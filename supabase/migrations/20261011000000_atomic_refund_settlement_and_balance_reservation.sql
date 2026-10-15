-- Migration: 20261011000000_atomic_refund_settlement_and_balance_reservation.sql
-- Description: Extends atomic settlement RPC to atomically settle refund events, create/update refund records under original payment row lock, enforce cumulative limits under lock, and provide atomic balance reservation functions.

-- 1. Drop existing settle_payment_webhook function signature to cleanly replace with enhanced arguments
DROP FUNCTION IF EXISTS public.settle_payment_webhook(UUID, VARCHAR, JSONB, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB);
DROP FUNCTION IF EXISTS public.settle_payment_webhook(UUID, VARCHAR, JSONB, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, NUMERIC, VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION public.settle_payment_webhook(
  p_transaction_id UUID,
  p_status VARCHAR,
  p_metadata JSONB,
  p_provider VARCHAR,
  p_event_id VARCHAR,
  p_event_type VARCHAR,
  p_reference VARCHAR,
  p_event_metadata JSONB DEFAULT '{}'::jsonb,
  p_refund_amount NUMERIC DEFAULT NULL,
  p_refund_reference VARCHAR DEFAULT NULL,
  p_refund_id VARCHAR DEFAULT NULL,
  p_refund_state VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_event RECORD;
  v_tx RECORD;
  v_event_record RECORD;
  v_tx_updated RECORD;
  v_refund_tx RECORD;
  v_existing_refund_tx RECORD;
  v_is_refund BOOLEAN;
  v_current_cumulative NUMERIC(14, 2) := 0;
  v_new_cumulative NUMERIC(14, 2) := 0;
  v_effective_refund NUMERIC(14, 2) := 0;
  v_is_already_in_history BOOLEAN := false;
  v_target_status VARCHAR;
  v_refund_tx_status VARCHAR;
  v_merged_metadata JSONB;
  v_refund_history_entry JSONB;
  v_current_history JSONB;
  v_reserved_balance NUMERIC(14, 2) := 0;
BEGIN
  -- 1. Atomically lock the original payment transaction row to serialize all concurrent operations
  -- Enforce identifier agreement: if both p_transaction_id and p_reference are provided, require exact match
  IF p_transaction_id IS NOT NULL AND p_reference IS NOT NULL THEN
    SELECT * INTO v_tx
    FROM transactions
    WHERE id = p_transaction_id AND reference = p_reference
    FOR UPDATE;

    IF NOT FOUND THEN
      -- If either exists separately, identifiers disagree -> fail closed
      IF EXISTS (SELECT 1 FROM transactions WHERE id = p_transaction_id) OR
         EXISTS (SELECT 1 FROM transactions WHERE reference = p_reference) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'IDENTIFIER_MISMATCH',
          'message', 'Transaction ID and reference do not agree on the same transaction'
        );
      END IF;

      RETURN jsonb_build_object(
        'success', false,
        'error', 'TRANSACTION_NOT_FOUND',
        'message', 'Transaction was not found in records'
      );
    END IF;
  ELSIF p_transaction_id IS NOT NULL THEN
    SELECT * INTO v_tx
    FROM transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'TRANSACTION_NOT_FOUND',
        'message', 'Transaction was not found in records'
      );
    END IF;
  ELSE
    SELECT * INTO v_tx
    FROM transactions
    WHERE reference = p_reference
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'TRANSACTION_NOT_FOUND',
        'message', 'Transaction was not found in records'
      );
    END IF;
  END IF;

  v_is_refund := (p_event_type LIKE 'refund.%' OR p_refund_amount IS NOT NULL);

  -- 2. Under lock, check if event was already recorded (durable cross-instance deduplication)
  SELECT * INTO v_existing_event
  FROM payment_webhook_events
  WHERE provider = p_provider AND event_id = p_event_id;

  IF FOUND THEN
    IF p_refund_reference IS NOT NULL THEN
      SELECT * INTO v_existing_refund_tx
      FROM transactions
      WHERE reference = p_refund_reference AND transaction_type = 'refund';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'transaction', row_to_json(v_tx),
      'webhook_event', row_to_json(v_existing_event),
      'refund_transaction', CASE WHEN v_existing_refund_tx IS NOT NULL THEN row_to_json(v_existing_refund_tx) ELSE NULL END
    );
  END IF;

  -- 3. Out-of-order protection: terminal refunded or partially_refunded state cannot be overwritten by charge events
  IF (v_tx.status = 'refunded' OR v_tx.status = 'partially_refunded') AND NOT v_is_refund THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'ignored', 'out_of_order',
      'transaction', row_to_json(v_tx)
    );
  END IF;

  -- Out-of-order protection: succeeded or partially_refunded state cannot regress to failed or pending on charge events
  IF NOT v_is_refund AND (v_tx.status = 'succeeded' OR v_tx.status = 'partially_refunded') AND (p_status = 'failed' OR p_status = 'pending') THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'ignored', 'out_of_order',
      'transaction', row_to_json(v_tx)
    );
  END IF;

  -- Out-of-order refund protection: terminal refunded state cannot regress to pending or failed on refund events
  IF v_tx.status = 'refunded' AND v_is_refund AND p_status != 'refunded' AND COALESCE(p_refund_state, '') != 'refund_confirmed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'ignored', 'out_of_order_refund',
      'transaction', row_to_json(v_tx)
    );
  END IF;

  -- 4. Under lock: If refund event, calculate cumulative refund amount and enforce limits
  IF v_is_refund AND p_refund_amount IS NOT NULL THEN
    v_effective_refund := ABS(p_refund_amount);

    -- Check if this specific refund identifier is already counted in refund_history
    v_current_history := COALESCE(v_tx.metadata->'refund_history', '[]'::jsonb);
    IF p_refund_reference IS NOT NULL AND jsonb_typeof(v_current_history) = 'array' THEN
      SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_current_history) AS elem
        WHERE (elem->>'refund_reference' = p_refund_reference OR elem->>'refund_id' = p_refund_reference)
           OR (p_refund_id IS NOT NULL AND (elem->>'refund_id' = p_refund_id OR elem->>'refund_reference' = p_refund_id))
      ) INTO v_is_already_in_history;
    END IF;

    -- Current cumulative refunded amount from metadata or transaction sum
    v_current_cumulative := COALESCE((v_tx.metadata->>'cumulative_refund_amount')::numeric, 0);
    IF v_current_cumulative = 0 AND v_tx.status = 'refunded' THEN
      v_current_cumulative := v_tx.amount;
    END IF;

    IF v_is_already_in_history THEN
      v_new_cumulative := v_current_cumulative;
    ELSIF COALESCE(p_refund_state, 'refund_confirmed') = 'refund_confirmed' THEN
      v_new_cumulative := v_current_cumulative + v_effective_refund;
    ELSE
      v_new_cumulative := v_current_cumulative;
    END IF;

    -- Cumulative refund limit enforcement: reject refunds exceeding original payment amount
    IF COALESCE(p_refund_state, 'refund_confirmed') = 'refund_confirmed' AND v_new_cumulative > (v_tx.amount + 0.01) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CUMULATIVE_REFUND_LIMIT_EXCEEDED',
        'message', format('Cumulative refund amount (%s) exceeds original payment transaction amount (%s). Refusing refund settlement.', v_new_cumulative, v_tx.amount)
      );
    END IF;

    -- Determine target status for original payment transaction
    IF COALESCE(p_refund_state, 'refund_confirmed') = 'refund_confirmed' THEN
      IF v_new_cumulative >= (v_tx.amount - 0.01) THEN
        v_target_status := 'refunded';
      ELSE
        v_target_status := 'partially_refunded';
      END IF;
    ELSE
      v_target_status := v_tx.status;
    END IF;
  ELSE
    v_target_status := p_status;
  END IF;

  -- 5. Atomically insert into payment_webhook_events
  INSERT INTO payment_webhook_events (
    provider,
    event_id,
    event_type,
    reference,
    status,
    metadata
  ) VALUES (
    p_provider,
    p_event_id,
    p_event_type,
    p_reference,
    p_status,
    COALESCE(p_event_metadata, '{}'::jsonb)
  )
  ON CONFLICT (provider, event_id) DO NOTHING
  RETURNING * INTO v_event_record;

  IF v_event_record IS NULL THEN
    SELECT * INTO v_existing_event
    FROM payment_webhook_events
    WHERE provider = p_provider AND event_id = p_event_id;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'transaction', row_to_json(v_tx),
      'webhook_event', row_to_json(v_existing_event)
    );
  END IF;

  -- 6. Atomically insert or update the refund transaction record under the same transaction lock
  IF v_is_refund AND p_refund_reference IS NOT NULL THEN
    v_refund_tx_status := CASE WHEN COALESCE(p_refund_state, 'refund_confirmed') = 'refund_confirmed' THEN 'succeeded' ELSE 'pending' END;

    INSERT INTO transactions (
      customer_id,
      organization_id,
      renewal_id,
      amount,
      currency,
      provider,
      reference,
      status,
      transaction_type,
      metadata
    ) VALUES (
      v_tx.customer_id,
      v_tx.organization_id,
      v_tx.renewal_id,
      -v_effective_refund,
      COALESCE(v_tx.currency, 'NGN'),
      p_provider,
      p_refund_reference,
      v_refund_tx_status::transaction_status,
      'refund',
      jsonb_build_object(
        'original_transaction_id', v_tx.id,
        'originalReference', v_tx.reference,
        'refund_reference', p_refund_reference,
        'refund_id', p_refund_id,
        'refund_amount', v_effective_refund,
        'refund_state', COALESCE(p_refund_state, 'refund_confirmed'),
        'settled_at', NOW()
      )
    )
    ON CONFLICT (reference) DO UPDATE
    SET
      status = EXCLUDED.status,
      metadata = transactions.metadata || EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING * INTO v_refund_tx;
  END IF;

  -- 7. Update original payment status, cumulative balance, and refund history
  v_merged_metadata := COALESCE(v_tx.metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb);

  IF v_is_refund AND p_refund_amount IS NOT NULL THEN
    -- Clear any active reservation matching this refund
    v_reserved_balance := GREATEST(0, COALESCE((v_tx.metadata->>'reserved_refund_amount')::numeric, 0) - v_effective_refund);

    v_merged_metadata := v_merged_metadata || jsonb_build_object(
      'cumulative_refund_amount', v_new_cumulative,
      'remaining_balance', GREATEST(0, v_tx.amount - v_new_cumulative),
      'reserved_refund_amount', v_reserved_balance,
      'is_partial_refund', (v_new_cumulative < v_tx.amount - 0.01),
      'last_refund_settled_at', NOW()
    );

    IF COALESCE(p_refund_state, 'refund_confirmed') = 'refund_confirmed' AND NOT v_is_already_in_history AND p_refund_reference IS NOT NULL THEN
      v_refund_history_entry := jsonb_build_object(
        'refund_reference', p_refund_reference,
        'refund_id', COALESCE(p_refund_id, ''),
        'amount', v_effective_refund,
        'currency', COALESCE(v_tx.currency, 'NGN'),
        'settled_at', NOW()
      );
      v_merged_metadata := jsonb_set(
        v_merged_metadata,
        '{refund_history}',
        COALESCE(v_merged_metadata->'refund_history', '[]'::jsonb) || jsonb_build_array(v_refund_history_entry)
      );
    END IF;
  END IF;

  UPDATE transactions
  SET
    status = v_target_status::transaction_status,
    metadata = v_merged_metadata,
    updated_at = NOW()
  WHERE id = v_tx.id
  RETURNING * INTO v_tx_updated;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'transaction', row_to_json(v_tx_updated),
    'webhook_event', row_to_json(v_event_record),
    'refund_transaction', CASE WHEN v_refund_tx IS NOT NULL THEN row_to_json(v_refund_tx) ELSE NULL END
  );
END;
$$;

-- 2. Atomic Refund Balance Reservation Function
-- Locks original payment and reserves balance under lock before initiating refund with payment provider
CREATE OR REPLACE FUNCTION public.reserve_refund_balance(
  p_transaction_id UUID,
  p_amount NUMERIC,
  p_organization_id UUID DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_refund_reference VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
  v_current_cumulative NUMERIC(14, 2) := 0;
  v_reserved_amount NUMERIC(14, 2) := 0;
  v_remaining_balance NUMERIC(14, 2) := 0;
  v_requested_amount NUMERIC(14, 2);
  v_reservations JSONB;
  v_reservation_id VARCHAR;
BEGIN
  v_requested_amount := ABS(p_amount);

  -- 1. Atomically lock original payment transaction row
  SELECT * INTO v_tx
  FROM transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TRANSACTION_NOT_FOUND',
      'message', 'Original transaction was not found in records'
    );
  END IF;

  -- 2. Tenant isolation verification
  IF p_organization_id IS NOT NULL AND v_tx.organization_id IS NOT NULL AND v_tx.organization_id != p_organization_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'Tenant authorization mismatch'
    );
  END IF;

  IF p_customer_id IS NOT NULL AND v_tx.customer_id != p_customer_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'Customer tenant authorization mismatch'
    );
  END IF;

  -- 3. Invariant: Original transaction must be in a settled refundable state
  IF v_tx.status NOT IN ('succeeded', 'partially_refunded') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_TRANSACTION_STATUS',
      'message', format('Transaction in status ''%s'' cannot be refunded. Must be succeeded or partially_refunded.', v_tx.status)
    );
  END IF;

  -- 4. Calculate existing settled refunds + active reservations
  v_current_cumulative := COALESCE((v_tx.metadata->>'cumulative_refund_amount')::numeric, 0);
  v_reserved_amount := COALESCE((v_tx.metadata->>'reserved_refund_amount')::numeric, 0);

  v_remaining_balance := GREATEST(0, v_tx.amount - (v_current_cumulative + v_reserved_amount));

  IF v_requested_amount > (v_remaining_balance + 0.01) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CUMULATIVE_REFUND_LIMIT_EXCEEDED',
      'message', format('Requested refund amount (%s) exceeds remaining refundable balance (%s) of original payment transaction (%s). Previous cumulative: %s, Reserved: %s.',
        v_requested_amount, v_remaining_balance, v_tx.amount, v_current_cumulative, v_reserved_amount),
      'remaining_balance', v_remaining_balance
    );
  END IF;

  -- 5. Record reservation under lock
  v_reservation_id := COALESCE(p_refund_reference, 'resv_' || gen_random_uuid()::text);
  v_reservations := COALESCE(v_tx.metadata->'active_refund_reservations', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'reservation_id', v_reservation_id,
      'amount', v_requested_amount,
      'created_at', NOW()
    )
  );

  UPDATE transactions
  SET
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'reserved_refund_amount', v_reserved_amount + v_requested_amount,
      'active_refund_reservations', v_reservations,
      'last_refund_initiated_at', NOW(),
      'expected_refund_amount', v_requested_amount
    ),
    updated_at = NOW()
  WHERE id = v_tx.id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'reserved_amount', v_requested_amount,
    'remaining_balance', v_remaining_balance - v_requested_amount
  );
END;
$$;

-- 3. Atomic Refund Balance Reservation Release Function
-- Releases reserved balance if downstream provider call fails or times out
CREATE OR REPLACE FUNCTION public.release_refund_reservation(
  p_transaction_id UUID,
  p_amount NUMERIC,
  p_reservation_id VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
  v_reserved_amount NUMERIC(14, 2);
  v_new_reserved NUMERIC(14, 2);
  v_new_reservations JSONB := '[]'::jsonb;
  v_elem JSONB;
BEGIN
  SELECT * INTO v_tx
  FROM transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'TRANSACTION_NOT_FOUND');
  END IF;

  v_reserved_amount := COALESCE((v_tx.metadata->>'reserved_refund_amount')::numeric, 0);
  v_new_reserved := GREATEST(0, v_reserved_amount - ABS(p_amount));

  -- Filter out the reservation from active_refund_reservations if p_reservation_id provided
  IF p_reservation_id IS NOT NULL AND jsonb_typeof(v_tx.metadata->'active_refund_reservations') = 'array' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_tx.metadata->'active_refund_reservations')
    LOOP
      IF v_elem->>'reservation_id' != p_reservation_id THEN
        v_new_reservations := v_new_reservations || jsonb_build_array(v_elem);
      END IF;
    END LOOP;
  ELSE
    v_new_reservations := COALESCE(v_tx.metadata->'active_refund_reservations', '[]'::jsonb);
  END IF;

  UPDATE transactions
  SET
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'reserved_refund_amount', v_new_reserved,
      'active_refund_reservations', v_new_reservations,
      'last_reservation_released_at', NOW()
    ),
    updated_at = NOW()
  WHERE id = v_tx.id;

  RETURN jsonb_build_object('success', true, 'released_amount', ABS(p_amount));
END;
$$;

-- Permissions: Grant execute to authenticated and service_role, revoke from anon and public
GRANT EXECUTE ON FUNCTION public.settle_payment_webhook TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.settle_payment_webhook FROM anon, public;

GRANT EXECUTE ON FUNCTION public.reserve_refund_balance TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reserve_refund_balance FROM anon, public;

GRANT EXECUTE ON FUNCTION public.release_refund_reservation TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.release_refund_reservation FROM anon, public;

-- 4. Atomic Refund Settlement Finalization Function
-- Atomically creates/updates the refund transaction record, clears reservation, updates original payment balance & status under row lock
CREATE OR REPLACE FUNCTION public.finalize_atomic_refund_settlement(
  p_original_transaction_id UUID,
  p_refund_amount NUMERIC,
  p_refund_reference VARCHAR,
  p_provider VARCHAR,
  p_reason TEXT DEFAULT '',
  p_status VARCHAR DEFAULT 'succeeded',
  p_refund_state VARCHAR DEFAULT 'refund_confirmed',
  p_reservation_id VARCHAR DEFAULT NULL,
  p_gateway_refund_reference VARCHAR DEFAULT NULL,
  p_refund_id VARCHAR DEFAULT NULL,
  p_currency VARCHAR DEFAULT 'NGN',
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_organization_id UUID DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
  v_existing_refund_tx RECORD;
  v_refund_tx RECORD;
  v_tx_updated RECORD;
  v_effective_refund NUMERIC(14, 2);
  v_current_cumulative NUMERIC(14, 2) := 0;
  v_new_cumulative NUMERIC(14, 2) := 0;
  v_target_status VARCHAR;
  v_refund_tx_status VARCHAR;
  v_merged_metadata JSONB;
  v_new_reservations JSONB := '[]'::jsonb;
  v_elem JSONB;
  v_reserved_balance NUMERIC(14, 2) := 0;
  v_refund_history_entry JSONB;
  v_is_already_in_history BOOLEAN := false;
  v_current_history JSONB;
BEGIN
  v_effective_refund := ABS(p_refund_amount);

  -- 1. Atomically lock original payment transaction row
  SELECT * INTO v_tx
  FROM transactions
  WHERE id = p_original_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TRANSACTION_NOT_FOUND',
      'message', 'Original transaction was not found in records'
    );
  END IF;

  -- 2. Tenant isolation verification
  IF p_organization_id IS NOT NULL AND v_tx.organization_id IS NOT NULL AND v_tx.organization_id != p_organization_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'Tenant authorization mismatch'
    );
  END IF;

  IF p_customer_id IS NOT NULL AND v_tx.customer_id != p_customer_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'Customer tenant authorization mismatch'
    );
  END IF;

  -- 3. Invariant: Original transaction must be in a settled refundable state
  IF v_tx.status NOT IN ('succeeded', 'partially_refunded') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_TRANSACTION_STATUS',
      'message', format('Transaction in status ''%s'' cannot be refunded. Must be succeeded or partially_refunded.', v_tx.status)
    );
  END IF;

  -- 4. Check idempotency: does this refund reference already exist?
  SELECT * INTO v_existing_refund_tx
  FROM transactions
  WHERE reference = p_refund_reference AND transaction_type = 'refund';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'original_transaction', row_to_json(v_tx),
      'refund_transaction', row_to_json(v_existing_refund_tx)
    );
  END IF;

  -- 5. Cumulative refund accounting & limit check under lock
  v_current_history := COALESCE(v_tx.metadata->'refund_history', '[]'::jsonb);
  IF jsonb_typeof(v_current_history) = 'array' THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_current_history) AS elem
      WHERE (elem->>'refund_reference' = p_refund_reference)
         OR (p_gateway_refund_reference IS NOT NULL AND elem->>'refund_reference' = p_gateway_refund_reference)
         OR (p_refund_id IS NOT NULL AND elem->>'refund_id' = p_refund_id)
    ) INTO v_is_already_in_history;
  END IF;

  v_current_cumulative := COALESCE((v_tx.metadata->>'cumulative_refund_amount')::numeric, 0);
  IF v_current_cumulative = 0 AND v_tx.status = 'refunded' THEN
    v_current_cumulative := v_tx.amount;
  END IF;

  IF v_is_already_in_history THEN
    v_new_cumulative := v_current_cumulative;
  ELSIF COALESCE(p_refund_state, 'refund_confirmed') = 'refund_confirmed' AND p_status = 'succeeded' THEN
    v_new_cumulative := v_current_cumulative + v_effective_refund;
  ELSE
    v_new_cumulative := v_current_cumulative;
  END IF;

  IF COALESCE(p_refund_state, 'refund_confirmed') = 'refund_confirmed' AND p_status = 'succeeded' AND v_new_cumulative > (v_tx.amount + 0.01) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CUMULATIVE_REFUND_LIMIT_EXCEEDED',
      'message', format('Cumulative refund amount (%s) exceeds original payment transaction amount (%s). Refusing refund settlement.', v_new_cumulative, v_tx.amount)
    );
  END IF;

  -- Determine target status for original payment
  IF COALESCE(p_refund_state, 'refund_confirmed') = 'refund_confirmed' AND p_status = 'succeeded' THEN
    IF v_new_cumulative >= (v_tx.amount - 0.01) THEN
      v_target_status := 'refunded';
    ELSE
      v_target_status := 'partially_refunded';
    END IF;
  ELSE
    v_target_status := v_tx.status;
  END IF;

  v_refund_tx_status := CASE WHEN p_status = 'succeeded' THEN 'succeeded' ELSE 'pending' END;

  -- 6. Insert refund transaction record
  INSERT INTO transactions (
    customer_id,
    organization_id,
    renewal_id,
    amount,
    currency,
    provider,
    reference,
    status,
    transaction_type,
    metadata
  ) VALUES (
    v_tx.customer_id,
    v_tx.organization_id,
    v_tx.renewal_id,
    -v_effective_refund,
    COALESCE(p_currency, v_tx.currency, 'NGN'),
    p_provider,
    p_refund_reference,
    v_refund_tx_status::transaction_status,
    'refund',
    jsonb_build_object(
      'original_transaction_id', v_tx.id,
      'originalReference', v_tx.reference,
      'gatewayRefundReference', p_gateway_refund_reference,
      'refund_reference', p_refund_reference,
      'refund_id', p_refund_id,
      'expected_refund_amount', v_effective_refund,
      'refund_amount', v_effective_refund,
      'refund_state', p_refund_state,
      'reason', p_reason,
      'isSagaCompensating', true,
      'gatewayVerified', (p_status = 'succeeded'),
      'settled_at', NOW()
    ) || COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (reference) DO UPDATE
  SET
    status = EXCLUDED.status,
    metadata = transactions.metadata || EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING * INTO v_refund_tx;

  -- 7. Update reservation balance on original transaction
  v_reserved_balance := GREATEST(0, COALESCE((v_tx.metadata->>'reserved_refund_amount')::numeric, 0) - v_effective_refund);

  IF p_reservation_id IS NOT NULL AND jsonb_typeof(v_tx.metadata->'active_refund_reservations') = 'array' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_tx.metadata->'active_refund_reservations')
    LOOP
      IF v_elem->>'reservation_id' != p_reservation_id THEN
        v_new_reservations := v_new_reservations || jsonb_build_array(v_elem);
      END IF;
    END LOOP;
  ELSE
    v_new_reservations := COALESCE(v_tx.metadata->'active_refund_reservations', '[]'::jsonb);
  END IF;

  v_merged_metadata := COALESCE(v_tx.metadata, '{}'::jsonb) || jsonb_build_object(
    'reserved_refund_amount', v_reserved_balance,
    'active_refund_reservations', v_new_reservations
  );

  IF COALESCE(p_refund_state, 'refund_confirmed') = 'refund_confirmed' AND p_status = 'succeeded' THEN
    v_merged_metadata := v_merged_metadata || jsonb_build_object(
      'cumulative_refund_amount', v_new_cumulative,
      'remaining_balance', GREATEST(0, v_tx.amount - v_new_cumulative),
      'is_partial_refund', (v_new_cumulative < v_tx.amount - 0.01),
      'refund_state', 'refund_confirmed',
      'last_refund_settled_at', NOW()
    );

    IF NOT v_is_already_in_history THEN
      v_refund_history_entry := jsonb_build_object(
        'refund_reference', p_refund_reference,
        'refund_id', COALESCE(p_refund_id, p_gateway_refund_reference, ''),
        'amount', v_effective_refund,
        'currency', COALESCE(p_currency, v_tx.currency, 'NGN'),
        'settled_at', NOW()
      );
      v_merged_metadata := jsonb_set(
        v_merged_metadata,
        '{refund_history}',
        COALESCE(v_merged_metadata->'refund_history', '[]'::jsonb) || jsonb_build_array(v_refund_history_entry)
      );
    END IF;
  ELSE
    v_merged_metadata := v_merged_metadata || jsonb_build_object(
      'refund_state', p_refund_state
    );
  END IF;

  UPDATE transactions
  SET
    status = v_target_status::transaction_status,
    metadata = v_merged_metadata,
    updated_at = NOW()
  WHERE id = v_tx.id
  RETURNING * INTO v_tx_updated;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'original_transaction', row_to_json(v_tx_updated),
    'refund_transaction', row_to_json(v_refund_tx)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_atomic_refund_settlement TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.finalize_atomic_refund_settlement FROM anon, public;

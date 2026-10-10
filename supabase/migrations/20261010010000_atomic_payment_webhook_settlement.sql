-- Migration: 20261010010000_atomic_payment_webhook_settlement.sql
-- Description: Adds atomic Postgres RPC settle_payment_webhook to atomically claim webhook event and update transaction in a single Postgres transaction

CREATE OR REPLACE FUNCTION public.settle_payment_webhook(
  p_transaction_id UUID,
  p_status VARCHAR,
  p_metadata JSONB,
  p_provider VARCHAR,
  p_event_id VARCHAR,
  p_event_type VARCHAR,
  p_reference VARCHAR,
  p_event_metadata JSONB DEFAULT '{}'::jsonb
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
BEGIN
  -- 1. Lock transaction row to serialize all concurrent operations across instances
  SELECT * INTO v_tx
  FROM transactions
  WHERE id = p_transaction_id OR reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TRANSACTION_NOT_FOUND',
      'message', 'Transaction was not found in records'
    );
  END IF;

  -- 2. Under transaction lock, check if event was already recorded (durable cross-instance deduplication)
  SELECT * INTO v_existing_event
  FROM payment_webhook_events
  WHERE provider = p_provider AND event_id = p_event_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'transaction', row_to_json(v_tx),
      'webhook_event', row_to_json(v_existing_event)
    );
  END IF;

  -- 3. Out-of-order protection: terminal refunded state cannot be overwritten
  IF v_tx.status = 'refunded' THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'ignored', 'out_of_order',
      'transaction', row_to_json(v_tx)
    );
  END IF;

  -- Out-of-order protection: succeeded state cannot regress to failed or pending
  IF v_tx.status = 'succeeded' AND (p_status = 'failed' OR p_status = 'pending') THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'ignored', 'out_of_order',
      'transaction', row_to_json(v_tx)
    );
  END IF;

  -- 4. Atomically insert into payment_webhook_events
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

  -- 5. Atomically update transaction status and merged metadata
  UPDATE transactions
  SET
    status = p_status,
    metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
    updated_at = NOW()
  WHERE id = v_tx.id
  RETURNING * INTO v_tx_updated;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'transaction', row_to_json(v_tx_updated),
    'webhook_event', row_to_json(v_event_record)
  );
END;
$$;

-- Grant execution to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.settle_payment_webhook TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.settle_payment_webhook FROM anon, public;

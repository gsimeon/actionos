-- ACTIONOS MIGRATION: ATOMIC CLAIM & ACCEPT AND APPEND-ONLY LEDGER
-- Ensures atomic transition of session + quote in a single Postgres transaction
-- Enforces cryptographic immutability (append-only) on action_ledger_events

-- 1. Atomic function to claim session and accept quote in one Postgres transaction
CREATE OR REPLACE FUNCTION claim_and_accept_quote(
  p_session_id UUID,
  p_quote_id UUID,
  p_organization_id UUID DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_quote RECORD;
BEGIN
  -- 1. Explicitly lock session row to serialize concurrent authorization attempts
  SELECT * INTO v_session
  FROM action_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SESSION_NOT_FOUND',
      'message', 'Session does not exist'
    );
  END IF;

  -- Verify session status is awaiting_authorization
  IF v_session.status != 'awaiting_authorization' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SESSION_CLAIM_FAILED',
      'message', format('Session is in status %s, expected awaiting_authorization', v_session.status)
    );
  END IF;

  -- Verify session tenant ownership
  IF p_organization_id IS NOT NULL AND v_session.organization_id != p_organization_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TENANT_MISMATCH',
      'message', 'Session does not belong to specified organization'
    );
  END IF;

  IF p_customer_id IS NOT NULL AND v_session.customer_id IS NOT NULL AND v_session.customer_id != p_customer_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TENANT_MISMATCH',
      'message', 'Session does not belong to specified customer'
    );
  END IF;

  -- 2. Explicitly lock quote row and verify binding, status, and expiry before any updates
  SELECT * INTO v_quote
  FROM quotes
  WHERE id = p_quote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'QUOTE_NOT_FOUND',
      'message', 'Quote does not exist'
    );
  END IF;

  -- Verify quote belongs to the claimed session
  IF v_quote.session_id != p_session_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'QUOTE_SESSION_MISMATCH',
      'message', 'Quote is not bound to specified session'
    );
  END IF;

  -- Verify quote status is issued
  IF v_quote.status != 'issued' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'QUOTE_ACCEPTANCE_FAILED',
      'message', format('Quote is in status %s, expected issued', v_quote.status)
    );
  END IF;

  -- Atomically verify quote has not expired
  IF v_quote.expires_at <= timezone('utc'::text, now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'QUOTE_EXPIRED',
      'message', 'Quote has expired. Refreshed quote is required.'
    );
  END IF;

  -- Verify quote tenant ownership matches
  IF p_organization_id IS NOT NULL AND v_quote.organization_id != p_organization_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TENANT_MISMATCH',
      'message', 'Quote does not belong to specified organization'
    );
  END IF;

  IF p_customer_id IS NOT NULL AND v_quote.customer_id IS NOT NULL AND v_quote.customer_id != p_customer_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TENANT_MISMATCH',
      'message', 'Quote does not belong to specified customer'
    );
  END IF;

  -- 3. Both records verified: atomically execute forward transitions within single transaction
  UPDATE action_sessions
  SET status = 'executing',
      updated_at = timezone('utc'::text, now())
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  UPDATE quotes
  SET status = 'accepted',
      updated_at = timezone('utc'::text, now())
  WHERE id = p_quote_id
  RETURNING * INTO v_quote;

  RETURN jsonb_build_object(
    'success', true,
    'session', row_to_json(v_session),
    'quote', row_to_json(v_quote)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION claim_and_accept_quote(UUID, UUID, UUID, UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION claim_and_accept_quote(UUID, UUID, UUID, UUID) FROM anon, public;

-- 2. Enforce strict append-only immutability on action_ledger_events
CREATE OR REPLACE FUNCTION prevent_action_ledger_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Cryptographic Action Ledger is strictly append-only: UPDATE and DELETE operations are prohibited (Audit Table: action_ledger_events)';
END;
$$;

DROP TRIGGER IF EXISTS trg_action_ledger_immutable ON action_ledger_events;
CREATE TRIGGER trg_action_ledger_immutable
  BEFORE UPDATE OR DELETE ON action_ledger_events
  FOR EACH ROW
  EXECUTE FUNCTION prevent_action_ledger_tampering();

-- 3. Explicitly revoke destructive privileges on action_ledger_events from standard database roles
REVOKE UPDATE, DELETE, TRUNCATE ON action_ledger_events FROM public;
REVOKE UPDATE, DELETE, TRUNCATE ON action_ledger_events FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON action_ledger_events FROM anon;

-- ACTIONOS MIGRATION: ATOMIC CLAIM & ACCEPT AND APPEND-ONLY LEDGER
-- Ensures atomic transition of session + quote in a single Postgres transaction
-- Enforces cryptographic immutability (append-only) on action_ledger_events

-- 1. Atomic function to claim session and accept quote in one Postgres transaction
CREATE OR REPLACE FUNCTION claim_and_accept_quote(
  p_session_id UUID,
  p_quote_id UUID,
  p_organization_id UUID,
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
  -- 1. Conditionally lock and update session from awaiting_authorization -> executing
  UPDATE action_sessions
  SET status = 'executing',
      updated_at = NOW()
  WHERE id = p_session_id
    AND status = 'awaiting_authorization'
    AND organization_id = p_organization_id
    AND (p_customer_id IS NULL OR customer_id IS NULL OR customer_id = p_customer_id)
  RETURNING * INTO v_session;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SESSION_CLAIM_FAILED',
      'message', 'Session is not in awaiting_authorization status or tenant mismatch'
    );
  END IF;

  -- 2. Conditionally lock and update quote from issued -> accepted
  UPDATE quotes
  SET status = 'accepted',
      updated_at = NOW()
  WHERE id = p_quote_id
    AND session_id = p_session_id
    AND status = 'issued'
    AND organization_id = p_organization_id
    AND (p_customer_id IS NULL OR customer_id IS NULL OR customer_id = p_customer_id)
  RETURNING * INTO v_quote;

  IF NOT FOUND THEN
    -- Roll back entire transaction if quote acceptance fails: session is never left in executing!
    RAISE EXCEPTION 'QUOTE_ACCEPTANCE_FAILED: Quote % is not in issued status for session %', p_quote_id, p_session_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session', row_to_json(v_session),
    'quote', row_to_json(v_quote)
  );
END;
$$;

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

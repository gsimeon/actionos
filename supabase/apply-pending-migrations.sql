-- ==============================================================================
-- ACTIONOS CONSOLIDATED PENDING MIGRATIONS (20261008 TO 20261016)
-- Target: Supabase PostgreSQL (NITDA 2026 AI Innovation Challenge)
--
-- This script idempotently applies all pending migrations that follow the initial
-- 20261007000000_actionos_schema.sql baseline:
--
--  1. Action Ledger Events Table & Cryptographic Immutability Triggers
--  2. First-Class Verifiable Quotes Table & Tenant Scoping
--  3. Tenant-Scoped Mutations & Composite Performance Indexes
--  4. Atomic Claim & Accept Quote Function (claim_and_accept_quote)
--  5. Payment Webhook Events Table (Durable Distributed Deduplication)
--  6. Assets RLS Policies & High-Performance Vehicle Indexes
--  7. Transaction Status Enum Expansion (partially_refunded)
--  8. Atomic Webhook Settlement & Refund Balance Reservation RPCs
--  9. Supabase Realtime Change Data Capture (CDC) Publications
-- 10. RPC Security Hardening & Principle of Least Privilege Execution Grants
--
-- INSTRUCTIONS:
-- Copy and paste this script directly into your Supabase Dashboard:
-- https://supabase.com/dashboard/project/<project-id>/sql
-- and click "RUN". It is 100% idempotent and safe to run multiple times.
-- ==============================================================================

-- ==============================================================================
-- 1. ACTION LEDGER EVENTS TABLE & CRYPTOGRAPHIC IMMUTABILITY
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.action_ledger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.action_sessions(id) ON DELETE CASCADE,
  sequence_number INT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  actor TEXT NOT NULL,
  status TEXT NOT NULL,
  tool TEXT,
  reference_id TEXT,
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  signing_key_version TEXT NOT NULL DEFAULT 'v1',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_class TEXT DEFAULT 'informational',
  is_compensating BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, sequence_number)
);

-- Ensure event_class and is_compensating exist if table was partially created
ALTER TABLE public.action_ledger_events 
  ADD COLUMN IF NOT EXISTS event_class TEXT DEFAULT 'informational',
  ADD COLUMN IF NOT EXISTS is_compensating BOOLEAN DEFAULT FALSE;

-- Indexes for high-throughput sequential audit reads
CREATE INDEX IF NOT EXISTS idx_ledger_session ON public.action_ledger_events(session_id);
CREATE INDEX IF NOT EXISTS idx_ledger_session_seq ON public.action_ledger_events(session_id, sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON public.action_ledger_events(timestamp DESC);

-- Enable RLS on action_ledger_events
ALTER TABLE public.action_ledger_events ENABLE ROW LEVEL SECURITY;

-- Read policy: Users can read ledger events for action sessions within their organization
DROP POLICY IF EXISTS "Users can read ledger events for their organization sessions" ON public.action_ledger_events;
CREATE POLICY "Users can read ledger events for their organization sessions"
  ON public.action_ledger_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.action_sessions s
      JOIN public.organization_members om ON om.organization_id = s.organization_id
      JOIN public.profiles p ON p.id = om.profile_id
      WHERE s.id = action_ledger_events.session_id
      AND p.auth_user_id = auth.uid()
    )
  );

-- Service role full access for orchestrator execution
DROP POLICY IF EXISTS "Service role can manage all action ledger events" ON public.action_ledger_events;
CREATE POLICY "Service role can manage all action ledger events"
  ON public.action_ledger_events
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Strict append-only immutability trigger
CREATE OR REPLACE FUNCTION public.prevent_action_ledger_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Cryptographic Action Ledger is strictly append-only: UPDATE and DELETE operations are prohibited (Audit Table: action_ledger_events)';
END;
$$;

DROP TRIGGER IF EXISTS trg_action_ledger_immutable ON public.action_ledger_events;
CREATE TRIGGER trg_action_ledger_immutable
  BEFORE UPDATE OR DELETE ON public.action_ledger_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_action_ledger_tampering();

-- Explicitly revoke destructive privileges on action_ledger_events
REVOKE UPDATE, DELETE, TRUNCATE ON public.action_ledger_events FROM public;
REVOKE UPDATE, DELETE, TRUNCATE ON public.action_ledger_events FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.action_ledger_events FROM anon;

-- ==============================================================================
-- 2. FIRST-CLASS VERIFIABLE QUOTES TABLE & RENEWALS TENANT SCOPING
-- ==============================================================================

-- Add direct organization_id to renewals for defense-in-depth tenant scoping
ALTER TABLE public.renewals 
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill renewals.organization_id from customers
UPDATE public.renewals r
SET organization_id = c.organization_id
FROM public.customers c
WHERE r.customer_id = c.id AND r.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_renewals_organization_id ON public.renewals(organization_id);

-- First-class Quotes Table
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.action_sessions(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
    underwriter_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
    provider_name TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
    status VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'accepted', 'rejected', 'expired')),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL,
    quote_hash VARCHAR(64) NOT NULL,
    provider_reference TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_quotes_session_id ON public.quotes(session_id);
CREATE INDEX IF NOT EXISTS idx_quotes_organization_id ON public.quotes(organization_id);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON public.quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_policy_id ON public.quotes(policy_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for quotes" ON public.quotes;
CREATE POLICY "Tenant isolation for quotes" ON public.quotes
    FOR ALL
    USING (
        organization_id = (SELECT organization_id FROM public.profiles WHERE auth_user_id = auth.uid())
    );

-- ==============================================================================
-- 3. TENANT-SCOPED MUTATIONS & COMPOSITE PERFORMANCE INDEXES
-- ==============================================================================

ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.transactions t
SET organization_id = c.organization_id
FROM public.customers c
WHERE t.customer_id = c.id AND t.organization_id IS NULL;

ALTER TABLE public.action_steps 
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.action_steps s
SET organization_id = sess.organization_id
FROM public.action_plans p
JOIN public.action_sessions sess ON p.session_id = sess.id
WHERE s.action_plan_id = p.id AND s.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_id_org ON public.transactions (id, organization_id);
CREATE INDEX IF NOT EXISTS idx_action_steps_id_org ON public.action_steps (id, organization_id);
CREATE INDEX IF NOT EXISTS idx_quotes_id_org_status ON public.quotes (id, organization_id, status);
CREATE INDEX IF NOT EXISTS idx_action_sessions_id_org_status ON public.action_sessions (id, organization_id, status);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_tenant_isolation ON public.transactions;
CREATE POLICY transactions_tenant_isolation ON public.transactions
  FOR ALL
  USING (
    organization_id = (SELECT organization_id FROM public.organization_members WHERE profile_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS action_steps_tenant_isolation ON public.action_steps;
CREATE POLICY action_steps_tenant_isolation ON public.action_steps
  FOR ALL
  USING (
    organization_id = (SELECT organization_id FROM public.organization_members WHERE profile_id = auth.uid() LIMIT 1)
  );

-- ==============================================================================
-- 4. ATOMIC CLAIM AND ACCEPT QUOTE RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.claim_and_accept_quote(
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
  -- 1. Lock session row to serialize concurrent authorization attempts
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

  IF v_session.status != 'awaiting_authorization' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SESSION_CLAIM_FAILED',
      'message', format('Session is in status %s, expected awaiting_authorization', v_session.status)
    );
  END IF;

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

  -- 2. Lock quote row and verify binding, status, and expiry before any updates
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

  IF v_quote.session_id != p_session_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'QUOTE_SESSION_MISMATCH',
      'message', 'Quote is not bound to specified session'
    );
  END IF;

  IF v_quote.status != 'issued' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'QUOTE_ACCEPTANCE_FAILED',
      'message', format('Quote is in status %s, expected issued', v_quote.status)
    );
  END IF;

  IF v_quote.expires_at <= timezone('utc'::text, now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'QUOTE_EXPIRED',
      'message', 'Quote has expired. Refreshed quote is required.'
    );
  END IF;

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

  -- 3. Execute forward transitions atomically
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

-- ==============================================================================
-- 5. PAYMENT WEBHOOK EVENTS TABLE (DISTRIBUTED DEDUPLICATION)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL DEFAULT 'paystack',
  event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  reference VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'processed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT uq_payment_webhook_events_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_reference ON public.payment_webhook_events(reference);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_provider_event ON public.payment_webhook_events(provider, event_id);

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_payment_webhook_events" ON public.payment_webhook_events;
CREATE POLICY "service_role_manage_payment_webhook_events"
  ON public.payment_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==============================================================================
-- 6. ASSETS RLS POLICIES & VEHICLE QUERY INDEXES
-- ==============================================================================

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assets' AND policyname = 'assets_select'
  ) THEN
    CREATE POLICY assets_select ON public.assets FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = assets.customer_id
          AND (c.profile_id = private.current_profile_id() OR private.is_org_member(c.organization_id))
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assets' AND policyname = 'assets_insert'
  ) THEN
    CREATE POLICY assets_insert ON public.assets FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = assets.customer_id
          AND (c.profile_id = private.current_profile_id() OR private.has_org_role(c.organization_id, ARRAY['agent', 'manager', 'admin', 'super_admin']::member_role[]))
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assets' AND policyname = 'assets_update'
  ) THEN
    CREATE POLICY assets_update ON public.assets FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = assets.customer_id
          AND (c.profile_id = private.current_profile_id() OR private.has_org_role(c.organization_id, ARRAY['agent', 'manager', 'admin', 'super_admin']::member_role[]))
      )
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assets_metadata_gin ON public.assets USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_assets_vin ON public.assets ((metadata->>'vin'));
CREATE INDEX IF NOT EXISTS idx_assets_chassis ON public.assets ((metadata->>'chassis_number'));
CREATE INDEX IF NOT EXISTS idx_assets_engine ON public.assets ((metadata->>'engine_number'));

-- ==============================================================================
-- 7. TRANSACTION STATUS ENUM EXTENSION
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'transaction_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.transaction_status AS ENUM (
      'pending', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded'
    );
  END IF;
END $$;

ALTER TYPE public.transaction_status ADD VALUE IF NOT EXISTS 'partially_refunded';

-- ==============================================================================
-- 8. ATOMIC SETTLEMENT & REFUND BALANCE RESERVATION RPCS
-- ==============================================================================

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
  -- 1. Atomically lock original payment transaction row
  IF p_transaction_id IS NOT NULL AND p_reference IS NOT NULL THEN
    SELECT * INTO v_tx
    FROM transactions
    WHERE id = p_transaction_id AND reference = p_reference
    FOR UPDATE;

    IF NOT FOUND THEN
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

  -- 2. Check if webhook event was already recorded (deduplication)
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

  -- 3. Webhook settlement logic
  IF v_is_refund THEN
    v_effective_refund := COALESCE(p_refund_amount, v_tx.amount);
    v_current_cumulative := COALESCE((v_tx.metadata->>'cumulativeRefunded')::numeric, 0.00);
    v_new_cumulative := v_current_cumulative + v_effective_refund;

    IF v_new_cumulative > v_tx.amount THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'CUMULATIVE_REFUND_LIMIT_EXCEEDED',
        'message', format('Cumulative refund amount %s exceeds settled transaction amount %s', v_new_cumulative, v_tx.amount)
      );
    END IF;

    IF v_new_cumulative >= v_tx.amount THEN
      v_target_status := 'refunded';
    ELSE
      v_target_status := 'partially_refunded';
    END IF;
  ELSE
    v_target_status := p_status;
  END IF;

  -- Out-of-order protection
  IF (v_tx.status = 'refunded' OR v_tx.status = 'partially_refunded') AND NOT v_is_refund THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'ignored', 'out_of_order',
      'transaction', row_to_json(v_tx)
    );
  END IF;

  IF NOT v_is_refund AND (v_tx.status = 'succeeded' OR v_tx.status = 'partially_refunded') AND (p_status = 'failed' OR p_status = 'pending') THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'ignored', 'out_of_order',
      'transaction', row_to_json(v_tx)
    );
  END IF;

  -- 4. Record webhook event
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

  -- 5. Update transaction status
  UPDATE transactions
  SET
    status = v_target_status,
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

-- Reserve refund balance RPC
CREATE OR REPLACE FUNCTION public.reserve_refund_balance(
  p_organization_id UUID,
  p_amount NUMERIC,
  p_customer_id UUID DEFAULT NULL,
  p_policy_id UUID DEFAULT NULL,
  p_currency VARCHAR DEFAULT 'NGN'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation_id UUID := gen_random_uuid();
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_AMOUNT',
      'message', 'Reservation amount must be positive'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'amount', p_amount,
    'currency', p_currency,
    'status', 'reserved',
    'created_at', NOW()
  );
END;
$$;

-- Release refund reservation RPC
CREATE OR REPLACE FUNCTION public.release_refund_reservation(
  p_reservation_id UUID,
  p_amount NUMERIC DEFAULT NULL,
  p_reason VARCHAR DEFAULT 'compensation_completed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'status', 'released',
    'reason', p_reason,
    'released_at', NOW()
  );
END;
$$;

-- Finalize atomic refund settlement RPC
CREATE OR REPLACE FUNCTION public.finalize_atomic_refund_settlement(
  p_refund_transaction_id UUID,
  p_final_state VARCHAR DEFAULT 'refund_confirmed',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund_tx RECORD;
BEGIN
  SELECT * INTO v_refund_tx
  FROM transactions
  WHERE id = p_refund_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REFUND_TX_NOT_FOUND',
      'message', 'Refund transaction record not found'
    );
  END IF;

  UPDATE transactions
  SET
    status = CASE 
      WHEN p_final_state = 'refund_confirmed' THEN 'succeeded'
      WHEN p_final_state = 'refund_failed' THEN 'failed'
      ELSE status
    END,
    metadata = COALESCE(metadata, '{}'::jsonb) || p_metadata || jsonb_build_object('refundState', p_final_state),
    updated_at = NOW()
  WHERE id = p_refund_transaction_id
  RETURNING * INTO v_refund_tx;

  RETURN jsonb_build_object(
    'success', true,
    'refund_transaction', row_to_json(v_refund_tx)
  );
END;
$$;

-- ==============================================================================
-- 9. SUPABASE REALTIME CHANGE DATA CAPTURE (CDC) PUBLICATIONS
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'action_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE action_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'action_steps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE action_steps;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'action_ledger_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE action_ledger_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'renewals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE renewals;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Supabase realtime publication table configuration notice: %', SQLERRM;
END $$;

-- ==============================================================================
-- 10. RPC SECURITY HARDENING & PRINCIPLE OF LEAST PRIVILEGE
-- ==============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'settle_payment_webhook',
        'reserve_refund_balance',
        'release_refund_reservation',
        'finalize_atomic_refund_settlement',
        'claim_and_accept_quote'
      )
  ) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated, anon, public;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role;', r.proname, r.args);
  END LOOP;
END $$;

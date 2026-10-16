-- Migration: 20261016020000_harden_rpc_execution_grants.sql
-- Description: Hardens SECURITY DEFINER RPCs by revoking execution from authenticated and public roles.
-- Reconciles function signatures between 20261010010000 (8-param webhook) and 20261011000000 (12-param refund webhook).
-- Prevents unauthorized transaction changes, untrusted payment settlements, and arbitrary balance mutations.
-- All consequential financial settlements and balance reservations are strictly restricted to trusted
-- server-side execution paths operating with the service_role privilege.

-- ==============================================================================
-- 1. PURGE LEGACY OVERLOADS
-- ==============================================================================
-- Safely drop deprecated 8-parameter legacy signature if present from 20261010010000.
-- The canonical production signature is the 12-parameter version from 20261011000000,
-- which includes refund accounting, balance tracking, and cumulative limit enforcement.
DROP FUNCTION IF EXISTS public.settle_payment_webhook(
  UUID, VARCHAR, JSONB, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB
);

-- ==============================================================================
-- 2. DYNAMIC CATALOG INTROSPECTION & HARDENING ACROSS ALL OVERLOADS
-- ==============================================================================
-- Inspect pg_proc to discover every existing overload of each sensitive RPC in the
-- public schema, and defensively revoke execution from authenticated, anon, and public,
-- granting strictly to service_role. This ensures zero privilege leakage regardless
-- of the database migration history.
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

-- ==============================================================================
-- 3. EXPLICIT CANONICAL PERMISSION STATEMENTS WITH SAFE EXCEPTION RECOVERY
-- ==============================================================================

-- 1. Settle Payment Webhook: Revoke from authenticated and public; restrict strictly to service_role
-- Canonical signature: 12 parameters (extended in 20261011000000 for atomic refund & balance tracking)
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.settle_payment_webhook(
    UUID, VARCHAR, JSONB, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, NUMERIC, VARCHAR, VARCHAR, VARCHAR
  ) FROM authenticated, anon, public;

  GRANT EXECUTE ON FUNCTION public.settle_payment_webhook(
    UUID, VARCHAR, JSONB, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, NUMERIC, VARCHAR, VARCHAR, VARCHAR
  ) TO service_role;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'Function public.settle_payment_webhook(12 params) not present; dynamic catalog grant was applied.';
END $$;

-- 2. Reserve Refund Balance: Revoke from authenticated and public; restrict strictly to service_role
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.reserve_refund_balance(
    UUID, NUMERIC, UUID, UUID, VARCHAR
  ) FROM authenticated, anon, public;

  GRANT EXECUTE ON FUNCTION public.reserve_refund_balance(
    UUID, NUMERIC, UUID, UUID, VARCHAR
  ) TO service_role;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'Function public.reserve_refund_balance not present; dynamic catalog grant was applied.';
END $$;

-- 3. Release Refund Reservation: Revoke from authenticated and public; restrict strictly to service_role
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.release_refund_reservation(
    UUID, NUMERIC, VARCHAR
  ) FROM authenticated, anon, public;

  GRANT EXECUTE ON FUNCTION public.release_refund_reservation(
    UUID, NUMERIC, VARCHAR
  ) TO service_role;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'Function public.release_refund_reservation not present; dynamic catalog grant was applied.';
END $$;

-- 4. Finalize Atomic Refund Settlement: Revoke from authenticated and public; restrict strictly to service_role
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.finalize_atomic_refund_settlement(
    UUID, NUMERIC, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, UUID, UUID
  ) FROM authenticated, anon, public;

  GRANT EXECUTE ON FUNCTION public.finalize_atomic_refund_settlement(
    UUID, NUMERIC, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, UUID, UUID
  ) TO service_role;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'Function public.finalize_atomic_refund_settlement not present; dynamic catalog grant was applied.';
END $$;

-- 5. Claim and Accept Quote: Revoke from authenticated and public; restrict strictly to service_role
-- Quote acceptance and execution transitions are orchestrated exclusively by the ActionOS server-side engine.
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.claim_and_accept_quote(
    UUID, UUID, UUID, UUID
  ) FROM authenticated, anon, public;

  GRANT EXECUTE ON FUNCTION public.claim_and_accept_quote(
    UUID, UUID, UUID, UUID
  ) TO service_role;
EXCEPTION
  WHEN undefined_function THEN
    RAISE NOTICE 'Function public.claim_and_accept_quote not present; dynamic catalog grant was applied.';
END $$;

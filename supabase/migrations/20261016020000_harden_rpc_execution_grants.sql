-- Migration: 20261016020000_harden_rpc_execution_grants.sql
-- Description: Hardens SECURITY DEFINER RPCs by revoking execution from authenticated and public roles.
-- Prevents unauthorized transaction changes, untrusted payment settlements, and arbitrary balance mutations.
-- All consequential financial settlements and balance reservations are strictly restricted to trusted
-- server-side execution paths operating with the service_role privilege.

-- 1. Settle Payment Webhook: Revoke from authenticated and public; restrict strictly to service_role
REVOKE EXECUTE ON FUNCTION public.settle_payment_webhook(
  UUID, VARCHAR, JSONB, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, NUMERIC, VARCHAR, VARCHAR, VARCHAR
) FROM authenticated, anon, public;

GRANT EXECUTE ON FUNCTION public.settle_payment_webhook(
  UUID, VARCHAR, JSONB, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, NUMERIC, VARCHAR, VARCHAR, VARCHAR
) TO service_role;

-- 2. Reserve Refund Balance: Revoke from authenticated and public; restrict strictly to service_role
REVOKE EXECUTE ON FUNCTION public.reserve_refund_balance(
  UUID, NUMERIC, UUID, UUID, VARCHAR
) FROM authenticated, anon, public;

GRANT EXECUTE ON FUNCTION public.reserve_refund_balance(
  UUID, NUMERIC, UUID, UUID, VARCHAR
) TO service_role;

-- 3. Release Refund Reservation: Revoke from authenticated and public; restrict strictly to service_role
REVOKE EXECUTE ON FUNCTION public.release_refund_reservation(
  UUID, NUMERIC, VARCHAR
) FROM authenticated, anon, public;

GRANT EXECUTE ON FUNCTION public.release_refund_reservation(
  UUID, NUMERIC, VARCHAR
) TO service_role;

-- 4. Finalize Atomic Refund Settlement: Revoke from authenticated and public; restrict strictly to service_role
REVOKE EXECUTE ON FUNCTION public.finalize_atomic_refund_settlement(
  UUID, NUMERIC, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, UUID, UUID
) FROM authenticated, anon, public;

GRANT EXECUTE ON FUNCTION public.finalize_atomic_refund_settlement(
  UUID, NUMERIC, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB, UUID, UUID
) TO service_role;

-- 5. Claim and Accept Quote: Revoke from authenticated and public; restrict strictly to service_role
-- Quote acceptance and execution transitions are orchestrated exclusively by the ActionOS server-side engine.
REVOKE EXECUTE ON FUNCTION public.claim_and_accept_quote(
  UUID, UUID, UUID, UUID
) FROM authenticated, anon, public;

GRANT EXECUTE ON FUNCTION public.claim_and_accept_quote(
  UUID, UUID, UUID, UUID
) TO service_role;

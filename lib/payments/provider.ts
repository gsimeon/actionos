/**
 * ActionOS Payment Rail Provider Abstractions
 * 
 * Provider Coverage Matrix:
 * - Paystack: Production-ready adapter (PaystackPaymentProvider). Selected in production mode,
 *   requires PAYSTACK_SECRET_KEY, and verifies out-of-band settlement via HMAC-SHA512 webhooks.
 * - Mock Rail: Deterministic sandbox simulation driver (MockPaymentProvider) for offline demos and CI testing.
 * - Flutterwave: Integration roadmap (Planned). NOT production-ready until its adapter, settlement verification,
 *   and webhook signature verification paths are implemented and tested.
 */

/**
 * Explicit payment lifecycle states separating API request acceptance from authoritative settlement:
 * - initiated: Payment request created with gateway, checkout authorization URL generated
 * - pending: Awaiting customer debit, bank settlement, or webhook delivery (never treated as proof of settlement)
 * - confirmed / succeeded: Authoritative settlement verified via direct gateway verification endpoint or HMAC-validated webhook
 * - failed: Payment declined, expired, or rejected by payment rail
 * - refund_pending: Reversal requested with rail, awaiting confirmation
 * - refund_confirmed / refunded: Authoritative refund settlement verified and credited
 * - refund_failed: Reversal declined or failed by gateway rail, escalating to human operator
 */
export type CanonicalRefundState =
  | "refund_pending"
  | "refund_confirmed"
  | "refund_failed"
  | "refund_unknown";

export type CanonicalPaymentLifecycleState =
  | "initiated"
  | "pending"
  | "confirmed"
  | "failed"
  | "refund_pending"
  | "refund_confirmed"
  | "refund_failed"
  | "refund_unknown";

export interface PaymentInitiationInput {
  customerId: string;
  amount: number;
  currency: string;
  reference: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentInitiationResult {
  status: "initiated" | "processing" | "succeeded" | "failed";
  reference: string;
  gatewayUrl?: string;
  providerReference?: string;
}

export interface PaymentVerificationResult {
  status: "confirmed" | "succeeded" | "failed" | "pending";
  amount: number;
  currency: string;
  providerReference: string;
  paidAt?: string;
  verifiedAt?: string;
}

export interface PaymentRefundResult {
  status:
    | "refund_confirmed"
    | "refunded"
    | "refund_pending"
    | "refund_failed"
    | "failed"
    | "refund_unknown"
    | "unknown";
  refundReference: string;
  amount: number;
  currency?: string;
  error?: string;
  rawStatus?: string;
}

export interface RefundPaymentOptions {
  simulateRefundFailure?: boolean;
  simulateRefundPending?: boolean;
  simulateRefundUnknown?: boolean;
}

export interface IPaymentProvider {
  readonly name: string;
  requestPayment(input: PaymentInitiationInput): Promise<PaymentInitiationResult>;
  verifyPayment(reference: string): Promise<PaymentVerificationResult>;
  refundPayment?(
    reference: string,
    amount?: number,
    options?: RefundPaymentOptions
  ): Promise<PaymentRefundResult>;
  verifyRefund?(refundReference: string): Promise<PaymentRefundResult>;
}

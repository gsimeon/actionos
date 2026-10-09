export interface PaymentInitiationInput {
  customerId: string;
  amount: number;
  currency: string;
  reference: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentInitiationResult {
  status: "processing" | "succeeded" | "failed";
  reference: string;
  gatewayUrl?: string;
  providerReference?: string;
}

export interface PaymentVerificationResult {
  status: "succeeded" | "failed" | "pending";
  amount: number;
  currency: string;
  providerReference: string;
  paidAt: string;
}

export interface PaymentRefundResult {
  status: "refunded" | "failed";
  refundReference: string;
  amount: number;
  currency?: string;
  error?: string;
}

export interface IPaymentProvider {
  readonly name: string;
  requestPayment(input: PaymentInitiationInput): Promise<PaymentInitiationResult>;
  verifyPayment(reference: string): Promise<PaymentVerificationResult>;
  refundPayment?(reference: string, amount?: number, options?: { simulateRefundFailure?: boolean }): Promise<PaymentRefundResult>;
}

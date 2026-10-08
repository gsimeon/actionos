import type {
  IPaymentProvider,
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentVerificationResult,
  PaymentRefundResult,
} from "./provider";

/**
 * Production Paystack Payment Gateway Integration Driver
 * Interacts directly with Paystack REST API for Nigerian NGN payment rail verification & checkout.
 */
export class PaystackPaymentProvider implements IPaymentProvider {
  public readonly name = "Paystack Gateway (Production)";
  private secretKey: string;

  constructor(secretKey?: string) {
    this.secretKey = secretKey || process.env.PAYSTACK_SECRET_KEY || "";
  }

  async requestPayment(input: PaymentInitiationInput): Promise<PaymentInitiationResult> {
    if (!this.secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is required for live payment initiation");
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100), // Kobo conversion
        email: (input.metadata?.email as string) || "customer@actionos.ng",
        reference: input.reference,
        currency: input.currency || "NGN",
        metadata: input.metadata || {},
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Paystack initialization failed: ${err.message || response.statusText}`);
    }

    const data = await response.json();
    return {
      status: "processing",
      reference: input.reference,
      gatewayUrl: data.data?.authorization_url,
    };
  }

  async verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    if (!this.secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is required for live payment verification");
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Paystack verification failed: ${err.message || response.statusText}`);
    }

    const json = await response.json();
    const data = json.data;

    const status = data.status === "success" ? "succeeded" : data.status === "failed" ? "failed" : "pending";
    const amount = (data.amount || 0) / 100; // Convert from Kobo to Naira

    return {
      status,
      amount,
      currency: data.currency || "NGN",
      providerReference: data.id ? String(data.id) : reference,
      paidAt: data.paid_at || new Date().toISOString(),
    };
  }

  async refundPayment(reference: string, amount?: number): Promise<PaymentRefundResult> {
    if (!this.secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is required for refund processing");
    }

    const response = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: reference,
        amount: amount ? Math.round(amount * 100) : undefined,
      }),
    });

    if (!response.ok) {
      return {
        status: "failed",
        refundReference: `ref_fail_${Date.now()}`,
        amount: amount || 0,
      };
    }

    const json = await response.json();
    return {
      status: "refunded",
      refundReference: json.data?.id ? String(json.data.id) : `ref_${Date.now()}`,
      amount: amount || (json.data?.amount ? json.data.amount / 100 : 0),
    };
  }
}

import type {
  IPaymentProvider,
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentVerificationResult,
  PaymentRefundResult,
} from "./provider";
import { isProductionMode } from "@/lib/runtime/mode";

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

    if (!input.customerId || typeof input.customerId !== "string" || !input.customerId.trim()) {
      throw new Error("Customer identity (customerId) is required before initializing a transaction.");
    }

    if (
      typeof input.amount !== "number" ||
      isNaN(input.amount) ||
      input.amount <= 0 ||
      !isFinite(input.amount)
    ) {
      throw new Error(`Invalid payment amount: ${input.amount}. Amount must be a positive non-zero number.`);
    }

    // Validate minor-unit (kobo) precision: max 2 decimal places, no fractional kobo
    const roundedAmount = Math.round(input.amount * 100) / 100;
    if (Math.abs(input.amount - roundedAmount) > 1e-6) {
      throw new Error(
        `Invalid amount precision: ${input.amount}. Payment amount cannot exceed 2 decimal places (fractional kobo is prohibited).`
      );
    }

    const currency = (input.currency || "NGN").toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(`Invalid currency code: '${input.currency}'. Currency must be a 3-letter ISO code.`);
    }
    if (currency !== "NGN") {
      throw new Error(
        `Unsupported currency: '${currency}'. Paystack gateway exclusively settles in 'NGN' for local policy renewal.`
      );
    }

    const amountInKobo = Math.round(input.amount * 100);
    if (amountInKobo <= 0) {
      throw new Error("Calculated minor currency units (kobo) must be greater than zero.");
    }

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const candidateEmail = (
      input.email ||
      (input.metadata?.email as string) ||
      ((input as unknown as Record<string, unknown>).customerEmail as string | undefined)
    )?.trim();

    const isLive = isProductionMode() || (this.secretKey.length > 0 && !this.secretKey.startsWith("sk_test_"));

    if (!candidateEmail) {
      if (isLive) {
        throw new Error(
          "Customer email is strictly required for live Paystack payment initiation. Silent fallback to generic address is prohibited."
        );
      }
    } else {
      if (!EMAIL_REGEX.test(candidateEmail)) {
        throw new Error(
          `Invalid customer email format: '${candidateEmail}'. A valid email address is required for payment initialization.`
        );
      }
      if (isProductionMode() && candidateEmail.toLowerCase() === "customer@actionos.ng") {
        throw new Error(
          "Generic fallback email 'customer@actionos.ng' is prohibited for live payment initialization in production. A verified customer email is required."
        );
      }
    }

    const email = candidateEmail || "customer@actionos.ng";

    let response: Response;
    try {
      response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInKobo,
          email,
          reference: input.reference,
          currency,
          metadata: input.metadata || {},
        }),
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Paystack initialization network error: ${errMsg}`);
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.message || response.statusText || `HTTP ${response.status}`;

      // Idempotency check: if transaction reference was already initiated or paid
      if (
        errMsg.toLowerCase().includes("duplicate") ||
        errMsg.toLowerCase().includes("already exists") ||
        errMsg.toLowerCase().includes("reference has already been used")
      ) {
        try {
          const verified = await this.verifyPayment(input.reference);
          if (verified.status === "succeeded" || verified.status === "confirmed") {
            return {
              status: "succeeded",
              reference: input.reference,
              providerReference: verified.providerReference,
            };
          } else if (verified.status === "pending") {
            return {
              status: "processing",
              reference: input.reference,
              providerReference: verified.providerReference,
            };
          }
        } catch {
          // If verifyPayment also throws, fall through to throw original initiation error
        }
      }

      throw new Error(`Paystack initialization failed: ${errMsg}`);
    }

    const data = await response.json();
    return {
      status: "processing",
      reference: input.reference,
      gatewayUrl: data.data?.authorization_url,
      providerReference: data.data?.reference || input.reference,
    };
  }

  async verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    if (!this.secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is required for live payment verification");
    }

    if (!reference || typeof reference !== "string" || !reference.trim()) {
      throw new Error("Transaction reference is required for payment verification");
    }

    let response: Response;
    try {
      response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference.trim())}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Paystack verification network error: ${errMsg}`);
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.message || response.statusText || `HTTP ${response.status}`;
      throw new Error(`Paystack verification failed: ${errMsg}`);
    }

    const json = await response.json();
    const data = json.data;

    const status = data?.status === "success" ? "succeeded" : data?.status === "failed" ? "failed" : "pending";
    const amount = (data?.amount || 0) / 100; // Convert from Kobo to Naira
    const verifiedAt = new Date().toISOString();
    // Only return paidAt when provider confirmed payment settlement with a valid paid_at timestamp
    const paidAt = status === "succeeded" && data?.paid_at ? String(data.paid_at) : undefined;

    return {
      status,
      amount,
      currency: (data?.currency || "NGN").toUpperCase(),
      providerReference: data?.id ? String(data.id) : reference,
      paidAt,
      verifiedAt,
    };
  }

  async refundPayment(reference: string, amount?: number): Promise<PaymentRefundResult> {
    if (!this.secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is required for refund processing");
    }

    if (!reference || typeof reference !== "string" || !reference.trim()) {
      throw new Error("Transaction reference is required for refund processing");
    }

    let response: Response;
    try {
      response = await fetch("https://api.paystack.co/refund", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transaction: reference.trim(),
          amount: amount ? Math.round(amount * 100) : undefined,
        }),
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        status: "refund_unknown",
        refundReference: `ref_unknown_${Date.now()}`,
        amount: amount || 0,
        currency: "NGN",
        error: `Gateway connection failure / timeout during refund request: ${errMsg}`,
      };
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.message || response.statusText || `HTTP ${response.status}`;

      // HTTP 5xx indicates server error or gateway timeout: outcome is unknown/ambiguous
      if (response.status >= 500) {
        return {
          status: "refund_unknown",
          refundReference: `ref_unknown_${Date.now()}`,
          amount: amount || 0,
          currency: "NGN",
          error: `HTTP ${response.status}: Gateway server error or timeout during refund: ${errMsg}`,
        };
      }

      // HTTP 4xx indicates client rejection (e.g., transaction not found, unrefundable, already reversed)
      return {
        status: "refund_failed",
        refundReference: `ref_fail_${Date.now()}`,
        amount: amount || 0,
        currency: "NGN",
        error: `HTTP ${response.status}: ${errMsg}`,
      };
    }

    let json: Record<string, unknown>;
    try {
      json = await response.json();
    } catch {
      return {
        status: "refund_unknown",
        refundReference: `ref_unknown_${Date.now()}`,
        amount: amount || 0,
        currency: "NGN",
        error: "Malformed JSON response from Paystack refund endpoint",
      };
    }

    // Paystack returns { status: false, message: "..." } when declined
    if (json.status === false) {
      const errMsg = typeof json.message === "string" ? json.message : "Paystack declined refund request";
      return {
        status: "refund_failed",
        refundReference: `ref_fail_${Date.now()}`,
        amount: amount || 0,
        currency: "NGN",
        error: errMsg,
      };
    }

    const data = (json.data && typeof json.data === "object" ? json.data : {}) as Record<string, unknown>;
    const rawStatus = (typeof data.status === "string" ? data.status : "").toLowerCase().trim();
    const refundRef = data.id !== undefined && data.id !== null ? String(data.id) : `ref_${Date.now()}`;
    const refundAmount = typeof data.amount === "number" ? data.amount / 100 : (amount || 0);
    const refundCurrency = (typeof data.currency === "string" ? data.currency : "NGN").toUpperCase();

    // Model pending, confirmed, failed, and unknown outcomes accurately:
    // - processed / success: authoritative settlement completed
    // - pending / processing: accepted and queued by gateway, awaiting bank settlement
    // - failed: rejected by gateway or card rail
    // - other / unspecified: ambiguous outcome
    const msg = (typeof json.message === "string" ? json.message : "").toLowerCase();
    if (rawStatus === "processed" || rawStatus === "success") {
      return {
        status: "refund_confirmed",
        refundReference: refundRef,
        amount: refundAmount,
        currency: refundCurrency,
        rawStatus,
      };
    } else if (rawStatus === "pending" || rawStatus === "processing" || msg.includes("queued")) {
      return {
        status: "refund_pending",
        refundReference: refundRef,
        amount: refundAmount,
        currency: refundCurrency,
        rawStatus: rawStatus || "pending",
      };
    } else if (rawStatus === "failed") {
      const failNote = typeof data.merchant_note === "string" ? data.merchant_note : "Gateway reported refund status as failed";
      return {
        status: "refund_failed",
        refundReference: refundRef,
        amount: refundAmount,
        currency: refundCurrency,
        error: failNote,
        rawStatus,
      };
    } else {
      return {
        status: "refund_unknown",
        refundReference: refundRef,
        amount: refundAmount,
        currency: refundCurrency,
        error: `Ambiguous provider refund status: '${rawStatus || "unspecified"}'`,
        rawStatus,
      };
    }
  }

  async verifyRefund(refundReference: string): Promise<PaymentRefundResult> {
    if (!this.secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is required for refund verification");
    }

    if (!refundReference || typeof refundReference !== "string" || !refundReference.trim()) {
      throw new Error("Refund reference is required for refund verification");
    }

    let response: Response;
    try {
      response = await fetch(`https://api.paystack.co/refund/${encodeURIComponent(refundReference.trim())}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        status: "refund_unknown",
        refundReference,
        amount: 0,
        currency: "NGN",
        error: `Gateway connection failure / timeout during refund verification: ${errMsg}`,
      };
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.message || response.statusText || `HTTP ${response.status}`;
      if (response.status >= 500) {
        return {
          status: "refund_unknown",
          refundReference,
          amount: 0,
          currency: "NGN",
          error: `HTTP ${response.status}: Gateway server error during refund verification: ${errMsg}`,
        };
      }
      return {
        status: "refund_failed",
        refundReference,
        amount: 0,
        currency: "NGN",
        error: `HTTP ${response.status}: ${errMsg}`,
      };
    }

    let json: Record<string, unknown>;
    try {
      json = await response.json();
    } catch {
      return {
        status: "refund_unknown",
        refundReference,
        amount: 0,
        currency: "NGN",
        error: "Malformed JSON response from Paystack refund verification",
      };
    }

    if (json.status === false) {
      const errMsg = typeof json.message === "string" ? json.message : "Paystack reported refund not found or invalid";
      return {
        status: "refund_failed",
        refundReference,
        amount: 0,
        currency: "NGN",
        error: errMsg,
      };
    }

    const data = (json.data && typeof json.data === "object" ? json.data : {}) as Record<string, unknown>;
    const rawStatus = (typeof data.status === "string" ? data.status : "").toLowerCase().trim();
    const confirmedRef = data.id !== undefined && data.id !== null ? String(data.id) : refundReference;
    const confirmedAmount = typeof data.amount === "number" ? data.amount / 100 : 0;
    const confirmedCurrency = (typeof data.currency === "string" ? data.currency : "NGN").toUpperCase();

    if (rawStatus === "processed" || rawStatus === "success") {
      return {
        status: "refund_confirmed",
        refundReference: confirmedRef,
        amount: confirmedAmount,
        currency: confirmedCurrency,
        rawStatus,
      };
    } else if (rawStatus === "pending" || rawStatus === "processing") {
      return {
        status: "refund_pending",
        refundReference: confirmedRef,
        amount: confirmedAmount,
        currency: confirmedCurrency,
        rawStatus,
      };
    } else if (rawStatus === "failed") {
      return {
        status: "refund_failed",
        refundReference: confirmedRef,
        amount: confirmedAmount,
        currency: confirmedCurrency,
        error: "Paystack verified refund status as failed",
        rawStatus,
      };
    } else {
      return {
        status: "refund_unknown",
        refundReference: confirmedRef,
        amount: confirmedAmount,
        currency: confirmedCurrency,
        error: `Ambiguous provider verification status: '${rawStatus || "unspecified"}'`,
        rawStatus,
      };
    }
  }
}

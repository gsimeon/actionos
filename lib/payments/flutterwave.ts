import crypto from "node:crypto";
import type {
  IPaymentProvider,
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentVerificationResult,
  PaymentRefundResult,
} from "./provider";

/**
 * Cryptographically verifies Flutterwave webhook authenticity against the configured secret hash.
 * Flutterwave sends the secret hash in the 'verif-hash' HTTP request header.
 * Uses timingSafeEqual to prevent signature tampering or timing attacks.
 */
export function verifyFlutterwaveWebhookSignature(
  signature: string | null | undefined,
  secretHash?: string
): boolean {
  const secret =
    secretHash ||
    process.env.FLUTTERWAVE_SECRET_HASH ||
    process.env.FLUTTERWAVE_WEBHOOK_HASH ||
    "";

  if (!secret || !signature) {
    return false;
  }

  try {
    const secretBuf = Buffer.from(secret, "utf8");
    const sigBuf = Buffer.from(signature, "utf8");
    if (secretBuf.length !== sigBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(secretBuf, sigBuf);
  } catch {
    return false;
  }
}

/**
 * Production Flutterwave Payment Gateway Integration Driver
 * Interacts directly with Flutterwave REST API v3 for Nigerian NGN / multi-currency payment rail verification & checkout.
 */
export class FlutterwavePaymentProvider implements IPaymentProvider {
  public readonly name = "Flutterwave Gateway (Production)";
  private secretKey: string;
  private baseUrl: string;

  constructor(secretKey?: string, baseUrl = "https://api.flutterwave.com/v3") {
    this.secretKey = secretKey || process.env.FLUTTERWAVE_SECRET_KEY || "";
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async requestPayment(input: PaymentInitiationInput): Promise<PaymentInitiationResult> {
    if (!this.secretKey) {
      throw new Error("FLUTTERWAVE_SECRET_KEY is required for live payment initiation");
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

    // Validate precision: maximum 2 decimal places (fractional kobo prohibited)
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

    if (!input.reference || typeof input.reference !== "string" || !input.reference.trim()) {
      throw new Error("Transaction reference is required before initializing a payment transaction.");
    }

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const candidateEmail = (
      input.email ||
      (input.metadata?.email as string) ||
      ((input as unknown as Record<string, unknown>).customerEmail as string | undefined)
    )?.trim();

    if (!candidateEmail) {
      throw new Error(
        "Customer email is strictly required for live Flutterwave payment initiation. Silent fallback to generic address is prohibited."
      );
    }

    if (!EMAIL_REGEX.test(candidateEmail)) {
      throw new Error(
        `Invalid customer email format: '${candidateEmail}'. A valid email address is required for payment initialization.`
      );
    }

    if (candidateEmail.toLowerCase() === "customer@actionos.ng") {
      throw new Error(
        "Generic fallback email 'customer@actionos.ng' is prohibited for Flutterwave payment initialization. A verified customer email is required."
      );
    }

    const email = candidateEmail;
    const customerName =
      typeof input.metadata?.customerName === "string" && input.metadata.customerName.trim()
        ? input.metadata.customerName.trim()
        : undefined;
    const customerPhone =
      typeof input.metadata?.customerPhone === "string" && input.metadata.customerPhone.trim()
        ? input.metadata.customerPhone.trim()
        : undefined;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/payments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: input.reference.trim(),
          amount: input.amount,
          currency,
          redirect_url: (input.metadata?.redirect_url as string) || "https://actionos.ng/dashboard",
          customer: {
            email,
            name: customerName,
            phonenumber: customerPhone,
          },
          meta: input.metadata || {},
          customizations: {
            title: "ActionOS Renew",
            description: "Autonomous Statutory Policy & Compliance Renewal",
          },
        }),
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Flutterwave initialization network error: ${errMsg}`);
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.message || response.statusText || `HTTP ${response.status}`;

      // Idempotency check: if transaction reference was already initiated or paid
      if (
        errMsg.toLowerCase().includes("duplicate") ||
        errMsg.toLowerCase().includes("already exists") ||
        errMsg.toLowerCase().includes("reference has already been used") ||
        errMsg.toLowerCase().includes("tx_ref already exists")
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

      throw new Error(`Flutterwave initialization failed: ${errMsg}`);
    }

    const data = await response.json();
    return {
      status: "processing",
      reference: input.reference,
      gatewayUrl: data.data?.link,
      providerReference: String(data.data?.id || input.reference),
    };
  }

  async verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    if (!this.secretKey) {
      throw new Error("FLUTTERWAVE_SECRET_KEY is required for live payment verification");
    }

    if (!reference || typeof reference !== "string" || !reference.trim()) {
      throw new Error("Transaction reference is required for payment verification");
    }

    const trimmedRef = reference.trim();
    const isNumericId = /^\d+$/.test(trimmedRef);

    let response: Response;
    try {
      if (isNumericId) {
        response = await fetch(`${this.baseUrl}/transactions/${encodeURIComponent(trimmedRef)}/verify`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            "Content-Type": "application/json",
          },
        });
      } else {
        // Query by transaction reference (tx_ref)
        response = await fetch(`${this.baseUrl}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(trimmedRef)}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            "Content-Type": "application/json",
          },
        });

        // Fallback to direct ID query if 404
        if (response.status === 404) {
          response = await fetch(`${this.baseUrl}/transactions/${encodeURIComponent(trimmedRef)}/verify`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              "Content-Type": "application/json",
            },
          });
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Flutterwave verification network error: ${errMsg}`);
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.message || response.statusText || `HTTP ${response.status}`;
      throw new Error(`Flutterwave verification failed: ${errMsg}`);
    }

    const json = await response.json();
    const data = json.data;

    const rawStatus = (typeof data?.status === "string" ? data.status : "").toLowerCase().trim();
    const status =
      rawStatus === "successful" || rawStatus === "success"
        ? "succeeded"
        : rawStatus === "failed"
          ? "failed"
          : "pending";

    const amount = typeof data?.amount === "number" ? data.amount : Number(data?.charged_amount || 0);
    const verifiedAt = new Date().toISOString();
    const paidAt =
      status === "succeeded" && (data?.created_at || data?.paid_at)
        ? String(data.created_at || data.paid_at)
        : undefined;

    const paymentReference = data?.tx_ref ? String(data.tx_ref).trim() : trimmedRef;
    const providerReference = data?.flw_ref ? String(data.flw_ref).trim() : String(data?.id || trimmedRef).trim();
    const providerTransactionId = data?.id !== undefined && data?.id !== null ? String(data.id).trim() : undefined;
    const providerCurrency =
      typeof data?.currency === "string" && data.currency.trim()
        ? data.currency.toUpperCase().trim()
        : "";

    return {
      status,
      amount,
      currency: providerCurrency,
      reference: paymentReference,
      providerReference,
      providerTransactionId,
      paidAt,
      verifiedAt,
    };
  }

  async refundPayment(reference: string, amount?: number): Promise<PaymentRefundResult> {
    if (!this.secretKey) {
      throw new Error("FLUTTERWAVE_SECRET_KEY is required for refund processing");
    }

    if (!reference || typeof reference !== "string" || !reference.trim()) {
      throw new Error("Transaction reference is required for refund processing");
    }

    // Validate refund amount if provided
    if (amount !== undefined) {
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("Invalid refund amount: amount must be a finite positive number strictly greater than zero");
      }
      if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
        throw new Error("Invalid refund amount precision: amount cannot have more than 2 decimal places");
      }
    }

    // Flutterwave requires the transaction ID for the refund path: /transactions/:id/refund
    let transactionId = reference.trim();
    if (!/^\d+$/.test(transactionId)) {
      try {
        const verified = await this.verifyPayment(transactionId);
        if (verified.providerTransactionId) {
          transactionId = verified.providerTransactionId;
        } else {
          return {
            status: "refund_failed",
            amount: amount || 0,
            error: `Could not resolve numeric Flutterwave transaction ID for reference '${reference}'`,
          };
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          status: "refund_unknown",
          amount: amount || 0,
          error: `Failed to resolve transaction ID before refund: ${errMsg}`,
        };
      }
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/transactions/${encodeURIComponent(transactionId)}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          comments: "ActionOS automated compensating refund",
        }),
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        status: "refund_unknown",
        amount: amount || 0,
        error: `Gateway connection failure / timeout during refund request: ${errMsg}`,
      };
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.message || response.statusText || `HTTP ${response.status}`;

      if (response.status >= 500) {
        return {
          status: "refund_unknown",
          amount: amount || 0,
          error: `HTTP ${response.status}: Gateway server error or timeout during refund: ${errMsg}`,
        };
      }

      return {
        status: "refund_failed",
        amount: amount || 0,
        error: `HTTP ${response.status}: ${errMsg}`,
      };
    }

    let json: Record<string, unknown>;
    try {
      json = await response.json();
    } catch {
      return {
        status: "refund_unknown",
        amount: amount || 0,
        error: "Malformed JSON response from Flutterwave refund endpoint",
      };
    }

    if (json.status !== "success") {
      const errMsg = typeof json.message === "string" ? json.message : "Flutterwave declined refund request";
      return {
        status: "refund_failed",
        amount: amount || 0,
        error: errMsg,
      };
    }

    const data = (json.data && typeof json.data === "object" ? json.data : {}) as Record<string, unknown>;
    const rawStatus = (typeof data.status === "string" ? data.status : "").toLowerCase().trim();
    const refundId = data.id !== undefined && data.id !== null ? String(data.id).trim() : undefined;
    const refundRef =
      typeof data.flw_ref === "string" && data.flw_ref.trim()
        ? data.flw_ref.trim()
        : refundId;
    const refundAmount =
      typeof data.amount_refunded === "number"
        ? data.amount_refunded
        : typeof data.amount === "number"
          ? data.amount
          : (amount || 0);

    const refundCurrency =
      typeof data.currency === "string" && data.currency.trim()
        ? data.currency.toUpperCase().trim()
        : "";

    if (!refundId && !refundRef) {
      return {
        status: "refund_unknown",
        amount: refundAmount,
        currency: refundCurrency,
        error: "Flutterwave refund response omitted authoritative identifier. Synthetic fallback reference generation is prohibited.",
        rawStatus,
      };
    }

    const msg = (typeof json.message === "string" ? json.message : "").toLowerCase();
    if (rawStatus === "completed" || rawStatus === "successful" || rawStatus === "success") {
      return {
        status: "refund_confirmed",
        refundId,
        refundReference: refundRef,
        transactionReference: reference.trim(),
        amount: refundAmount,
        currency: refundCurrency,
        rawStatus,
      };
    } else if (rawStatus === "pending" || rawStatus === "processing" || msg.includes("queued")) {
      return {
        status: "refund_pending",
        refundId,
        refundReference: refundRef,
        transactionReference: reference.trim(),
        amount: refundAmount,
        currency: refundCurrency,
        rawStatus: rawStatus || "pending",
      };
    } else if (rawStatus === "failed") {
      return {
        status: "refund_failed",
        refundId,
        refundReference: refundRef,
        transactionReference: reference.trim(),
        amount: refundAmount,
        currency: refundCurrency,
        error: "Gateway reported refund status as failed",
        rawStatus,
      };
    } else {
      return {
        status: "refund_unknown",
        refundId,
        refundReference: refundRef,
        transactionReference: reference.trim(),
        amount: refundAmount,
        currency: refundCurrency,
        error: `Ambiguous provider refund status: '${rawStatus || "unspecified"}'`,
        rawStatus,
      };
    }
  }

  async verifyRefund(refundReference: string): Promise<PaymentRefundResult> {
    if (!this.secretKey) {
      throw new Error("FLUTTERWAVE_SECRET_KEY is required for refund verification");
    }

    if (!refundReference || typeof refundReference !== "string" || !refundReference.trim()) {
      throw new Error("Refund reference is required for refund verification");
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/refunds/${encodeURIComponent(refundReference.trim())}`, {
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
          error: `HTTP ${response.status}: Gateway server error during refund verification: ${errMsg}`,
        };
      }
      return {
        status: "refund_failed",
        refundReference,
        amount: 0,
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
        error: "Malformed JSON response from Flutterwave refund verification",
      };
    }

    if (json.status !== "success") {
      const errMsg = typeof json.message === "string" ? json.message : "Flutterwave reported refund not found or invalid";
      return {
        status: "refund_failed",
        refundReference,
        amount: 0,
        error: errMsg,
      };
    }

    const data = (json.data && typeof json.data === "object" ? json.data : {}) as Record<string, unknown>;
    const rawStatus = (typeof data.status === "string" ? data.status : "").toLowerCase().trim();
    const refundId = data.id !== undefined && data.id !== null ? String(data.id).trim() : undefined;
    const refundRef =
      typeof data.flw_ref === "string" && data.flw_ref.trim()
        ? data.flw_ref.trim()
        : refundId;
    const confirmedAmount =
      typeof data.amount_refunded === "number"
        ? data.amount_refunded
        : typeof data.amount === "number"
          ? data.amount
          : 0;
    const confirmedCurrency =
      typeof data.currency === "string" && data.currency.trim()
        ? data.currency.toUpperCase().trim()
        : "";

    const txRef =
      typeof data.tx_ref === "string" && data.tx_ref.trim()
        ? data.tx_ref.trim()
        : undefined;

    const confirmedRef = refundRef || refundId || refundReference;

    if (rawStatus === "completed" || rawStatus === "successful" || rawStatus === "success") {
      return {
        status: "refund_confirmed",
        refundId,
        refundReference: confirmedRef,
        transactionReference: txRef,
        amount: confirmedAmount,
        currency: confirmedCurrency,
        rawStatus,
      };
    } else if (rawStatus === "pending" || rawStatus === "processing") {
      return {
        status: "refund_pending",
        refundId,
        refundReference: confirmedRef,
        transactionReference: txRef,
        amount: confirmedAmount,
        currency: confirmedCurrency,
        rawStatus,
      };
    } else if (rawStatus === "failed") {
      return {
        status: "refund_failed",
        refundId,
        refundReference: confirmedRef,
        transactionReference: txRef,
        amount: confirmedAmount,
        currency: confirmedCurrency,
        error: "Flutterwave verified refund status as failed",
        rawStatus,
      };
    } else {
      return {
        status: "refund_unknown",
        refundId,
        refundReference: confirmedRef,
        amount: confirmedAmount,
        currency: confirmedCurrency,
        error: `Ambiguous provider verification status: '${rawStatus || "unspecified"}'`,
        rawStatus,
      };
    }
  }
}

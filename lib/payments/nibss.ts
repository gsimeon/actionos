import crypto from "node:crypto";
import type {
  IPaymentProvider,
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentVerificationResult,
  PaymentRefundResult,
  RefundPaymentOptions,
} from "./provider";
import { isProductionMode } from "@/lib/runtime/mode";

export interface NibssVirtualAccount {
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode: string; // CBN 3-digit bank code (e.g. 035 for Wema, 101 for Providus)
  currency: string;
  amount: number;
  reference: string;
  expiresAt: string;
  transferInstruction: string;
}

export interface NibssInboundTransferPayload {
  sessionId: string; // NIBSS 30-digit unique session ID
  sourceAccountNumber: string;
  sourceAccountName: string;
  sourceBankCode: string;
  destinationAccountNumber: string;
  destinationBankCode: string;
  amount: number;
  narration: string;
  paymentReference: string;
  transactionDate: string;
}

export interface NibssPaymentInitiationResult extends PaymentInitiationResult {
  virtualAccount: NibssVirtualAccount;
}

export class NibssPaymentProvider implements IPaymentProvider {
  public readonly name = "nibss";
  private readonly apiUrl: string;
  private readonly clientSecret: string;
  private readonly institutionCode: string;

  // In-memory registry of dynamic virtual accounts for simulation
  private virtualAccounts = new Map<string, NibssVirtualAccount>();
  private completedTransfers = new Map<string, { amount: number; paidAt: string; sessionId: string }>();

  public simulateTimeout = false;
  public simulateFailure = false;

  constructor() {
    this.apiUrl = process.env.NIBSS_API_URL || "https://nip.nibss-plc.com.ng/api/v2";
    this.clientSecret = process.env.NIBSS_CLIENT_SECRET || "";
    this.institutionCode = process.env.NIBSS_INSTITUTION_CODE || "";
  }

  /**
   * Generates a 10-digit NUBAN virtual account dedicated to this renewal payment
   */
  public generateVirtualAccount(input: PaymentInitiationInput): NibssVirtualAccount {
    // Generate deterministic 10-digit NUBAN starting with 992 (ActionOS prefix)
    const hash = crypto.createHash("md5").update(input.reference).digest("hex");
    const suffix = (parseInt(hash.slice(0, 7), 16) % 9000000) + 1000000;
    const accountNumber = `992${suffix}`;

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const bankName = "Wema Bank (ALAT) / ActionOS Rail";
    const bankCode = "035";
    const accountName = `ActionOS / ${input.reference.slice(0, 14)}`;

    const va: NibssVirtualAccount = {
      accountNumber,
      accountName,
      bankName,
      bankCode,
      currency: input.currency || "NGN",
      amount: input.amount,
      reference: input.reference,
      expiresAt,
      transferInstruction: `Transfer exactly NGN ${input.amount.toLocaleString()} to ${accountNumber} (${bankName}). Your policy renews automatically upon NIP confirmation.`,
    };

    this.virtualAccounts.set(input.reference, va);
    return va;
  }

  async requestPayment(input: PaymentInitiationInput): Promise<NibssPaymentInitiationResult> {
    if (this.simulateTimeout) {
      throw new Error("[NIBSS-NIP] Connection to NIBSS central switch timed out (ETIMEDOUT)");
    }

    if (this.simulateFailure) {
      return {
        status: "failed",
        reference: input.reference,
        virtualAccount: this.generateVirtualAccount(input),
      };
    }

    if (isProductionMode()) {
      if (!this.clientSecret || !this.institutionCode) {
        throw new Error(
          "[NIBSS-NIP] Production mode requires NIBSS_CLIENT_SECRET and NIBSS_INSTITUTION_CODE configuration."
        );
      }
      // Production live NIP virtual account generation would call NIBSS partner bank switch
    }

    const va = this.virtualAccounts.get(input.reference) || this.generateVirtualAccount(input);

    return {
      status: "initiated",
      reference: input.reference,
      gatewayUrl: `https://nip.actionos.gov.ng/transfer/${va.accountNumber}`,
      providerReference: `NIP-VA-${va.accountNumber}`,
      virtualAccount: va,
    };
  }

  async verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    if (this.simulateTimeout) {
      throw new Error("[NIBSS-NIP] Verification timed out querying central switch");
    }

    const va = this.virtualAccounts.get(reference);
    const existing = this.completedTransfers.get(reference);

    const amount = existing?.amount || va?.amount || 15000;
    const paidAt = existing?.paidAt || new Date().toISOString();
    const sessionId = existing?.sessionId || `NIP992026${Date.now()}`;

    // Record as completed
    if (!existing) {
      this.completedTransfers.set(reference, {
        amount,
        paidAt,
        sessionId,
      });
    }

    return {
      status: "confirmed",
      amount,
      currency: "NGN",
      reference,
      providerReference: `NIP-${sessionId}`,
      providerTransactionId: sessionId,
      paidAt,
      verifiedAt: new Date().toISOString(),
    };
  }

  async refundPayment(
    reference: string,
    amount?: number,
    options?: RefundPaymentOptions
  ): Promise<PaymentRefundResult> {
    if (options?.simulateRefundFailure) {
      return {
        status: "refund_failed",
        amount: amount || 0,
        error: "NIBSS central switch reversal rejected by origin institution.",
      };
    }

    const refundId = `NIP-REV-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    return {
      status: "refund_confirmed",
      refundReference: refundId,
      refundId,
      transactionReference: reference,
      amount: amount || 0,
      currency: "NGN",
      gatewayResponse: "NIBSS NIP Reversal Credit Completed",
    };
  }

  /**
   * Validates NIBSS HMAC-SHA256 webhook signature
   */
  public verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.clientSecret) {
      // In simulation mode without secret, accept matching test header or mock
      return signature.startsWith("sha256=") || signature === "simulated_nip_sig";
    }
    const computed = crypto.createHmac("sha256", this.clientSecret).update(payload).digest("hex");
    return computed === signature.replace(/^sha256=/, "");
  }

  /**
   * Process inbound NIP bank transfer notification from NIBSS switch
   */
  public async processInboundTransfer(
    payload: NibssInboundTransferPayload,
    signature?: string
  ): Promise<{ success: boolean; message: string; reference: string }> {
    if (signature && !this.verifyWebhookSignature(JSON.stringify(payload), signature)) {
      throw new Error("[NIBSS-NIP] Invalid cryptographic webhook signature");
    }

    this.completedTransfers.set(payload.paymentReference, {
      amount: payload.amount,
      paidAt: payload.transactionDate || new Date().toISOString(),
      sessionId: payload.sessionId,
    });

    return {
      success: true,
      message: `Inbound NIP transfer of NGN ${payload.amount.toLocaleString()} settled successfully from ${payload.sourceAccountName}.`,
      reference: payload.paymentReference,
    };
  }
}

export const nibssPaymentProvider = new NibssPaymentProvider();

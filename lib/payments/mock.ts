import type {
  IPaymentProvider,
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentVerificationResult,
  PaymentRefundResult,
} from "./provider";
import { getRepositoryContainer } from "@/lib/repositories";
import { isProductionMode } from "@/lib/runtime/mode";

interface PaymentStoreEntry {
  reference: string;
  customerId: string;
  amount: number;
  currency: string;
  status: "processing" | "succeeded" | "failed";
  paidAt: string;
  providerReference: string;
}

export class MockPaymentProvider implements IPaymentProvider {
  public readonly name = "ActionOS Mock Paystack Rail (Simulation)";
  private simulatedPayments = new Map<string, PaymentStoreEntry>();
  public simulateRefundPending = false;
  public simulateRefundUnknown = false;
  public simulateRefundFailure = false;

  async requestPayment(input: PaymentInitiationInput): Promise<PaymentInitiationResult> {
    if (isProductionMode()) {
      throw new Error(
        "Production isolation violation: Mock payment provider simulation is strictly disabled in production runtime mode."
      );
    }

    // Idempotency check: if payment with this reference was already processed, return existing record
    const cached = this.simulatedPayments.get(input.reference);
    if (cached && cached.status === "succeeded") {
      return {
        status: cached.status,
        reference: cached.reference,
        gatewayUrl: `https://checkout.actionos.ng/pay/sim/${cached.reference}`,
        providerReference: cached.providerReference,
      };
    }

    const repos = getRepositoryContainer();
    const existing = await repos.transactions.findByReference(input.reference);
    if (existing && existing.status === "succeeded") {
      const recoveredEntry: PaymentStoreEntry = {
        reference: existing.reference,
        customerId: existing.customer_id,
        amount: existing.amount,
        currency: existing.currency,
        status: "succeeded",
        paidAt: existing.updated_at,
        providerReference: (existing.metadata?.provider_reference as string) || `pstk_recovered_${existing.reference}`,
      };
      this.simulatedPayments.set(input.reference, recoveredEntry);
      return {
        status: "succeeded",
        reference: existing.reference,
        gatewayUrl: `https://checkout.actionos.ng/pay/sim/${existing.reference}`,
        providerReference: recoveredEntry.providerReference,
      };
    }

    const providerRef = `pstk_sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // In simulation mode, payment automatically transitions to succeeded upon confirmation
    const entry: PaymentStoreEntry = {
      reference: input.reference,
      customerId: input.customerId,
      amount: input.amount,
      currency: input.currency || "NGN",
      status: "succeeded",
      paidAt: new Date().toISOString(),
      providerReference: providerRef,
    };

    this.simulatedPayments.set(input.reference, entry);

    if (existing) {
      await repos.transactions.updateStatus(existing.id, "succeeded");
    } else {
      await repos.transactions.create({
        customer_id: input.customerId,
        renewal_id: (input.metadata?.renewalId as string) || null,
        amount: input.amount,
        currency: input.currency || "NGN",
        provider: "mock_paystack",
        reference: input.reference,
        status: "succeeded",
        transaction_type: "renewal_premium",
        metadata: {
          simulation_mode: true,
          channel: "card",
          bank: "GTBank Nigeria Plc",
          provider_reference: providerRef,
          ...input.metadata,
        },
      });
    }

    return {
      status: "succeeded",
      reference: input.reference,
      gatewayUrl: `https://checkout.actionos.ng/pay/sim/${input.reference}`,
      providerReference: providerRef,
    };
  }

  async verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    if (isProductionMode()) {
      throw new Error(
        "Production isolation violation: Mock payment provider simulation is strictly disabled in production runtime mode."
      );
    }

    let record = this.simulatedPayments.get(reference);

    if (!record) {
      const repos = getRepositoryContainer();
      const tx = await repos.transactions.findByReference(reference);
      if (tx) {
        record = {
          reference: tx.reference,
          customerId: tx.customer_id,
          amount: tx.amount,
          currency: tx.currency,
          status: tx.status === "succeeded" ? "succeeded" : "failed",
          paidAt: tx.updated_at,
          providerReference: `pstk_recovered_${reference}`,
        };
      }
    }

    if (!record) {
      return {
        status: "failed",
        amount: 0,
        currency: "NGN",
        providerReference: "",
        paidAt: undefined,
        verifiedAt: new Date().toISOString(),
      };
    }

    const paymentRef = record.reference || reference;
    return {
      status: record.status === "processing" ? "pending" : record.status,
      amount: record.amount,
      currency: record.currency,
      reference: paymentRef,
      providerReference: record.providerReference || paymentRef,
      providerTransactionId: `pstk_mock_id_${paymentRef}`,
      paidAt: record.status === "succeeded" ? record.paidAt : undefined,
      verifiedAt: new Date().toISOString(),
    };
  }

  async refundPayment(
    reference: string,
    amount?: number,
    options?: {
      simulateRefundFailure?: boolean;
      simulateRefundPending?: boolean;
      simulateRefundUnknown?: boolean;
    }
  ): Promise<PaymentRefundResult> {
    if (isProductionMode()) {
      throw new Error(
        "Production isolation violation: Mock payment provider simulation is strictly disabled in production runtime mode."
      );
    }

    if (options?.simulateRefundFailure || this.simulateRefundFailure) {
      return {
        status: "refund_failed",
        refundReference: "",
        amount: amount || 0,
        currency: "NGN",
        error: "Payment rail rejected refund reversal: Gateway simulation declined reversal",
      };
    }

    if (options?.simulateRefundPending || this.simulateRefundPending) {
      return {
        status: "refund_pending",
        refundReference: `ref_sim_pend_${Date.now()}`,
        amount: amount || 0,
        currency: "NGN",
      };
    }

    if (options?.simulateRefundUnknown || this.simulateRefundUnknown) {
      return {
        status: "refund_unknown",
        refundReference: `ref_sim_unk_${Date.now()}`,
        amount: amount || 0,
        currency: "NGN",
        error: "Payment gateway simulation timeout: Response ambiguous",
      };
    }

    const record = this.simulatedPayments.get(reference);
    const refundRef = `ref_sim_${Date.now()}`;

    if (record) {
      record.status = "failed";
    }

    const repos = getRepositoryContainer();
    const tx = await repos.transactions.findByReference(reference);
    if (tx) {
      await repos.transactions.updateStatus(tx.id, "refunded");
    }

    return {
      status: "refund_confirmed",
      refundReference: refundRef,
      amount: amount ?? (record?.amount || 0),
      currency: record?.currency || tx?.currency || "NGN",
      rawStatus: "processed",
    };
  }

  async verifyRefund(refundReference: string): Promise<PaymentRefundResult> {
    if (isProductionMode()) {
      throw new Error(
        "Production isolation violation: Mock payment provider simulation is strictly disabled in production runtime mode."
      );
    }

    const repos = getRepositoryContainer();
    const tx = await repos.transactions.findByReference(refundReference).catch(() => null);
    const amount = tx ? Math.abs(tx.amount) : 87500;
    const currency = tx?.currency || "NGN";

    if (this.simulateRefundPending || refundReference.includes("_still_pend")) {
      return {
        status: "refund_pending",
        refundReference,
        amount,
        currency,
      };
    }
    if (refundReference.includes("fail")) {
      return {
        status: "refund_failed",
        refundReference,
        amount,
        currency,
        error: "Simulated refund verification reported failure",
      };
    }
    if (refundReference.includes("unk")) {
      return {
        status: "refund_unknown",
        refundReference,
        amount,
        currency,
        error: "Simulated refund verification ambiguous",
      };
    }
    return {
      status: "refund_confirmed",
      refundReference,
      transactionReference: tx?.reference,
      amount,
      currency,
    };
  }
}

export const mockPaymentProvider = new MockPaymentProvider();

import type {
  IPaymentProvider,
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentVerificationResult,
  PaymentRefundResult,
} from "./provider";
import { getRepositoryContainer } from "@/lib/repositories";

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

  async requestPayment(input: PaymentInitiationInput): Promise<PaymentInitiationResult> {
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
        paidAt: new Date().toISOString(),
      };
    }

    return {
      status: record.status === "processing" ? "pending" : record.status,
      amount: record.amount,
      currency: record.currency,
      providerReference: record.providerReference,
      paidAt: record.paidAt,
    };
  }

  async refundPayment(
    reference: string,
    amount?: number,
    options?: { simulateRefundFailure?: boolean }
  ): Promise<PaymentRefundResult> {
    if (options?.simulateRefundFailure) {
      return {
        status: "failed",
        refundReference: "",
        amount: amount || 0,
        error: "Payment rail rejected refund reversal: Gateway simulation declined reversal",
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
      status: "refunded",
      refundReference: refundRef,
      amount: amount ?? (record?.amount || 0),
    };
  }
}

export const mockPaymentProvider = new MockPaymentProvider();

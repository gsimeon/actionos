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

    // Record transaction via repository abstraction
    const repos = getRepositoryContainer();
    const existing = await repos.transactions.findByReference(input.reference);

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

  async refundPayment(reference: string, amount?: number): Promise<PaymentRefundResult> {
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

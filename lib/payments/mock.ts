import type { PaymentProvider } from "@/types/actionos";
import { getStore } from "@/lib/actionos/mock-store";

interface PaymentStoreEntry {
  reference: string;
  customerId: string;
  amount: number;
  currency: string;
  status: "processing" | "succeeded" | "failed";
  paidAt: string;
  providerReference: string;
}

class MockPaymentProvider implements PaymentProvider {
  public readonly name = "ActionOS Mock Paystack Rail (Simulation)";
  private simulatedPayments = new Map<string, PaymentStoreEntry>();

  async requestPayment(input: {
    customerId: string;
    amount: number;
    currency: string;
    reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    status: "processing" | "succeeded" | "failed";
    reference: string;
    gatewayUrl?: string;
  }> {
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

    // Record in global mock store if available
    const store = getStore();
    const existingIdx = store.transactions.findIndex((t) => t.reference === input.reference);
    const txRecord = {
      id: `tx_${Date.now()}`,
      customer_id: input.customerId,
      renewal_id: (input.metadata?.renewalId as string) || null,
      amount: input.amount,
      currency: input.currency || "NGN",
      provider: "mock_paystack",
      reference: input.reference,
      status: "succeeded" as const,
      transaction_type: "renewal_premium" as const,
      metadata: {
        simulation_mode: true,
        channel: "card",
        bank: "GTBank Nigeria Plc",
        provider_reference: providerRef,
        ...input.metadata,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      store.transactions[existingIdx] = txRecord;
    } else {
      store.transactions.unshift(txRecord);
    }

    return {
      status: "succeeded",
      reference: input.reference,
      gatewayUrl: `https://checkout.actionos.ng/pay/sim/${input.reference}`,
    };
  }

  async verifyPayment(reference: string): Promise<{
    status: "succeeded" | "failed" | "pending";
    amount: number;
    currency: string;
    providerReference: string;
    paidAt: string;
  }> {
    // Check in-memory simulation records or store transactions
    let record = this.simulatedPayments.get(reference);

    if (!record) {
      const store = getStore();
      const tx = store.transactions.find((t) => t.reference === reference);
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
}

export const mockPaymentProvider = new MockPaymentProvider();

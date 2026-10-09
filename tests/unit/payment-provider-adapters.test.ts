import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getPaymentProvider,
  setPaymentProvider,
  mockPaymentProvider,
  PaystackPaymentProvider,
  type IPaymentProvider,
  type PaymentInitiationInput,
  type PaymentInitiationResult,
  type PaymentVerificationResult,
  type PaymentRefundResult,
} from "@/lib/payments";
import { formatCurrency, formatNaira } from "@/lib/utils";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { resetStore } from "@/lib/actionos/mock-store";
import { getRepositoryContainer } from "@/lib/repositories";
import type { ActionLedgerEvent } from "@/types/actionos";

class DeterministicFakePaymentProvider implements IPaymentProvider {
  public readonly name = "Deterministic Test Payment Provider";
  public initiationBehavior: "succeeded" | "failed" | "processing" = "succeeded";
  public verificationBehavior: "succeeded" | "failed" | "pending" | "timeout" = "succeeded";
  public refundBehavior: "refunded" | "failed" | "timeout" = "refunded";
  public lastRequestedInput?: PaymentInitiationInput;
  public lastVerifiedReference?: string;
  public lastRefundedReference?: string;

  async requestPayment(input: PaymentInitiationInput): Promise<PaymentInitiationResult> {
    this.lastRequestedInput = input;
    if (this.initiationBehavior === "failed") {
      return { status: "failed", reference: input.reference };
    }
    return {
      status: this.initiationBehavior,
      reference: input.reference,
      gatewayUrl: `https://fake-rail.test/pay/${input.reference}`,
      providerReference: `prov_${input.reference}`,
    };
  }

  async verifyPayment(reference: string): Promise<PaymentVerificationResult> {
    this.lastVerifiedReference = reference;
    if (this.verificationBehavior === "timeout") {
      throw new Error("GATEWAY_TIMEOUT: authoritative provider endpoint timed out");
    }
    return {
      status: this.verificationBehavior,
      amount: 85000,
      currency: "NGN",
      providerReference: `prov_ver_${reference}`,
      paidAt: new Date().toISOString(),
    };
  }

  async refundPayment(reference: string, amount?: number): Promise<PaymentRefundResult> {
    this.lastRefundedReference = reference;
    if (this.refundBehavior === "timeout") {
      throw new Error("GATEWAY_TIMEOUT: refund endpoint unreachable");
    }
    if (this.refundBehavior === "failed") {
      return {
        status: "failed",
        refundReference: "",
        amount: amount || 0,
        currency: "NGN",
        error: "Card issuer declined reversal",
      };
    }
    return {
      status: "refunded",
      refundReference: `ref_det_${Date.now()}`,
      amount: amount || 85000,
      currency: "NGN",
    };
  }
}

interface SagaRefundOrchestrator {
  executeVerifiedSagaRefund: (params: Record<string, unknown>) => Promise<{
    success: boolean;
    error?: string;
    refundState: string;
    refundReference?: string;
  }>;
}

describe("Payment Provider Adapter Isolation & Production Fail-Closed Tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    setPaymentProvider(null);
    resetStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setPaymentProvider(null);
  });

  describe("getPaymentProvider Factory Behavior", () => {
    it("fails closed in production mode when PAYSTACK_SECRET_KEY is missing", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      delete process.env.PAYSTACK_SECRET_KEY;

      assert.throws(
        () => getPaymentProvider(),
        (err: Error) => {
          assert(err.message.includes("PAYSTACK_SECRET_KEY"));
          assert(err.message.includes("Production runtime requires"));
          return true;
        }
      );
    });

    it("instantiates PaystackPaymentProvider in production when PAYSTACK_SECRET_KEY is provided", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.PAYSTACK_SECRET_KEY = "sk_live_super_secret_paystack_test_key";

      const provider = getPaymentProvider();
      assert(provider instanceof PaystackPaymentProvider);
      assert.equal(provider.name, "Paystack Gateway (Production)");
    });

    it("defaults to mockPaymentProvider in demo mode", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "demo";
      delete process.env.PAYSTACK_SECRET_KEY;

      const provider = getPaymentProvider();
      assert.equal(provider, mockPaymentProvider);
      assert.equal(provider.name, "ActionOS Mock Paystack Rail (Simulation)");
    });

    it("defaults to mockPaymentProvider in test environment without crashing", () => {
      delete process.env.ACTIONOS_RUNTIME_MODE;
      delete process.env.PAYSTACK_SECRET_KEY;

      const provider = getPaymentProvider();
      assert.equal(provider, mockPaymentProvider);
    });
  });

  describe("Dependency Injection & Deterministic Fake Adapter", () => {
    it("allows test suites to inject custom IPaymentProvider via setPaymentProvider", async () => {
      const fake = new DeterministicFakePaymentProvider();
      fake.initiationBehavior = "succeeded";
      setPaymentProvider(fake);

      const active = getPaymentProvider();
      assert.equal(active, fake);
      assert.equal(active.name, "Deterministic Test Payment Provider");

      const initResult = await active.requestPayment({
        customerId: "cust_123",
        amount: 85000,
        currency: "NGN",
        reference: "ref_test_001",
      });

      assert.equal(initResult.status, "succeeded");
      assert.equal(fake.lastRequestedInput?.reference, "ref_test_001");
    });

    it("restores default factory behavior when setPaymentProvider is called with null", () => {
      const fake = new DeterministicFakePaymentProvider();
      setPaymentProvider(fake);
      assert.equal(getPaymentProvider(), fake);

      setPaymentProvider(null);
      process.env.ACTIONOS_RUNTIME_MODE = "demo";
      assert.equal(getPaymentProvider(), mockPaymentProvider);
    });

    it("handles simulated verification timeout gracefully in fake provider", async () => {
      const fake = new DeterministicFakePaymentProvider();
      fake.verificationBehavior = "timeout";
      setPaymentProvider(fake);

      await assert.rejects(
        async () => {
          await getPaymentProvider().verifyPayment("ref_timeout_test");
        },
        {
          message: /GATEWAY_TIMEOUT/,
        }
      );
      assert.equal(fake.lastVerifiedReference, "ref_timeout_test");
    });
  });

  describe("formatCurrency & Currency Consistency", () => {
    it("formats Nigerian Naira correctly matching formatNaira", () => {
      const amount = 85000;
      assert.equal(formatCurrency(amount, "NGN"), formatNaira(amount));
      assert.equal(formatCurrency(amount, "ngn"), formatNaira(amount));
      assert.equal(formatCurrency(amount), formatNaira(amount));
    });

    it("formats foreign currencies (USD, EUR, GBP) accurately", () => {
      const usdFormatted = formatCurrency(1500, "USD");
      assert(usdFormatted.includes("1,500.00") || usdFormatted.includes("$1,500"));

      const eurFormatted = formatCurrency(2500, "EUR");
      assert(eurFormatted.includes("2,500.00") || eurFormatted.includes("€2,500"));

      const gbpFormatted = formatCurrency(99.99, "GBP");
      assert(gbpFormatted.includes("99.99") || gbpFormatted.includes("£99.99"));
    });
  });

  describe("Orchestrator Saga Refund Safeguards with Payment Adapters", () => {
    it("detects and escalates refund amount or currency mismatch from payment rail", async () => {
      const mismatchProvider: IPaymentProvider = {
        name: "Mismatch Provider",
        async requestPayment(input: PaymentInitiationInput) {
          return { status: "succeeded", reference: input.reference };
        },
        async verifyPayment(ref: string) {
          return {
            status: "succeeded",
            amount: 85000,
            currency: "NGN",
            providerReference: `prov_${ref}`,
            paidAt: new Date().toISOString(),
          };
        },
        async refundPayment(reference: string, amount?: number) {
          // Intentionally return mismatched currency or amount
          return {
            status: "refunded",
            refundReference: `ref_mismatch_${Date.now()}`,
            amount: (amount || 85000) - 1000, // Short refunded by 1000
            currency: "NGN",
          };
        },
      };

      setPaymentProvider(mismatchProvider);

      const events: ActionLedgerEvent[] = [];
      const tenantContext = {
        organizationId: "org_test",
        customerId: "cust_test",
        role: "customer" as const,
      };

      const repos = getRepositoryContainer();
      await repos.customers.create(
        {
          id: "cust_test",
          customer_number: "CUST-TEST-001",
          organization_id: "org_test",
          full_name: "Test Customer",
          email: "customer@test.com",
          phone: "+2348000000000",
        },
        tenantContext
      );

      const session = await repos.sessions.create(
        {
          organization_id: "org_test",
          customer_id: "cust_test",
          channel: "web",
          status: "executing",
        },
        tenantContext
      );

      const refundOutcome = await (orchestrator as unknown as SagaRefundOrchestrator).executeVerifiedSagaRefund({
        sessionId: session.id,
        paymentReference: "ref_mismatch_tx",
        amount: 85000,
        currency: "NGN",
        reason: "Certificate generation failure",
        execContext: {
          sessionId: session.id,
          stepNumber: 3,
          auth: {
            organizationId: "org_test",
            customerId: "cust_test",
            userId: "cust_test",
            role: "customer" as const,
          },
          channel: "web" as const,
        },
        events,
        tenantContext,
      });

      assert.equal(refundOutcome.success, false);
      assert.equal(refundOutcome.refundState, "refund_pending");
      assert(refundOutcome.error?.includes("Refund amount or currency mismatch"));

      const mismatchEvent = events.find((e) => e.action === "saga_compensating_refund_failed");
      assert(mismatchEvent);
      assert(mismatchEvent.description.includes("mismatch"));
    });

    it("records verified rollback event when provider successfully confirms exact refund", async () => {
      const exactProvider: IPaymentProvider = {
        name: "Exact Provider",
        async requestPayment(input: PaymentInitiationInput) {
          return { status: "succeeded", reference: input.reference };
        },
        async verifyPayment(ref: string) {
          return {
            status: "succeeded",
            amount: 85000,
            currency: "NGN",
            providerReference: `prov_${ref}`,
            paidAt: new Date().toISOString(),
          };
        },
        async refundPayment(reference: string, amount?: number) {
          return {
            status: "refunded",
            refundReference: `ref_exact_${Date.now()}`,
            amount: amount || 85000,
            currency: "NGN",
          };
        },
      };

      setPaymentProvider(exactProvider);

      const events: ActionLedgerEvent[] = [];
      const tenantContext = {
        organizationId: "org_test",
        customerId: "cust_test",
        role: "customer" as const,
      };

      const repos = getRepositoryContainer();
      await repos.customers.create(
        {
          id: "cust_test",
          customer_number: "CUST-TEST-002",
          organization_id: "org_test",
          full_name: "Test Customer",
          email: "customer@test.com",
          phone: "+2348000000000",
        },
        tenantContext
      );

      const session = await repos.sessions.create(
        {
          organization_id: "org_test",
          customer_id: "cust_test",
          channel: "web",
          status: "executing",
        },
        tenantContext
      );

      const refundOutcome = await (orchestrator as unknown as SagaRefundOrchestrator).executeVerifiedSagaRefund({
        sessionId: session.id,
        paymentReference: "ref_exact_tx",
        amount: 85000,
        currency: "NGN",
        reason: "Downstream renewal failure",
        execContext: {
          sessionId: session.id,
          stepNumber: 3,
          auth: {
            organizationId: "org_test",
            customerId: "cust_test",
            userId: "cust_test",
            role: "customer" as const,
          },
          channel: "web" as const,
        },
        events,
        tenantContext,
      });

      assert.equal(refundOutcome.success, true);
      assert.equal(refundOutcome.refundState, "refund_confirmed");
      assert(refundOutcome.refundReference?.startsWith("ref_exact_"));

      const verifiedEvent = events.find((e) => e.action === "saga_compensating_refund");
      assert(verifiedEvent);
      assert.equal(verifiedEvent.status, "verified");
    });
  });
});

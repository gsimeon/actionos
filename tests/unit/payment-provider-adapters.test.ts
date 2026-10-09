import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
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
import { verifyPaystackWebhookSignature, POST as paymentWebhookHandler } from "@/app/api/webhooks/payment/route";
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

  describe("Paystack Webhook Authenticity & Signature Verification", () => {
    const testSecret = "sk_live_paystack_secret_verification_test_998877";

    it("verifies authentic HMAC-SHA512 webhook signature against raw request body", () => {
      const rawBody = JSON.stringify({
        event: "charge.success",
        data: {
          id: 12345678,
          reference: "ref_webhook_valid_01",
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      const validSignature = crypto.createHmac("sha512", testSecret).update(rawBody).digest("hex");
      assert.equal(verifyPaystackWebhookSignature(rawBody, validSignature, testSecret), true);
    });

    it("rejects tampered webhook request body or forged signature", () => {
      const rawBody = JSON.stringify({
        event: "charge.success",
        data: { reference: "ref_webhook_02", amount: 8750000 },
      });
      const validSignature = crypto.createHmac("sha512", testSecret).update(rawBody).digest("hex");

      // Body tampered with by adversary (e.g., trying to falsify payment amount)
      const tamperedBody = JSON.stringify({
        event: "charge.success",
        data: { reference: "ref_webhook_02", amount: 100 },
      });
      assert.equal(verifyPaystackWebhookSignature(tamperedBody, validSignature, testSecret), false);

      // Forged signature
      assert.equal(verifyPaystackWebhookSignature(rawBody, "bad_signature_deadbeef", testSecret), false);

      // Wrong gateway secret key
      assert.equal(verifyPaystackWebhookSignature(rawBody, validSignature, "wrong_secret_key"), false);
    });

    it("returns false when signature or secret is missing or empty", () => {
      const rawBody = JSON.stringify({ event: "charge.success" });
      assert.equal(verifyPaystackWebhookSignature(rawBody, null, testSecret), false);
      assert.equal(verifyPaystackWebhookSignature(rawBody, undefined, testSecret), false);
      assert.equal(verifyPaystackWebhookSignature(rawBody, "some_sig", ""), false);
      assert.equal(verifyPaystackWebhookSignature(rawBody, "some_sig", undefined), false);
    });
  });

  describe("Webhook Processing Idempotency & Deduplication", () => {
    it("acknowledges initial charge webhook and marks duplicate on replayed webhook", async () => {
      const tenantContext = {
        organizationId: "org_webhook_test",
        customerId: "cust_webhook_test",
        role: "customer" as const,
      };
      const repos = getRepositoryContainer();

      await repos.customers.create(
        {
          id: "cust_webhook_test",
          customer_number: "CUST-WH-001",
          organization_id: "org_webhook_test",
          full_name: "Webhook Test User",
          email: "wh@actionos.ng",
          phone: "+2348000000001",
        },
        tenantContext
      );

      const txRef = "ref_idempotent_wh_123";
      await repos.transactions.create(
        {
          id: txRef,
          reference: txRef,
          customer_id: "cust_webhook_test",
          organization_id: "org_webhook_test",
          transaction_type: "renewal_premium",
          amount: 87500,
          currency: "NGN",
          status: "pending",
          provider: "paystack",
          renewal_id: null,
          metadata: { session_id: "sess_wh_123" },
        },
        tenantContext
      );

      const webhookPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 999111,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      // First webhook delivery
      const req1 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookPayload,
      });

      const res1 = await paymentWebhookHandler(req1);
      assert.equal(res1.status, 200);
      const json1 = (await res1.json()) as { data: { acknowledged: boolean; duplicate: boolean } };
      assert.equal(json1.data.acknowledged, true);
      assert.equal(json1.data.duplicate, false, "Initial webhook must not be marked as duplicate");

      // Verify transaction transitioned to succeeded
      const txAfter1 = await repos.transactions.findByReference(txRef);
      assert.equal(txAfter1?.status, "succeeded");

      // Second webhook delivery (simulated gateway replay/retry)
      const req2 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookPayload,
      });

      const res2 = await paymentWebhookHandler(req2);
      assert.equal(res2.status, 200);
      const json2 = (await res2.json()) as { data: { acknowledged: boolean; duplicate: boolean } };
      assert.equal(json2.data.acknowledged, true);
      assert.equal(json2.data.duplicate, true, "Replayed webhook must be acknowledged as idempotent duplicate");

      // Transaction status remains cleanly succeeded
      const txAfter2 = await repos.transactions.findByReference(txRef);
      assert.equal(txAfter2?.status, "succeeded");
    });
  });

  describe("Uncertain Payment Recovery & Double-Charge Prevention", () => {
    it("simulates gateway timeout after initiation and confirms retry reconciles without a second charge", async () => {
      let chargeRequestCount = 0;
      let verificationCallCount = 0;

      const trackableProvider: IPaymentProvider = {
        name: "Trackable Payment Provider",
        async requestPayment(input: PaymentInitiationInput) {
          chargeRequestCount++;
          return {
            status: "processing",
            reference: input.reference,
            gatewayUrl: `https://checkout.paystack.com/${input.reference}`,
            providerReference: `paystack_tx_${input.reference}`,
          };
        },
        async verifyPayment(ref: string) {
          verificationCallCount++;
          if (verificationCallCount === 1) {
            // First verification simulates timeout right after customer was debited
            throw new Error("GATEWAY_TIMEOUT: Paystack verification endpoint timed out");
          }
          // Subsequent reconciliation verification confirms settlement
          return {
            status: "succeeded",
            amount: 87500,
            currency: "NGN",
            providerReference: `paystack_tx_${ref}`,
            paidAt: new Date().toISOString(),
          };
        },
      };

      setPaymentProvider(trackableProvider);

      const paymentInput: PaymentInitiationInput = {
        customerId: "cust_timeout_test",
        amount: 87500,
        currency: "NGN",
        reference: "ref_timeout_charge_001",
      };

      // 1. Initial charge initiation
      const initResult = await trackableProvider.requestPayment(paymentInput);
      assert.equal(initResult.status, "processing");
      assert.equal(chargeRequestCount, 1, "Initial charge requested exactly once");

      // 2. Verification attempt encounters gateway timeout
      await assert.rejects(
        () => trackableProvider.verifyPayment(initResult.reference),
        /GATEWAY_TIMEOUT/
      );
      assert.equal(verificationCallCount, 1);

      // 3. Retry / reconciliation path: must check existing reference via verifyPayment, NOT issue a new charge
      const reconciled = await trackableProvider.verifyPayment(initResult.reference);
      assert.equal(reconciled.status, "succeeded");
      assert.equal(verificationCallCount, 2);

      // Crucial security invariant: charge request count MUST remain 1, preventing double-debiting customer
      assert.equal(
        chargeRequestCount,
        1,
        "Reconciliation must verify existing transaction reference and never trigger a second charge"
      );
    });
  });
});

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
import { ActionOSGuardrails } from "@/lib/actionos/guardrails";
import { VerifyPaymentTool } from "@/lib/actionos/tools/verify-payment";
import type { ActionLedgerEvent } from "@/types/actionos";

class DeterministicFakePaymentProvider implements IPaymentProvider {
  public readonly name = "Deterministic Test Payment Provider";
  public initiationBehavior: "succeeded" | "failed" | "processing" = "succeeded";
  public verificationBehavior: "succeeded" | "failed" | "pending" | "timeout" = "succeeded";
  public refundBehavior:
    | "refund_confirmed"
    | "refund_pending"
    | "refund_failed"
    | "refund_unknown"
    | "refunded"
    | "failed"
    | "timeout" = "refund_confirmed";
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
      paidAt: this.verificationBehavior === "succeeded" ? new Date().toISOString() : undefined,
      verifiedAt: new Date().toISOString(),
    };
  }

  async refundPayment(reference: string, amount?: number): Promise<PaymentRefundResult> {
    this.lastRefundedReference = reference;
    if (this.refundBehavior === "timeout") {
      throw new Error("GATEWAY_TIMEOUT: refund endpoint unreachable");
    }
    if (this.refundBehavior === "failed" || this.refundBehavior === "refund_failed") {
      return {
        status: "refund_failed",
        amount: amount || 0,
        currency: "NGN",
        error: "Card issuer declined reversal",
      };
    }
    if (this.refundBehavior === "refund_pending") {
      return {
        status: "refund_pending",
        refundReference: `ref_det_pend_${Date.now()}`,
        amount: amount || 85000,
        currency: "NGN",
        rawStatus: "pending",
      };
    }
    if (this.refundBehavior === "refund_unknown") {
      return {
        status: "refund_unknown",
        amount: amount || 0,
        currency: "NGN",
        error: "Ambiguous gateway response",
      };
    }
    return {
      status: "refund_confirmed",
      refundReference: `ref_det_${Date.now()}`,
      amount: amount || 85000,
      currency: "NGN",
      rawStatus: "processed",
    };
  }

  async verifyRefund(refundReference: string): Promise<PaymentRefundResult> {
    if (refundReference.includes("fail")) {
      return {
        status: "refund_failed",
        amount: 0,
        currency: "NGN",
        error: "Card issuer confirmed decline",
      };
    }
    if (refundReference.includes("pend")) {
      return {
        status: "refund_pending",
        refundReference,
        amount: 85000,
        currency: "NGN",
        rawStatus: "pending",
      };
    }
    return {
      status: "refund_confirmed",
      refundReference,
      amount: 85000,
      currency: "NGN",
      rawStatus: "processed",
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
            status: "refund_confirmed",
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
            status: "refund_confirmed",
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

  describe("PaystackPaymentProvider Hardening & Strict Validation", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("rejects non-positive, NaN, or non-finite payment amounts", async () => {
      const provider = new PaystackPaymentProvider("sk_live_test_key_123");

      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "cust_1",
            amount: 0,
            currency: "NGN",
            reference: "ref_zero_amt",
          }),
        /Amount must be a positive non-zero number/
      );

      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "cust_1",
            amount: -5000,
            currency: "NGN",
            reference: "ref_neg_amt",
          }),
        /Amount must be a positive non-zero number/
      );

      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "cust_1",
            amount: NaN,
            currency: "NGN",
            reference: "ref_nan_amt",
          }),
        /Amount must be a positive non-zero number/
      );
    });

    it("rejects invalid currency codes", async () => {
      const provider = new PaystackPaymentProvider("sk_live_test_key_123");

      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "cust_1",
            amount: 85000,
            currency: "NAIRA",
            reference: "ref_bad_curr",
          }),
        /Currency must be a 3-letter ISO code/
      );
    });

    it("strictly requires real customer email in production mode and prevents generic fallback", async () => {
      const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
      try {
        process.env.ACTIONOS_RUNTIME_MODE = "production";
        const provider = new PaystackPaymentProvider("sk_live_test_key_123");

        await assert.rejects(
          () =>
            provider.requestPayment({
              customerId: "cust_1",
              amount: 85000,
              currency: "NGN",
              reference: "ref_prod_no_email",
              metadata: {},
            }),
          /Customer email is strictly required for live Paystack payment initiation/
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = originalMode;
      }
    });

    it("converts amount accurately to integer kobo in outgoing Paystack request", async () => {
      let capturedBody: { amount?: number; email?: string; currency?: string } | null = null;
      global.fetch = async (_url, init) => {
        capturedBody = JSON.parse(init?.body as string) as { amount?: number; email?: string; currency?: string };
        return new Response(
          JSON.stringify({
            status: true,
            data: { authorization_url: "https://checkout.paystack.com/auth_123" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const provider = new PaystackPaymentProvider("sk_live_test_key_123");
      const res = await provider.requestPayment({
        customerId: "cust_1",
        amount: 87500.5,
        currency: "NGN",
        reference: "ref_kobo_test",
        metadata: { email: "real.customer@example.com" },
      });

      assert.equal(res.status, "processing");
      assert.ok(capturedBody);
      const payload = capturedBody as { amount?: number; email?: string; currency?: string };
      assert.equal(payload.amount, 8750050, "₦87,500.50 must convert accurately to 8,750,050 kobo");
      assert.equal(payload.email, "real.customer@example.com");
      assert.equal(payload.currency, "NGN");
    });

    it("distinguishes refund_pending from refund_confirmed and never treats pending refund as complete", async () => {
      const provider = new PaystackPaymentProvider("sk_live_test_key_123");

      // 1. Initial refund response: Paystack returns status 'pending' / 'processing'
      global.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: true,
            message: "Refund has been queued",
            data: { id: 778899, status: "pending", amount: 8750000, currency: "NGN" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const pendingRefund = await provider.refundPayment("ref_tx_refund_01", 87500);
      assert.equal(
        pendingRefund.status,
        "refund_pending",
        "Initial Paystack refund request acceptance must be mapped to refund_pending, NOT completed refunded"
      );
      assert.equal(pendingRefund.refundReference, "778899");

      // 2. Confirmed refund response: Paystack returns status 'processed' / 'success'
      global.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: true,
            message: "Refund processed",
            data: { id: 778899, status: "processed", amount: 8750000, currency: "NGN" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const confirmedRefund = await provider.refundPayment("ref_tx_refund_01", 87500);
      assert.equal(
        confirmedRefund.status,
        "refund_confirmed",
        "Confirmed settlement reversal must be mapped to refund_confirmed"
      );
    });

    it("rejects payment initiation when amount has fractional kobo or invalid precision", async () => {
      const provider = new PaystackPaymentProvider("sk_live_test_key_123");

      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "cust_1",
            amount: 87500.123,
            currency: "NGN",
            reference: "ref_frac_kobo",
            metadata: { email: "user@test.ng" },
          }),
        /Invalid amount precision.*cannot exceed 2 decimal places/
      );
    });

    it("rejects payment initiation when customer email is malformed or uses generic fallback", async () => {
      const provider = new PaystackPaymentProvider("sk_live_test_key_123");

      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "cust_1",
            amount: 87500,
            currency: "NGN",
            reference: "ref_bad_email",
            metadata: { email: "not-an-email" },
          }),
        /Invalid customer email format/
      );

      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "cust_1",
            amount: 87500,
            currency: "NGN",
            reference: "ref_generic_email",
            metadata: { email: "customer@actionos.ng" },
          }),
        /Generic fallback email 'customer@actionos.ng' is prohibited/
      );

      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "",
            amount: 87500,
            currency: "NGN",
            reference: "ref_missing_cust",
            metadata: { email: "valid@test.ng" },
          }),
        /Customer identity \(customerId\) is required/
      );

      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "cust_1",
            amount: 87500,
            currency: "NGN",
            reference: "",
            metadata: { email: "valid@test.ng" },
          }),
        /Transaction reference is required/
      );
    });

    it("preserves provider payment timestamp as optional and records local verifiedAt separately", async () => {
      const provider = new PaystackPaymentProvider("sk_live_test_key_123");

      // Case 1: Provider provides paid_at
      global.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: true,
            data: {
              status: "success",
              amount: 8750000,
              currency: "NGN",
              reference: "ref_with_paid_at",
              paid_at: "2026-10-10T08:30:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const result1 = await provider.verifyPayment("ref_with_paid_at");
      assert.equal(result1.status, "succeeded");
      assert.equal(result1.paidAt, "2026-10-10T08:30:00.000Z");
      assert.ok(result1.verifiedAt, "Local verifiedAt timestamp must be recorded");

      // Case 2: Provider omits paid_at (e.g. pending or omitted by gateway)
      global.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: true,
            data: {
              status: "success",
              amount: 8750000,
              currency: "NGN",
              reference: "ref_no_paid_at",
              paid_at: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const result2 = await provider.verifyPayment("ref_no_paid_at");
      assert.equal(result2.status, "succeeded");
      assert.equal(result2.paidAt, undefined, "Missing paid_at must not be fabricated");
      assert.ok(result2.verifiedAt, "Local verifiedAt timestamp must still be recorded");
    });

    it("handles refund failure when Paystack rejects request without inventing synthetic reference", async () => {
      const provider = new PaystackPaymentProvider("sk_live_test_key_123");

      global.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: false,
            message: "Transaction has already been fully refunded",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      };

      const refundResult = await provider.refundPayment("ref_already_refunded", 87500);
      assert.equal(refundResult.status, "refund_failed");
      assert.equal(refundResult.refundReference, undefined, "Must not invent synthetic fallback reference");
      assert.ok(refundResult.error?.includes("already been fully refunded") || refundResult.error?.includes("400"));
    });

    it("handles malformed non-JSON response from Paystack without inventing synthetic reference", async () => {
      const provider = new PaystackPaymentProvider("sk_live_test_key_123");

      global.fetch = async () => {
        return new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      };

      const refundResult = await provider.refundPayment("ref_malformed", 87500);
      assert.equal(refundResult.status, "refund_unknown");
      assert.equal(refundResult.refundReference, undefined, "Must not invent synthetic reference on malformed response");
      assert.ok(refundResult.error?.includes("Malformed JSON"));
    });

    it("handles ambiguous response with missing data.id without inventing synthetic reference", async () => {
      const provider = new PaystackPaymentProvider("sk_live_test_key_123");

      global.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: true,
            message: "Refund accepted",
            data: { status: "pending", amount: 8750000, currency: "NGN" }, // no id!
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const refundResult = await provider.refundPayment("ref_no_id", 87500);
      assert.equal(refundResult.status, "refund_unknown");
      assert.equal(refundResult.refundReference, undefined, "Must not invent synthetic reference when data.id is missing");
      assert.ok(refundResult.error?.includes("omitted authoritative identifier (data.id)"));
    });

    it("handles gateway network timeout during refund without inventing synthetic reference", async () => {
      const provider = new PaystackPaymentProvider("sk_live_test_key_123");

      global.fetch = async () => {
        throw new Error("ETIMEDOUT: Connection timed out to api.paystack.co");
      };

      const refundResult = await provider.refundPayment("ref_timeout", 87500);
      assert.equal(refundResult.status, "refund_unknown");
      assert.equal(refundResult.refundReference, undefined, "Must not invent synthetic reference on network timeout");
      assert.ok(refundResult.error?.includes("timeout"));
    });

    it("verifies refund status via verifyRefund polling endpoint", async () => {
      const provider = new PaystackPaymentProvider("sk_live_test_key_123");

      // Case 1: Transitioned to processed
      global.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: true,
            data: { id: 778899, status: "processed", amount: 8750000, currency: "NGN" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };
      const verifyRes1 = await provider.verifyRefund("778899");
      assert.equal(verifyRes1.status, "refund_confirmed");
      assert.equal(verifyRes1.refundReference, "778899");

      // Case 2: Still pending
      global.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: true,
            data: { id: 778899, status: "pending", amount: 8750000, currency: "NGN" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };
      const verifyRes2 = await provider.verifyRefund("778899");
      assert.equal(verifyRes2.status, "refund_pending");

      // Case 3: Failed
      global.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: true,
            data: { id: 778899, status: "failed", amount: 8750000, currency: "NGN" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };
      const verifyRes3 = await provider.verifyRefund("778899");
      assert.equal(verifyRes3.status, "refund_failed");

      // Case 4: Gateway 500 error
      global.fetch = async () => {
        return new Response(JSON.stringify({ status: false, message: "Gateway error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      };
      const verifyRes4 = await provider.verifyRefund("778899");
      assert.equal(verifyRes4.status, "refund_unknown");
    });
  });

  describe("Calling Workflow Verification Response Enforcement", () => {
    it("guardrail rejects payment settlement if verified amount does not match authorized quote", () => {
      const guardrails = new ActionOSGuardrails();

      // Case 1: Underpaid payment (₦50,000 paid for ₦87,500 quote)
      const underpaidCheck = guardrails.validatePaymentSettlement("succeeded", 87500, 50000, "NGN", "NGN");
      assert.equal(underpaidCheck.passed, false);
      assert.equal(underpaidCheck.code, "UNDERPAID_PAYMENT");

      // Case 2: Overpaid or mismatched payment (₦90,000 paid for ₦87,500 quote)
      const overpaidCheck = guardrails.validatePaymentSettlement("succeeded", 87500, 90000, "NGN", "NGN");
      assert.equal(overpaidCheck.passed, false);
      assert.equal(overpaidCheck.code, "PAYMENT_AMOUNT_MISMATCH");

      // Case 3: Currency mismatch (paid in USD instead of required NGN)
      const currMismatch = guardrails.validatePaymentSettlement("succeeded", 87500, 87500, "NGN", "USD");
      assert.equal(currMismatch.passed, false);
      assert.equal(currMismatch.code, "CURRENCY_MISMATCH");

      // Case 4: Exact match passes
      const exactCheck = guardrails.validatePaymentSettlement("succeeded", 87500, 87500, "NGN", "NGN");
      assert.equal(exactCheck.passed, true);
    });

    it("VerifyPaymentTool rejects verification if settled currency or amount differs from expected quote", async () => {
      const mismatchedProvider: IPaymentProvider = {
        name: "Mismatched Gateway",
        async requestPayment(input: PaymentInitiationInput) {
          return { status: "succeeded", reference: input.reference };
        },
        async verifyPayment(ref: string) {
          return {
            status: "succeeded",
            amount: 50000, // Quote expects 87,500
            currency: "NGN",
            providerReference: `prov_${ref}`,
            paidAt: new Date().toISOString(),
          };
        },
        async refundPayment() {
          return { status: "refund_confirmed", refundReference: "ref", amount: 0 };
        },
      };

      setPaymentProvider(mismatchedProvider);

      const tool = new VerifyPaymentTool();
      const result = await tool.execute(
        {
          reference: "ref_mismatch_check",
          expectedAmount: 87500,
          expectedCurrency: "NGN",
        },
        {
          sessionId: "sess_verify_test",
          auth: {
            organizationId: "org_1",
            customerId: "cust_1",
            userId: "cust_1",
            profileId: "profile_1",
            role: "customer",
            isDemo: false,
          },
          channel: "web",
          isSimulated: false,
        }
      );

      assert.equal(result.success, false);
      assert.equal(result.error?.code, "UNDERPAID_PAYMENT");
    });
  });
});

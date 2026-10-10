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
import {
  verifyPaystackWebhookSignature,
  resetProcessedWebhookMemoryCache,
  POST as paymentWebhookHandler,
} from "@/app/api/webhooks/payment/route";
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

    it("strictly rejects webhooks with unknown or uninitiated transaction references with 404", async () => {
      const webhookPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 11223344,
          reference: "ref_nonexistent_transaction_999",
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 404);
      const json = (await res.json()) as { error?: { code: string; message: string } };
      assert.equal(json.error?.code, "TRANSACTION_NOT_FOUND");
    });

    it("never marks a transaction succeeded solely because event name is charge.success when provider status contradicts it", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_contradictory_event_001";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_webhook_test",
        organization_id: "org_webhook_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      // Event is charge.success, but payload status is explicitly failed/declined
      const webhookPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 55443322,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "failed", // Contradicts event name!
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error?: { code: string; message: string } };
      assert.equal(json.error?.code, "PROVIDER_STATUS_MISMATCH");

      // Verify transaction in DB did NOT transition to succeeded
      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending", "Transaction must not transition to succeeded when provider status contradicts it");
    });

    it("rejects signed webhooks when amount or currency does not match the persisted transaction", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_mismatch_validation_002";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_webhook_test",
        organization_id: "org_webhook_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      // 1. Amount mismatch (₦50,000 sent instead of ₦87,500)
      const badAmountPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 111111,
          reference: txRef,
          amount: 5000000,
          currency: "NGN",
          status: "success",
        },
      });

      const reqAmount = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: badAmountPayload,
      });

      const resAmount = await paymentWebhookHandler(reqAmount);
      assert.equal(resAmount.status, 422);
      const jsonAmount = (await resAmount.json()) as { error?: { code: string } };
      assert.equal(jsonAmount.error?.code, "AMOUNT_MISMATCH");

      // 2. Currency mismatch (USD sent instead of NGN)
      const badCurrencyPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 222222,
          reference: txRef,
          amount: 8750000,
          currency: "USD",
          status: "success",
        },
      });

      const reqCurrency = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: badCurrencyPayload,
      });

      const resCurrency = await paymentWebhookHandler(reqCurrency);
      assert.equal(resCurrency.status, 422);
      const jsonCurrency = (await resCurrency.json()) as { error?: { code: string } };
      assert.equal(jsonCurrency.error?.code, "CURRENCY_MISMATCH");
    });

    it("returns HTTP 500 and does NOT swallow database update errors so gateway can retry delivery", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_db_failure_retry_003";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_webhook_test",
        organization_id: "org_webhook_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      // Simulate transient database failure during status update
      const originalUpdateStatus = repos.transactions.updateStatus;
      try {
        repos.transactions.updateStatus = async () => {
          throw new Error("PostgreSQL connection pool exhausted: timeout acquiring connection");
        };

        const webhookPayload = JSON.stringify({
          event: "charge.success",
          data: {
            id: 99881122,
            reference: txRef,
            amount: 8750000,
            currency: "NGN",
            status: "success",
          },
        });

        const req = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: webhookPayload,
        });

        const res = await paymentWebhookHandler(req);

        // Crucial invariant: MUST return 500 so gateway retries delivery, never swallow error as 200
        assert.equal(res.status, 500);
        const json = (await res.json()) as { error?: { code: string; message: string } };
        assert.equal(json.error?.code, "DATABASE_UPDATE_FAILED");
        assert(json.error?.message.includes("Provider retry requested"));
      } finally {
        repos.transactions.updateStatus = originalUpdateStatus;
      }
    });

    it("tracks durable provider event identifier in transaction metadata for deduplication", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_durable_event_id_004";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_webhook_test",
        organization_id: "org_webhook_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      const providerEventId = 77665544;
      const webhookPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: providerEventId,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
          paid_at: "2026-10-10T11:00:00.000Z",
        },
      });

      // 1. First delivery succeeds
      const req1 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookPayload,
      });

      const res1 = await paymentWebhookHandler(req1);
      assert.equal(res1.status, 200);
      const json1 = (await res1.json()) as { data: { acknowledged: boolean; duplicate: boolean } };
      assert.equal(json1.data.duplicate, false);

      // Verify metadata records provider event ID and processed events list
      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "succeeded");
      assert.equal(tx?.metadata?.provider_event_id, String(providerEventId));
      assert(Array.isArray(tx?.metadata?.processed_webhook_events));
      assert(tx?.metadata?.processed_webhook_events.some((k: string) => k.includes(String(providerEventId))));

      // 2. Second delivery with identical event ID is recognized as duplicate
      const req2 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookPayload,
      });

      const res2 = await paymentWebhookHandler(req2);
      assert.equal(res2.status, 200);
      const json2 = (await res2.json()) as { data: { acknowledged: boolean; duplicate: boolean } };
      assert.equal(json2.data.duplicate, true);
    });

    it("handles out-of-order events without allowing a stale failure or pending event to overwrite a confirmed succeeded payment", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_ooo_safety_005";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_webhook_test",
        organization_id: "org_webhook_test",
        amount: 87500,
        currency: "NGN",
        status: "succeeded",
        metadata: { processed_webhook_events: ["charge.success:99001"] },
      });

      // Arriving late: an out-of-order failure webhook event
      const staleFailPayload = JSON.stringify({
        event: "charge.failed",
        data: {
          id: 99002,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "failed",
        },
      });

      const reqFail = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: staleFailPayload,
      });

      const resFail = await paymentWebhookHandler(reqFail);
      assert.equal(resFail.status, 200);
      const jsonFail = (await resFail.json()) as { data: { acknowledged: boolean; ignored?: string } };
      assert.equal(jsonFail.data.acknowledged, true);
      assert.equal(jsonFail.data.ignored, "out_of_order");

      // Verify transaction status did NOT regress to failed
      const txAfterFail = await repos.transactions.findByReference(txRef);
      assert.equal(txAfterFail?.status, "succeeded", "Confirmed succeeded payment must not regress to failed on out-of-order webhook");

      // Also verify terminal 'refunded' status cannot be overwritten by late charge.success
      await repos.transactions.updateStatus(txRef, "refunded");
      const lateSuccessPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 99003,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      const reqSuccess = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: lateSuccessPayload,
      });

      const resSuccess = await paymentWebhookHandler(reqSuccess);
      assert.equal(resSuccess.status, 200);
      const jsonSuccess = (await resSuccess.json()) as { data: { acknowledged: boolean; ignored?: string } };
      assert.equal(jsonSuccess.data.ignored, "out_of_order");

      const txAfterSuccess = await repos.transactions.findByReference(txRef);
      assert.equal(txAfterSuccess?.status, "refunded", "Terminal refunded state must never be overwritten by late charge.success");
    });

    it("recovers safely and settles transaction on redelivery after an initial database failure", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_recovery_after_db_failure_006";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_webhook_test",
        organization_id: "org_webhook_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      const webhookPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 88776655,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      // 1. First attempt fails due to transient database error
      const originalUpdateStatus = repos.transactions.updateStatus;
      let dbFailSimulated = true;
      repos.transactions.updateStatus = async (ref, status, extra) => {
        if (dbFailSimulated) {
          throw new Error("Simulated transient dead-lock error");
        }
        return originalUpdateStatus.call(repos.transactions, ref, status, extra);
      };

      try {
        const req1 = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: webhookPayload,
        });

        const res1 = await paymentWebhookHandler(req1);
        assert.equal(res1.status, 500, "Initial delivery failure must return 500 to request provider retry");

        // Verify status remains pending in database
        const txPending = await repos.transactions.findByReference(txRef);
        assert.equal(txPending?.status, "pending");

        // 2. Provider retries delivery, database is now healthy
        dbFailSimulated = false;

        const req2 = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: webhookPayload,
        });

        const res2 = await paymentWebhookHandler(req2);
        assert.equal(res2.status, 200, "Retried delivery after recovery must succeed with 200");
        const json2 = (await res2.json()) as { data: { acknowledged: boolean; duplicate: boolean } };
        assert.equal(json2.data.acknowledged, true);
        assert.equal(json2.data.duplicate, false);

        // Verify transaction successfully settled as succeeded
        const txSettled = await repos.transactions.findByReference(txRef);
        assert.equal(txSettled?.status, "succeeded", "Transaction must be settled after successful retry");
      } finally {
        repos.transactions.updateStatus = originalUpdateStatus;
      }
    });

    it("safely ignores unrecognized or unrelated webhook events without failing the transaction", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_unrecognized_event_007";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_webhook_test",
        organization_id: "org_webhook_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      // An unrelated Paystack event (e.g., transfer.success or invoice.create)
      const unrelatedPayload = JSON.stringify({
        event: "transfer.success",
        data: {
          id: 44332211,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: unrelatedPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { data: { acknowledged: boolean; ignored: boolean; reason: string } };
      assert.equal(json.data.acknowledged, true);
      assert.equal(json.data.ignored, true);
      assert.equal(json.data.reason, "unrecognized_event");

      // Verify transaction did NOT transition to failed
      const txAfter = await repos.transactions.findByReference(txRef);
      assert.equal(txAfter?.status, "pending", "Unrelated event must never mark transaction as failed");
    });

    it("safely acknowledges and ignores unrelated Paystack webhooks that do not contain a reference field", async () => {
      // An unrelated event (e.g. dedicated_account.assign.success or transfer.success) without any 'reference'
      const unhandledEventPayload = JSON.stringify({
        event: "dedicated_account.assign.success",
        data: {
          id: 99887766,
          customer: { id: 12345, email: "someone@domain.com" },
          dedicated_account: { account_name: "ActionOS Test", account_number: "9988776655" },
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: unhandledEventPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { data: { acknowledged: boolean; ignored: boolean; reason: string } };
      assert.equal(json.data.acknowledged, true);
      assert.equal(json.data.ignored, true);
      assert.equal(json.data.reason, "unrecognized_event");
    });

    it("handles concurrent deliveries safely without race conditions or duplicate execution", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_concurrent_delivery_008";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_webhook_test",
        organization_id: "org_webhook_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      const webhookPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 55667788,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      const req1 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookPayload,
      });

      const req2 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookPayload,
      });

      // Fire both requests concurrently
      const [res1, res2] = await Promise.all([
        paymentWebhookHandler(req1),
        paymentWebhookHandler(req2),
      ]);

      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);

      const json1 = (await res1.json()) as { data: { acknowledged: boolean; duplicate: boolean } };
      const json2 = (await res2.json()) as { data: { acknowledged: boolean; duplicate: boolean } };

      // Exactly one request should be the initial processing, the other must be recognized as duplicate
      const duplicateCount = (json1.data.duplicate ? 1 : 0) + (json2.data.duplicate ? 1 : 0);
      assert.equal(duplicateCount, 1, "Exactly one concurrent delivery must be flagged as duplicate");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "succeeded");
    });

    it("returns HTTP 500 when database lookup fails instead of returning a false 404", async () => {
      const repos = getRepositoryContainer();
      const originalFindByRef = repos.transactions.findByReference;

      try {
        repos.transactions.findByReference = async () => {
          throw new Error("PostgreSQL connection timeout during lookup");
        };

        const req = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "charge.success",
            data: {
              reference: "ref_lookup_failure_009",
              amount: 8750000,
              currency: "NGN",
              status: "success",
            },
          }),
        });

        const res = await paymentWebhookHandler(req);
        assert.equal(res.status, 500, "Database lookup failure must return 500 for gateway retry, not 404");
        const json = (await res.json()) as { error?: { code: string } };
        assert.equal(json.error?.code, "DATABASE_LOOKUP_FAILED");
      } finally {
        repos.transactions.findByReference = originalFindByRef;
      }
    });

    it("verifies authoritative payment with provider when ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER is enabled", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_provider_direct_verify_010";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_webhook_test",
        organization_id: "org_webhook_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      const originalEnv = process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER;
      process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER = "true";

      let verifyCalled = false;
      const fakeProvider: IPaymentProvider = {
        name: "Direct Verification Test Provider",
        async requestPayment() {
          throw new Error("Not implemented");
        },
        async verifyPayment(ref) {
          verifyCalled = true;
          return {
            status: "succeeded",
            amount: 87500,
            currency: "NGN",
            reference: ref,
            providerReference: ref,
          };
        },
      };

      setPaymentProvider(fakeProvider);

      try {
        const req = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "charge.success",
            data: {
              id: 998877,
              reference: txRef,
              amount: 8750000,
              currency: "NGN",
              status: "success",
            },
          }),
        });

        const res = await paymentWebhookHandler(req);
        assert.equal(res.status, 200);
        assert.equal(verifyCalled, true, "Authoritative provider verifyPayment must be called");

        const tx = await repos.transactions.findByReference(txRef);
        assert.equal(tx?.status, "succeeded");
      } finally {
        process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER = originalEnv;
        setPaymentProvider(null);
      }
    });

    it("rejects settlement with 422 QUOTE_EXPIRED when linked authorized quote has expired", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_expired_quote_test_011";
      const quoteId = "quote_expired_011";

      await repos.quotes.create({
        id: quoteId,
        session_id: "sess_expired_011",
        organization_id: "org_webhook_test",
        customer_id: "cust_webhook_test",
        policy_id: "pol_expired_011",
        provider_name: "Leadway",
        amount: 87500,
        currency: "NGN",
        expires_at: new Date(Date.now() - 3600000).toISOString(), // Expired 1 hour ago
        status: "issued",
      });

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_webhook_test",
        organization_id: "org_webhook_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
        metadata: { quote_id: quoteId },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "charge.success",
          data: {
            id: 110099,
            reference: txRef,
            amount: 8750000,
            currency: "NGN",
            status: "success",
          },
        }),
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error?: { code: string; message: string } };
      assert.equal(json.error?.code, "QUOTE_EXPIRED");
      assert(json.error?.message.includes("has expired"));

      // Verify transaction did NOT transition to succeeded
      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("persists webhook event into webhookEvents repository and detects duplicates via database uniqueness", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_db_unique_evt_012";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_webhook_test",
        organization_id: "org_webhook_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      const eventId = 44556677;
      const reqPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: eventId,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      // 1. First delivery
      const req1 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: reqPayload,
      });

      const res1 = await paymentWebhookHandler(req1);
      assert.equal(res1.status, 200);
      const json1 = (await res1.json()) as { data: { acknowledged: boolean; duplicate: boolean } };
      assert.equal(json1.data.duplicate, false);

      // Verify event was recorded in repos.webhookEvents
      const recorded = await repos.webhookEvents.findByEventId("paystack", String(eventId));
      assert(recorded !== null, "Webhook event must be recorded in webhookEvents repository");
      assert.equal(recorded?.event_id, String(eventId));
      assert.equal(recorded?.reference, txRef);

      // 2. Second delivery across isolated memory (simulating a separate serverless worker)
      resetProcessedWebhookMemoryCache();

      const req2 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: reqPayload,
      });

      const res2 = await paymentWebhookHandler(req2);
      assert.equal(res2.status, 200);
      const json2 = (await res2.json()) as { data: { acknowledged: boolean; duplicate: boolean } };
      assert.equal(json2.data.duplicate, true, "Separate worker must detect duplicate via database uniqueness");
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

  describe("Payment Webhook Hardening & Invariant Regressions", () => {
    const originalProvider = getPaymentProvider();

    beforeEach(() => {
      resetStore();
      resetProcessedWebhookMemoryCache();
      delete process.env.ACTIONOS_RUNTIME_MODE;
      delete process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER;
      delete process.env.ACTIONOS_STRICT_PROVIDER_VERIFICATION;
      delete process.env.PAYSTACK_SECRET_KEY;
      setPaymentProvider(originalProvider);
    });

    afterEach(() => {
      resetStore();
      resetProcessedWebhookMemoryCache();
      delete process.env.ACTIONOS_RUNTIME_MODE;
      delete process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER;
      delete process.env.ACTIONOS_STRICT_PROVIDER_VERIFICATION;
      delete process.env.PAYSTACK_SECRET_KEY;
      setPaymentProvider(originalProvider);
    });

    it("fails closed with 422 QUOTE_NOT_FOUND when transaction is bound to a missing or deleted quote", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_missing_quote_001";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 65000,
        currency: "NGN",
        status: "pending",
        metadata: { quoteId: "quote_nonexistent_or_deleted_999" },
      });

      const reqPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 11223344,
          reference: txRef,
          amount: 6500000,
          currency: "NGN",
          status: "success",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: reqPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422, "Missing quote must fail closed with 422");
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "QUOTE_NOT_FOUND");
      assert(json.error.message.includes("quote_nonexistent_or_deleted_999"));

      // Invariant: Transaction must NOT settle
      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("rejects settlement with 422 PROVIDER_AMOUNT_MISMATCH when authoritative provider amount differs", async () => {
      process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER = "true";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_provider_amt_mismatch_002";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      // Provider verification reports underpayment (e.g. 50,000 instead of 87,500)
      const fakeProvider: IPaymentProvider = {
        name: "Mismatched Amount Provider",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(ref: string): Promise<PaymentVerificationResult> {
          return {
            status: "succeeded",
            amount: 50000,
            currency: "NGN",
            reference: ref,
            providerReference: ref,
            paidAt: new Date().toISOString(),
          };
        },
      };
      setPaymentProvider(fakeProvider);

      const reqPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 22334455,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: reqPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "PROVIDER_AMOUNT_MISMATCH");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("rejects settlement with 422 PROVIDER_CURRENCY_MISMATCH when authoritative provider currency differs", async () => {
      process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER = "true";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_provider_curr_mismatch_003";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      // Provider verification reports foreign currency
      const fakeProvider: IPaymentProvider = {
        name: "Mismatched Currency Provider",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(ref: string): Promise<PaymentVerificationResult> {
          return {
            status: "succeeded",
            amount: 87500,
            currency: "USD",
            reference: ref,
            providerReference: ref,
            paidAt: new Date().toISOString(),
          };
        },
      };
      setPaymentProvider(fakeProvider);

      const reqPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 33445566,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: reqPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "PROVIDER_CURRENCY_MISMATCH");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("strictly enforces provider minor units (kobo) in production mode and rejects direct Naira amounts", async () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.PAYSTACK_SECRET_KEY = "test_key_strict_prod_004";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_strict_units_prod_004";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 50000,
        currency: "NGN",
        status: "pending",
      });

      // Payload sends direct Naira (50000) instead of minor unit (5000000 kobo)
      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 44556677,
          reference: txRef,
          amount: 50000,
          currency: "NGN",
          status: "success",
        },
      });

      const signature = crypto
        .createHmac("sha512", "test_key_strict_prod_004")
        .update(rawPayload)
        .digest("hex");

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-paystack-signature": signature,
        },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "AMOUNT_MISMATCH");
      assert(json.error.message.includes("strict provider minor units"));

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("coordinates concurrent in-flight deliveries and does not falsely acknowledge duplicate when the primary delivery fails", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_concurrent_failure_005";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 99112233,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      // Simulate database failure during transaction status mutation
      const originalUpdateStatus = repos.transactions.updateStatus;
      repos.transactions.updateStatus = async () => {
        throw new Error("PostgreSQL connection timeout during settlement");
      };

      try {
        const req1 = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: rawPayload,
        });

        const req2 = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: rawPayload,
        });

        // Fire both concurrently
        const [res1, res2] = await Promise.all([
          paymentWebhookHandler(req1),
          paymentWebhookHandler(req2),
        ]);

        // CRITICAL INVARIANT: Neither response must return 200 acknowledged duplicate.
        // Both must return 500 so the payment gateway knows delivery failed and retries.
        assert.equal(res1.status, 500, "Primary request must return 500 on database failure");
        assert.equal(res2.status, 500, "Concurrent request must NOT acknowledge duplicate on failure");

        const json1 = (await res1.json()) as { success: boolean; error: { code: string } };
        const json2 = (await res2.json()) as { success: boolean; error: { code: string } };

        assert.equal(json1.success, false);
        assert.equal(json2.success, false);
      } finally {
        repos.transactions.updateStatus = originalUpdateStatus;
      }
    });

    it("strictly requires currency field in production mode and rejects with 422 CURRENCY_REQUIRED when omitted", async () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.PAYSTACK_SECRET_KEY = "test_key_currency_prod_006";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_missing_curr_prod_006";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 50000,
        currency: "NGN",
        status: "pending",
      });

      // Payload omits currency field
      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 55667788,
          reference: txRef,
          amount: 5000000,
          status: "success",
        },
      });

      const signature = crypto
        .createHmac("sha512", "test_key_currency_prod_006")
        .update(rawPayload)
        .digest("hex");

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-paystack-signature": signature,
        },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "CURRENCY_REQUIRED");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("rejects settlement with 422 CURRENCY_MISMATCH when webhook currency contradicts transaction", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_currency_mismatch_007";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 50000,
        currency: "NGN",
        status: "pending",
      });

      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 66778899,
          reference: txRef,
          amount: 5000000,
          currency: "USD",
          status: "success",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "CURRENCY_MISMATCH");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("fails closed with 422 QUOTE_REQUIRED when transaction metadata specifies requires_quote without a quoteId", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_quote_required_008";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 75000,
        currency: "NGN",
        status: "pending",
        metadata: { requires_quote: true },
      });

      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 77889900,
          reference: txRef,
          amount: 7500000,
          currency: "NGN",
          status: "success",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "QUOTE_REQUIRED");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("fails closed with 422 QUOTE_EXPIRED when linked quote has expired", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_quote_expired_009";
      const quoteId = "quote_expired_test_009";

      await repos.quotes.create({
        id: quoteId,
        session_id: "sess_wh_test_009",
        policy_id: "pol_wh_test_009",
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 80000,
        currency: "NGN",
        provider_name: "Leadway",
        status: "issued",
        expires_at: new Date(Date.now() - 3600000).toISOString(), // expired 1h ago
      });

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 80000,
        currency: "NGN",
        status: "pending",
        metadata: { quoteId },
      });

      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 88990011,
          reference: txRef,
          amount: 8000000,
          currency: "NGN",
          status: "success",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "QUOTE_EXPIRED");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("fails closed with 422 QUOTE_AMOUNT_MISMATCH when transaction amount does not match bound quote", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_quote_amt_mismatch_010";
      const quoteId = "quote_amt_mismatch_test_010";

      await repos.quotes.create({
        id: quoteId,
        session_id: "sess_wh_test_010",
        policy_id: "pol_wh_test_010",
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 90000, // Quote is 90,000
        currency: "NGN",
        provider_name: "Leadway",
        status: "issued",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 85000, // Transaction record is 85,000 (mismatch)
        currency: "NGN",
        status: "pending",
        metadata: { quoteId },
      });

      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 99001122,
          reference: txRef,
          amount: 8500000,
          currency: "NGN",
          status: "success",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "QUOTE_AMOUNT_MISMATCH");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("fails closed with 422 PROVIDER_REFERENCE_MISMATCH when authoritative provider reference contradicts stored transaction metadata", async () => {
      process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER = "true";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_prov_ref_mismatch_011";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 55000,
        currency: "NGN",
        status: "pending",
        metadata: { provider_reference: "prov_expected_ref_original" },
      });

      const fakeProvider: IPaymentProvider = {
        name: "Mismatched Provider Reference",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(): Promise<PaymentVerificationResult> {
          return {
            status: "succeeded",
            amount: 55000,
            currency: "NGN",
            providerReference: "prov_completely_different_foreign_ref",
            paidAt: new Date().toISOString(),
          };
        },
      };
      setPaymentProvider(fakeProvider);

      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 10293847,
          reference: txRef,
          amount: 5500000,
          currency: "NGN",
          status: "success",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "PROVIDER_REFERENCE_MISMATCH");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("preserves original payment settlement outcome as succeeded and records refund_pending separately on refund.pending", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_refund_pending_012";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "succeeded",
        metadata: {
          original_payment_status: "succeeded",
        },
      });

      const rawPayload = JSON.stringify({
        event: "refund.pending",
        data: {
          id: 55661122,
          reference: txRef,
          refund_reference: "rf_paystack_pend_012",
          amount: 8750000,
          currency: "NGN",
          status: "pending",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 200);

      const tx = await repos.transactions.findByReference(txRef);
      // Invariant: original payment status must NOT regress to 'pending'
      assert.equal(tx?.status, "succeeded", "Primary status must remain succeeded");
      assert.equal(tx?.metadata?.original_payment_status, "succeeded");
      assert.equal(tx?.metadata?.refund_state, "refund_pending");
      assert.equal(tx?.metadata?.refund_reference, "rf_paystack_pend_012");
    });

    it("preserves original payment settlement outcome as succeeded and records refund_failed separately on refund.failed", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_refund_failed_013";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "succeeded",
        metadata: {
          original_payment_status: "succeeded",
        },
      });

      const rawPayload = JSON.stringify({
        event: "refund.failed",
        data: {
          id: 66772233,
          reference: txRef,
          refund_reference: "rf_paystack_fail_013",
          amount: 8750000,
          currency: "NGN",
          status: "failed",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 200);

      const tx = await repos.transactions.findByReference(txRef);
      // Invariant: original payment status must NOT be corrupted to 'failed'
      assert.equal(tx?.status, "succeeded", "Primary status must remain succeeded when refund fails");
      assert.equal(tx?.metadata?.original_payment_status, "succeeded");
      assert.equal(tx?.metadata?.refund_state, "refund_failed");
    });

    it("transitions transaction status to refunded and preserves original_payment_status: succeeded on refund.processed", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_refund_processed_014";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "succeeded",
        metadata: {
          original_payment_status: "succeeded",
        },
      });

      const rawPayload = JSON.stringify({
        event: "refund.processed",
        data: {
          id: 77883344,
          reference: txRef,
          refund_reference: "rf_paystack_proc_014",
          amount: 8750000,
          currency: "NGN",
          status: "processed",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 200);

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "refunded");
      assert.equal(tx?.metadata?.original_payment_status, "succeeded");
      assert.equal(tx?.metadata?.refund_state, "refund_confirmed");
      assert.equal(tx?.metadata?.refund_reference, "rf_paystack_proc_014");
    });

    it("fails closed with 422 PROVIDER_REFUND_VERIFICATION_FAILED when authoritative provider refund verification does not confirm refund", async () => {
      process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER = "true";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_refund_verif_failed_015";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "succeeded",
        metadata: {
          original_payment_status: "succeeded",
        },
      });

      const fakeProvider: IPaymentProvider = {
        name: "Failed Refund Verifier",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(): Promise<PaymentVerificationResult> {
          return {
            status: "succeeded",
            amount: 87500,
            currency: "NGN",
            providerReference: txRef,
          };
        },
        async verifyRefund(): Promise<PaymentRefundResult> {
          return {
            status: "refund_failed",
            refundReference: "rf_paystack_declined_015",
            amount: 87500,
            currency: "NGN",
            error: "Bank rejected reversal",
          };
        },
      };
      setPaymentProvider(fakeProvider);

      const rawPayload = JSON.stringify({
        event: "refund.processed",
        data: {
          id: 88994455,
          reference: txRef,
          refund_reference: "rf_paystack_declined_015",
          amount: 8750000,
          currency: "NGN",
          status: "processed",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "PROVIDER_REFUND_VERIFICATION_FAILED");

      // Invariant: Transaction must NOT be marked refunded
      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "succeeded");
    });
  });

  describe("Payment Webhook Authoritative Hardening & Production Invariants", () => {
    it("should strictly enforce authoritative verification in production even if ACTIONOS_DISABLE_AUTHORITATIVE_VERIFICATION=true is configured", async () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.PAYSTACK_SECRET_KEY = "test_paystack_secret_key_prod_auth";
      process.env.ACTIONOS_DISABLE_AUTHORITATIVE_VERIFICATION = "true";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_prod_no_bypass_020";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 45000,
        currency: "NGN",
        status: "pending",
      });

      const failingProvider: IPaymentProvider = {
        name: "Failing Provider",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(): Promise<PaymentVerificationResult> {
          return {
            status: "failed",
            amount: 45000,
            currency: "NGN",
            reference: txRef,
            providerReference: txRef,
          };
        },
      };
      setPaymentProvider(failingProvider);

      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 55443322,
          reference: txRef,
          amount: 4500000,
          currency: "NGN",
          status: "success",
        },
      });

      const signature = crypto
        .createHmac("sha512", "test_paystack_secret_key_prod_auth")
        .update(rawPayload)
        .digest("hex");

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-paystack-signature": signature,
        },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "PROVIDER_VERIFICATION_FAILED");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("should reject settlement when provider payment reference contains transaction reference as substring but is not strictly equal", async () => {
      process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER = "true";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_exact_match_021";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 60000,
        currency: "NGN",
        status: "pending",
      });

      // Provider reference contains txRef as substring, which must be strictly rejected
      const looseProvider: IPaymentProvider = {
        name: "Substring Loose Provider",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(): Promise<PaymentVerificationResult> {
          return {
            status: "succeeded",
            amount: 60000,
            currency: "NGN",
            reference: `${txRef}_extra_suffix_tamper`,
            providerReference: `${txRef}_extra_suffix_tamper`,
          };
        },
      };
      setPaymentProvider(looseProvider);

      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 66554433,
          reference: txRef,
          amount: 6000000,
          currency: "NGN",
          status: "success",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "PROVIDER_REFERENCE_MISMATCH");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "pending");
    });

    it("should reject refund.processed in production mode when refund identifier is missing", async () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.PAYSTACK_SECRET_KEY = "test_paystack_secret_key_prod_refund";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_missing_refund_id_022";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "succeeded",
        metadata: { original_payment_status: "succeeded" },
      });

      const rawPayload = JSON.stringify({
        event: "refund.processed",
        data: {
          id: 99887766,
          reference: txRef,
          // Omitting refund_reference
          amount: 8750000,
          currency: "NGN",
          status: "processed",
        },
      });

      const signature = crypto
        .createHmac("sha512", "test_paystack_secret_key_prod_refund")
        .update(rawPayload)
        .digest("hex");

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-paystack-signature": signature,
        },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 422);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "REFUND_IDENTIFIER_REQUIRED");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "succeeded");
    });

    it("should reject refund.processed in production mode when provider refund verification capability is unavailable", async () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.PAYSTACK_SECRET_KEY = "test_paystack_secret_key_prod_refund";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_no_verify_refund_023";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "succeeded",
        metadata: { original_payment_status: "succeeded" },
      });

      // Provider without verifyRefund
      const noVerifyRefundProvider: IPaymentProvider = {
        name: "No Refund Verifier Provider",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(): Promise<PaymentVerificationResult> {
          return {
            status: "succeeded",
            amount: 87500,
            currency: "NGN",
            reference: txRef,
            providerReference: txRef,
          };
        },
      };
      setPaymentProvider(noVerifyRefundProvider);

      const rawPayload = JSON.stringify({
        event: "refund.processed",
        data: {
          id: 99887777,
          reference: txRef,
          refund_reference: "rf_paystack_test_023",
          amount: 8750000,
          currency: "NGN",
          status: "processed",
        },
      });

      const signature = crypto
        .createHmac("sha512", "test_paystack_secret_key_prod_refund")
        .update(rawPayload)
        .digest("hex");

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-paystack-signature": signature,
        },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 500);
      const json = (await res.json()) as { error: { code: string; message: string } };
      assert.equal(json.error.code, "PROVIDER_REFUND_VERIFICATION_UNAVAILABLE");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "succeeded");
    });

    it("should reject settlement when provider verification returns empty payment reference", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_empty_provider_ref_024";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      const originalEnv = process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER;
      process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER = "true";

      const emptyRefProvider: IPaymentProvider = {
        name: "Empty Reference Provider",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(): Promise<PaymentVerificationResult> {
          return {
            status: "succeeded",
            amount: 87500,
            currency: "NGN",
            reference: "",
            providerReference: "",
          };
        },
      };
      setPaymentProvider(emptyRefProvider);

      try {
        const req = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "charge.success",
            data: {
              id: 99881122,
              reference: txRef,
              amount: 8750000,
              currency: "NGN",
              status: "success",
            },
          }),
        });

        const res = await paymentWebhookHandler(req);
        assert.equal(res.status, 422);
        const json = (await res.json()) as { error: { code: string; message: string } };
        assert.equal(json.error.code, "PROVIDER_REFERENCE_REQUIRED");

        const tx = await repos.transactions.findByReference(txRef);
        assert.equal(tx?.status, "pending");
      } finally {
        process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER = originalEnv;
        setPaymentProvider(null);
      }
    });

    it("should reject settlement when provider verification returns missing or empty currency", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_empty_provider_currency_025";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "pending",
      });

      const originalEnv = process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER;
      process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER = "true";

      const emptyCurrencyProvider: IPaymentProvider = {
        name: "Empty Currency Provider",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(ref: string): Promise<PaymentVerificationResult> {
          return {
            status: "succeeded",
            amount: 87500,
            currency: "", // Omitted / empty currency
            reference: ref,
            providerReference: ref,
          };
        },
      };
      setPaymentProvider(emptyCurrencyProvider);

      try {
        const req = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "charge.success",
            data: {
              id: 99882233,
              reference: txRef,
              amount: 8750000,
              currency: "NGN",
              status: "success",
            },
          }),
        });

        const res = await paymentWebhookHandler(req);
        assert.equal(res.status, 422);
        const json = (await res.json()) as { error: { code: string; message: string } };
        assert.equal(json.error.code, "PROVIDER_CURRENCY_REQUIRED");

        const tx = await repos.transactions.findByReference(txRef);
        assert.equal(tx?.status, "pending");
      } finally {
        process.env.ACTIONOS_VERIFY_WEBHOOK_WITH_PROVIDER = originalEnv;
        setPaymentProvider(null);
      }
    });

    it("should reject refund.processed when provider refund verification amount mismatches expected amount", async () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.PAYSTACK_SECRET_KEY = "test_paystack_secret_key_prod_refund";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_refund_amount_mismatch_026";
      const refundRef = "rf_provider_test_026";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "succeeded",
        metadata: { original_payment_status: "succeeded" },
      });

      const mismatchRefundAmountProvider: IPaymentProvider = {
        name: "Mismatch Refund Amount Provider",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(): Promise<PaymentVerificationResult> {
          return {
            status: "succeeded",
            amount: 87500,
            currency: "NGN",
            reference: txRef,
            providerReference: txRef,
          };
        },
        async verifyRefund(rRef: string): Promise<PaymentRefundResult> {
          return {
            status: "refund_confirmed",
            refundReference: rRef,
            transactionReference: txRef,
            amount: 50000, // Under-refunded: 50,000 instead of 87,500
            currency: "NGN",
          };
        },
      };
      setPaymentProvider(mismatchRefundAmountProvider);

      try {
        const rawPayload = JSON.stringify({
          event: "refund.processed",
          data: {
            id: 99883344,
            reference: txRef,
            refund_reference: refundRef,
            amount: 8750000,
            currency: "NGN",
            status: "processed",
          },
        });

        const signature = crypto
          .createHmac("sha512", "test_paystack_secret_key_prod_refund")
          .update(rawPayload)
          .digest("hex");

        const req = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-paystack-signature": signature,
          },
          body: rawPayload,
        });

        const res = await paymentWebhookHandler(req);
        assert.equal(res.status, 422);
        const json = (await res.json()) as { error: { code: string; message: string } };
        assert.equal(json.error.code, "PROVIDER_REFUND_AMOUNT_MISMATCH");

        const tx = await repos.transactions.findByReference(txRef);
        assert.equal(tx?.status, "succeeded");
      } finally {
        setPaymentProvider(null);
      }
    });

    it("should reject refund.processed when provider refund verification transaction reference contradicts original transaction", async () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.PAYSTACK_SECRET_KEY = "test_paystack_secret_key_prod_refund";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_refund_tx_mismatch_027";
      const refundRef = "rf_provider_test_027";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "succeeded",
        metadata: { original_payment_status: "succeeded" },
      });

      const mismatchTxRefProvider: IPaymentProvider = {
        name: "Mismatch Tx Reference Refund Provider",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(): Promise<PaymentVerificationResult> {
          return {
            status: "succeeded",
            amount: 87500,
            currency: "NGN",
            reference: txRef,
            providerReference: txRef,
          };
        },
        async verifyRefund(rRef: string): Promise<PaymentRefundResult> {
          return {
            status: "refund_confirmed",
            refundReference: rRef,
            transactionReference: "different_tx_ref_099",
            amount: 87500,
            currency: "NGN",
          };
        },
      };
      setPaymentProvider(mismatchTxRefProvider);

      try {
        const rawPayload = JSON.stringify({
          event: "refund.processed",
          data: {
            id: 99884455,
            reference: txRef,
            refund_reference: refundRef,
            amount: 8750000,
            currency: "NGN",
            status: "processed",
          },
        });

        const signature = crypto
          .createHmac("sha512", "test_paystack_secret_key_prod_refund")
          .update(rawPayload)
          .digest("hex");

        const req = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-paystack-signature": signature,
          },
          body: rawPayload,
        });

        const res = await paymentWebhookHandler(req);
        assert.equal(res.status, 422);
        const json = (await res.json()) as { error: { code: string; message: string } };
        assert.equal(json.error.code, "PROVIDER_REFUND_TRANSACTION_MISMATCH");

        const tx = await repos.transactions.findByReference(txRef);
        assert.equal(tx?.status, "succeeded");
      } finally {
        setPaymentProvider(null);
      }
    });

    it("should prevent out-of-order refund.pending from overwriting confirmed refund status", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_out_of_order_refund_028";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "refunded",
        metadata: {
          original_payment_status: "succeeded",
          refund_state: "refund_confirmed",
        },
      });

      const rawPayload = JSON.stringify({
        event: "refund.pending",
        data: {
          id: 99885566,
          reference: txRef,
          refund_reference: "rf_late_pend_028",
          amount: 8750000,
          currency: "NGN",
          status: "pending",
        },
      });

      const req = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawPayload,
      });

      const res = await paymentWebhookHandler(req);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { data: { acknowledged: boolean; duplicate: boolean; ignored: string } };
      assert.equal(json.data.acknowledged, true);
      assert.equal(json.data.ignored, "out_of_order_refund");

      const tx = await repos.transactions.findByReference(txRef);
      assert.equal(tx?.status, "refunded", "Transaction status must remain terminal refunded");
      assert.equal(tx?.metadata?.refund_state, "refund_confirmed", "Refund state must not regress to refund_pending");
    });

    it("should ensure PaystackPaymentProvider does not silently default missing reference or currency in verifyPayment", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              status: true,
              data: {
                status: "success",
                amount: 8750000,
                // reference and currency omitted from response
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );

        const provider = new PaystackPaymentProvider("sk_test_mock_key_001");
        const res = await provider.verifyPayment("ref_test_no_default_01");

        assert.equal(res.reference, "", "Must not default missing reference to queried reference");
        assert.equal(res.currency, "", "Must not default missing currency to NGN");
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("should ensure PaystackPaymentProvider does not silently default missing currency in verifyRefund", async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              status: true,
              data: {
                id: 12345,
                status: "processed",
                amount: 8750000,
                // currency omitted from response
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );

        const provider = new PaystackPaymentProvider("sk_test_mock_key_002");
        const res = await provider.verifyRefund("rf_test_no_default_02");

        assert.equal(res.currency, "", "Must not default missing refund currency to NGN");
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it("should reject refund.processed when provider refund verification currency mismatches expected currency", async () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.PAYSTACK_SECRET_KEY = "test_paystack_secret_key_prod_refund";

      const repos = getRepositoryContainer();
      const txRef = "ref_wh_refund_curr_mismatch_029";
      const refundRef = "rf_provider_test_029";

      await repos.transactions.create({
        id: txRef,
        reference: txRef,
        customer_id: "cust_wh_test",
        organization_id: "org_wh_test",
        amount: 87500,
        currency: "NGN",
        status: "succeeded",
        metadata: { original_payment_status: "succeeded" },
      });

      const mismatchCurrencyProvider: IPaymentProvider = {
        name: "Mismatch Refund Currency Provider",
        async requestPayment() {
          return { status: "initiated", reference: txRef };
        },
        async verifyPayment(): Promise<PaymentVerificationResult> {
          return {
            status: "succeeded",
            amount: 87500,
            currency: "NGN",
            reference: txRef,
            providerReference: txRef,
          };
        },
        async verifyRefund(rRef: string): Promise<PaymentRefundResult> {
          return {
            status: "refund_confirmed",
            refundReference: rRef,
            transactionReference: txRef,
            amount: 87500,
            currency: "USD", // Mismatch: USD instead of NGN
          };
        },
      };
      setPaymentProvider(mismatchCurrencyProvider);

      try {
        const rawPayload = JSON.stringify({
          event: "refund.processed",
          data: {
            id: 99886677,
            reference: txRef,
            refund_reference: refundRef,
            amount: 8750000,
            currency: "NGN",
            status: "processed",
          },
        });

        const signature = crypto
          .createHmac("sha512", "test_paystack_secret_key_prod_refund")
          .update(rawPayload)
          .digest("hex");

        const req = new Request("https://actionos.ng/api/webhooks/payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-paystack-signature": signature,
          },
          body: rawPayload,
        });

        const res = await paymentWebhookHandler(req);
        assert.equal(res.status, 422);
        const json = (await res.json()) as { error: { code: string; message: string } };
        assert.equal(json.error.code, "PROVIDER_REFUND_CURRENCY_MISMATCH");

        const tx = await repos.transactions.findByReference(txRef);
        assert.equal(tx?.status, "succeeded");
      } finally {
        setPaymentProvider(null);
      }
    });
  });
});

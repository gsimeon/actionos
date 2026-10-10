import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ActionOSRecoveryWorker } from "@/lib/actionos/recovery-worker";
import { ActionOSOrchestrator } from "@/lib/actionos/orchestrator";
import { getRepositoryContainer, setRepositoryContainer } from "@/lib/repositories";
import { DemoRepositoryContainer } from "@/lib/repositories/demo/demo-repositories";
import { mockPaymentProvider, setPaymentProvider } from "@/lib/payments";
import { POST as paymentWebhookHandler } from "@/app/api/webhooks/payment/route";
import { getStore, resetStore } from "@/lib/actionos/mock-store";

describe("Durable Reconciliation Worker & Dead-Letter Handling", () => {
  const originalEnv = { ...process.env };
  const mockTenantContext = {
    organizationId: "org_test_123",
    customerId: "cust_test_456",
    role: "customer" as const,
  };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    setPaymentProvider(null);
    resetStore();
    const repos = new DemoRepositoryContainer();
    setRepositoryContainer(repos);
    await repos.customers.create(
      {
        id: mockTenantContext.customerId,
        customer_number: "CUST-REC-001",
        full_name: "Test Customer",
        phone: "+2348012345678",
        email: "test@actionos.ng",
        organization_id: mockTenantContext.organizationId,
      },
      mockTenantContext
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setPaymentProvider(null);
  });

  it("should process and reconcile a stuck session when payment is settled", async () => {
    const repos = getRepositoryContainer();
    const orchestrator = new ActionOSOrchestrator();
    const worker = new ActionOSRecoveryWorker(orchestrator, { maxRetries: 5 });

    const policy = await repos.policies.create(
      {
        customer_id: mockTenantContext.customerId,
        provider_id: "prov_1",
        policy_type_id: "type_motor",
        policy_number: "POL-REC-001",
        start_date: "2025-01-01",
        expiry_date: "2026-01-01",
        premium: 50000,
        status: "active",
      },
      mockTenantContext
    );

    const session = await repos.sessions.create(
      {
        organization_id: mockTenantContext.organizationId,
        customer_id: mockTenantContext.customerId,
        channel: "web",
        status: "executing",
        metadata: {
          reconciliation_required: true,
          policyNumber: policy.policy_number,
          paymentReference: "pay_rec_001",
          expectedYear: 2027,
          plan: {
            intent: "renew_policy",
            confidence: 0.95,
            steps: [],
          },
        },
      },
      mockTenantContext
    );

    await mockPaymentProvider.requestPayment({
      customerId: mockTenantContext.customerId,
      amount: 50000,
      currency: "NGN",
      reference: "pay_rec_001",
    });

    const result = await worker.processSession(session.id, mockTenantContext);

    assert.equal(result.sessionId, session.id);
    assert.equal(result.attemptCount, 1);
    assert.ok(["reconciled", "still_pending"].includes(result.outcome));

    const updated = await repos.sessions.findById(session.id, mockTenantContext);
    const meta = updated?.metadata as Record<string, unknown> | undefined;
    assert.equal(meta?.reconciliationAttempts, 1);
    assert.ok(meta?.lastReconciliationAttemptAt);
  });

  it("should move session to Dead-Letter Queue (DLQ) after exceeding maxRetries", async () => {
    const repos = getRepositoryContainer();
    const orchestrator = new ActionOSOrchestrator();
    const worker = new ActionOSRecoveryWorker(orchestrator, { maxRetries: 3 });

    const session = await repos.sessions.create(
      {
        organization_id: mockTenantContext.organizationId,
        customer_id: mockTenantContext.customerId,
        channel: "web",
        status: "executing",
        metadata: {
          reconciliation_required: true,
          reconciliationAttempts: 3,
          paymentReference: "unresolved_payment_ref_dead",
        },
      },
      mockTenantContext
    );

    const result = await worker.processSession(session.id, mockTenantContext);

    assert.equal(result.outcome, "dead_lettered");
    assert.equal(result.newStatus, "escalated");
    assert.equal(result.attemptCount, 4);
    assert.ok(result.details?.includes("Max recovery attempts"));

    const updated = await repos.sessions.findById(session.id, mockTenantContext);
    assert.equal(updated?.status, "escalated");
    const meta = updated?.metadata as Record<string, unknown> | undefined;
    assert.equal(meta?.isDeadLettered, true);
    assert.ok(meta?.deadLetteredAt);
    assert.equal(meta?.requiresOperatorIntervention, true);
  });

  it("should respect exponential backoff and defer retry within backoff window", async () => {
    const repos = getRepositoryContainer();
    const orchestrator = new ActionOSOrchestrator();
    const worker = new ActionOSRecoveryWorker(orchestrator, { maxRetries: 5 });

    const futureDate = new Date(Date.now() + 60000).toISOString();
    const session = await repos.sessions.create(
      {
        organization_id: mockTenantContext.organizationId,
        customer_id: mockTenantContext.customerId,
        channel: "web",
        status: "executing",
        metadata: {
          reconciliation_required: true,
          reconciliationAttempts: 1,
          nextRetryAt: futureDate,
        },
      },
      mockTenantContext
    );

    // Without force, should be deferred
    const deferredResult = await worker.processSession(session.id, mockTenantContext, false);
    assert.equal(deferredResult.outcome, "still_pending");
    assert.ok(deferredResult.details?.includes("waiting for backoff window"));

    // With force=true, should bypass backoff window
    const forcedResult = await worker.processSession(session.id, mockTenantContext, true);
    assert.equal(forcedResult.attemptCount, 2);
  });

  it("should perform batch sweep across pending reconciliation sessions", async () => {
    const repos = getRepositoryContainer();
    const orchestrator = new ActionOSOrchestrator();
    const worker = new ActionOSRecoveryWorker(orchestrator, { maxRetries: 5 });

    const session1 = await repos.sessions.create(
      {
        organization_id: mockTenantContext.organizationId,
        channel: "web",
        status: "executing",
        metadata: { reconciliation_required: true },
      },
      mockTenantContext
    );

    const session2 = await repos.sessions.create(
      {
        organization_id: mockTenantContext.organizationId,
        channel: "web",
        status: "escalated",
        metadata: { requiresManualRefund: true, refundState: "refund_pending" },
      },
      mockTenantContext
    );

    const report = await worker.runSweep(
      { organizationId: mockTenantContext.organizationId, force: true },
      mockTenantContext
    );

    assert.ok(report.totalScanned >= 2);
    assert.ok(report.processedCount >= 2);
    assert.ok(report.results.some((r) => r.sessionId === session1.id));
    assert.ok(report.results.some((r) => r.sessionId === session2.id));
  });

  it("should safely continue recovery after process restart", async () => {
    const repos = getRepositoryContainer();

    const session = await repos.sessions.create(
      {
        organization_id: mockTenantContext.organizationId,
        channel: "web",
        status: "executing",
        metadata: {
          reconciliation_required: true,
          reconciliationAttempts: 2,
          lastReconciliationAttemptAt: new Date(Date.now() - 60000).toISOString(),
        },
      },
      mockTenantContext
    );

    // Simulate process restart: fresh worker instance created
    const newWorkerInstance = new ActionOSRecoveryWorker(new ActionOSOrchestrator(), { maxRetries: 5 });

    const result = await newWorkerInstance.processSession(session.id, mockTenantContext, true);

    assert.equal(result.attemptCount, 3);
    const updated = await repos.sessions.findById(session.id, mockTenantContext);
    const meta = updated?.metadata as Record<string, unknown> | undefined;
    assert.equal(meta?.reconciliationAttempts, 3);
  });

  it("should enforce tenant boundaries during reconciliation", async () => {
    const repos = getRepositoryContainer();
    const worker = new ActionOSRecoveryWorker(new ActionOSOrchestrator(), { maxRetries: 5 });

    const session = await repos.sessions.create(
      {
        organization_id: "org_alpha",
        channel: "web",
        status: "executing",
        metadata: { reconciliation_required: true },
      },
      { organizationId: "org_alpha", role: "customer" }
    );

    // Org Beta tries to process Org Alpha session
    const blockedResult = await worker.processSession(
      session.id,
      { organizationId: "org_beta", role: "customer" },
      true
    );

    assert.equal(blockedResult.outcome, "failed");
    assert.ok(blockedResult.details?.includes("not found or tenant boundary"));
  });

  describe("Webhook Deduplication & Authoritative Gateway Signature Guard", () => {
    it("should acknowledge duplicate webhook deliveries idempotently without duplicate side-effects", async () => {
      const repos = getRepositoryContainer();
      const ref = "ref_wh_dedup_001";

      await repos.transactions.create(
        {
          customer_id: mockTenantContext.customerId,
          amount: 50000,
          currency: "NGN",
          reference: ref,
          status: "pending",
        },
        mockTenantContext
      );

      const webhookBody = JSON.stringify({
        event: "charge.success",
        data: {
          reference: ref,
          amount: 50000,
          status: "success",
        },
      });

      // 1. First delivery
      const req1 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookBody,
      });
      const res1 = await paymentWebhookHandler(req1);
      const json1 = await res1.json();

      assert.equal(res1.status, 200);
      assert.equal(json1.success, true);
      assert.equal(json1.data.duplicate, false);

      // Verify transaction marked succeeded
      const txAfter1 = await repos.transactions.findByReference(ref);
      assert.equal(txAfter1?.status, "succeeded");

      // 2. Second (duplicate) delivery
      const req2 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookBody,
      });
      const res2 = await paymentWebhookHandler(req2);
      const json2 = await res2.json();

      assert.equal(res2.status, 200);
      assert.equal(json2.success, true);
      assert.equal(json2.data.duplicate, true);
    });

    it("should strictly reject unauthenticated or tampered webhooks in production mode", async () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.PAYSTACK_SECRET_KEY = "test_paystack_secret_key_888";

      const repos = getRepositoryContainer();
      await repos.transactions.create(
        {
          customer_id: mockTenantContext.customerId,
          amount: 50000,
          currency: "NGN",
          reference: "ref_wh_tamper_001",
          status: "pending",
        },
        mockTenantContext
      );

      const webhookBody = JSON.stringify({
        event: "charge.success",
        data: { reference: "ref_wh_tamper_001", amount: 5000000 },
      });

      // 1. Missing signature header in production -> 401
      const reqMissing = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: webhookBody,
      });
      const resMissing = await paymentWebhookHandler(reqMissing);
      assert.equal(resMissing.status, 401);
      const jsonMissing = await resMissing.json();
      assert.equal(jsonMissing.error.code, "UNAUTHORIZED_WEBHOOK");

      // 2. Tampered signature -> 401
      const reqTampered = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-paystack-signature": "tampered_fake_signature_hash",
        },
        body: webhookBody,
      });
      const resTampered = await paymentWebhookHandler(reqTampered);
      assert.equal(resTampered.status, 401);
      const jsonTampered = await resTampered.json();
      assert.equal(jsonTampered.error.code, "INVALID_WEBHOOK_SIGNATURE");

      // 3. Valid HMAC SHA512 signature -> 200
      const validSignature = crypto
        .createHmac("sha512", "test_paystack_secret_key_888")
        .update(webhookBody)
        .digest("hex");

      const reqValid = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-paystack-signature": validSignature,
        },
        body: webhookBody,
      });
      const resValid = await paymentWebhookHandler(reqValid);
      assert.equal(resValid.status, 200);
      const jsonValid = await resValid.json();
      assert.equal(jsonValid.success, true);
      assert.equal(jsonValid.data.acknowledged, true);
    });
  });

  describe("Delayed Webhook & Safe Recovery Without Duplicate Charging", () => {
    it("should execute verified saga refund when payment settled but renewal failed downstream without duplicate charges", async () => {
      const repos = getRepositoryContainer();
      const orchestrator = new ActionOSOrchestrator();
      const worker = new ActionOSRecoveryWorker(orchestrator, { maxRetries: 5 });

      const policy = await repos.policies.create(
        {
          customer_id: mockTenantContext.customerId,
          provider_id: "prov_1",
          policy_type_id: "type_motor",
          policy_number: "POL-DELAYED-FAIL-001",
          start_date: "2025-01-01",
          expiry_date: "2026-01-01",
          premium: 65000,
          status: "active", // Renewal was NOT performed
        },
        mockTenantContext
      );

      const ref = "pay_delayed_fail_001";

      await repos.transactions.create(
        {
          customer_id: mockTenantContext.customerId,
          amount: 65000,
          currency: "NGN",
          reference: ref,
          status: "pending",
        },
        mockTenantContext
      );

      const session = await repos.sessions.create(
        {
          organization_id: mockTenantContext.organizationId,
          customer_id: mockTenantContext.customerId,
          channel: "web",
          status: "executing",
          metadata: {
            reconciliation_required: true,
            policyNumber: policy.policy_number,
            paymentReference: ref,
            expectedYear: 2027,
            plan: {
              intent: "renew_policy",
              confidence: 0.95,
              steps: [],
            },
          },
        },
        mockTenantContext
      );

      // Delayed webhook arrives and marks transaction succeeded
      const webhookReq = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "charge.success",
          data: { reference: ref, amount: 65000 },
        }),
      });
      await paymentWebhookHandler(webhookReq);

      // Worker processes session: detects unrenewed policy and executes compensating refund
      const recoveryResult = await worker.processSession(session.id, mockTenantContext, true);
      assert.equal(recoveryResult.sessionId, session.id);
      assert.ok(["reconciled", "still_pending", "escalated"].includes(recoveryResult.outcome));

      // Verify transaction was marked refunded and exactly one original transaction existed (no double debit)
      const store = getStore();
      const refTx = store.transactions.filter((t) => t.reference === ref);
      assert.equal(refTx.length, 1, "Customer must never have multiple charge attempts");
      assert.equal(refTx[0].status, "refunded", "Transaction must be transitioned to refunded upon renewal failure");
    });

    it("should mark session completed when payment settled and policy was renewed downstream without duplicate charges", async () => {
      const repos = getRepositoryContainer();
      const orchestrator = new ActionOSOrchestrator();
      const worker = new ActionOSRecoveryWorker(orchestrator, { maxRetries: 5 });

      const policy = await repos.policies.create(
        {
          customer_id: mockTenantContext.customerId,
          provider_id: "prov_1",
          policy_type_id: "type_motor",
          policy_number: "POL-DELAYED-SUCCESS-002",
          start_date: "2025-01-01",
          expiry_date: "2027-01-01",
          premium: 65000,
          status: "renewed", // Policy renewal was successfully finished downstream
        },
        mockTenantContext
      );

      const ref = "pay_delayed_succ_002";

      await repos.transactions.create(
        {
          customer_id: mockTenantContext.customerId,
          amount: 65000,
          currency: "NGN",
          reference: ref,
          status: "pending",
        },
        mockTenantContext
      );

      const session = await repos.sessions.create(
        {
          organization_id: mockTenantContext.organizationId,
          customer_id: mockTenantContext.customerId,
          channel: "web",
          status: "executing",
          metadata: {
            reconciliation_required: true,
            policyNumber: policy.policy_number,
            paymentReference: ref,
            expectedYear: 2027,
            plan: {
              intent: "renew_policy",
              confidence: 0.95,
              steps: [],
            },
          },
        },
        mockTenantContext
      );

      // Delayed webhook arrives and marks transaction succeeded
      const webhookReq = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "charge.success",
          data: { reference: ref, amount: 65000 },
        }),
      });
      await paymentWebhookHandler(webhookReq);

      // Worker processes session: confirms payment is settled and policy is renewed, marks completed
      const recoveryResult = await worker.processSession(session.id, mockTenantContext, true);
      assert.equal(recoveryResult.sessionId, session.id);
      assert.equal(recoveryResult.outcome, "reconciled");
      assert.equal(recoveryResult.newStatus, "completed");

      const store = getStore();
      const refTx = store.transactions.filter((t) => t.reference === ref);
      assert.equal(refTx.length, 1);
      assert.equal(refTx[0].status, "succeeded");
    });
  });
});


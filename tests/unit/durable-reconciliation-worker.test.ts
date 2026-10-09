import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ActionOSRecoveryWorker } from "@/lib/actionos/recovery-worker";
import { ActionOSOrchestrator } from "@/lib/actionos/orchestrator";
import { getRepositoryContainer, setRepositoryContainer } from "@/lib/repositories";
import { DemoRepositoryContainer } from "@/lib/repositories/demo/demo-repositories";
import { mockPaymentProvider, setPaymentProvider } from "@/lib/payments";

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
});

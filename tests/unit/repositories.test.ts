import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetStore } from "@/lib/actionos/mock-store";
import {
  getRepositoryContainer,
  setRepositoryContainer,
  resetRepositoryContainer,
  DemoRepositoryContainer,
} from "@/lib/repositories";

describe("Repository Abstraction Layer", () => {
  beforeEach(() => {
    resetStore();
    resetRepositoryContainer();
  });

  it("should resolve DemoRepositoryContainer in demo/test environment", () => {
    const repos = getRepositoryContainer();
    assert.equal(repos.isDemo, true);
    assert.ok(repos instanceof DemoRepositoryContainer);
  });

  it("should perform customer and policy repository operations deterministically", async () => {
    const repos = getRepositoryContainer();

    // Customer
    const customer = await repos.customers.findById("f0000000-0000-0000-0000-000000000001");
    assert.ok(customer);
    assert.equal(customer?.phone, "+234 803 123 4567");

    const byNumber = await repos.customers.findByNumber(customer!.customer_number);
    assert.equal(byNumber?.id, customer?.id);

    // Policy
    const policy = await repos.policies.findByNumber("AUTO-2026-00182");
    assert.ok(policy);
    assert.equal(policy?.status, "expiring");

    const updatedPolicy = await repos.policies.updateStatusAndExpiry(
      policy!.id,
      "renewed",
      "2027-10-14"
    );
    assert.equal(updatedPolicy.status, "renewed");
    assert.equal(updatedPolicy.expiry_date, "2027-10-14");
  });

  it("should create and track action sessions, plans, and steps", async () => {
    const repos = getRepositoryContainer();
    const testSessionId = `test_sess_${Date.now()}`;

    // Session
    const session = await repos.sessions.create({
      id: testSessionId,
      customer_id: "f0000000-0000-0000-0000-000000000001",
      organization_id: "a0000000-0000-0000-0000-000000000001",
      channel: "web",
      language: "en-NG",
      input_text: "Renew my policy",
      intent: "renew_policy",
      status: "received",
      metadata: { initiatedBy: "test" },
    });
    assert.equal(session.id, testSessionId);
    assert.equal(session.status, "received");

    const foundSession = await repos.sessions.findById(testSessionId);
    assert.ok(foundSession);
    assert.equal(foundSession?.status, "received");

    await repos.sessions.updateStatus(testSessionId, "executing");
    const updatedStatus = await repos.sessions.findById(testSessionId);
    assert.equal(updatedStatus?.status, "executing");

    await repos.sessions.updateMetadata(testSessionId, { quoteAmount: 87500 });
    const updatedMeta = await repos.sessions.findById(testSessionId);
    assert.equal(updatedMeta?.metadata?.quoteAmount, 87500);

    // Plan
    const plan = await repos.plans.create({
      id: `test_plan_${Date.now()}`,
      session_id: testSessionId,
      intent: "renew_policy",
      goal: "Complete vehicle insurance renewal",
      risk_level: "high",
      confidence: 0.98,
      status: "pending",
    });
    assert.equal(plan.session_id, testSessionId);

    const foundPlan = await repos.plans.findBySessionId(testSessionId);
    assert.equal(foundPlan?.id, plan.id);

    // Steps
    const steps = await repos.steps.createMany([
      {
        action_plan_id: plan.id,
        sequence: 1,
        action_type: "customer_lookup",
        description: "Verify customer profile",
        tool_name: "get_customer",
      },
      {
        action_plan_id: plan.id,
        sequence: 2,
        action_type: "quote_generation",
        description: "Generate renewal quote",
        tool_name: "get_quote",
      },
    ]);
    assert.equal(steps.length, 2);

    const planSteps = await repos.steps.findByPlanId(plan.id);
    assert.equal(planSteps.length, 2);
    assert.equal(planSteps[0].tool_name, "get_customer");
    assert.equal(planSteps[1].tool_name, "get_quote");
  });

  it("should record financial transactions, documents, and notifications", async () => {
    const repos = getRepositoryContainer();
    const customerId = "f0000000-0000-0000-0000-000000000001";
    const ref = `TX_TEST_${Date.now()}`;

    // Transaction
    const tx = await repos.transactions.create({
      customer_id: customerId,
      amount: 87500,
      currency: "NGN",
      reference: ref,
      status: "pending",
    });
    assert.equal(tx.reference, ref);

    const foundTx = await repos.transactions.findByReference(ref);
    assert.ok(foundTx);
    assert.equal(foundTx?.amount, 87500);

    const updatedTx = await repos.transactions.updateStatus(ref, "succeeded");
    assert.equal(updatedTx.status, "succeeded");

    // Document
    const doc = await repos.documents.create({
      customer_id: customerId,
      document_type: "certificate",
      file_path: "/docs/cert_123.pdf",
      file_name: "cert_123.pdf",
      mime_type: "application/pdf",
    });
    assert.ok(doc.id);
    const docs = await repos.documents.findByCustomerId(customerId);
    assert.ok(docs.some((d) => d.id === doc.id));

    // Notification
    const notif = await repos.notifications.create({
      customer_id: customerId,
      type: "renewal_due",
      channel: "sms",
      title: "Renewal Confirmed",
      message: "Your policy has been renewed successfully.",
      scheduled_for: new Date().toISOString(),
    });
    assert.ok(notif.id);
    const notifs = await repos.notifications.findByCustomerId(customerId);
    assert.ok(notifs.some((n) => n.id === notif.id));
  });

  it("should maintain immutable ledger events with idempotency and ordering", async () => {
    const repos = getRepositoryContainer();
    const sessionId = `ledger_test_${Date.now()}`;

    const ev1 = {
      id: `ev_test_1`,
      sessionId,
      sequenceNumber: 1,
      timestamp: new Date().toISOString(),
      action: "intent_detection",
      description: "Test intent detection",
      status: "verified" as const,
      actor: "User" as const,
      hash: "hash_1",
      signature: "sig_1",
    };

    const ev2 = {
      id: `ev_test_2`,
      sessionId,
      sequenceNumber: 2,
      timestamp: new Date().toISOString(),
      action: "policy_lookup",
      description: "Test policy lookup",
      status: "verified" as const,
      actor: "ActionOS Engine" as const,
      previousHash: "hash_1",
      hash: "hash_2",
      signature: "sig_2",
    };

    await repos.ledger.appendEvent(ev1);
    await repos.ledger.appendEvent(ev2);

    // Duplicate append of ev1 must not create duplicate entries
    await repos.ledger.appendEvent(ev1);

    const events = await repos.ledger.getEventsBySessionId(sessionId);
    assert.equal(events.length, 2);
    assert.equal(events[0].id, "ev_test_1");
    assert.equal(events[1].id, "ev_test_2");
    assert.equal(events[1].previousHash, "hash_1");
  });

  it("should allow dependency injection container override via setRepositoryContainer", () => {
    const customContainer = new DemoRepositoryContainer();
    setRepositoryContainer(customContainer);
    assert.equal(getRepositoryContainer(), customContainer);

    resetRepositoryContainer();
    assert.notEqual(getRepositoryContainer(), customContainer);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { getStore, resetStore } from "@/lib/actionos/mock-store";

describe("ActionOS Vehicle Insurance Renewal Workflow (End-to-End Acceptance Test)", () => {
  it("should process full renewal cycle from natural language to certificate issuance", async () => {
    resetStore();
    const store = getStore();

    // Initial benchmark state
    const policy = store.policies.find((p) => p.policy_number === "AUTO-2026-00182");
    assert.ok(policy, "Seed benchmark policy AUTO-2026-00182 must exist");
    assert.equal(policy.status, "expiring");
    assert.equal(policy.expiry_date, "2026-10-14");

    // 1. Natural Language Input
    const step1 = await orchestrator.startWorkflow({
      inputText: "My car insurance expires next week. Check it and renew it for me.",
      channel: "web",
      language: "en-NG",
      customerId: "f0000000-0000-0000-0000-000000000001",
    });

    assert.equal(step1.intent, "renew_policy");
    assert.equal(step1.status, "awaiting_authorization");
    assert.equal(step1.authorizationRequired, true);
    assert.equal(step1.amount, 87500);
    assert.ok(step1.authorizationDetails);
    assert.equal(step1.authorizationDetails?.policyNumber, "AUTO-2026-00182");
    assert.equal(step1.authorizationDetails?.assetName, "Toyota Camry");
    assert.equal(step1.authorizationDetails?.assetIdentifier, "ABC-123-XY");

    // Action ledger contains pre-authorization steps
    assert.ok(step1.events.length >= 5);
    const actionsLogged = step1.events.map((e) => e.action);
    assert.ok(actionsLogged.includes("intent_detection"));
    assert.ok(actionsLogged.includes("customer_lookup"));
    assert.ok(actionsLogged.includes("policy_lookup"));
    assert.ok(actionsLogged.includes("underwriting_check"));
    assert.ok(actionsLogged.includes("quote_generation"));
    assert.ok(actionsLogged.includes("authorization_requested"));

    // 2. Explicit User Authorization
    const step2 = await orchestrator.authorizeAndExecute(
      step1.sessionId,
      true,
      "customer"
    );
    assert.equal(step2.status, "completed");
    assert.equal(step2.authorizationRequired, false);

    // Verify post-execution events in Action Ledger
    const finalActions = step2.events.map((e) => e.action);
    assert.ok(finalActions.includes("authorization_confirmed"));
    assert.ok(finalActions.includes("payment_initiation"));
    assert.ok(finalActions.includes("payment_verification"));
    assert.ok(finalActions.includes("policy_renewal"));
    assert.ok(finalActions.includes("document_issuance"));
    assert.ok(finalActions.includes("notification_dispatch"));
    assert.ok(finalActions.includes("reminder_schedule"));
    assert.ok(finalActions.includes("independent_verification"));

    // 3. Verify Database State Changes
    const updatedPolicy = store.policies.find((p) => p.policy_number === "AUTO-2026-00182");
    assert.equal(updatedPolicy?.status, "renewed");
    assert.equal(updatedPolicy?.expiry_date, "2027-10-14");

    const renewalRecord = store.renewals.find((r) => r.policy_id === policy.id);
    assert.equal(renewalRecord?.status, "completed");
    assert.ok(
      renewalRecord?.payment_status === "succeeded" || renewalRecord?.payment_status === "paid",
      "Payment status must be marked succeeded"
    );

    const documents = store.documents.filter((d) => d.customer_id === policy.customer_id);
    assert.ok(documents.length >= 1);
    assert.equal(documents[0].document_type, "certificate");

    const notifications = store.notifications.filter((n) => n.customer_id === policy.customer_id);
    assert.ok(notifications.length >= 4); // in-app, sms, email + scheduled reminders

    // 4. Verify Cryptographic Merkle Hash Chain Integrity (Zero Tamper Proof)
    const { verifyLedgerIntegrity } = await import("@/lib/actionos/crypto-ledger");
    const integrityCheck = verifyLedgerIntegrity(step2.events);
    assert.equal(integrityCheck.valid, true, "Complete Action Ledger chain must be cryptographically valid");
    assert.ok(step2.events[0].hash, "Every event must possess a computed SHA-256 hash");
    assert.ok(step2.events[1].previousHash, "Sequential events must link to previous hash");

    // 5. Verify Multi-Insurer Marketplace Quotes
    assert.ok(step1.authorizationDetails?.quotes && step1.authorizationDetails.quotes.length >= 3);
    const underwriters = step1.authorizationDetails.quotes.map((q) => q.underwriter);
    assert.ok(underwriters.includes("Leadway Assurance"));
    assert.ok(underwriters.includes("AXA Mansard"));
  });

  it("should trigger distributed Saga compensating transaction and refund customer if step fails", async () => {
    resetStore();

    // 1. Start renewal session
    const step1 = await orchestrator.startWorkflow({
      inputText: "Renew Toyota Camry AUTO-2026-00182 now",
      channel: "web",
      customerId: "f0000000-0000-0000-0000-000000000001",
    });
    assert.equal(step1.status, "awaiting_authorization");

    // 2. Authorize with simulated downstream fault injection
    const sagaResult = await orchestrator.authorizeAndExecute(
      step1.sessionId,
      true,
      "customer",
      { simulateSagaFailure: true }
    );

    // 3. Verify Saga Rollback
    assert.equal(sagaResult.status, "escalated");
    assert.ok(sagaResult.message.includes("Saga Rollback Triggered"));

    // Verify compensating event in ledger
    const sagaEvent = sagaResult.events.find((e) => e.action === "saga_compensating_refund");
    assert.ok(sagaEvent, "Saga compensating refund event must be logged in Action Ledger");
    assert.equal(sagaEvent?.actor, "Saga Compensator");
    assert.equal(sagaEvent?.isCompensating, true);

    // Verify cryptographic integrity of the compensated chain
    const { verifyLedgerIntegrity } = await import("@/lib/actionos/crypto-ledger");
    const integrity = verifyLedgerIntegrity(sagaResult.events);
    assert.equal(integrity.valid, true, "Compensated ledger chain must remain cryptographically unbroken");
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { getStore, resetStore } from "@/lib/actionos/mock-store";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import {
  setPaymentProvider,
  type IPaymentProvider,
  type PaymentInitiationInput,
} from "@/lib/payments";

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
      executionContext: DEMO_CONTEXT,
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
      DEMO_CONTEXT
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
      executionContext: DEMO_CONTEXT,
    });
    assert.equal(step1.status, "awaiting_authorization");

    // 2. Authorize with simulated downstream fault injection
    const sagaResult = await orchestrator.authorizeAndExecute(
      step1.sessionId,
      true,
      DEMO_CONTEXT,
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

  it("Scenario 2: should cleanly halt and not renew policy when payment is rejected/failed", async () => {
    resetStore();
    const store = getStore();
    const initialPolicy = store.policies.find((p) => p.policy_number === "AUTO-2026-00182");
    assert.equal(initialPolicy?.status, "expiring");
    assert.equal(initialPolicy?.expiry_date, "2026-10-14");

    // Configure a failing payment provider
    const failingProvider: IPaymentProvider = {
      name: "Declined Payment Rail",
      async requestPayment(input: PaymentInitiationInput) {
        return { status: "failed", reference: input.reference };
      },
      async verifyPayment(ref: string) {
        return {
          status: "failed",
          amount: 0,
          currency: "NGN",
          providerReference: ref,
          paidAt: new Date().toISOString(),
        };
      },
      async refundPayment() {
        return { status: "failed", refundReference: "", amount: 0 };
      },
    };

    setPaymentProvider(failingProvider);

    try {
      const step1 = await orchestrator.startWorkflow({
        inputText: "Renew AUTO-2026-00182 now",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });
      assert.equal(step1.status, "awaiting_authorization");

      // Customer authorizes, but payment rail declines the transaction
      const execResult = await orchestrator.authorizeAndExecute(
        step1.sessionId,
        true,
        DEMO_CONTEXT
      );

      // Workflow halts and fails cleanly (escalated to human supervisor to prevent duplicate charge)
      assert.ok(execResult.status === "failed" || execResult.status === "escalated");
      assert.match(execResult.message, /Execution halted at step 'request_payment'|Payment/);

      // Crucial regulatory invariant: Policy must NOT be renewed!
      const currentPolicy = store.policies.find((p) => p.policy_number === "AUTO-2026-00182");
      assert.equal(currentPolicy?.status, "expiring", "Policy status must remain expiring after payment decline");
      assert.equal(currentPolicy?.expiry_date, "2026-10-14", "Expiry date must remain un-advanced");

      // Action ledger must record payment failure
      const failEvent = execResult.events.find((e) => e.action.includes("failed") || e.status === "failed");
      assert.ok(failEvent, "Ledger must record failed execution event for supervisory audit");
    } finally {
      setPaymentProvider(null);
    }
  });

  it("Scenario 3: should reconcile uncertain payment after gateway timeout without double charging", async () => {
    resetStore();
    const store = getStore();

    let requestPaymentCallCount = 0;
    let verifyCallCount = 0;

    // Simulate gateway timeout on initial attempt, but charge actually succeeded at bank
    const uncertainProvider: IPaymentProvider = {
      name: "Uncertain Gateway Rail",
      async requestPayment() {
        requestPaymentCallCount++;
        // First initiation: simulate timeout right after debiting customer account
        throw new Error("GATEWAY_TIMEOUT: Downstream bank switch timed out after charge");
      },
      async verifyPayment(ref: string) {
        verifyCallCount++;
        // During reconciliation inspection, query confirms customer was indeed charged for exact quote
        return {
          status: "succeeded",
          amount: 87500,
          currency: "NGN",
          providerReference: `gw_${ref}`,
          paidAt: new Date().toISOString(),
        };
      },
      async refundPayment() {
        return { status: "refunded", refundReference: "ref", amount: 87500 };
      },
    };

    setPaymentProvider(uncertainProvider);

    try {
      const step1 = await orchestrator.startWorkflow({
        inputText: "Renew Toyota Camry AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });
      assert.equal(step1.status, "awaiting_authorization");

      // 1. Authorize: triggers timeout during execution
      const execResult = await orchestrator.authorizeAndExecute(
        step1.sessionId,
        true,
        DEMO_CONTEXT
      );

      // Session escalates to protect customer from duplicate charges
      assert.equal(execResult.status, "escalated");
      assert.equal(requestPaymentCallCount, 1);

      // 2. Recovery / Reconciliation worker runs for the escalated session
      const reconciliationOutcome = await orchestrator.reconcileOrRollback(
        step1.sessionId,
        DEMO_CONTEXT
      );

      // 3. Reconciled safely: detects stranded charge and verifies compensating refund without re-charging customer
      assert.equal(reconciliationOutcome.reconciliationAction, "refunded_uncompleted");
      assert.equal(
        requestPaymentCallCount,
        1,
        "Reconciliation must never call requestPayment a second time"
      );
      assert.ok(verifyCallCount >= 1, "Reconciliation must query verification endpoint");

      // Policy remains un-advanced: no unearned statutory coverage is granted without completed renewal
      const finalPolicy = store.policies.find((p) => p.policy_number === "AUTO-2026-00182");
      assert.equal(finalPolicy?.status, "expiring", "Policy must remain expiring since downstream renewal did not finish");
      assert.equal(finalPolicy?.expiry_date, "2026-10-14", "Expiry date must remain unchanged");
    } finally {
      setPaymentProvider(null);
    }
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { resetStore, getStore } from "@/lib/actionos/mock-store";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { getRepositoryContainer } from "@/lib/repositories";
import { mockPaymentProvider } from "@/lib/payments/mock";
import { verifyLedgerIntegrity } from "@/lib/actionos/crypto-ledger";
import { RefundPaymentTool } from "@/lib/actionos/tools/refund-payment";
import { POST as paymentWebhookHandler, resetProcessedWebhookMemoryCache } from "@/app/api/webhooks/payment/route";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";

describe("ActionOS Complete Renewal Flow & Resilience Proof Suite (Sandbox)", () => {
  describe("1. Complete Renewal Transaction with Explicit Authorization & Auditable Receipt", () => {
    it("executes complete renewal transaction: human authorization -> verified payment -> policy roll-forward -> auditable certificate", async () => {
      resetStore();
      const store = getStore();

      // Step 0: Initial state verification
      const initialPolicy = store.policies.find((p) => p.policy_number === "AUTO-2026-00182");
      assert.ok(initialPolicy, "Benchmark policy AUTO-2026-00182 must exist");
      assert.equal(initialPolicy.status, "expiring");
      assert.equal(initialPolicy.expiry_date, "2026-10-14");

      // Step 1: Natural Language Renewal Request
      const startRes = await orchestrator.startWorkflow({
        inputText: "Please renew my Toyota Camry motor insurance AUTO-2026-00182 sharp sharp.",
        channel: "web",
        language: "pcm",
        executionContext: DEMO_CONTEXT,
      });

      // Proof of Intent & Authorization Gate
      assert.equal(startRes.intent, "renew_policy");
      assert.equal(startRes.status, "awaiting_authorization");
      assert.equal(startRes.authorizationRequired, true);
      assert.ok(startRes.authorizationDetails);
      assert.equal(startRes.authorizationDetails.policyNumber, "AUTO-2026-00182");
      assert.equal(startRes.authorizationDetails.amount, 87500);
      assert.equal(startRes.authorizationDetails.currency, "NGN");
      assert.ok(startRes.authorizationDetails.quoteId);
      assert.ok(startRes.authorizationDetails.quotes && startRes.authorizationDetails.quotes.length >= 3);

      // Verify pre-authorization events logged in Action Ledger
      const preEvents = startRes.events.map((e) => e.action);
      assert.ok(preEvents.includes("intent_detection"));
      assert.ok(preEvents.includes("quote_generation"));
      assert.ok(preEvents.includes("authorization_requested"));

      // Invariant: Policy must remain un-advanced before authorization
      assert.equal(initialPolicy.status, "expiring");
      assert.equal(initialPolicy.expiry_date, "2026-10-14");

      // Step 2: Explicit Human Authorization
      const execRes = await orchestrator.authorizeAndExecute(
        startRes.sessionId,
        true,
        DEMO_CONTEXT
      );

      // Proof of Completed Execution
      assert.equal(execRes.status, "completed");
      assert.equal(execRes.authorizationRequired, false);

      // Step 3: Verify Policy State Transition
      const renewedPolicy = store.policies.find((p) => p.policy_number === "AUTO-2026-00182");
      assert.equal(renewedPolicy?.status, "renewed");
      assert.equal(renewedPolicy?.expiry_date, "2027-10-14", "Expiry date must roll forward exactly 1 statutory year");

      // Step 4: Verify Renewal Record
      const renewalRecord = store.renewals.find((r) => r.policy_id === initialPolicy.id);
      assert.ok(renewalRecord);
      assert.equal(renewalRecord.status, "completed");
      assert.ok(
        renewalRecord.payment_status === "succeeded" || renewalRecord.payment_status === "paid"
      );

      // Step 5: Verify Auditable Financial Transaction
      const transactions = store.transactions.filter((t) => t.customer_id === DEMO_CONTEXT.customerId);
      const paymentTx = transactions.find((t) => t.transaction_type === "renewal_premium" && t.status === "succeeded");
      assert.ok(paymentTx, "Succeeded payment transaction must exist");
      assert.equal(paymentTx.amount, 87500);
      assert.equal(paymentTx.currency, "NGN");

      // Step 6: Verify Auditable Document & Certificate
      const certDoc = store.documents.find(
        (d) => d.customer_id === DEMO_CONTEXT.customerId && d.document_type === "certificate"
      );
      assert.ok(certDoc, "Official certificate document must be issued");
      assert.ok(certDoc.file_name.includes("SIMULATED_DEMO_"));
      assert.ok(certDoc.file_name.includes("AUTO-2026-00182"));

      // Step 7: Confirm Multi-Channel Customer Notification Dispatched
      const notifs = store.notifications.filter((n) => n.customer_id === DEMO_CONTEXT.customerId);
      assert.ok(notifs.length >= 1, "Customer notification must be dispatched upon renewal");
      assert.ok(
        execRes.events.some((e) => e.action === "notification_dispatch" || e.tool === "send_notification"),
        "Ledger must record notification dispatch event"
      );

      // Step 8: Cryptographic Merkle Chain Non-Repudiation Proof
      const integrityCheck = verifyLedgerIntegrity(execRes.events);
      assert.equal(integrityCheck.valid, true, "Ledger Merkle chain must be 100% cryptographically intact");
      assert.ok(execRes.events.length >= 8);
      for (const event of execRes.events) {
        assert.ok(event.hash, "Every event must possess computed SHA-256 hash");
      }
    });
  });

  describe("2. Duplicate-Payment & Replay Prevention", () => {
    it("strictly blocks duplicate charge on replayed authorization (idempotency guard)", async () => {
      resetStore();
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew Toyota Camry AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      // Authorization 1: Succeeds
      const auth1 = await orchestrator.authorizeAndExecute(startRes.sessionId, true, DEMO_CONTEXT);
      assert.equal(auth1.status, "completed");

      // Authorization 2: Replay attempt returns idempotent completed status without re-debiting
      const auth2 = await orchestrator.authorizeAndExecute(startRes.sessionId, true, DEMO_CONTEXT);
      assert.equal(auth2.status, "completed");
      assert.match(auth2.message, /already completed/i);

      // Verify customer was only debited once
      const store = getStore();
      const debits = store.transactions.filter(
        (t) => t.customer_id === DEMO_CONTEXT.customerId && t.status === "succeeded" && t.transaction_type === "renewal_premium"
      );
      assert.equal(debits.length, 1, "Duplicate payment debit must be prevented");
    });

    it("acknowledges duplicate replayed webhook delivery idempotently without second debit", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const testRef = "PAYSTACK_REPLAY_TEST_001";
      const testEventId = "EVT_REPLAY_TEST_001";

      // Seed pending transaction
      const tx = await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 87500,
          currency: "NGN",
          reference: testRef,
          status: "pending",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      const webhookPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: testEventId,
          reference: testRef,
          amount: 8750000, // 87,500 NGN in kobo
          currency: "NGN",
          status: "success",
          paid_at: "2026-10-18T10:00:00.000Z",
          customer: {
            id: DEMO_CONTEXT.customerId,
            email: "adebayo.ogundimu@example.ng",
          },
        },
      });

      const makeRequest = () =>
        new Request("http://localhost:3000/api/webhooks/payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-paystack-signature": "dev-bypass",
          },
          body: webhookPayload,
        });

      // Delivery 1: Initial settlement
      const res1 = await paymentWebhookHandler(makeRequest());
      assert.equal(res1.status, 200);
      const json1 = (await res1.json()) as { data: { duplicate: boolean; acknowledged: boolean } };
      assert.equal(json1.data.acknowledged, true);
      assert.equal(json1.data.duplicate, false, "First delivery must not be flagged as duplicate");

      // Delivery 2: Replay of identical webhook
      const res2 = await paymentWebhookHandler(makeRequest());
      assert.equal(res2.status, 200);
      const json2 = (await res2.json()) as { data: { duplicate: boolean; acknowledged: boolean } };
      assert.equal(json2.data.acknowledged, true);
      assert.equal(json2.data.duplicate, true, "Replayed delivery must be recognized as duplicate");

      // Verify database transaction status is succeeded and only 1 settlement exists
      const settledTx = await repos.transactions.findById(tx.id);
      assert.equal(settledTx?.status, "succeeded");

      const store = getStore();
      const allMatching = store.transactions.filter((t) => t.reference === testRef);
      assert.equal(allMatching.length, 1, "Must never spawn duplicate transaction rows");
    });
  });

  describe("3. Refund Failure & Resilience Scenarios", () => {
    it("handles explicit provider refund declination (refund_failed) safely without false confirmation", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const ref = "ref_declined_refund_test";

      // Seed succeeded payment transaction
      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 87500,
          currency: "NGN",
          reference: ref,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      const refundTool = new RefundPaymentTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_refund_declined",
        planId: "plan_declined",
        channel: "web",
      });

      // Provider declines the refund
      mockPaymentProvider.simulateRefundFailure = true;
      try {
        const result = await refundTool.execute(
          {
            reference: ref,
            amount: 87500,
            currency: "NGN",
            reason: "Underwriting cancellation test",
          },
          execCtx
        );

        // Verification of safe declination
        assert.equal(result.success, false);
        assert.equal(result.error?.code, "REFUND_FAILED");
        assert.equal(result.data?.refundState, "refund_failed");

        // Customer's original payment MUST NOT be marked refunded
        const originalTx = await repos.transactions.findByReference(ref);
        assert.equal(originalTx?.status, "succeeded", "Original payment must remain intact when refund fails");

        // Transactions table must not contain a succeeded refund
        const store = getStore();
        const succeededRefunds = store.transactions.filter(
          (t) => t.transaction_type === "refund" && t.status === "succeeded"
        );
        assert.equal(succeededRefunds.length, 0, "No succeeded refund must be recorded on declination");
      } finally {
        mockPaymentProvider.simulateRefundFailure = false;
      }
    });

    it("handles gateway network error or HTTP 500 as refund_unknown without confirming reversal", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const ref = "ref_ambiguous_refund_test";

      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 60000,
          currency: "NGN",
          reference: ref,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      const refundTool = new RefundPaymentTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_refund_ambiguous",
        planId: "plan_ambiguous",
        channel: "web",
      });

      // Simulate network timeout or 500 error from payment gateway
      mockPaymentProvider.simulateRefundUnknown = true;
      try {
        const result = await refundTool.execute(
          {
            reference: ref,
            amount: 60000,
            currency: "NGN",
            reason: "Ambiguous gateway response test",
          },
          execCtx
        );

        assert.equal(result.success, false);
        assert.equal(result.error?.code, "REFUND_UNKNOWN");
        assert.equal(result.data?.refundState, "refund_unknown");

        // Transactions repository must NOT contain a succeeded refund
        const store = getStore();
        const succeededRefunds = store.transactions.filter(
          (t) => t.transaction_type === "refund" && t.status === "succeeded"
        );
        assert.equal(succeededRefunds.length, 0, "Ambiguous refund must never be reported as succeeded");
      } finally {
        mockPaymentProvider.simulateRefundUnknown = false;
      }
    });

    it("models queued refund as refund_pending and authoritatively verifies upon confirmation", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const ref = "ref_pending_queue_test";

      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 45000,
          currency: "NGN",
          reference: ref,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      const refundTool = new RefundPaymentTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_refund_pending_flow",
        planId: "plan_pending_flow",
        channel: "web",
      });

      // Provider queues request as pending
      mockPaymentProvider.simulateRefundPending = true;
      try {
        const refundRes = await refundTool.execute(
          {
            reference: ref,
            amount: 45000,
            currency: "NGN",
            reason: "Queued refund test",
          },
          execCtx
        );

        assert.equal(refundRes.success, false);
        assert.equal(refundRes.error?.code, "REFUND_PENDING");
        assert.equal(refundRes.data?.refundState, "refund_pending");
        assert.equal(refundRes.data?.status, "pending");

        const queuedRefundRef = refundRes.data?.refundReference;
        assert.ok(queuedRefundRef, "Pending refund must return a refundReference");

        // Recorded in DB as 'pending', NOT 'succeeded'
        const refundTx = await repos.transactions.findByReference(queuedRefundRef);
        assert.ok(refundTx);
        assert.equal(refundTx.status, "pending");

        // Later: out-of-band verification confirms settlement
        mockPaymentProvider.simulateRefundPending = false;
        const verification = await mockPaymentProvider.verifyRefund(queuedRefundRef);
        assert.equal(verification.status, "refund_confirmed");
        assert.equal(verification.amount, 45000);
      } finally {
        mockPaymentProvider.simulateRefundPending = false;
      }
    });
  });

  describe("4. Wrong Amounts & Wrong Currencies Verification", () => {
    it("rejects webhook delivery with incorrect amount (AMOUNT_MISMATCH) and leaves transaction pending", async () => {
      resetStore();
      resetProcessedWebhookMemoryCache();
      const repos = getRepositoryContainer();
      const testRef = "PAYSTACK_WRONG_AMOUNT_001";

      const tx = await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 87500,
          currency: "NGN",
          reference: testRef,
          status: "pending",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      // Webhook delivers 50,000 NGN (5,000,000 kobo) instead of 87,500 NGN (8,750,000 kobo)
      const wrongAmountPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: "EVT_WRONG_AMT_001",
          reference: testRef,
          amount: 5000000, // 50,000 NGN in kobo
          currency: "NGN",
          status: "success",
          paid_at: "2026-10-18T10:00:00.000Z",
        },
      });

      const res = await paymentWebhookHandler(
        new Request("http://localhost:3000/api/webhooks/payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-paystack-signature": "dev-bypass",
          },
          body: wrongAmountPayload,
        })
      );

      assert.equal(res.status, 422);
      const json = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(json.success, false);
      assert.equal(json.error.code, "AMOUNT_MISMATCH");

      // Verify transaction was NOT marked succeeded
      const unmutatedTx = await repos.transactions.findById(tx.id);
      assert.equal(unmutatedTx?.status, "pending", "Transaction must remain pending when amount does not match");
    });

    it("rejects webhook delivery with incorrect currency (CURRENCY_MISMATCH) and leaves transaction pending", async () => {
      resetStore();
      resetProcessedWebhookMemoryCache();
      const repos = getRepositoryContainer();
      const testRef = "PAYSTACK_WRONG_CURRENCY_001";

      const tx = await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 87500,
          currency: "NGN",
          reference: testRef,
          status: "pending",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      // Webhook delivers USD instead of NGN
      const wrongCurrencyPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: "EVT_WRONG_CURR_001",
          reference: testRef,
          amount: 8750000,
          currency: "USD",
          status: "success",
          paid_at: "2026-10-18T10:00:00.000Z",
        },
      });

      const res = await paymentWebhookHandler(
        new Request("http://localhost:3000/api/webhooks/payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-paystack-signature": "dev-bypass",
          },
          body: wrongCurrencyPayload,
        })
      );

      assert.equal(res.status, 422);
      const json = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(json.success, false);
      assert.equal(json.error.code, "CURRENCY_MISMATCH");

      const unmutatedTx = await repos.transactions.findById(tx.id);
      assert.equal(unmutatedTx?.status, "pending", "Transaction must remain pending when currency does not match");
    });
  });

  describe("5. Payment Timeouts & Fail-Closed Invariants", () => {
    it("handles payment gateway timeout during authorization: leaves policy untouched, does not issue certificate, and allows retry", async () => {
      resetStore();
      const store = getStore();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew Toyota Camry AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      assert.equal(startRes.status, "awaiting_authorization");

      // Simulate payment gateway network timeout / failure during execution
      mockPaymentProvider.simulatePaymentTimeout = true;
      try {
        const failRes = await orchestrator.authorizeAndExecute(
          startRes.sessionId,
          true,
          DEMO_CONTEXT
        );

        assert.ok(
          failRes.status === "failed" || failRes.status === "escalated",
          `Status must be failed or escalated on payment timeout, got: ${failRes.status}`
        );
        assert.match(failRes.message, /timed out|timeout|halted|failed|declined|execution error/i);

        // Invariant: Expiring policy must NOT be advanced to renewed
        const policy = store.policies.find((p) => p.policy_number === "AUTO-2026-00182");
        assert.equal(policy?.status, "expiring");
        assert.equal(policy?.expiry_date, "2026-10-14");

        // No certificate must be issued
        const cert = store.documents.find(
          (d) => d.customer_id === DEMO_CONTEXT.customerId && d.document_type === "certificate"
        );
        assert.equal(cert, undefined, "No certificate may be issued upon payment failure");
      } finally {
        mockPaymentProvider.simulatePaymentTimeout = false;
      }
    });

    it("handles explicit declined payment (card declined / insufficient funds): leaves policy untouched, does not issue certificate, and never produces an active renewed policy", async () => {
      resetStore();
      const store = getStore();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew Toyota Camry AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      assert.equal(startRes.status, "awaiting_authorization");

      // Simulate payment gateway declining the transaction
      mockPaymentProvider.simulatePaymentFailure = true;
      try {
        const failRes = await orchestrator.authorizeAndExecute(
          startRes.sessionId,
          true,
          DEMO_CONTEXT
        );

        assert.ok(
          failRes.status === "failed" || failRes.status === "escalated",
          `Status must be failed or escalated on payment decline, got: ${failRes.status}`
        );

        // Invariant 1: Policy MUST remain in expiring status and not renewed
        const policy = store.policies.find((p) => p.policy_number === "AUTO-2026-00182");
        assert.equal(policy?.status, "expiring", "Policy must remain expiring when payment is declined");
        assert.equal(policy?.expiry_date, "2026-10-14", "Expiry date must NOT be extended");

        // Invariant 2: No certificate must be issued
        const cert = store.documents.find(
          (d) => d.customer_id === DEMO_CONTEXT.customerId && d.document_type === "certificate"
        );
        assert.equal(cert, undefined, "Certificate must never be issued when payment is declined");

        // Invariant 3: Audit ledger records failed execution
        assert.ok(
          failRes.events.some((e) => e.status === "failed" || e.action.includes("failed") || e.action === "payment_initiation"),
          "Ledger must record failed payment event"
        );
      } finally {
        mockPaymentProvider.simulatePaymentFailure = false;
      }
    });
  });

  describe("6. Partial Refunds & Accounting Balance Invariants", () => {
    it("processes partial refund correctly: updates cumulative refunded amount, records remaining balance, and maintains active status", async () => {
      resetStore();
      resetProcessedWebhookMemoryCache();
      const repos = getRepositoryContainer();
      const ref = "PAYSTACK_PARTIAL_REFUND_001";
      const totalAmount = 87500;

      // Seed succeeded payment transaction
      const tx = await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: totalAmount,
          currency: "NGN",
          reference: ref,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      // Webhook delivers partial refund of 30,000 NGN (3,000,000 kobo)
      const partialRefundPayload = JSON.stringify({
        event: "refund.processed",
        data: {
          id: "EVT_PARTIAL_REF_001",
          refund_reference: "rf_partial_001",
          transaction_reference: ref,
          amount: 3000000, // 30,000 NGN in kobo
          currency: "NGN",
          status: "processed",
        },
      });

      const res = await paymentWebhookHandler(
        new Request("http://localhost:3000/api/webhooks/payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-paystack-signature": "dev-bypass",
          },
          body: partialRefundPayload,
        })
      );

      assert.equal(res.status, 200);
      const json = (await res.json()) as { data: { acknowledged: boolean; status: string } };
      assert.equal(json.data.acknowledged, true);
      assert.equal(json.data.status, "partially_refunded");

      const updatedTx = await repos.transactions.findById(tx.id);
      assert.equal(updatedTx?.status, "partially_refunded");
      assert.equal(updatedTx?.metadata?.cumulative_refund_amount, 30000);
      assert.equal(updatedTx?.metadata?.remaining_balance, 57500);
      assert.equal(updatedTx?.metadata?.is_partial_refund, true);
    });
  });

  describe("7. Retries & Idempotent Backoff Recovery", () => {
    it("supports retry of transient payment settlement failure with backoff and idempotent recovery", async () => {
      resetStore();
      const store = getStore();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew Toyota Camry AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      assert.equal(startRes.status, "awaiting_authorization");

      // Attempt 1: Transient gateway error causes payment failure
      mockPaymentProvider.simulatePaymentTimeout = true;
      try {
        const attempt1Res = await orchestrator.authorizeAndExecute(startRes.sessionId, true, DEMO_CONTEXT);
        assert.ok(
          attempt1Res.status === "failed" || attempt1Res.status === "escalated",
          `Status must be failed or escalated on payment failure, got: ${attempt1Res.status}`
        );
      } finally {
        mockPaymentProvider.simulatePaymentTimeout = false;
      }

      // Invariant after attempt 1 failure: Policy is untouched
      let policy = store.policies.find((p) => p.policy_number === "AUTO-2026-00182");
      assert.equal(policy?.status, "expiring");

      // Attempt 2: After backoff, user/system re-initiates renewal and succeeds cleanly
      const retryRes = await orchestrator.startWorkflow({
        inputText: "Retry renewing Toyota Camry AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      assert.equal(retryRes.status, "awaiting_authorization");
      const retrySuccess = await orchestrator.authorizeAndExecute(retryRes.sessionId, true, DEMO_CONTEXT);

      assert.equal(retrySuccess.status, "completed");
      policy = store.policies.find((p) => p.policy_number === "AUTO-2026-00182");
      assert.equal(policy?.status, "renewed");
      assert.equal(policy?.expiry_date, "2027-10-14");
    });
  });

  describe("8. Concurrent Requests & Atomic Synchronization", () => {
    it("serializes concurrent parallel authorization requests via atomic claim lock so exactly one succeeds", async () => {
      resetStore();
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew Toyota Camry AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      assert.equal(startRes.status, "awaiting_authorization");

      // Fire 2 concurrent authorizations simultaneously on the same session
      const [claim1, claim2] = await Promise.all([
        orchestrator.authorizeAndExecute(startRes.sessionId, true, DEMO_CONTEXT),
        orchestrator.authorizeAndExecute(startRes.sessionId, true, DEMO_CONTEXT),
      ]);

      const statuses = [claim1.status, claim2.status];
      assert.ok(statuses.includes("completed"));

      const store = getStore();
      const debits = store.transactions.filter(
        (t) => t.customer_id === DEMO_CONTEXT.customerId && t.status === "succeeded" && t.transaction_type === "renewal_premium"
      );
      assert.equal(debits.length, 1, "Exactly one debit transaction must be recorded under concurrent authorization");
    });

    it("coordinates concurrent parallel webhook deliveries without double-crediting", async () => {
      resetStore();
      resetProcessedWebhookMemoryCache();
      const repos = getRepositoryContainer();
      const testRef = "PAYSTACK_CONCURRENT_WH_001";

      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 87500,
          currency: "NGN",
          reference: testRef,
          status: "pending",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      const payload = JSON.stringify({
        event: "charge.success",
        data: {
          id: "EVT_CONCURRENT_WH_001",
          reference: testRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
          paid_at: "2026-10-18T10:00:00.000Z",
        },
      });

      const makeReq = () =>
        new Request("http://localhost:3000/api/webhooks/payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-paystack-signature": "dev-bypass",
          },
          body: payload,
        });

      // Fire 2 simultaneous webhook requests
      const [res1, res2] = await Promise.all([
        paymentWebhookHandler(makeReq()),
        paymentWebhookHandler(makeReq()),
      ]);

      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);

      const json1 = (await res1.json()) as { data: { duplicate: boolean } };
      const json2 = (await res2.json()) as { data: { duplicate: boolean } };

      const duplicates = [json1.data.duplicate, json2.data.duplicate].filter(Boolean);
      assert.equal(duplicates.length, 1, "Exactly one of the concurrent deliveries must be flagged as duplicate");

      const store = getStore();
      const matching = store.transactions.filter((t) => t.reference === testRef);
      assert.equal(matching.length, 1, "Must never spawn duplicate transaction rows");
      assert.equal(matching[0].status, "succeeded");
    });
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { resetStore, getStore } from "@/lib/actionos/mock-store";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { getRepositoryContainer } from "@/lib/repositories";
import { mockPaymentProvider } from "@/lib/payments/mock";
import { PaystackPaymentProvider } from "@/lib/payments/paystack";
import { getPaymentProvider, setPaymentProvider } from "@/lib/payments";
import { RenewPolicyTool } from "@/lib/actionos/tools/renew-policy";
import { RefundPaymentTool } from "@/lib/actionos/tools/refund-payment";
import { POST as paymentWebhookHandler } from "@/app/api/webhooks/payment/route";
import { POST as authorizeHandler } from "@/app/api/actions/[id]/authorize/route";
import { ActionOSRecoveryWorker } from "@/lib/actionos/recovery-worker";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";

describe("Paystack Payment & Renewal Orchestration Hardening Regression Suite", () => {
  // Scenario 1: Refund request accepted but not yet completed
  describe("1. Refund request accepted but not yet completed", () => {
    it("should model pending refund accurately and verify authoritatively upon subsequent check", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const ref = "ref_pending_refund_001";
      const quoteAmount = 45000;

      // Seed customer payment transaction
      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: quoteAmount,
          currency: "NGN",
          reference: ref,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      const refundTool = new RefundPaymentTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_refund_pending_01",
        planId: "plan_01",
        channel: "web",
      });

      // Simulate provider accepting refund request as pending
      mockPaymentProvider.simulateRefundPending = true;
      try {
        const refundRes = await refundTool.execute(
          {
            reference: ref,
            amount: quoteAmount,
            currency: "NGN",
            reason: "Policy renewal uncompleted downstream",
          },
          execCtx
        );

        // A pending refund MUST NOT report success / confirmed
        assert.equal(refundRes.success, false);
        assert.equal(refundRes.error?.code, "REFUND_PENDING");
        assert.equal(refundRes.data?.refundState, "refund_pending");
        assert.equal(refundRes.data?.status, "pending");

        // Verify transaction in DB is marked 'pending', NOT 'succeeded'
        assert.ok(refundRes.data?.refundReference, "Pending refund must return a refundReference");
        const refundTx = await repos.transactions.findByReference(refundRes.data.refundReference!);
        assert.ok(refundTx, "Pending refund transaction must exist in repository");
        assert.equal(refundTx.status, "pending", "Pending refund transaction must NOT be marked succeeded");

        // Subsequent verification: provider confirms settlement
        mockPaymentProvider.simulateRefundPending = false;
        const verifyRes = await mockPaymentProvider.verifyRefund(refundRes.data.refundReference!);
        assert.equal(verifyRes.status, "refund_confirmed");
        assert.equal(verifyRes.amount, quoteAmount);
      } finally {
        mockPaymentProvider.simulateRefundPending = false;
      }
    });
  });

  // Scenario 2: Refund failure and ambiguous provider response
  describe("2. Refund failure and ambiguous provider response", () => {
    it("should handle ambiguous provider response (HTTP 500 / network error) as refund_unknown without confirming", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const ref = "ref_unknown_refund_002";
      const quoteAmount = 55000;

      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: quoteAmount,
          currency: "NGN",
          reference: ref,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      const refundTool = new RefundPaymentTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_refund_unknown_02",
        planId: "plan_02",
        channel: "web",
      });

      // Simulate ambiguous provider outcome (HTTP 500 / timeout)
      mockPaymentProvider.simulateRefundUnknown = true;
      try {
        const refundRes = await refundTool.execute(
          {
            reference: ref,
            amount: quoteAmount,
            currency: "NGN",
            reason: "Saga compensation attempt",
          },
          execCtx
        );

        assert.equal(refundRes.success, false);
        assert.equal(refundRes.error?.code, "REFUND_UNKNOWN");
        assert.equal(refundRes.data?.refundState, "refund_unknown");

        // Transactions repository must not contain a succeeded refund
        const store = getStore();
        const succeededRefunds = store.transactions.filter(
          (t) => t.transaction_type === "refund" && t.status === "succeeded"
        );
        assert.equal(succeededRefunds.length, 0, "Ambiguous refund must never be reported as succeeded");
      } finally {
        mockPaymentProvider.simulateRefundUnknown = false;
      }
    });

    it("should handle explicit provider rejection as refund_failed without confirming", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const ref = "ref_failed_refund_003";
      const quoteAmount = 30000;

      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: quoteAmount,
          currency: "NGN",
          reference: ref,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      const refundTool = new RefundPaymentTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_refund_fail_03",
        planId: "plan_03",
        channel: "web",
      });

      const refundRes = await refundTool.execute(
        {
          reference: ref,
          amount: quoteAmount,
          currency: "NGN",
          reason: "Saga compensation attempt",
          simulateRefundFailure: true,
        },
        execCtx
      );

      assert.equal(refundRes.success, false);
      assert.ok(refundRes.error?.code === "REFUND_REJECTED" || refundRes.error?.code === "REFUND_FAILED");
      assert.equal(refundRes.data?.refundState, "refund_failed");
    });
  });

  // Scenario 3: Incorrect amount, currency, or transaction reference
  describe("3. Incorrect amount, currency, or transaction reference", () => {
    it("should reject policy renewal when payment reference is missing or unpaid", async () => {
      resetStore();
      const renewTool = new RenewPolicyTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_renew_check_01",
        planId: "plan_01",
        channel: "web",
      });

      // 1. Missing transaction reference in DB
      const resMissing = await renewTool.execute(
        {
          policyNumber: "AUTO-2026-00182",
          paymentReference: "non_existent_ref_999",
          expectedAmount: 87500,
          expectedCurrency: "NGN",
        },
        execCtx
      );
      assert.equal(resMissing.success, false);
      assert.ok(resMissing.error?.code === "UNVERIFIED_PAYMENT" || resMissing.error?.code === "PAYMENT_NOT_SETTLED");

      // 2. Transaction exists but is pending (not succeeded)
      const repos = getRepositoryContainer();
      const pendingRef = "ref_unsettled_pending";
      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 87500,
          currency: "NGN",
          reference: pendingRef,
          status: "pending",
        },
        DEMO_CONTEXT
      );

      const resPending = await renewTool.execute(
        {
          policyNumber: "AUTO-2026-00182",
          paymentReference: pendingRef,
          expectedAmount: 87500,
          expectedCurrency: "NGN",
        },
        execCtx
      );
      assert.equal(resPending.success, false);
      assert.ok(resPending.error?.code === "UNVERIFIED_PAYMENT" || resPending.error?.code === "PAYMENT_NOT_SETTLED");
    });

    it("should reject policy renewal when paid amount is less than persisted quote amount", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const underpaidRef = "ref_underpaid_001";

      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 50000, // Settled 50k, but expected 87.5k
          currency: "NGN",
          reference: underpaidRef,
          status: "succeeded",
        },
        DEMO_CONTEXT
      );

      const renewTool = new RenewPolicyTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_renew_underpaid",
        planId: "plan_01",
        channel: "web",
      });

      const resUnderpaid = await renewTool.execute(
        {
          policyNumber: "AUTO-2026-00182",
          paymentReference: underpaidRef,
          expectedAmount: 87500,
          expectedCurrency: "NGN",
        },
        execCtx
      );
      assert.equal(resUnderpaid.success, false);
      assert.equal(resUnderpaid.error?.code, "UNDERPAID_PAYMENT");
    });

    it("should reject policy renewal when currency mismatches expected quote currency", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const usdRef = "ref_usd_mismatch_001";

      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 87500,
          currency: "USD", // Paid USD instead of NGN
          reference: usdRef,
          status: "succeeded",
        },
        DEMO_CONTEXT
      );

      const renewTool = new RenewPolicyTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_renew_currency_mismatch",
        planId: "plan_01",
        channel: "web",
      });

      const resCurrency = await renewTool.execute(
        {
          policyNumber: "AUTO-2026-00182",
          paymentReference: usdRef,
          expectedAmount: 87500,
          expectedCurrency: "NGN",
        },
        execCtx
      );
      assert.equal(resCurrency.success, false);
      assert.equal(resCurrency.error?.code, "CURRENCY_MISMATCH");
    });

    it("should reject webhook delivery when amount or currency is mismatched", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const ref = "ref_wh_mismatch_check";

      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 70000,
          currency: "NGN",
          reference: ref,
          status: "pending",
        },
        DEMO_CONTEXT
      );

      // Amount mismatch: webhook says 30,000 NGN instead of 70,000 NGN
      const reqAmountMismatch = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "charge.success",
          data: { reference: ref, amount: 30000, currency: "NGN" },
        }),
      });
      const resAmountMismatch = await paymentWebhookHandler(reqAmountMismatch);
      assert.equal(resAmountMismatch.status, 422);
      const jsonAmount = await resAmountMismatch.json();
      assert.equal(jsonAmount.error?.code, "AMOUNT_MISMATCH");

      // Currency mismatch: webhook says USD instead of NGN
      const reqCurrMismatch = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "charge.success",
          data: { reference: ref, amount: 70000, currency: "USD" },
        }),
      });
      const resCurrMismatch = await paymentWebhookHandler(reqCurrMismatch);
      assert.equal(resCurrMismatch.status, 422);
      const jsonCurr = await resCurrMismatch.json();
      assert.equal(jsonCurr.error?.code, "CURRENCY_MISMATCH");
    });
  });

  // Scenario 4: Duplicate and out-of-order webhooks
  describe("4. Duplicate and out-of-order webhooks", () => {
    it("should never allow a terminal refunded state to be regressed by out-of-order charge.success", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const ref = "ref_ooo_refunded_001";

      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 60000,
          currency: "NGN",
          reference: ref,
          status: "refunded",
        },
        DEMO_CONTEXT
      );

      // Stale charge.success webhook arrives after transaction was already refunded
      const staleWebhookReq = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "charge.success",
          data: { reference: ref, amount: 60000, currency: "NGN" },
        }),
      });

      const res = await paymentWebhookHandler(staleWebhookReq);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.ignored, "out_of_order");

      // Verify transaction in DB is STILL refunded
      const tx = await repos.transactions.findByReference(ref);
      assert.equal(tx?.status, "refunded", "Transaction must not regress from refunded to succeeded");
    });

    it("should never allow an already succeeded transaction to regress to failed or pending", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const ref = "ref_ooo_succeeded_002";

      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 40000,
          currency: "NGN",
          reference: ref,
          status: "succeeded",
        },
        DEMO_CONTEXT
      );

      // Out-of-order charge.failed arriving after successful charge
      const failedWebhookReq = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "charge.failed",
          data: { reference: ref, amount: 40000, currency: "NGN" },
        }),
      });

      const res = await paymentWebhookHandler(failedWebhookReq);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.ignored, "out_of_order");

      // Verify transaction status remained succeeded
      const tx = await repos.transactions.findByReference(ref);
      assert.equal(tx?.status, "succeeded", "Transaction must not regress from succeeded to failed");
    });
  });

  // Scenario 5: Repeated authorization and renewal requests
  describe("5. Repeated authorization and renewal requests", () => {
    it("should handle repeated authorization requests idempotently without double-charging or re-executing", async () => {
      resetStore();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      assert.equal(startRes.status, "awaiting_authorization");
      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const authReq = (authorizedQuoteId: string) =>
        new Request(`https://actionos.ng/api/actions/${startRes.sessionId}/authorize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": DEMO_CONTEXT.userId,
            "x-organization-id": DEMO_CONTEXT.organizationId,
            "x-customer-id": DEMO_CONTEXT.customerId!,
            "x-role": "customer",
          },
          body: JSON.stringify({
            authorized: true,
            authorizedQuoteId,
          }),
        });

      // First authorization: completes successfully
      const res1 = await authorizeHandler(authReq(quote.id), {
        params: Promise.resolve({ id: startRes.sessionId }),
      });
      assert.equal(res1.status, 200);
      const json1 = await res1.json();
      assert.equal(json1.actionStatus, "completed");

      // Second authorization retry: returns idempotent 200 without charging twice
      const res2 = await authorizeHandler(authReq(quote.id), {
        params: Promise.resolve({ id: startRes.sessionId }),
      });
      assert.equal(res2.status, 200);
      const json2 = await res2.json();
      assert.equal(json2.actionStatus, "completed");
      assert.match(json2.message, /already completed/i);

      // Verify exactly ONE renewal premium transaction was created
      const store = getStore();
      const renewalTxs = store.transactions.filter((t) => t.transaction_type === "renewal_premium");
      assert.equal(renewalTxs.length, 1, "Must never charge customer twice on repeated authorization requests");
    });

    it("should ensure RenewPolicyTool is strictly idempotent on repeated calls with the same reference", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const ref = "ref_renew_tool_idem_001";
      const policyNumber = "AUTO-2026-00182";

      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 87500,
          currency: "NGN",
          reference: ref,
          status: "succeeded",
        },
        DEMO_CONTEXT
      );

      const renewTool = new RenewPolicyTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_renew_tool_idem",
        planId: "plan_01",
        channel: "web",
      });

      // First execution: rolls forward expiry date
      const res1 = await renewTool.execute(
        {
          policyNumber,
          paymentReference: ref,
          expectedAmount: 87500,
          expectedCurrency: "NGN",
        },
        execCtx
      );
      assert.equal(res1.success, true);
      const firstExpiry = res1.data?.newExpiry;

      // Second execution: returns idempotent response without moving expiry date twice
      const res2 = await renewTool.execute(
        {
          policyNumber,
          paymentReference: ref,
          expectedAmount: 87500,
          expectedCurrency: "NGN",
        },
        execCtx
      );
      assert.equal(res2.success, true);
      assert.equal(res2.data?.idempotent, true);
      assert.equal(res2.data?.newExpiry, firstExpiry, "Expiry date must not roll forward twice on repeated executions");
    });
  });

  // Scenario 6: Payment timeout after provider-side success
  describe("6. Payment timeout after provider-side success", () => {
    it("should reconcile session using provider truth when timeout occurred after successful charge", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const timeoutRef = "act_timeout_provider_ok_001";

      // Session was left executing with recorded paymentAttempt reference
      await repos.sessions.updateStatus(startRes.sessionId, "executing", undefined, DEMO_CONTEXT);
      await repos.sessions.updateMetadata(
        startRes.sessionId,
        {
          authorizationDetails: {
            authorizedQuoteId: quote.id,
            quoteId: quote.id,
            policyNumber: "AUTO-2026-00182",
            amount: 87500,
            currency: "NGN",
          },
          paymentReference: timeoutRef,
          paymentAttempt: {
            reference: timeoutRef,
            amount: 87500,
            currency: "NGN",
            status: "succeeded",
          },
          reconciliation_required: true,
        },
        DEMO_CONTEXT
      );

      // Provider has the settled transaction recorded
      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 87500,
          currency: "NGN",
          reference: timeoutRef,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      // Reconciler recovers session
      const recResult = await orchestrator.reconcileExecutingSession(startRes.sessionId, DEMO_CONTEXT);
      assert.ok(
        recResult.resolvedStatus === "completed" || recResult.resolvedStatus === "escalated",
        "Reconciliation must resolve or escalate safely without blind recharge"
      );

      // Verify no duplicate charges exist
      const store = getStore();
      const attempts = store.transactions.filter((t) => t.reference === timeoutRef);
      assert.equal(attempts.length, 1, "Must never charge again during timeout recovery");
    });
  });

  // Scenario 7: Database failure after payment verification
  describe("7. Database failure after payment verification", () => {
    it("should record unresolved state and provide safe reconciliation without duplicate charge", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const paidRef = "act_post_pay_db_fail_ref";

      // Seed settled payment
      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 87500,
          currency: "NGN",
          reference: paidRef,
          status: "succeeded",
        },
        DEMO_CONTEXT
      );

      // Simulate state where payment succeeded but downstream DB failure marked session as unresolved
      await repos.sessions.updateStatus(startRes.sessionId, "escalated", undefined, DEMO_CONTEXT);
      await repos.sessions.updateMetadata(
        startRes.sessionId,
        {
          authorizationDetails: {
            authorizedQuoteId: quote.id,
            quoteId: quote.id,
            policyNumber: "AUTO-2026-00182",
            amount: 87500,
            currency: "NGN",
          },
          policyNumber: "AUTO-2026-00182",
          paymentReference: paidRef,
          unresolvedDbFailure: true,
          paymentSettled: true,
          reconciliationState: "database_failure_post_payment",
          reconciliation_required: true,
        },
        DEMO_CONTEXT
      );

      // Reconcile the session: should complete renewal safely using the existing settled payment
      const recResult = await orchestrator.reconcileExecutingSession(startRes.sessionId, DEMO_CONTEXT);
      assert.equal(recResult.resolvedStatus, "completed");
      assert.equal(recResult.reconciliationAction, "completed_renewal");

      // Verify policy is renewed and only one payment transaction exists
      const updatedPolicy = await repos.policies.findByNumber("AUTO-2026-00182", DEMO_CONTEXT);
      assert.equal(updatedPolicy?.status, "renewed");

      const store = getStore();
      const matchingTxs = store.transactions.filter((t) => t.reference === paidRef);
      assert.equal(matchingTxs.length, 1, "Must not create duplicate charge during post-DB-failure recovery");
    });
  });

  // Scenario 8: Recovery after application restart
  describe("8. Recovery after application restart", () => {
    it("should sweep and recover executing sessions after application restart", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const worker = new ActionOSRecoveryWorker(orchestrator, { maxRetries: 3 });

      // Simulate a session that was executing when the server restarted
      const restartRef = "ref_app_restart_settled_001";
      await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount: 87500,
          currency: "NGN",
          reference: restartRef,
          status: "succeeded",
        },
        DEMO_CONTEXT
      );

      const session = await repos.sessions.create(
        {
          organization_id: DEMO_CONTEXT.organizationId,
          customer_id: DEMO_CONTEXT.customerId!,
          channel: "web",
          status: "executing",
          metadata: {
            policyNumber: "AUTO-2026-00182",
            paymentReference: restartRef,
            reconciliation_required: true,
            authorizationDetails: {
              quoteId: "quote_demo_restart",
              policyNumber: "AUTO-2026-00182",
              amount: 87500,
              currency: "NGN",
            },
          },
        },
        DEMO_CONTEXT
      );

      // Recovery worker sweeps and processes the session
      const recoveryOutcome = await worker.processSession(session.id, DEMO_CONTEXT, true);
      assert.equal(recoveryOutcome.sessionId, session.id);
      assert.ok(["reconciled", "escalated"].includes(recoveryOutcome.outcome));

      // Check session status is no longer stuck in executing
      const sessionAfter = await repos.sessions.findById(session.id, DEMO_CONTEXT);
      assert.notEqual(sessionAfter?.status, "executing", "Session must not remain stuck in executing after recovery cycle");
    });
  });

  // Scenario 9: Demo mode remaining isolated from live payment execution
  describe("9. Demo mode remaining isolated from live payment execution", () => {
    it("should strictly reject mock provider usage in production mode", () => {
      const origEnv = process.env.ACTIONOS_RUNTIME_MODE;
      try {
        process.env.ACTIONOS_RUNTIME_MODE = "production";
        setPaymentProvider(mockPaymentProvider);

        assert.throws(
          () => {
            getPaymentProvider();
          },
          /Production runtime requires PAYSTACK_SECRET_KEY|Production isolation violation/i,
          "Must fail closed if mock payment provider is passed in production mode"
        );
      } finally {
        setPaymentProvider(null);
        process.env.ACTIONOS_RUNTIME_MODE = origEnv;
      }
    });

    it("should ensure PaystackPaymentProvider never leaks secrets, authorization headers, or customer credentials in error messages", async () => {
      const adapter = new PaystackPaymentProvider("sk_test_super_secret_paystack_key_12345");

      // Verify error handling on network failure does not leak secret key
      try {
        await adapter.verifyPayment("");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        assert.ok(!msg.includes("sk_test_super_secret_paystack_key_12345"), "Must never leak secret key in error messages");
        assert.ok(!msg.includes("Bearer"), "Must never leak Bearer token in error messages");
      }
    });
  });

  // Scenario 10: Hardened Payment Initialization & Timestamp Distinction
  describe("10. Hardened Payment Initialization & Timestamp Distinction", () => {
    it("should reject payment initiation when customerId is missing or blank", async () => {
      const provider = new PaystackPaymentProvider("sk_test_key_123");
      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "",
            amount: 50000,
            currency: "NGN",
            reference: "ref_test_no_cust",
          }),
        /Customer identity \(customerId\) is required/
      );
    });

    it("should reject payment initiation when amount has fractional kobo precision", async () => {
      const provider = new PaystackPaymentProvider("sk_test_key_123");
      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "cust_123",
            amount: 87500.123, // 3 decimal places -> fractional kobo
            currency: "NGN",
            reference: "ref_test_kobo_prec",
          }),
        /Invalid amount precision: 87500.123/
      );
    });

    it("should reject payment initiation when currency is not NGN", async () => {
      const provider = new PaystackPaymentProvider("sk_test_key_123");
      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "cust_123",
            amount: 50000,
            currency: "USD",
            reference: "ref_test_usd",
          }),
        /Unsupported currency: 'USD'/
      );
    });

    it("should reject payment initiation when customer email format is invalid", async () => {
      const provider = new PaystackPaymentProvider("sk_test_key_123");
      await assert.rejects(
        () =>
          provider.requestPayment({
            customerId: "cust_123",
            amount: 50000,
            currency: "NGN",
            reference: "ref_test_bad_email",
            email: "invalid-email-format-without-at",
          }),
        /Invalid customer email format/
      );
    });

    it("should strictly reject generic customer@actionos.ng fallback in production mode", async () => {
      const origMode = process.env.ACTIONOS_RUNTIME_MODE;
      try {
        process.env.ACTIONOS_RUNTIME_MODE = "production";
        const provider = new PaystackPaymentProvider("sk_live_prod_key_123");
        await assert.rejects(
          () =>
            provider.requestPayment({
              customerId: "cust_123",
              amount: 50000,
              currency: "NGN",
              reference: "ref_test_generic_email",
              email: "customer@actionos.ng",
            }),
          /Generic fallback email 'customer@actionos.ng' is prohibited/
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = origMode;
      }
    });

    it("should preserve authoritative provider paid_at timestamp and separate local verifiedAt timestamp on success", async () => {
      const origFetch = global.fetch;
      const providerTimestamp = "2026-10-10T08:15:30.000Z";
      try {
        global.fetch = async () =>
          new Response(
            JSON.stringify({
              status: true,
              data: {
                id: 998877,
                status: "success",
                amount: 8750000,
                currency: "NGN",
                paid_at: providerTimestamp,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );

        const provider = new PaystackPaymentProvider("sk_test_key_123");
        const verification = await provider.verifyPayment("ref_ver_timestamp_test");

        assert.equal(verification.status, "succeeded");
        assert.equal(verification.amount, 87500);
        assert.equal(verification.paidAt, providerTimestamp, "paidAt must reflect provider paid_at exactly");
        assert.ok(verification.verifiedAt, "verifiedAt must be present");
        assert.notEqual(verification.paidAt, verification.verifiedAt, "paidAt and verifiedAt must remain distinct");
      } finally {
        global.fetch = origFetch;
      }
    });

    it("should omit paidAt timestamp when payment is pending or failed and record verifiedAt", async () => {
      const origFetch = global.fetch;
      try {
        global.fetch = async () =>
          new Response(
            JSON.stringify({
              status: true,
              data: {
                id: 998878,
                status: "failed",
                amount: 8750000,
                currency: "NGN",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );

        const provider = new PaystackPaymentProvider("sk_test_key_123");
        const verification = await provider.verifyPayment("ref_ver_failed_timestamp");

        assert.equal(verification.status, "failed");
        assert.equal(verification.paidAt, undefined, "paidAt must not be fabricated on unconfirmed/failed payment");
        assert.ok(verification.verifiedAt, "verifiedAt must reflect local verification execution");
      } finally {
        global.fetch = origFetch;
      }
    });
  });

  // Scenario 11: Paystack Refund Multi-State Contract & Asynchronous Verification
  describe("11. Paystack Refund Multi-State Contract & Asynchronous Verification", () => {
    it("should map Paystack queued HTTP 200 refund response to refund_pending instead of premature confirmed/refunded", async () => {
      const origFetch = global.fetch;
      try {
        global.fetch = async () =>
          new Response(
            JSON.stringify({
              status: true,
              message: "Refund has been queued for processing",
              data: {
                id: 445566,
                transaction: 123456,
                status: "pending",
                amount: 8750000,
                currency: "NGN",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );

        const provider = new PaystackPaymentProvider("sk_test_key_123");
        const refundRes = await provider.refundPayment("ref_tx_to_refund", 87500);

        assert.equal(refundRes.status, "refund_pending", "Initial Paystack queued refund must map to refund_pending");
        assert.equal(refundRes.refundReference, "445566");
        assert.equal(refundRes.amount, 87500);
        assert.equal(refundRes.currency, "NGN");
      } finally {
        global.fetch = origFetch;
      }
    });

    it("should verify refund status via verifyRefund and confirm settled refund", async () => {
      const origFetch = global.fetch;
      try {
        global.fetch = async () =>
          new Response(
            JSON.stringify({
              status: true,
              message: "Refund retrieved",
              data: {
                id: 445566,
                status: "processed",
                amount: 8750000,
                currency: "NGN",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );

        const provider = new PaystackPaymentProvider("sk_test_key_123");
        const verifyRes = await provider.verifyRefund("445566");

        assert.equal(verifyRes.status, "refund_confirmed");
        assert.equal(verifyRes.refundReference, "445566");
        assert.equal(verifyRes.amount, 87500);
      } finally {
        global.fetch = origFetch;
      }
    });

    it("should map Paystack failed refund verification to refund_failed", async () => {
      const origFetch = global.fetch;
      try {
        global.fetch = async () =>
          new Response(
            JSON.stringify({
              status: true,
              message: "Refund retrieved",
              data: {
                id: 445566,
                status: "failed",
                merchant_note: "Declined by issuing bank",
                amount: 8750000,
                currency: "NGN",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );

        const provider = new PaystackPaymentProvider("sk_test_key_123");
        const verifyRes = await provider.verifyRefund("445566");

        assert.equal(verifyRes.status, "refund_failed");
        assert.equal(verifyRes.refundReference, "445566");
      } finally {
        global.fetch = origFetch;
      }
    });

    it("should map 500 error during refund verification to refund_unknown", async () => {
      const origFetch = global.fetch;
      try {
        global.fetch = async () =>
          new Response(
            JSON.stringify({
              status: false,
              message: "Gateway Internal Error",
            }),
            { status: 502, headers: { "Content-Type": "application/json" } }
          );

        const provider = new PaystackPaymentProvider("sk_test_key_123");
        const verifyRes = await provider.verifyRefund("445566");

        assert.equal(verifyRes.status, "refund_unknown");
      } finally {
        global.fetch = origFetch;
      }
    });

    it("should reconcile pending refund to confirmed state without duplicating reversals", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const pendingRefundRef = "ref_pend_refund_rec_01";

      const session = await repos.sessions.create(
        {
          organization_id: DEMO_CONTEXT.organizationId,
          customer_id: DEMO_CONTEXT.customerId!,
          channel: "web",
          status: "escalated",
          metadata: {
            policyNumber: "AUTO-2026-00182",
            refundReference: pendingRefundRef,
            refundState: "refund_pending",
            reconciliation_required: true,
          },
        },
        DEMO_CONTEXT
      );

      // Reconciler checks verifyRefund on mock provider
      const recResult = await orchestrator.reconcileExecutingSession(session.id, DEMO_CONTEXT);
      assert.equal(recResult.reconciliationAction, "refunded_uncompleted");

      const updatedSession = await repos.sessions.findById(session.id, DEMO_CONTEXT);
      assert.equal(updatedSession?.metadata?.refundState, "refund_confirmed");
      assert.equal(updatedSession?.metadata?.reconciliation_required, false);
    });
  });
});

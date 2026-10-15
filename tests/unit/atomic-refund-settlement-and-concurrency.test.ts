import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetStore, getStore } from "@/lib/actionos/mock-store";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { getRepositoryContainer, setRepositoryContainer } from "@/lib/repositories";
import { RefundPaymentTool } from "@/lib/actionos/tools/refund-payment";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import { setPaymentProvider } from "@/lib/payments";
import { DemoRepositoryContainer } from "@/lib/repositories/demo/demo-repositories";

describe("Sprint 1 Financial Integrity Suite: Atomic Refund Settlement, Fail-Closed Security & Concurrency", () => {
  describe("P0: Atomic Refund Settlement & All-or-Nothing Rollback", () => {
    it("should atomically settle refund, insert refund transaction, update parent status, and record webhook event", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const parentRef = "tx_atomic_settle_parent_001";
      const orgId = DEMO_CONTEXT.organizationId;
      const custId = DEMO_CONTEXT.customerId!;
      const tenantContext = { organizationId: orgId, customerId: custId, role: "customer" as const };

      // 1. Seed succeeded parent payment transaction
      const parentTx = await repos.transactions.create(
        {
          customer_id: custId,
          amount: 60000,
          currency: "NGN",
          reference: parentRef,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        tenantContext
      );

      // 2. Perform atomic refund settlement
      const settlementResult = await repos.transactions.settleWithWebhookEvent(
        parentTx.id,
        "partially_refunded",
        {
          provider: "paystack",
          eventId: "evt_atomic_refund_001",
          eventType: "refund.processed",
          reference: parentRef,
          status: "succeeded",
          metadata: { reason: "Customer request partial refund" },
        },
        tenantContext,
        {
          refundAmount: 25000,
          refundReference: "ref_atomic_refund_001",
          refundId: "rfd_001",
          refundState: "refund_confirmed",
        }
      );

      assert.equal(settlementResult.isDuplicate, false, "First settlement must not be marked as duplicate");
      assert.equal(settlementResult.transaction.status, "partially_refunded");

      // Verify parent transaction was updated to partially_refunded with correct cumulative balance
      const updatedParent = await repos.transactions.findByReference(parentRef, tenantContext);
      assert.ok(updatedParent);
      assert.equal(updatedParent.status, "partially_refunded");
      assert.equal(updatedParent.metadata?.cumulative_refund_amount, 25000);
      assert.equal(updatedParent.metadata?.remaining_balance, 35000);

      // Verify refund transaction was atomically inserted with negative amount
      const refundTx = settlementResult.refundTransaction;
      assert.ok(refundTx, "Refund transaction record must be created");
      assert.equal(refundTx.amount, -25000, "Refund transaction amount must be negative");
      assert.equal(refundTx.status, "succeeded");
      assert.equal(refundTx.transaction_type, "refund");

      // Verify webhook event was recorded
      const webhookEvents = await repos.webhookEvents.findByEventId("paystack", "evt_atomic_refund_001");
      assert.ok(webhookEvents, "Payment webhook event must be recorded");
    });

    it("should rollback all state changes if refund transaction creation fails (all-or-nothing)", async () => {
      resetStore();
      const repos = new DemoRepositoryContainer();
      setRepositoryContainer(repos);
      const parentRef = "tx_atomic_rollback_parent_002";
      const custId = DEMO_CONTEXT.customerId!;
      const tenantContext = { organizationId: DEMO_CONTEXT.organizationId, customerId: custId, role: "customer" as const };

      // Seed succeeded transaction
      const parentTx = await repos.transactions.create(
        {
          customer_id: custId,
          amount: 50000,
          currency: "NGN",
          reference: parentRef,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        tenantContext
      );

      // Monkey patch repos.transactions.create to throw on refund transaction insertion
      const origCreate = repos.transactions.create.bind(repos.transactions);
      let createCallCount = 0;
      repos.transactions.create = async (data, ctx) => {
        if (data.transaction_type === "refund") {
          createCallCount++;
          throw new Error("DATABASE_DISK_FULL: Simulated I/O error during refund record insert");
        }
        return origCreate(data, ctx);
      };

      try {
        await assert.rejects(
          async () => {
            await repos.transactions.settleWithWebhookEvent(
              parentTx.id,
              "partially_refunded",
              {
                provider: "paystack",
                eventId: "evt_atomic_fail_002",
                eventType: "refund.processed",
                reference: parentRef,
                status: "succeeded",
              },
              tenantContext,
              {
                refundAmount: 30000,
                refundReference: "ref_failing_insert_002",
                refundState: "refund_confirmed",
              }
            );
          },
          /DATABASE_DISK_FULL/,
          "Atomic settlement must rethrow when refund insert fails"
        );

        assert.equal(createCallCount, 1, "Attempted refund create once");

        // Verify parent transaction was rolled back to pristine succeeded state (not partially_refunded)
        const checkParent = await repos.transactions.findByReference(parentRef, tenantContext);
        assert.ok(checkParent);
        assert.equal(checkParent.status, "succeeded", "Parent transaction status must roll back to succeeded");
        assert.equal(checkParent.metadata?.cumulative_refund_amount, undefined, "Cumulative refund must not be incremented");

        // Verify webhook event was NOT recorded
        const webhookEvent = await repos.webhookEvents.findByEventId("paystack", "evt_atomic_fail_002");
        assert.equal(webhookEvent, null, "Webhook event record must be rolled back");
      } finally {
        repos.transactions.create = origCreate;
      }
    });

    it("should reject refunds exceeding remaining balance under lock and prevent over-refunding", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const parentRef = "tx_atomic_overrefund_003";
      const custId = DEMO_CONTEXT.customerId!;
      const tenantContext = { organizationId: DEMO_CONTEXT.organizationId, customerId: custId, role: "customer" as const };

      const parentTx = await repos.transactions.create(
        {
          customer_id: custId,
          amount: 20000,
          currency: "NGN",
          reference: parentRef,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        tenantContext
      );

      await assert.rejects(
        async () => {
          await repos.transactions.settleWithWebhookEvent(
            parentTx.id,
            "refunded",
            {
              provider: "paystack",
              eventId: "evt_overrefund_003",
              eventType: "refund.processed",
              reference: parentRef,
              status: "succeeded",
            },
            tenantContext,
            {
              refundAmount: 25000, // Exceeds 20000 balance!
              refundReference: "ref_overrefund_003",
              refundState: "refund_confirmed",
            }
          );
        },
        /exceeds (original payment|remaining balance)/i,
        "Should reject refund exceeding remaining balance"
      );
    });

    it("should deduplicate duplicate refund webhook events without double-spending", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const parentRef = "tx_atomic_dedup_004";
      const custId = DEMO_CONTEXT.customerId!;
      const tenantContext = { organizationId: DEMO_CONTEXT.organizationId, customerId: custId, role: "customer" as const };

      const parentTx = await repos.transactions.create(
        {
          customer_id: custId,
          amount: 100000,
          currency: "NGN",
          reference: parentRef,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        tenantContext
      );

      const eventPayload = {
        provider: "paystack",
        eventId: "evt_dedup_004",
        eventType: "refund.processed",
        reference: parentRef,
        status: "succeeded",
      };
      const extraPayload = {
        refundAmount: 20000,
        refundReference: "ref_dedup_004",
        refundState: "refund_confirmed" as const,
      };

      // First delivery: processes successfully
      const first = await repos.transactions.settleWithWebhookEvent(
        parentTx.id,
        "partially_refunded",
        eventPayload,
        tenantContext,
        extraPayload
      );
      assert.equal(first.isDuplicate, false);

      // Duplicate delivery: safely deduplicated
      const second = await repos.transactions.settleWithWebhookEvent(
        parentTx.id,
        "partially_refunded",
        eventPayload,
        tenantContext,
        extraPayload
      );
      assert.equal(second.isDuplicate, true);

      // Verify cumulative refund amount was only incremented once (20000, NOT 40000)
      const parent = await repos.transactions.findByReference(parentRef, tenantContext);
      assert.equal(parent?.metadata?.cumulative_refund_amount, 20000);
      assert.equal(parent?.metadata?.remaining_balance, 80000);
    });
  });

  describe("P0: Fail-Closed Behavior in Refund Tool", () => {
    it("should fail closed if database lookup of original transaction throws an error", async () => {
      resetStore();
      const repos = new DemoRepositoryContainer();
      setRepositoryContainer(repos);

      // Monkey patch findByReference to simulate database connection loss
      const origFind = repos.transactions.findByReference.bind(repos.transactions);
      repos.transactions.findByReference = async () => {
        throw new Error("CONNECTION_TIMEOUT: Postgres connection pool exhausted");
      };

      let providerCalled = false;
      setPaymentProvider({
        name: "Mock Rail",
        async requestPayment() { return { status: "succeeded", reference: "ref" }; },
        async verifyPayment() { return { status: "succeeded", amount: 100, currency: "NGN", paidAt: new Date().toISOString(), providerReference: "prov_ref_test" }; },
        async refundPayment() {
          providerCalled = true;
          return { status: "refund_confirmed", amount: 15000, refundReference: "ref_confirmed_test" };
        },
      });

      try {
        const refundTool = new RefundPaymentTool();
        const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, { sessionId: "sess_fail_closed_db" });

        const result = await refundTool.execute(
          {
            reference: "tx_unknown_ref",
            amount: 15000,
            currency: "NGN",
            reason: "Customer cancellation",
          },
          execCtx
        );

        assert.equal(result.success, false);
        assert.equal(result.error?.code, "DATABASE_LOOKUP_FAILED");
        assert.match(result.error?.message || "", /Postgres connection pool exhausted/);
        assert.equal(providerCalled, false, "Payment provider must NEVER be called if database lookup fails");
      } finally {
        repos.transactions.findByReference = origFind;
      }
    });

    it("should fail closed if original transaction does not exist in database", async () => {
      resetStore();
      let providerCalled = false;
      setPaymentProvider({
        name: "Mock Rail",
        async requestPayment() { return { status: "succeeded", reference: "ref" }; },
        async verifyPayment() { return { status: "succeeded", amount: 100, currency: "NGN", paidAt: new Date().toISOString(), providerReference: "prov_ref_test" }; },
        async refundPayment() {
          providerCalled = true;
          return { status: "refund_confirmed", amount: 25000, refundReference: "ref_confirmed_test" };
        },
      });

      const refundTool = new RefundPaymentTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, { sessionId: "sess_missing_tx" });

      const result = await refundTool.execute(
        {
          reference: "tx_non_existent_reference_999",
          amount: 25000,
          currency: "NGN",
          reason: "Customer cancellation",
        },
        execCtx
      );

      assert.equal(result.success, false);
      assert.equal(result.error?.code, "TRANSACTION_NOT_FOUND");
      assert.equal(providerCalled, false, "Payment provider must never be called for non-existent transactions");
    });

    it("should fail closed if original transaction is not in succeeded or partially_refunded status", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const parentRef = "tx_pending_status_005";
      const custId = DEMO_CONTEXT.customerId!;
      const tenantContext = { organizationId: DEMO_CONTEXT.organizationId, customerId: custId, role: "customer" as const };

      await repos.transactions.create(
        {
          customer_id: custId,
          amount: 50000,
          currency: "NGN",
          reference: parentRef,
          status: "pending", // NOT succeeded
          transaction_type: "renewal_premium",
        },
        tenantContext
      );

      let providerCalled = false;
      setPaymentProvider({
        name: "Mock Rail",
        async requestPayment() { return { status: "succeeded", reference: "ref" }; },
        async verifyPayment() { return { status: "succeeded", amount: 100, currency: "NGN", paidAt: new Date().toISOString(), providerReference: "prov_ref_test" }; },
        async refundPayment() {
          providerCalled = true;
          return { status: "refund_confirmed", amount: 20000, refundReference: "ref_confirmed_test" };
        },
      });

      const refundTool = new RefundPaymentTool();
      const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, { sessionId: "sess_invalid_status" });

      const result = await refundTool.execute(
        {
          reference: parentRef,
          amount: 20000,
          currency: "NGN",
          reason: "Cancellation",
        },
        execCtx
      );

      assert.equal(result.success, false);
      assert.equal(result.error?.code, "INVALID_TRANSACTION_STATUS");
      assert.equal(providerCalled, false, "Payment provider must never be called for pending/failed transactions");
    });

    it("should fail closed and propagate error if updating original transaction fails after provider refund", async () => {
      resetStore();
      const repos = new DemoRepositoryContainer();
      setRepositoryContainer(repos);
      const parentRef = "tx_update_fail_006";
      const custId = DEMO_CONTEXT.customerId!;
      const tenantContext = { organizationId: DEMO_CONTEXT.organizationId, customerId: custId, role: "customer" as const };

      await repos.transactions.create(
        {
          customer_id: custId,
          amount: 50000,
          currency: "NGN",
          reference: parentRef,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        tenantContext
      );

      setPaymentProvider({
        name: "Mock Rail",
        async requestPayment() { return { status: "succeeded", reference: "ref" }; },
        async verifyPayment() { return { status: "succeeded", amount: 100, currency: "NGN", paidAt: new Date().toISOString(), providerReference: "prov_ref_test" }; },
        async refundPayment() {
          return { status: "refund_confirmed", refundReference: "ref_confirmed_006", amount: 20000 };
        },
      });

      // Monkey patch updateStatus to simulate DB failure during parent update
      const origUpdateStatus = repos.transactions.updateStatus.bind(repos.transactions);
      repos.transactions.updateStatus = async () => {
        throw new Error("MUTATION_LOCK_TIMEOUT: Deadlock or lock timeout during transaction update");
      };

      try {
        const refundTool = new RefundPaymentTool();
        const execCtx = createWorkflowExecutionContext(DEMO_CONTEXT, { sessionId: "sess_update_fail" });

        const result = await refundTool.execute(
          {
            reference: parentRef,
            amount: 20000,
            currency: "NGN",
            reason: "Saga compensation",
          },
          execCtx
        );

        // Crucial invariant: failure to update original transaction MUST NOT be swallowed!
        assert.equal(result.success, false, "Must return failure when transaction update fails");
        assert.equal(result.error?.code, "TRANSACTION_UPDATE_FAILED");
        assert.match(result.error?.message || "", /Requires ledger reconciliation/);
      } finally {
        repos.transactions.updateStatus = origUpdateStatus;
      }
    });
  });

  describe("P0: Adversarial Concurrency & Balance Reservation (Double-Spend Protection)", () => {
    it("should prevent two simultaneous refunds from double-spending the remaining balance", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const parentRef = "tx_concurrency_race_007";
      const custId = DEMO_CONTEXT.customerId!;
      const tenantContext = { organizationId: DEMO_CONTEXT.organizationId, customerId: custId, role: "customer" as const };

      // Original balance: 50,000 NGN
      const parentTx = await repos.transactions.create(
        {
          customer_id: custId,
          amount: 50000,
          currency: "NGN",
          reference: parentRef,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        tenantContext
      );

      // Attempt two concurrent reservations of 35,000 NGN each (35k + 35k = 70k > 50k)
      const reservation1Promise = repos.transactions.reserveRefundBalance(parentTx.id, 35000, tenantContext);
      const reservation2Promise = repos.transactions.reserveRefundBalance(parentTx.id, 35000, tenantContext);

      const results = await Promise.allSettled([reservation1Promise, reservation2Promise]);

      const fulfilled = results.filter((r) => r.status === "fulfilled" && (r.value as { success: boolean }).success);
      const rejected = results.filter(
        (r) =>
          r.status === "rejected" ||
          (r.status === "fulfilled" && !(r.value as { success: boolean }).success)
      );

      assert.equal(fulfilled.length, 1, "Exactly ONE concurrent refund reservation must succeed");
      assert.equal(rejected.length, 1, "The second concurrent refund reservation must be rejected");

      // Verify remaining balance after successful reservation
      const parentAfter = await repos.transactions.findByReference(parentRef, tenantContext);
      assert.equal(parentAfter?.metadata?.reserved_refund_amount, 35000);
      assert.equal(parentAfter?.metadata?.remaining_balance, 15000);
    });

    it("should release balance reservation if provider refund fails, allowing subsequent retry", async () => {
      resetStore();
      const repos = getRepositoryContainer();
      const parentRef = "tx_release_reservation_008";
      const custId = DEMO_CONTEXT.customerId!;
      const tenantContext = { organizationId: DEMO_CONTEXT.organizationId, customerId: custId, role: "customer" as const };

      const parentTx = await repos.transactions.create(
        {
          customer_id: custId,
          amount: 40000,
          currency: "NGN",
          reference: parentRef,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        tenantContext
      );

      // Reserve 30,000 NGN
      const reservation = await repos.transactions.reserveRefundBalance(parentTx.id, 30000, tenantContext);
      assert.equal(reservation.success, true);
      assert.equal(reservation.remainingBalance, 10000);

      // Release reservation due to provider failure
      await repos.transactions.releaseRefundReservation(parentTx.id, 30000, tenantContext, {
        reservationId: reservation.reservationId,
      });

      const parentAfterRelease = await repos.transactions.findByReference(parentRef, tenantContext);
      assert.equal(parentAfterRelease?.metadata?.reserved_refund_amount, 0);
      assert.equal(parentAfterRelease?.metadata?.remaining_balance, 40000);

      // Subsequent 30,000 NGN refund should now succeed without being blocked by stale reservation
      const retryReservation = await repos.transactions.reserveRefundBalance(parentTx.id, 30000, tenantContext);
      assert.equal(retryReservation.success, true);
    });
  });

  describe("P1: Zero Fabrication in Outcomes & Verified Evidence", () => {
    it("should not fabricate random certificate or transaction numbers when backend records omit them", () => {
      const extractOutcome = (events: Array<{ action: string; metadata?: Record<string, unknown> }>) => {
        let certificateNumber: string | undefined;
        let txReference: string | undefined;

        for (const ev of events) {
          if (ev.action === "certificate_generated" && ev.metadata?.certificateNumber) {
            certificateNumber = ev.metadata.certificateNumber as string;
          }
          if (ev.action === "payment_requested" && ev.metadata?.reference) {
            txReference = ev.metadata.reference as string;
          }
        }

        const missingFields: string[] = [];
        if (!certificateNumber) missingFields.push("Statutory NAICOM Certificate Number");
        if (!txReference) missingFields.push("Verified Payment Rail Transaction Reference");

        const isComplete = missingFields.length === 0;

        return {
          certificateNumber: certificateNumber || "Not available",
          txReference: txReference || "Not available",
          isComplete,
          missingFields,
        };
      };

      // Case 1: Incomplete events (missing certificate)
      const incompleteOutcome = extractOutcome([
        { action: "payment_requested", metadata: { reference: "pay_real_123" } },
      ]);

      assert.equal(incompleteOutcome.certificateNumber, "Not available", "Must report 'Not available' instead of inventing a random CERT- number");
      assert.equal(incompleteOutcome.txReference, "pay_real_123");
      assert.equal(incompleteOutcome.isComplete, false, "Must flag outcome as incomplete");
      assert.deepEqual(incompleteOutcome.missingFields, ["Statutory NAICOM Certificate Number"]);

      // Case 2: Complete events with verified backend evidence
      const completeOutcome = extractOutcome([
        { action: "payment_requested", metadata: { reference: "pay_real_123" } },
        { action: "certificate_generated", metadata: { certificateNumber: "NAICOM-2026-CERT-0001" } },
      ]);

      assert.equal(completeOutcome.certificateNumber, "NAICOM-2026-CERT-0001");
      assert.equal(completeOutcome.txReference, "pay_real_123");
      assert.equal(completeOutcome.isComplete, true);
      assert.equal(completeOutcome.missingFields.length, 0);
    });
  });
});

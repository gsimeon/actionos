import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { resetStore, getStore } from "@/lib/actionos/mock-store";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { getRepositoryContainer } from "@/lib/repositories";
import { mockPaymentProvider } from "@/lib/payments/mock";
import { POST as paymentWebhookHandler } from "@/app/api/webhooks/payment/route";
import { toolRegistry } from "@/lib/actionos/tool-registry";
import type { GetQuoteInput } from "@/lib/actionos/tools/get-quote";
import type { WorkflowExecutionContext } from "@/types/actionos";

describe("Atomic Quote Authorization, Idempotency & Financial Execution Integrity", () => {
  it("should fail closed when calculated quote amount has no exact match in issued quotes", async () => {
    resetStore();
    const originalTool = toolRegistry.get("get_quote");
    assert.ok(originalTool);

    // Create a mock tool with prototype inheritance that returns mismatched quotes
    const mockTool = Object.create(originalTool);
    mockTool.execute = async (input: GetQuoteInput, ctx: WorkflowExecutionContext) => {
      const res = await originalTool.execute(input, ctx);
      if (res.success && res.data) {
        return {
          ...res,
          data: {
            ...res.data,
            quoteAmount: 87500,
            quotes: [
              {
                id: "uq_mismatched",
                underwriter: "Mismatched Underwriter",
                tier: "basic",
                tierLabel: "Basic",
                amount: 99999, // Mismatched amount!
                currency: "NGN",
                benefits: [],
                rating: 4.0,
              },
            ],
          },
        };
      }
      return res;
    };

    toolRegistry.register(mockTool);

    try {
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew my Toyota Camry insurance AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      assert.equal(startRes.status, "failed");
      assert.equal(startRes.authorizationRequired, false);
      assert.match(startRes.message, /Quote selection integrity violation|Failing closed/i);
    } finally {
      toolRegistry.register(originalTool);
    }
  });

  it("should reject authorization if quote status is not 'issued' (e.g., already accepted or cancelled)", async () => {
    resetStore();
    const repos = getRepositoryContainer();

    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew my Toyota Camry insurance AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });

    assert.ok(startRes.authorizationDetails);
    const quoteId = startRes.authorizationDetails.quoteId;

    // Manually mark quote as already accepted
    await repos.quotes.updateStatus(quoteId, "accepted", {
      organizationId: DEMO_CONTEXT.organizationId,
      customerId: DEMO_CONTEXT.customerId,
      role: DEMO_CONTEXT.role,
    });

    const authRes = await orchestrator.authorizeAndExecute(
      startRes.sessionId,
      true,
      DEMO_CONTEXT,
      {
        authMethod: "pin",
        quoteId,
        authorizedQuoteId: quoteId,
      }
    );

    assert.equal(authRes.status, "failed");
    assert.match(authRes.message, /Only quotes in 'issued' status can be authorized/);
  });

  it("should reject authorization if quote HMAC signature is tampered with", async () => {
    resetStore();
    const repos = getRepositoryContainer();

    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew my Toyota Camry insurance AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });

    assert.ok(startRes.authorizationDetails);
    const quoteId = startRes.authorizationDetails.quoteId;

    const dbQuote = await repos.quotes.findById(quoteId);
    assert.ok(dbQuote);

    // Tamper with quote_hash directly
    dbQuote.quote_hash = "deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef";

    const authRes = await orchestrator.authorizeAndExecute(
      startRes.sessionId,
      true,
      DEMO_CONTEXT,
      {
        authMethod: "pin",
        quoteId,
        authorizedQuoteId: quoteId,
      }
    );

    assert.equal(authRes.status, "failed");
    assert.match(authRes.message, /Cryptographic quote signature mismatch|tampered/);
  });

  it("should prevent duplicate execution under concurrent authorization requests (atomic claim)", async () => {
    resetStore();

    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew my Toyota Camry insurance AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });

    assert.ok(startRes.authorizationDetails);
    const quoteId = startRes.authorizationDetails.quoteId;
    const sessionId = startRes.sessionId;

    // Fire two simultaneous authorization requests
    const [res1, res2] = await Promise.all([
      orchestrator.authorizeAndExecute(sessionId, true, DEMO_CONTEXT, {
        authMethod: "pin",
        quoteId,
        authorizedQuoteId: quoteId,
      }),
      orchestrator.authorizeAndExecute(sessionId, true, DEMO_CONTEXT, {
        authMethod: "pin",
        quoteId,
        authorizedQuoteId: quoteId,
      }),
    ]);

    // Exactly one must succeed and one must be rejected due to concurrent claim conflict
    const successCount = [res1, res2].filter((r) => r.status === "completed").length;
    const failureCount = [res1, res2].filter((r) => r.status === "failed").length;

    assert.equal(successCount, 1, "Exactly one concurrent authorization request must succeed");
    assert.equal(failureCount, 1, "The second concurrent authorization request must be rejected");

    const failedRes = [res1, res2].find((r) => r.status === "failed");
    assert.ok(failedRes);
    assert.match(failedRes.message, /Concurrent authorization detected|already been claimed|cannot be accepted atomically/);
  });

  it("should ensure payment operations and webhook processing are strictly idempotent", async () => {
    resetStore();
    const repos = getRepositoryContainer();

    const testRef = "act_test_idem_pay_auto2026";
    const paymentInput = {
      customerId: DEMO_CONTEXT.customerId!,
      amount: 87500,
      currency: "NGN",
      reference: testRef,
      metadata: { policyNumber: "AUTO-2026-00182" },
    };

    // First payment execution
    const pay1 = await mockPaymentProvider.requestPayment(paymentInput);
    assert.equal(pay1.status, "succeeded");

    const tx1 = await repos.transactions.findByReference(testRef);
    assert.ok(tx1);
    assert.equal(tx1.status, "succeeded");

    // Repeat payment execution with same reference (idempotent retry)
    const pay2 = await mockPaymentProvider.requestPayment(paymentInput);
    assert.equal(pay2.status, "succeeded");
    assert.equal(pay2.reference, testRef);

    // Verify no duplicate transactions were created
    const store = getStore();
    const matchingTxs = store.transactions.filter((t) => t.reference === testRef);
    assert.equal(matchingTxs.length, 1, "Payment provider must not create duplicate transactions on retries");

    // Webhook idempotency test
    const mockWebhookReq = (ref: string) =>
      new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "charge.success",
          data: { reference: ref, amount: 87500 },
        }),
      });

    // First webhook delivery
    const hookRes1 = await paymentWebhookHandler(mockWebhookReq(testRef));
    const hookData1 = await hookRes1.json();
    assert.equal(hookData1.success, true);
    assert.equal(hookData1.data.duplicate, true, "Already succeeded transaction is recognized as duplicate");

    // Second webhook delivery with same payload
    const hookRes2 = await paymentWebhookHandler(mockWebhookReq(testRef));
    const hookData2 = await hookRes2.json();
    assert.equal(hookData2.success, true);
    assert.equal(hookData2.data.duplicate, true);
  });

  it("should enforce tenant ownership in repository mutations and prevent cross-tenant tampering", async () => {
    resetStore();
    const repos = getRepositoryContainer();

    // Create a customer in Org A
    const custA = await repos.customers.create({
      customer_number: "CUS-ORGA-001",
      full_name: "Customer Org A",
      phone: "+2348000000001",
      email: "customerA@orga.ng",
      organization_id: "org-a",
    });

    // Create a transaction belonging to Org A
    const tx = await repos.transactions.create(
      {
        customer_id: custA.id,
        amount: 50000,
        reference: "ref_org_a_tx_001",
      },
      { organizationId: "org-a", customerId: custA.id }
    );

    // Attempt to mutate transaction status using tenant context of Org B
    await assert.rejects(
      async () => {
        await repos.transactions.updateStatus(tx.id, "refunded", {
          organizationId: "org-b",
          customerId: "cus-b",
        });
      },
      /Tenant authorization violation/
    );

    // Attempt to accept quote using tenant context of Org B
    const quote = await repos.quotes.create({
      session_id: "sess_001",
      organization_id: "org-a",
      customer_id: custA.id,
      policy_id: "pol-001",
      provider_name: "Leadway",
      amount: 80000,
      currency: "NGN",
      expires_at: new Date(Date.now() + 100000).toISOString(),
    });

    const acceptedQuoteOrgB = await repos.quotes.acceptQuote(quote.id, "sess_001", {
      organizationId: "org-b",
      customerId: "cus-b",
    });
    assert.equal(acceptedQuoteOrgB, null, "Org B must not be able to accept Org A's quote");
  });

  it("should execute automated Saga compensation refund on downstream renewal failure", async () => {
    resetStore();

    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew my Toyota Camry insurance AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });

    assert.ok(startRes.authorizationDetails);
    const quoteId = startRes.authorizationDetails.quoteId;

    // Authorize with simulated downstream failure
    const authRes = await orchestrator.authorizeAndExecute(
      startRes.sessionId,
      true,
      DEMO_CONTEXT,
      {
        authMethod: "pin",
        quoteId,
        authorizedQuoteId: quoteId,
        simulateSagaFailure: true,
      }
    );

    assert.equal(authRes.status, "escalated");
    assert.match(authRes.message, /Saga Rollback Triggered.*automatically refunded/);

    // Verify refund event recorded in ledger
    const ledgerEvents = authRes.events;
    const refundEvent = ledgerEvents.find((e) => e.action === "saga_compensating_refund");
    assert.ok(refundEvent, "Payment refund event must be committed to cryptographic ledger");
    assert.equal(refundEvent.status, "verified");
  });

  it("should strictly reject demo fault injection (simulateSagaFailure) in production runtime mode", async () => {
    resetStore();
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    process.env.ACTIONOS_RUNTIME_MODE = "production";

    try {
      const prodContext = {
        userId: "user_prod",
        profileId: "prof_prod",
        organizationId: "a0000000-0000-0000-0000-000000000001",
        role: "customer" as const,
        customerId: "f0000000-0000-0000-0000-000000000001",
        isDemo: false,
      };

      await assert.rejects(
        async () => {
          await orchestrator.authorizeAndExecute(
            "sess_prod_123",
            true,
            prodContext,
            { simulateSagaFailure: true }
          );
        },
        /Security enforcement violation: Fault injection \(simulateSagaFailure\) is prohibited in production runtime mode/
      );
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
    }
  });
});

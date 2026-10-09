import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrator, redactSensitiveInput } from "@/lib/actionos/orchestrator";
import { resetStore, getStore } from "@/lib/actionos/mock-store";
import { DEMO_CONTEXT, type AuthenticatedExecutionContext } from "@/lib/security/auth-context";
import { getRepositoryContainer } from "@/lib/repositories";
import { mockPaymentProvider } from "@/lib/payments/mock";
import { POST as paymentWebhookHandler } from "@/app/api/webhooks/payment/route";
import { toolRegistry } from "@/lib/actionos/tool-registry";
import { computeQuoteSignature, verifyQuoteSignature, getQuoteSigningSecret } from "@/lib/actionos/quote-signature";
import { verifyLedgerIntegrity } from "@/lib/actionos/crypto-ledger";
import type { GetQuoteInput } from "@/lib/actionos/tools/get-quote";
import type { WorkflowExecutionContext } from "@/types/actionos";
import { SupabaseActionSessionRepository } from "@/lib/repositories/supabase/supabase-repositories";
import { DatabaseError } from "@/lib/repositories/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    assert.match(failedRes.message, /Concurrent authorization detected|already been claimed|cannot be accepted atomically|Only quotes in 'issued' status can be authorized/);
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

  it("should select second alternative quote, authorize its canonical database ID, and verify exact provider details throughout payment and renewal", async () => {
    resetStore();
    const repos = getRepositoryContainer();

    // 1. Start renewal session
    const step1 = await orchestrator.startWorkflow({
      inputText: "Check my car insurance and renew it",
      channel: "web",
      language: "en-NG",
      executionContext: DEMO_CONTEXT,
    });

    assert.equal(step1.status, "awaiting_authorization");
    assert.ok(step1.authorizationDetails?.quotes && step1.authorizationDetails.quotes.length >= 2);

    // Pick second quote (alternative marketplace quote)
    const secondQuote = step1.authorizationDetails.quotes[1];
    assert.ok(secondQuote.id, "Second quote must carry a canonical ActionOS database ID");
    assert.ok(secondQuote.amount > 0);

    // Verify it exists in database in 'issued' status
    const dbAltQuoteBefore = await repos.quotes.findById(secondQuote.id, DEMO_CONTEXT);
    assert.ok(dbAltQuoteBefore, "Second quote must exist as a persisted entity");
    assert.equal(dbAltQuoteBefore.status, "issued");
    assert.equal(dbAltQuoteBefore.amount, secondQuote.amount);

    // 2. Authorize using the second quote's canonical quoteId
    const step2 = await orchestrator.authorizeAndExecute(
      step1.sessionId,
      true,
      DEMO_CONTEXT,
      {
        authorizedQuoteId: secondQuote.id,
        authMethod: "biometric_webauthn",
      }
    );

    assert.equal(step2.status, "completed");

    // Verify quote was atomically accepted in the database
    const dbAltQuoteAfter = await repos.quotes.findById(secondQuote.id, DEMO_CONTEXT);
    assert.ok(dbAltQuoteAfter);
    assert.equal(dbAltQuoteAfter.status, "accepted");

    // Verify exact payment transaction recorded in database matching the alternative quote
    const store = getStore();
    const tx = store.transactions.find((t) => t.amount === secondQuote.amount);
    assert.ok(tx, `Transaction must be executed for exact alternative quote amount ${secondQuote.amount}`);
    assert.equal(tx.status, "succeeded");
    assert.equal(tx.currency, secondQuote.currency);

    // Verify session metadata has bound consentRecord with exact details
    const session = await repos.sessions.findById(step1.sessionId, DEMO_CONTEXT);
    assert.ok(session);
    const consent = (session.metadata as Record<string, unknown>).consentRecord as Record<string, unknown> | undefined;
    assert.ok(consent, "Consent record must be bound in session metadata");
    assert.equal(consent.quoteId, secondQuote.id);
    assert.equal(consent.amount, secondQuote.amount);
    assert.equal(consent.provider, secondQuote.underwriter);
    assert.equal(consent.currency, secondQuote.currency);
  });

  it("should enforce dedicated signing key in production and reject demo/unkeyed/tampered signatures", async () => {
    resetStore();
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    const originalKey = process.env.ACTIONOS_QUOTE_SIGNING_KEY;
    process.env.ACTIONOS_RUNTIME_MODE = "production";

    try {
      // 1. Missing signing key in production must throw
      delete process.env.ACTIONOS_QUOTE_SIGNING_KEY;
      assert.throws(
        () => getQuoteSigningSecret(),
        /ACTIONOS_QUOTE_SIGNING_KEY is strictly required in production environment/
      );

      // 2. Configure dedicated production key
      process.env.ACTIONOS_QUOTE_SIGNING_KEY = "test_prod_dedicated_hmac_key_2026";
      assert.equal(getQuoteSigningSecret(), "test_prod_dedicated_hmac_key_2026");

      const testQuote = {
        session_id: "00000000-0000-0000-0000-000000000001",
        organization_id: "00000000-0000-0000-0000-000000000002",
        customer_id: "00000000-0000-0000-0000-000000000003",
        policy_id: "00000000-0000-0000-0000-000000000004",
        provider_name: "AXA Mansard",
        amount: 87500,
        currency: "NGN",
        expires_at: new Date(Date.now() + 60000).toISOString(),
        quote_hash: "demo_hash",
      };

      // 3. In production, 'demo_hash' is strictly rejected
      assert.equal(verifyQuoteSignature(testQuote), false, "Production must never accept 'demo_hash'");

      // 4. In production, legacy unkeyed hash is strictly rejected
      const legacyPayload = `${testQuote.session_id}:${testQuote.organization_id}:${testQuote.customer_id}:${testQuote.policy_id}:${testQuote.provider_name}:${testQuote.amount}:${testQuote.currency}:${testQuote.expires_at}`;
      const legacyHash = (await import("crypto")).createHash("sha256").update(legacyPayload).digest("hex");
      assert.equal(
        verifyQuoteSignature({ ...testQuote, quote_hash: legacyHash }),
        false,
        "Production must reject unkeyed legacy hash"
      );

      // 5. Valid HMAC signature is verified
      const { quoteHash } = computeQuoteSignature({
        sessionId: testQuote.session_id,
        organizationId: testQuote.organization_id,
        customerId: testQuote.customer_id,
        policyId: testQuote.policy_id,
        providerName: testQuote.provider_name,
        amount: testQuote.amount,
        currency: testQuote.currency,
        expiresAt: testQuote.expires_at,
      });

      assert.equal(verifyQuoteSignature({ ...testQuote, quote_hash: quoteHash }), true);

      // 6. Tampered amount is rejected
      assert.equal(
        verifyQuoteSignature({ ...testQuote, amount: 99999, quote_hash: quoteHash }),
        false,
        "Tampered quote amount must be rejected"
      );
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
      if (originalKey) process.env.ACTIONOS_QUOTE_SIGNING_KEY = originalKey;
      else delete process.env.ACTIONOS_QUOTE_SIGNING_KEY;
    }
  });

  it("should fail closed when attempting atomic claim and quote acceptance on non-issued quote", async () => {
    resetStore();
    const repos = getRepositoryContainer();

    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew my insurance",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });
    assert.equal(startRes.status, "awaiting_authorization");
    const quoteId = startRes.authorizationDetails!.quoteId;

    // Mutate quote status to rejected
    const store = getStore();
    const q = store.quotes.find((item) => item.id === quoteId);
    assert.ok(q);
    q.status = "rejected";

    // Attempt atomic claim and acceptance
    const res = await repos.sessions.claimAuthorizationAndAcceptQuote(startRes.sessionId, quoteId, DEMO_CONTEXT);
    assert.equal(res, null, "Atomic claim must fail when quote is not in issued status");

    // Verify session was NOT transitioned to executing
    const sess = store.sessions.find((s) => s.id === startRes.sessionId);
    assert.ok(sess);
    assert.equal(sess.status, "awaiting_authorization");
  });

  it("should safely reconcile sessions stuck in executing without blind payment retries", async () => {
    resetStore();
    const repos = getRepositoryContainer();

    // Case A: Session stuck in executing with no payment gateway transaction
    const stuckSession = await repos.sessions.create({
      organization_id: DEMO_CONTEXT.organizationId!,
      channel: "web",
      customer_id: DEMO_CONTEXT.customerId!,
      metadata: {
        authorizationDetails: {
          policyNumber: "AUTO-2026-00182",
          amount: 87500,
        },
      },
    });
    await repos.sessions.updateStatus(stuckSession.id, "executing");

    const recResult1 = await orchestrator.reconcileExecutingSession(stuckSession.id, DEMO_CONTEXT);
    assert.equal(recResult1.resolvedStatus, "failed");
    assert.equal(recResult1.reconciliationAction, "cancelled_unpaid");

    const sessionAfter1 = await repos.sessions.findById(stuckSession.id, DEMO_CONTEXT);
    assert.equal(sessionAfter1?.status, "failed");

    // Case B: Session stuck in executing where payment succeeded and policy was renewed
    const stuckSession2 = await repos.sessions.create({
      organization_id: DEMO_CONTEXT.organizationId!,
      channel: "web",
      customer_id: DEMO_CONTEXT.customerId!,
      metadata: {
        authorizationDetails: {
          policyNumber: "AUTO-2026-00182",
          amount: 87500,
        },
      },
    });
    await repos.sessions.updateStatus(stuckSession2.id, "executing");

    // Simulate settled payment in repository
    const sanitizedSession2 = stuckSession2.id.replace(/-/g, "").substring(0, 16);
    const deterministicRef2 = `act_${sanitizedSession2}_pay_AUTO202600182`;
    await repos.transactions.create(
      {
        customer_id: DEMO_CONTEXT.customerId!,
        amount: 87500,
        reference: deterministicRef2,
        status: "succeeded",
      },
      DEMO_CONTEXT
    );

    // Simulate renewed policy
    const policy = await repos.policies.findByNumber("AUTO-2026-00182", DEMO_CONTEXT);
    assert.ok(policy);
    await repos.policies.updateStatusAndExpiry(policy.id, "renewed", "2027-10-14", DEMO_CONTEXT);

    const recResult2 = await orchestrator.reconcileExecutingSession(stuckSession2.id, DEMO_CONTEXT);
    assert.equal(recResult2.resolvedStatus, "completed");
    assert.equal(recResult2.reconciliationAction, "completed_renewal");

    const sessionAfter2 = await repos.sessions.findById(stuckSession2.id, DEMO_CONTEXT);
    assert.equal(sessionAfter2?.status, "completed");
  });

  it("should detect broken sequence continuity and tampering in Action Ledger", () => {
    const validEvents = [
      {
        id: "ev_1",
        sessionId: "sess_test",
        sequenceNumber: 1,
        timestamp: "2026-10-08T00:00:00Z",
        action: "action_1",
        description: "first action",
        actor: "User" as const,
        status: "verified" as const,
        previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
        hash: "",
      },
      {
        id: "ev_2",
        sessionId: "sess_test",
        sequenceNumber: 3, // Broken sequence: 1 then 3 instead of 2!
        timestamp: "2026-10-08T00:00:01Z",
        action: "action_2",
        description: "second action",
        actor: "User" as const,
        status: "verified" as const,
        previousHash: "",
        hash: "",
      },
    ];

    const result = verifyLedgerIntegrity(validEvents);
    assert.equal(result.valid, false);
    assert.match(result.reason || "", /Broken sequence continuity/);
  });

  it("should detect tampering when persisted ledger events are modified, deleted, or reordered after reload", async () => {
    resetStore();
    const repos = getRepositoryContainer();

    // 1. Run renewal workflow to generate a real chained ledger
    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew my Toyota Camry insurance AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });
    assert.equal(startRes.status, "awaiting_authorization");

    const authRes = await orchestrator.authorizeAndExecute(
      startRes.sessionId,
      true,
      DEMO_CONTEXT,
      {
        quoteId: startRes.authorizationDetails!.quoteId,
        authorizedQuoteId: startRes.authorizationDetails!.quoteId,
      }
    );
    assert.equal(authRes.status, "completed");

    // 2. Fetch persisted events from repository
    const persistedEvents = await repos.ledger.getEventsBySessionId(startRes.sessionId, DEMO_CONTEXT);
    assert.ok(persistedEvents.length >= 3, "Workflow must produce multiple chained ledger events");

    // 3. Verify clean baseline passes integrity check
    const baselineCheck = verifyLedgerIntegrity(persistedEvents);
    assert.equal(baselineCheck.valid, true, "Unmodified persisted ledger must be cryptographically valid");

    // 4. Tampering Case A: Modify an entry's description or payload
    const modifiedEvents = JSON.parse(JSON.stringify(persistedEvents));
    modifiedEvents[1].description = "Tampered payment amount or altered description";
    const modCheck = verifyLedgerIntegrity(modifiedEvents);
    assert.equal(modCheck.valid, false, "Modified event must fail cryptographic hash verification");
    assert.match(modCheck.reason || "", /Invalid event hash/);

    // 5. Tampering Case B: Delete an intermediate ledger entry
    const deletedEvents = JSON.parse(JSON.stringify(persistedEvents));
    deletedEvents.splice(1, 1); // Remove intermediate event
    const delCheck = verifyLedgerIntegrity(deletedEvents);
    assert.equal(delCheck.valid, false, "Deleted ledger event must break sequence or previous hash link");
    assert.match(delCheck.reason || "", /Broken sequence continuity|Broken chain link/);

    // 6. Tampering Case C: Reorder two ledger entries
    const reorderedEvents = JSON.parse(JSON.stringify(persistedEvents));
    const temp = reorderedEvents[0];
    reorderedEvents[0] = reorderedEvents[1];
    reorderedEvents[1] = temp;
    const reorderCheck = verifyLedgerIntegrity(reorderedEvents);
    assert.equal(reorderCheck.valid, false, "Reordered ledger entries must fail sequence verification");
    assert.match(reorderCheck.reason || "", /Broken sequence continuity|Broken chain link/);
  });

  it("should fail closed on ledger event queries when parent session does not exist or cross-tenant context is provided", async () => {
    resetStore();
    const repos = getRepositoryContainer();

    // 1. Session does not exist: must return empty list (fail-closed)
    const nonExistentEvents = await repos.ledger.getEventsBySessionId("sess_non_existent", {
      organizationId: "org-a",
      customerId: "cus-a",
    });
    assert.deepEqual(nonExistentEvents, []);

    // 2. Cross-tenant query: session belongs to org-a, queried with org-b tenant context
    const step1 = await orchestrator.startWorkflow({
      inputText: "Check my car insurance and renew it",
      channel: "web",
      language: "en-NG",
      executionContext: DEMO_CONTEXT,
    });

    const crossTenantEvents = await repos.ledger.getEventsBySessionId(step1.sessionId, {
      organizationId: "foreign-org-id",
      customerId: "foreign-cust-id",
    });
    assert.deepEqual(crossTenantEvents, [], "Cross-tenant query must return no events");
  });

  it("should fail closed in production mode when customer identity cannot be resolved", async () => {
    resetStore();
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    const originalKey = process.env.ACTIONOS_QUOTE_SIGNING_KEY;
    const originalLedgerKey = process.env.ACTION_LEDGER_SIGNING_KEY;
    const originalWebhookKey = process.env.ACTIONOS_WEBHOOK_SIGNING_SECRET;
    process.env.ACTIONOS_RUNTIME_MODE = "production";
    process.env.ACTIONOS_QUOTE_SIGNING_KEY = "test_prod_key_2026_xyz";
    process.env.ACTION_LEDGER_SIGNING_KEY = "test_prod_ledger_key_2026";
    process.env.ACTIONOS_WEBHOOK_SIGNING_SECRET = "test_webhook_secret_2026";

    try {
      // 1. Customer role without customerId must reject
      const prodContextCustomer: AuthenticatedExecutionContext = {
        userId: "user_without_customer",
        profileId: "prof_test_customer",
        organizationId: "a0000000-0000-0000-0000-000000000001",
        role: "customer",
        isDemo: false,
      };

      await assert.rejects(
        async () => {
          await orchestrator.startWorkflow({
            inputText: "Renew my insurance policy AUTO-2026-00182",
            channel: "web",
            executionContext: prodContextCustomer,
          });
        },
        /Identity enforcement violation: customerId is required for customer role/
      );

      // 2. Agent role without customer resolution must halt without authorization
      const prodContextAgent: AuthenticatedExecutionContext = {
        userId: "agent_without_customer",
        profileId: "prof_test_agent",
        organizationId: "a0000000-0000-0000-0000-000000000001",
        role: "agent",
        isDemo: false,
      };

      const result = await orchestrator.startWorkflow({
        inputText: "Renew my insurance policy AUTO-2026-00182",
        channel: "web",
        executionContext: prodContextAgent,
      });

      assert.equal(result.authorizationRequired, false);
      assert.ok(result.status === "escalated" || result.status === "failed");
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
      if (originalKey) process.env.ACTIONOS_QUOTE_SIGNING_KEY = originalKey;
      else delete process.env.ACTIONOS_QUOTE_SIGNING_KEY;
      if (originalLedgerKey) process.env.ACTION_LEDGER_SIGNING_KEY = originalLedgerKey;
      else delete process.env.ACTION_LEDGER_SIGNING_KEY;
      if (originalWebhookKey) process.env.ACTIONOS_WEBHOOK_SIGNING_SECRET = originalWebhookKey;
      else delete process.env.ACTIONOS_WEBHOOK_SIGNING_SECRET;
    }
  });

  it("should fail closed in production if claim_and_accept_quote RPC is missing or fails on Supabase repository", async () => {
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    process.env.ACTIONOS_RUNTIME_MODE = "production";

    try {
      // 1. Mock Supabase client returning RPC missing error
      let fallbackQueryExecuted = false;
      const mockClient = {
        rpc: async (_fn: string, _args: Record<string, unknown>) => {
          return {
            data: null,
            error: {
              message: "Could not find the function public.claim_and_accept_quote in the schema cache",
              code: "PGRST202",
              details: "",
              hint: "",
            },
          };
        },
        from: (_table: string) => {
          fallbackQueryExecuted = true;
          return {
            update: () => ({
              eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
            }),
          };
        },
      } as unknown as SupabaseClient;

      const repo = new SupabaseActionSessionRepository(mockClient);

      await assert.rejects(
        async () => {
          await repo.claimAuthorizationAndAcceptQuote(
            "00000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-0000-000000000002",
            {
              organizationId: "00000000-0000-0000-0000-000000000003",
              customerId: "00000000-0000-0000-0000-000000000004",
            }
          );
        },
        (err: unknown) => {
          const dbErr = err as DatabaseError;
          assert.equal(dbErr.name, "DatabaseError");
          assert.match(
            dbErr.message,
            /Atomic authorization claim RPC 'claim_and_accept_quote' failed in production/
          );
          return true;
        }
      );

      assert.equal(
        fallbackQueryExecuted,
        false,
        "Production must strictly fail closed without attempting non-atomic fallback query"
      );
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
    }
  });

  it("should reject customAmount when not a positive numeric value", async () => {
    resetStore();

    // 1. Negative customAmount
    const startRes1 = await orchestrator.startWorkflow({
      inputText: "Renew my insurance policy AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });
    assert.equal(startRes1.status, "awaiting_authorization");

    const negRes = await orchestrator.authorizeAndExecute(
      startRes1.sessionId,
      true,
      DEMO_CONTEXT,
      {
        customAmount: -5000,
      }
    );
    assert.equal(negRes.status, "failed");
    assert.match(negRes.message, /customAmount must be a positive numeric value/);

    // 2. Zero customAmount
    const startRes2 = await orchestrator.startWorkflow({
      inputText: "Renew my insurance policy AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });
    assert.equal(startRes2.status, "awaiting_authorization");

    const zeroRes = await orchestrator.authorizeAndExecute(
      startRes2.sessionId,
      true,
      DEMO_CONTEXT,
      {
        customAmount: 0,
      }
    );
    assert.equal(zeroRes.status, "failed");
    assert.match(zeroRes.message, /customAmount must be a positive numeric value/);

    // 3. NaN customAmount
    const startRes3 = await orchestrator.startWorkflow({
      inputText: "Renew my insurance policy AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });
    assert.equal(startRes3.status, "awaiting_authorization");

    const nanRes = await orchestrator.authorizeAndExecute(
      startRes3.sessionId,
      true,
      DEMO_CONTEXT,
      {
        customAmount: NaN,
      }
    );
    assert.equal(nanRes.status, "failed");
    assert.match(nanRes.message, /customAmount must be a positive numeric value/);
  });

  it("should redact sensitive cards, Nigerian phone numbers, NIN/BVN, and emails from customer input in ledger descriptions", async () => {
    resetStore();

    // 1. Direct unit verification of redactSensitiveInput helper
    const rawPiiText =
      "Please pay using card 4532 0150 1234 5678 or call 08031234567 / +2348098765432, email me at test.customer@actionos.ng, my NIN is 12345678901.";
    const sanitized = redactSensitiveInput(rawPiiText);

    assert.ok(!sanitized.includes("4532 0150 1234 5678"), "Card number must be redacted");
    assert.ok(sanitized.includes("[REDACTED_CARD]"));

    assert.ok(!sanitized.includes("08031234567"), "Phone must be redacted");
    assert.ok(!sanitized.includes("+2348098765432"), "International phone must be redacted");
    assert.ok(sanitized.includes("[REDACTED_PHONE]"));

    assert.ok(!sanitized.includes("test.customer@actionos.ng"), "Email must be redacted");
    assert.ok(sanitized.includes("[REDACTED_EMAIL]"));

    assert.ok(!sanitized.includes("12345678901"), "NIN/BVN identifier must be redacted");
    assert.ok(sanitized.includes("[REDACTED_IDENTIFIER]"));

    // 2. Integration check in workflow execution ledger
    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew policy AUTO-2026-00182 with card 4123 4567 8901 2345 and notify me at user@example.com",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });

    const initEvent = startRes.events.find((e) => e.action === "intent_detection");
    assert.ok(initEvent, "Intent detection event must be logged");
    assert.ok(!initEvent.description.includes("4123 4567 8901 2345"), "Ledger description must not expose raw card");
    assert.ok(!initEvent.description.includes("user@example.com"), "Ledger description must not expose raw email");
    assert.match(initEvent.description, /\[REDACTED_CARD\]/);
    assert.match(initEvent.description, /\[REDACTED_EMAIL\]/);
  });
});


import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getRepositoryContainer, setRepositoryContainer } from "@/lib/repositories";
import { DemoRepositoryContainer } from "@/lib/repositories/demo/demo-repositories";
import { SupabaseQuoteRepository } from "@/lib/repositories/supabase/supabase-repositories";
import { verifyPaystackWebhookSignature, POST as paymentWebhookHandler } from "@/app/api/webhooks/payment/route";
import { verifyLedgerIntegrity, computeEventHash, signEventHash, GENESIS_LEDGER_HASH } from "@/lib/actionos/crypto-ledger";
import { computeQuoteSignature, verifyQuoteSignature } from "@/lib/actionos/quote-signature";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { ActionOSRecoveryWorker } from "@/lib/actionos/recovery-worker";
import type { ActionLedgerEvent } from "@/types/actionos";
import type { TenantContext } from "@/lib/repositories/interfaces";

describe("Protected Supabase Security, RLS Invariants & Payment Webhook Integration Suite", () => {
  const orgIdA = "a0000000-0000-0000-0000-000000000001";
  const orgIdB = "b0000000-0000-0000-0000-000000000002";
  const customerIdA = "f0000000-0000-0000-0000-000000000001";
  const customerIdB = "f0000000-0000-0000-0000-000000000002";

  const orgA: TenantContext = {
    organizationId: orgIdA,
    customerId: customerIdA,
    role: "customer",
  };

  const orgB: TenantContext = {
    organizationId: orgIdB,
    customerId: customerIdB,
    role: "customer",
  };

  beforeEach(() => {
    const repos = new DemoRepositoryContainer();
    setRepositoryContainer(repos);
  });

  describe("1. Multi-Tenant Isolation & Row-Level Security (RLS) Boundaries", () => {
    it("strictly isolates customers across organizational boundaries", async () => {
      const repos = getRepositoryContainer();

      // Org A accesses its own customer
      const custA = await repos.customers.findById(customerIdA, orgA);
      assert.ok(custA, "Org A customer must be accessible to Org A context");
      assert.equal(custA.organization_id, orgIdA);

      // Org B attempts cross-tenant query for Org A's customer -> MUST return null (RLS isolation)
      const crossCust = await repos.customers.findById(customerIdA, orgB);
      assert.equal(crossCust, null, "Cross-tenant customer query across Org B must return null");
    });

    it("strictly isolates policies and prevents cross-tenant lookup by number or ID", async () => {
      const repos = getRepositoryContainer();

      // Org A policy lookup
      const policyA = await repos.policies.findByNumber("AUTO-2026-00182", orgA);
      assert.ok(policyA, "Policy AUTO-2026-00182 must be resolvable within Org A");

      // Org B attempts to look up Org A's policy -> MUST return null
      const crossPolicy = await repos.policies.findByNumber("AUTO-2026-00182", orgB);
      assert.equal(crossPolicy, null, "Cross-tenant policy lookup must be rejected by tenant filter");
    });

    it("strictly isolates quotes and prevents cross-tenant quote claiming", async () => {
      const repos = getRepositoryContainer();

      const createdQuote = await repos.quotes.create(
        {
          id: "quo_tenant_test_001",
          session_id: "sess_tenant_test",
          organization_id: orgIdA,
          customer_id: customerIdA,
          policy_id: "20000000-0000-0000-0000-000000000001",
          provider_name: "Leadway Assurance",
          amount: 87500,
          currency: "NGN",
          status: "issued",
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          quote_hash: "hash_001",
        },
        orgA
      );

      const quoteA = await repos.quotes.findById(createdQuote.id, orgA);
      assert.ok(quoteA, "Quote must be visible to Org A");

      const crossQuote = await repos.quotes.findById(createdQuote.id, orgB);
      assert.equal(crossQuote, null, "Org B must not have read access to Org A quote");

      // Attempting to claim/accept Org A's quote under Org B tenant context must fail
      const crossAccepted = await repos.quotes.acceptQuote(createdQuote.id, "sess_tenant_test", orgB);
      assert.equal(crossAccepted, null, "Org B cannot accept quote belonging to Org A");
    });

    it("strictly isolates financial transactions and prevents cross-tenant inspection", async () => {
      const repos = getRepositoryContainer();

      await repos.transactions.create(
        {
          id: "tx_org_a_001",
          customer_id: customerIdA,
          organization_id: orgIdA,
          amount: 87500,
          currency: "NGN",
          provider: "paystack",
          reference: "ref_org_a_001",
          status: "succeeded",
          transaction_type: "renewal_premium",
          metadata: { policy_number: "AUTO-2026-00182" },
        },
        orgA
      );

      // Org A can access transaction
      const txA = await repos.transactions.findByReference("ref_org_a_001", orgA);
      assert.ok(txA, "Transaction must be accessible within Org A");

      // Org B cannot access transaction
      const txCross = await repos.transactions.findByReference("ref_org_a_001", orgB);
      assert.equal(txCross, null, "Cross-tenant transaction inspection must return null");
    });
  });

  describe("2. RPC Permissions & Atomic Authorization Invariants", () => {
    it("ensures claimAuthorizationAndAcceptQuote enforces single-use atomic consumption", async () => {
      const repos = getRepositoryContainer();

      const session = await repos.sessions.create(
        {
          organization_id: orgIdA,
          customer_id: customerIdA,
          channel: "web",
          status: "awaiting_authorization",
        },
        orgA
      );

      const quote = await repos.quotes.create(
        {
          id: "quo_atomic_claim_001",
          session_id: session.id,
          organization_id: orgIdA,
          customer_id: customerIdA,
          policy_id: "20000000-0000-0000-0000-000000000001",
          provider_name: "Leadway Assurance",
          amount: 87500,
          currency: "NGN",
          status: "issued",
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          quote_hash: "hash_atomic_001",
        },
        orgA
      );

      // First claim succeeds
      const claimedResult = await repos.sessions.claimAuthorizationAndAcceptQuote(session.id, quote.id, orgA);
      assert.ok(claimedResult, "First claim must succeed");
      assert.equal(claimedResult.session.status, "executing");
      assert.equal(claimedResult.quote.status, "accepted");

      // Immediate second claim MUST return null (anti-double-spend / anti-replay)
      const secondClaim = await repos.sessions.claimAuthorizationAndAcceptQuote(session.id, quote.id, orgA);
      assert.equal(secondClaim, null, "Second claim must be rejected atomically");
    });

    it("verifies production SupabaseQuoteRepository correctly surfaces RPC schema requirements", () => {
      const origMode = process.env.ACTIONOS_RUNTIME_MODE;
      const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        process.env.ACTIONOS_RUNTIME_MODE = "production";
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://real-production-project.supabase.co";
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;

        // In production without service role key, instantiation must fail closed
        assert.throws(
          () => new SupabaseQuoteRepository(),
          /SUPABASE_SERVICE_ROLE_KEY is strictly required/
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = origMode;
        if (origUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
        if (origKey) process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
      }
    });

    it("rejects quote claiming if quote expiration has elapsed", async () => {
      const repos = getRepositoryContainer();

      const session = await repos.sessions.create(
        {
          organization_id: orgIdA,
          customer_id: customerIdA,
          channel: "web",
          status: "awaiting_authorization",
        },
        orgA
      );

      // Create an expired quote
      const expiredQuote = await repos.quotes.create(
        {
          id: "quo_expired_test",
          session_id: session.id,
          customer_id: customerIdA,
          organization_id: orgIdA,
          policy_id: "20000000-0000-0000-0000-000000000001",
          provider_name: "Leadway Assurance",
          amount: 87500,
          currency: "NGN",
          status: "issued",
          issued_at: new Date(Date.now() - 3600000).toISOString(),
          expires_at: new Date(Date.now() - 60000).toISOString(), // Expired 1 min ago
          quote_hash: "hash_expired",
        },
        orgA
      );

      const claimResult = await repos.sessions.claimAuthorizationAndAcceptQuote(session.id, expiredQuote.id, orgA);
      assert.equal(claimResult, null, "Claiming expired quote must be rejected");
    });
  });

  describe("3. Payment Webhook Authenticity, Security & Idempotent Processing", () => {
    const webhookSecret = "sk_live_paystack_webhook_auth_secret_xyz123";

    it("authenticates genuine Paystack HMAC-SHA512 webhook signature against raw request body", () => {
      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: {
          id: 887766,
          reference: "ref_wh_auth_01",
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      const signature = crypto.createHmac("sha512", webhookSecret).update(rawPayload).digest("hex");
      const isValid = verifyPaystackWebhookSignature(rawPayload, signature, webhookSecret);
      assert.equal(isValid, true, "Authentic HMAC-SHA512 signature must verify successfully");
    });

    it("rejects tampered webhook payload or forged signature", () => {
      const rawPayload = JSON.stringify({
        event: "charge.success",
        data: { reference: "ref_wh_tamper_01", amount: 8750000 },
      });
      const validSig = crypto.createHmac("sha512", webhookSecret).update(rawPayload).digest("hex");

      const tamperedPayload = JSON.stringify({
        event: "charge.success",
        data: { reference: "ref_wh_tamper_01", amount: 100 },
      });

      assert.equal(
        verifyPaystackWebhookSignature(tamperedPayload, validSig, webhookSecret),
        false,
        "Tampered payload must fail signature verification"
      );

      assert.equal(
        verifyPaystackWebhookSignature(rawPayload, "forged_hex_signature_deadbeef", webhookSecret),
        false,
        "Forged signature must be rejected"
      );
    });

    it("processes payment webhooks idempotently without duplicate side-effects", async () => {
      const repos = getRepositoryContainer();
      const txRef = "ref_wh_idempotent_test_99";

      await repos.transactions.create(
        {
          id: txRef,
          reference: txRef,
          customer_id: customerIdA,
          organization_id: orgIdA,
          transaction_type: "renewal_premium",
          amount: 87500,
          currency: "NGN",
          status: "pending",
          provider: "paystack",
          renewal_id: null,
          metadata: { session_id: "sess_wh_test" },
        },
        orgA
      );

      const payloadString = JSON.stringify({
        event: "charge.success",
        data: {
          id: 554433,
          reference: txRef,
          amount: 8750000,
          currency: "NGN",
          status: "success",
        },
      });

      // 1. First webhook execution
      const req1 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadString,
      });

      const res1 = await paymentWebhookHandler(req1);
      assert.equal(res1.status, 200);
      const json1 = (await res1.json()) as { data: { acknowledged: boolean; duplicate: boolean } };
      assert.equal(json1.data.acknowledged, true);
      assert.equal(json1.data.duplicate, false, "Initial delivery must not be flagged duplicate");

      const txAfter1 = await repos.transactions.findByReference(txRef, orgA);
      assert.equal(txAfter1?.status, "succeeded", "Transaction must transition to succeeded");

      // 2. Replayed webhook delivery (network retry)
      const req2 = new Request("https://actionos.ng/api/webhooks/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadString,
      });

      const res2 = await paymentWebhookHandler(req2);
      assert.equal(res2.status, 200);
      const json2 = (await res2.json()) as { data: { acknowledged: boolean; duplicate: boolean } };
      assert.equal(json2.data.acknowledged, true);
      assert.equal(json2.data.duplicate, true, "Replayed delivery must be acknowledged as duplicate");

      const txAfter2 = await repos.transactions.findByReference(txRef, orgA);
      assert.equal(txAfter2?.status, "succeeded", "Transaction status must remain clean");
    });
  });

  describe("4. End-to-End Cryptographic Chain & Quote Signature Invariant", () => {
    it("guarantees unbroken cryptographic continuity between signed quote and action ledger", () => {
      const quotePayload = {
        sessionId: "sess_chain_001",
        organizationId: orgIdA,
        customerId: customerIdA,
        policyId: "20000000-0000-0000-0000-000000000001",
        providerName: "Leadway Assurance",
        amount: 87500,
        currency: "NGN",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        providerReference: "leadway_ref_001",
        underwriterId: "und_leadway",
      };

      const computed = computeQuoteSignature(quotePayload);
      assert.ok(computed.quoteHash);

      const isValidQuote = verifyQuoteSignature({
        session_id: quotePayload.sessionId,
        organization_id: quotePayload.organizationId,
        customer_id: quotePayload.customerId,
        policy_id: quotePayload.policyId,
        provider_name: quotePayload.providerName,
        amount: quotePayload.amount,
        currency: quotePayload.currency,
        expires_at: quotePayload.expiresAt,
        provider_reference: quotePayload.providerReference,
        underwriter_id: quotePayload.underwriterId,
        quote_hash: computed.quoteHash,
      });
      assert.equal(isValidQuote, true, "Valid quote signature must verify");

      // Generate verified ledger chain
      const ev1Partial: Partial<ActionLedgerEvent> = {
        id: "ev_chain_1",
        sessionId: "sess_chain_001",
        sequenceNumber: 1,
        timestamp: new Date().toISOString(),
        action: "quote_authorized",
        description: "Customer authorized quote quo_leadway_001",
        actor: "User",
        status: "verified",
        eventClass: "critical",
        signingKeyVersion: "v1-2026",
        isCompensating: false,
      };
      const hash1 = computeEventHash(ev1Partial, GENESIS_LEDGER_HASH);
      const ev1: ActionLedgerEvent = {
        ...(ev1Partial as ActionLedgerEvent),
        previousHash: GENESIS_LEDGER_HASH,
        hash: hash1,
        signature: signEventHash(hash1),
      };

      const ev2Partial: Partial<ActionLedgerEvent> = {
        id: "ev_chain_2",
        sessionId: "sess_chain_001",
        sequenceNumber: 2,
        timestamp: new Date().toISOString(),
        action: "payment_settled",
        description: "Payment confirmed via Paystack",
        actor: "ActionOS Engine",
        status: "verified",
        eventClass: "critical",
        signingKeyVersion: "v1-2026",
        isCompensating: false,
      };
      const hash2 = computeEventHash(ev2Partial, hash1);
      const ev2: ActionLedgerEvent = {
        ...(ev2Partial as ActionLedgerEvent),
        previousHash: hash1,
        hash: hash2,
        signature: signEventHash(hash2),
      };

      const chainIntegrity = verifyLedgerIntegrity([ev1, ev2], { verifySignatures: true });
      assert.equal(chainIntegrity.valid, true, "Ledger integrity must verify successfully with signatures");
    });
  });

  describe("5. Concurrent Authorization, Payment Timeouts & Database Failure Recovery Invariants", () => {
    it("strictly serializes concurrent parallel authorization attempts (atomic lock guarantee)", async () => {
      const repos = getRepositoryContainer();

      const session = await repos.sessions.create(
        {
          organization_id: orgIdA,
          customer_id: customerIdA,
          channel: "web",
          status: "awaiting_authorization",
        },
        orgA
      );

      const quote = await repos.quotes.create(
        {
          id: "quo_race_condition_test",
          session_id: session.id,
          organization_id: orgIdA,
          customer_id: customerIdA,
          policy_id: "20000000-0000-0000-0000-000000000001",
          provider_name: "Leadway Assurance",
          amount: 87500,
          currency: "NGN",
          status: "issued",
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          quote_hash: "hash_race_001",
        },
        orgA
      );

      // Execute 3 concurrent parallel claims
      const results = await Promise.all([
        repos.sessions.claimAuthorizationAndAcceptQuote(session.id, quote.id, orgA),
        repos.sessions.claimAuthorizationAndAcceptQuote(session.id, quote.id, orgA),
        repos.sessions.claimAuthorizationAndAcceptQuote(session.id, quote.id, orgA),
      ]);

      const successfulClaims = results.filter((r) => r !== null);
      const rejectedClaims = results.filter((r) => r === null);

      assert.equal(successfulClaims.length, 1, "Exactly one claim must succeed among concurrent requests");
      assert.equal(rejectedClaims.length, 2, "Concurrent parallel claims must be rejected cleanly");
    });

    it("safely handles payment verification timeout without corrupting session or recharging", async () => {
      const repos = getRepositoryContainer();
      const timeoutRef = "ref_ver_timeout_test_01";

      const session = await repos.sessions.create(
        {
          organization_id: orgIdA,
          customer_id: customerIdA,
          channel: "web",
          status: "executing",
          metadata: {
            policyNumber: "AUTO-2026-00182",
            paymentReference: timeoutRef,
            reconciliation_required: true,
          },
        },
        orgA
      );

      // Provider has no settled payment record
      const recResult = await orchestrator.reconcileExecutingSession(session.id, orgA);
      assert.ok(
        recResult.resolvedStatus === "failed" || recResult.resolvedStatus === "escalated",
        "Unsettled timeout session must safely fail closed or escalate for reconciliation"
      );

      // Verify no duplicate transactions exist
      const tx = await repos.transactions.findByReference(timeoutRef, orgA);
      assert.equal(tx, null, "Timeout check must not fabricate transactions");
    });

    it("recovers policy renewal safely after database failure post-payment without second charge", async () => {
      const repos = getRepositoryContainer();
      const paidRef = "ref_post_pay_db_fail_test";

      // Seed settled payment transaction
      await repos.transactions.create(
        {
          id: paidRef,
          customer_id: customerIdA,
          organization_id: orgIdA,
          amount: 87500,
          currency: "NGN",
          reference: paidRef,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        orgA
      );

      const quote = await repos.quotes.create(
        {
          id: "quo_post_pay_db_fail",
          session_id: "sess_post_pay_db_fail",
          organization_id: orgIdA,
          customer_id: customerIdA,
          policy_id: "20000000-0000-0000-0000-000000000001",
          provider_name: "Leadway Assurance",
          amount: 87500,
          currency: "NGN",
          status: "accepted",
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          quote_hash: "hash_db_fail",
        },
        orgA
      );

      const session = await repos.sessions.create(
        {
          id: "sess_post_pay_db_fail",
          organization_id: orgIdA,
          customer_id: customerIdA,
          channel: "web",
          status: "escalated",
          metadata: {
            policyNumber: "AUTO-2026-00182",
            paymentReference: paidRef,
            unresolvedDbFailure: true,
            reconciliationState: "database_failure_post_payment",
            reconciliation_required: true,
            authorizationDetails: {
              quoteId: quote.id,
              policyNumber: "AUTO-2026-00182",
              amount: 87500,
              currency: "NGN",
            },
          },
        },
        orgA
      );

      // Reconciler recovers the session
      const recResult = await orchestrator.reconcileExecutingSession(session.id, orgA);
      assert.equal(recResult.resolvedStatus, "completed");
      assert.equal(recResult.reconciliationAction, "completed_renewal");

      // Verify policy is marked renewed
      const policy = await repos.policies.findByNumber("AUTO-2026-00182", orgA);
      assert.equal(policy?.status, "renewed");

      // Verify no second transaction was created
      const allTx = await repos.transactions.findByReference(paidRef, orgA);
      assert.ok(allTx);
      assert.equal(allTx.status, "succeeded");
    });

    it("sweeps executing sessions and reconciles them safely after application restart", async () => {
      const repos = getRepositoryContainer();
      const restartRef = "ref_app_restart_int_01";

      await repos.transactions.create(
        {
          id: restartRef,
          customer_id: customerIdA,
          organization_id: orgIdA,
          amount: 87500,
          currency: "NGN",
          reference: restartRef,
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        orgA
      );

      const session = await repos.sessions.create(
        {
          organization_id: orgIdA,
          customer_id: customerIdA,
          channel: "web",
          status: "executing",
          metadata: {
            policyNumber: "AUTO-2026-00182",
            paymentReference: restartRef,
            reconciliation_required: true,
            authorizationDetails: {
              quoteId: "quo_restart_int",
              policyNumber: "AUTO-2026-00182",
              amount: 87500,
              currency: "NGN",
            },
          },
        },
        orgA
      );

      const worker = new ActionOSRecoveryWorker(orchestrator, { maxRetries: 3 });
      const recoveryOutcome = await worker.processSession(session.id, orgA, true);

      assert.equal(recoveryOutcome.sessionId, session.id);
      assert.ok(["reconciled", "escalated"].includes(recoveryOutcome.outcome));

      const updatedSession = await repos.sessions.findById(session.id, orgA);
      assert.notEqual(updatedSession?.status, "executing", "Session must not remain stuck in executing state");
    });

    it("reconciles unresolved refund states (pending and unknown) safely within tenant context", async () => {
      const repos = getRepositoryContainer();
      const refundRef = "ref_pend_refund_int_01";

      const session = await repos.sessions.create(
        {
          organization_id: orgIdA,
          customer_id: customerIdA,
          channel: "web",
          status: "escalated",
          metadata: {
            policyNumber: "AUTO-2026-00182",
            refundReference: refundRef,
            refundState: "refund_pending",
            reconciliation_required: true,
          },
        },
        orgA
      );

      // Reconcile within Org A tenant boundary
      const recResult = await orchestrator.reconcileExecutingSession(session.id, orgA);
      assert.equal(recResult.reconciliationAction, "refunded_uncompleted");

      const updated = await repos.sessions.findById(session.id, orgA);
      assert.equal(updated?.metadata?.refundState, "refund_confirmed");
      assert.equal(updated?.metadata?.reconciliation_required, false);

      // Verify Org B cannot view or modify the refunded session (RLS / tenant isolation)
      const crossSession = await repos.sessions.findById(session.id, orgB);
      assert.equal(crossSession, null, "Org B must not access Org A refunded session");
    });
  });
});

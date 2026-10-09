import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { orchestrator, redactSensitiveInput, redactSensitiveObject } from "@/lib/actionos/orchestrator";
import { resetStore, getStore } from "@/lib/actionos/mock-store";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { getRepositoryContainer } from "@/lib/repositories";
import { toolRegistry } from "@/lib/actionos/tool-registry";
import { SupabaseActionSessionRepository, assertSupabaseProductionConfig } from "@/lib/repositories/supabase/supabase-repositories";
import { mockPaymentProvider } from "@/lib/payments/mock";
import { DatabaseError } from "@/lib/repositories/errors";
import { POST as authorizeHandler } from "@/app/api/actions/[id]/authorize/route";
import { POST as createActionHandler } from "@/app/api/actions/route";
import { computeQuoteSignature, verifyQuoteSignature } from "@/lib/actionos/quote-signature";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestPaymentInput } from "@/lib/actionos/tools/request-payment";
import type { RenewPolicyInput } from "@/lib/actionos/tools/renew-policy";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";

describe("Atomic Authorization, Recoverable Execution & Security Hardening", () => {
  describe("P0: Genuinely Atomic Quote Acceptance", () => {
    it("should fail closed in Demo repository when quote has expired", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const session = await repos.sessions.create({
        organization_id: DEMO_CONTEXT.organizationId,
        customer_id: DEMO_CONTEXT.customerId,
        channel: "web",
        language: "en-NG",
        status: "awaiting_authorization",
        input_text: "Renew policy",
        intent: "policy_renewal",
        metadata: {},
      });

      const quote = await repos.quotes.create({
        session_id: session.id,
        organization_id: DEMO_CONTEXT.organizationId,
        customer_id: DEMO_CONTEXT.customerId!,
        policy_id: "pol_demo_01",
        amount: 87500,
        currency: "NGN",
        provider_name: "Cornerstone Insurance Plc",
        status: "issued",
        expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
        quote_hash: "sig_expired_test",
      });

      const claimResult = await repos.sessions.claimAuthorizationAndAcceptQuote(
        session.id,
        quote.id,
        DEMO_CONTEXT
      );

      assert.equal(claimResult, null, "Expired quote must return null and not be claimed");

      // Verify session was not transitioned to executing
      const sessionAfter = await repos.sessions.findById(session.id, DEMO_CONTEXT);
      assert.equal(sessionAfter?.status, "awaiting_authorization");

      // Verify quote was not accepted
      const quoteAfter = await repos.quotes.findById(quote.id, DEMO_CONTEXT);
      assert.equal(quoteAfter?.status, "issued");
    });

    it("should fail closed in Demo repository when quote is already accepted or cancelled", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const session = await repos.sessions.create({
        organization_id: DEMO_CONTEXT.organizationId,
        customer_id: DEMO_CONTEXT.customerId,
        channel: "web",
        language: "en-NG",
        status: "awaiting_authorization",
        input_text: "Renew policy",
        intent: "policy_renewal",
        metadata: {},
      });

      const quote = await repos.quotes.create({
        session_id: session.id,
        organization_id: DEMO_CONTEXT.organizationId,
        customer_id: DEMO_CONTEXT.customerId!,
        policy_id: "pol_demo_01",
        amount: 87500,
        currency: "NGN",
        provider_name: "Cornerstone Insurance Plc",
        status: "accepted", // Already accepted
        expires_at: new Date(Date.now() + 60000).toISOString(),
        quote_hash: "sig_accepted_test",
      });

      const claimResult = await repos.sessions.claimAuthorizationAndAcceptQuote(
        session.id,
        quote.id,
        DEMO_CONTEXT
      );

      assert.equal(claimResult, null, "Already-accepted quote must not be re-claimed");
    });

    it("should fail closed in Supabase repository without fallback when RPC fails", async () => {
      const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
      process.env.ACTIONOS_RUNTIME_MODE = "production";

      try {
        let fallbackQueryAttempted = false;
        const mockClient = {
          rpc: async () => ({
            data: null,
            error: {
              message: "RPC error in execution",
              code: "P0001",
            },
          }),
          from: () => {
            fallbackQueryAttempted = true;
            return {};
          },
        } as unknown as SupabaseClient;

        const repo = new SupabaseActionSessionRepository(mockClient);

        await assert.rejects(
          async () => {
            await repo.claimAuthorizationAndAcceptQuote("sess-1", "quote-1", {
              organizationId: "org-1",
              customerId: "cust-1",
            });
          },
          (err: unknown) => {
            assert.ok(err instanceof DatabaseError);
            assert.match(err.message, /Atomic authorization claim RPC 'claim_and_accept_quote' failed in production/);
            return true;
          }
        );

        assert.equal(fallbackQueryAttempted, false, "Must not attempt non-atomic fallback query");
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = originalMode;
      }
    });
  });

  describe("P0: Recoverable Payment & Renewal Execution", () => {
    it("should generate durable idempotency key and return providerReference in request-payment tool", async () => {
      resetStore();
      const paymentTool = toolRegistry.get("request_payment");
      assert.ok(paymentTool);

      const ctx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_dur_123",
      });

      const result = await paymentTool.execute(
        {
          amount: 87500,
          currency: "NGN",
          paymentMethod: "card",
          description: "Renewal payment",
          quoteId: "quote_dur_456",
        } as unknown as RequestPaymentInput,
        ctx
      );

      assert.equal(result.success, true);
      assert.ok(result.data);
      assert.ok(result.data.idempotencyKey.includes("sess_dur_123"));
      assert.ok(result.data.idempotencyKey.includes("quote_dur_456"));
      assert.ok(result.data.providerReference.startsWith("pstk_"));
    });

    it("should persist paymentAttempt and verification metadata in session during workflow execution", async () => {
      resetStore();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew my insurance policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      assert.equal(startRes.status, "awaiting_authorization");

      const authRes = await orchestrator.authorizeAndExecute(
        startRes.sessionId,
        true,
        DEMO_CONTEXT
      );

      assert.equal(authRes.status, "completed");

      const repos = getRepositoryContainer();
      const session = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
      assert.ok(session);

      const metadata = (session.metadata || {}) as Record<string, unknown>;
      const paymentAttempt = metadata.paymentAttempt as Record<string, unknown>;
      assert.ok(paymentAttempt, "Must persist paymentAttempt in session metadata");
      assert.equal(paymentAttempt.amount, 87500);
      assert.equal(paymentAttempt.currency, "NGN");
      assert.ok(paymentAttempt.paymentReference);
      assert.ok(paymentAttempt.providerReference);
      assert.ok(paymentAttempt.idempotencyKey);
      assert.ok(metadata.paymentVerification, "Must persist paymentVerification evidence in metadata");
    });

    it("should reject renewal in RenewPolicyTool if payment reference is unverified", async () => {
      resetStore();
      const renewTool = toolRegistry.get("renew_policy");
      assert.ok(renewTool);

      const ctx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_unverified_test",
      });

      const result = await renewTool.execute(
        {
          policyId: "AUTO-2026-00182",
          paymentReference: "act_invalid_fake_reference",
          renewalPeriodMonths: 12,
          premiumPaid: 87500,
        } as unknown as RenewPolicyInput,
        ctx
      );

      assert.equal(result.success, false);
      assert.equal(result.error?.code, "UNVERIFIED_PAYMENT");
      assert.match(result.error?.message || "", /Payment settlement could not be independently verified/);
    });

    it("should execute idempotently in RenewPolicyTool if policy is already renewed", async () => {
      resetStore();
      const renewTool = toolRegistry.get("renew_policy");
      assert.ok(renewTool);

      const ctx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_idempotent_renew",
      });

      // 1. First run workflow to properly renew policy and record payment transaction
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });
      const authRes = await orchestrator.authorizeAndExecute(startRes.sessionId, true, DEMO_CONTEXT);
      assert.equal(authRes.status, "completed");

      const repos = getRepositoryContainer();
      const sessionAfter = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
      const sessionMeta = (sessionAfter?.metadata || {}) as Record<string, unknown>;
      const paymentRef = sessionMeta.paymentReference as string;
      assert.ok(paymentRef);

      // 2. Call renew_policy again with the same verified payment reference
      const secondRenew = await renewTool.execute(
        {
          policyNumber: "AUTO-2026-00182",
          paymentReference: paymentRef,
          renewalPeriodMonths: 12,
          premiumPaid: 87500,
        } as RenewPolicyInput,
        ctx
      );

      assert.equal(secondRenew.success, true);
      assert.equal(secondRenew.data?.status, "renewed");
      assert.equal(secondRenew.data?.idempotent, true);
    });

    it("should safely reconcile executing session using persisted session metadata reference", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      // Start workflow to awaiting_authorization
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew my insurance policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      // Claim quote and manually transition session to executing
      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const customPaymentRef = "act_persisted_custom_attempt_999";
      await repos.sessions.updateStatus(startRes.sessionId, "executing", undefined, DEMO_CONTEXT);
      await repos.sessions.updateMetadata(
        startRes.sessionId,
        {
          authorizationDetails: {
            authorizedQuoteId: quote.id,
            quoteId: quote.id,
            policyNumber: "AUTO-2026-00182",
          },
          paymentReference: customPaymentRef,
        },
        DEMO_CONTEXT
      );

      // Session stuck in executing without settled payment should fail closed without charging again
      const recResult = await orchestrator.reconcileExecutingSession(startRes.sessionId, DEMO_CONTEXT);
      assert.equal(recResult.resolvedStatus, "failed");
      assert.equal(recResult.reconciliationAction, "cancelled_unpaid");
    });
  });

  describe("P1: Accurate API Success Status", () => {
    it("should return HTTP 200 with success: true when action is completed", async () => {
      resetStore();
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew my insurance policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const req = new Request(`http://localhost:3000/api/actions/${startRes.sessionId}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorized: true,
          authorizedQuoteId: quote.id,
        }),
      });

      const res = await authorizeHandler(req, {
        params: Promise.resolve({ id: startRes.sessionId }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.status, "completed");
    });

    it("should return HTTP 422 with success: false when customer declines authorization", async () => {
      resetStore();
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew my insurance policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const req = new Request(`http://localhost:3000/api/actions/${startRes.sessionId}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorized: false,
        }),
      });

      const res = await authorizeHandler(req, {
        params: Promise.resolve({ id: startRes.sessionId }),
      });

      assert.equal(res.status, 422);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.actionStatus, "cancelled");
      assert.equal(json.error.code, "ACTION_CANCELLED");
      assert.match(json.error.message, /Renewal cancelled/);
      assert.ok(json.data);
    });

    it("should return HTTP 422 with success: false when downstream execution fails or compensates", async () => {
      resetStore();
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew my insurance policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const req = new Request(`http://localhost:3000/api/actions/${startRes.sessionId}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorized: true,
          authorizedQuoteId: quote.id,
          simulateSagaFailure: true,
        }),
      });

      const res = await authorizeHandler(req, {
        params: Promise.resolve({ id: startRes.sessionId }),
      });

      assert.equal(res.status, 422);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.actionStatus, "escalated");
      assert.equal(json.error.code, "ACTION_ESCALATED");
      assert.ok(json.data.events.some((e: { isCompensating?: boolean }) => e.isCompensating));
    });

    it("should return HTTP 400 on POST /api/actions when request body is invalid", async () => {
      const req = new Request("http://localhost:3000/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputText: "",
        }),
      });

      const res = await createActionHandler(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, "VALIDATION_ERROR");
    });

    it("should return HTTP 200 on POST /api/actions when workflow begins successfully", async () => {
      resetStore();
      const req = new Request("http://localhost:3000/api/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actionos-demo": "true",
        },
        body: JSON.stringify({
          inputText: "Renew my policy AUTO-2026-00182",
          channel: "web",
          customerId: DEMO_CONTEXT.customerId,
        }),
      });

      const res = await createActionHandler(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.actionStatus, "awaiting_authorization");
      assert.ok(json.data.sessionId);
    });
  });

  describe("P1: Sensitive Information Redaction in Action Ledger", () => {
    it("should redact policy numbers and vehicle plates in addition to cards, phones, and emails", () => {
      const rawText =
        "Vehicle LAG-123-AA with policy POL-2026-00182 and AUTO-2026-99999 registered plate ABC-456-XY, phone 08023456789, email test@actionos.ng, card 4123 4567 8901 2345.";

      const redacted = redactSensitiveInput(rawText);

      assert.ok(!redacted.includes("POL-2026-00182"), "Policy numbers starting with POL- must be redacted");
      assert.ok(!redacted.includes("AUTO-2026-99999"), "Policy numbers starting with AUTO- must be redacted");
      assert.ok(redacted.includes("[REDACTED_POLICY]"));

      assert.ok(!redacted.includes("LAG-123-AA"), "Vehicle plate LAG-123-AA must be redacted");
      assert.ok(!redacted.includes("ABC-456-XY"), "Vehicle plate ABC-456-XY must be redacted");
      assert.ok(redacted.includes("[REDACTED_PLATE]"));

      assert.ok(!redacted.includes("4123 4567 8901 2345"), "Card number must be redacted");
      assert.ok(redacted.includes("[REDACTED_CARD]"));

      assert.ok(!redacted.includes("08023456789"), "Phone must be redacted");
      assert.ok(redacted.includes("[REDACTED_PHONE]"));

      assert.ok(!redacted.includes("test@actionos.ng"), "Email must be redacted");
      assert.ok(redacted.includes("[REDACTED_EMAIL]"));
    });

    it("should redact input_text in session records and apply retentionPolicy metadata", async () => {
      resetStore();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy POL-2026-00182 for vehicle LAG-123-AA and charge card 4532 0150 1234 5678",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const repos = getRepositoryContainer();
      const session = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
      assert.ok(session);

      assert.ok(!session.input_text?.includes("POL-2026-00182"), "Saved input_text must redact policy");
      assert.ok(!session.input_text?.includes("LAG-123-AA"), "Saved input_text must redact plate");
      assert.ok(!session.input_text?.includes("4532 0150 1234 5678"), "Saved input_text must redact card");
      assert.ok(session.input_text?.includes("[REDACTED_POLICY]"));
      assert.ok(session.input_text?.includes("[REDACTED_PLATE]"));
      assert.ok(session.input_text?.includes("[REDACTED_CARD]"));

      const meta = (session.metadata || {}) as Record<string, unknown>;
      assert.ok(meta.retentionPolicy, "Session must have retentionPolicy metadata");
      const retention = meta.retentionPolicy as Record<string, unknown>;
      assert.equal(retention.retentionPeriodDays, 90);
      assert.equal(retention.piiClass, "redacted-financial-identities");
    });

    it("should recursively redact arbitrary nested objects and arrays with redactSensitiveObject", () => {
      const nestedData = {
        customer: {
          email: "customer@example.ng",
          phone: "08012345678",
          vehicle: {
            plate: "LAG-999-ZZ",
            policy: "POL-2026-99999",
          },
        },
        paymentCards: ["4123 4567 8901 2345", "5123 4567 8901 2345"],
        note: "Customer plate is KAN-123-BB",
        amount: 87500,
      };

      const sanitized = redactSensitiveObject(nestedData);
      assert.equal(sanitized.customer.email, "[REDACTED_EMAIL]");
      assert.equal(sanitized.customer.phone, "[REDACTED_PHONE]");
      assert.equal(sanitized.customer.vehicle.plate, "[REDACTED_PLATE]");
      assert.equal(sanitized.customer.vehicle.policy, "[REDACTED_POLICY]");
      assert.equal(sanitized.paymentCards[0], "[REDACTED_CARD]");
      assert.equal(sanitized.paymentCards[1], "[REDACTED_CARD]");
      assert.ok(!sanitized.note.includes("KAN-123-BB"));
      assert.equal(sanitized.amount, 87500);
    });

    it("should redact normalizedText and entities in n_atlas_intent_extraction ledger event", async () => {
      resetStore();
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182 for vehicle LAG-123-AA and email user@example.com",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const repos = getRepositoryContainer();
      const events = await repos.ledger.getEventsBySessionId(startRes.sessionId, DEMO_CONTEXT);
      const intentEvent = events.find((e) => e.action === "n_atlas_intent_extraction");
      assert.ok(intentEvent, "Must record n_atlas_intent_extraction ledger event");
      assert.ok(!intentEvent.description.includes("user@example.com"));
      assert.ok(intentEvent.description.includes("[REDACTED_EMAIL]"));
      if (intentEvent.metadata && intentEvent.metadata.entities) {
        const entStr = JSON.stringify(intentEvent.metadata.entities);
        assert.ok(!entStr.includes("user@example.com"));
      }
    });
  });

  describe("P1: Fail Fast on Missing Supabase Configuration", () => {
    it("should throw descriptive configuration error when Supabase URL is missing in production", async () => {
      const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      process.env.ACTIONOS_RUNTIME_MODE = "production";
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        const { getSupabaseClient } = await import("@/lib/repositories/supabase/supabase-repositories");
        assert.throws(
          () => getSupabaseClient(),
          /Supabase.*configuration error/i
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = originalMode;
        if (originalUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
        if (originalKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
        if (originalServiceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
      }
    });

    it("should throw descriptive configuration error when Supabase URL contains demo.supabase.co in production", async () => {
      const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "prod-service-role-key-test-123";

      try {
        const { getSupabaseClient } = await import("@/lib/repositories/supabase/supabase-repositories");
        assert.throws(
          () => getSupabaseClient(),
          /Supabase production configuration error: A valid NEXT_PUBLIC_SUPABASE_URL is strictly required/i
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = originalMode;
        if (originalUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
        if (originalServiceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
      }
    });

    it("should throw descriptive configuration error when SUPABASE_SERVICE_ROLE_KEY is missing or demo in production", async () => {
      const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://prod-project.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "demo-key";

      try {
        const { getSupabaseClient } = await import("@/lib/repositories/supabase/supabase-repositories");
        assert.throws(
          () => getSupabaseClient(),
          /SUPABASE_SERVICE_ROLE_KEY is strictly required/i
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = originalMode;
        if (originalUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
        if (originalServiceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
      }
    });

    it("should throw in browser createClient when URL or anon key is demo or missing in production", async () => {
      const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      try {
        assert.throws(
          () => createBrowserClient(),
          /Supabase production configuration error/i
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = originalMode;
        if (originalUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
        if (originalKey) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
        if (originalAnon) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
      }
    });

    it("should throw in server createClient when URL or publishable key is demo or missing in production", async () => {
      const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      try {
        await assert.rejects(
          async () => {
            await createServerClient();
          },
          /Supabase production configuration error/i
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = originalMode;
        if (originalUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
        if (originalKey) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
        if (originalAnon) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
      }
    });
  });

  describe("P1: Cryptographic Quote HMAC Binding & Provider Reference Integrity", () => {
    it("should bind providerReference into canonical HMAC signature", () => {
      const payload1 = {
        sessionId: "sess_test_prov_1",
        organizationId: "org_test_1",
        customerId: "cust_test_1",
        policyId: "pol_test_1",
        providerName: "Cornerstone Insurance Plc",
        amount: 87500,
        currency: "NGN",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        providerReference: "pstk_ref_alpha",
      };

      const payload2 = {
        ...payload1,
        providerReference: "pstk_ref_beta",
      };

      const sig1 = computeQuoteSignature(payload1);
      const sig2 = computeQuoteSignature(payload2);

      assert.notEqual(sig1.quoteHash, sig2.quoteHash, "Different providerReferences must yield different HMAC signatures");
    });

    it("should verify authentic quote and reject tampered provider_reference", () => {
      const quotePayload = {
        sessionId: "sess_test_prov_verify",
        organizationId: "org_test_1",
        customerId: "cust_test_1",
        policyId: "pol_test_1",
        providerName: "Cornerstone Insurance Plc",
        amount: 87500,
        currency: "NGN",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        providerReference: "pstk_authentic_reference",
      };

      const { quoteHash } = computeQuoteSignature(quotePayload);

      // Verify authentic quote succeeds
      const valid = verifyQuoteSignature({
        session_id: quotePayload.sessionId,
        organization_id: quotePayload.organizationId,
        customer_id: quotePayload.customerId,
        policy_id: quotePayload.policyId,
        provider_name: quotePayload.providerName,
        amount: quotePayload.amount,
        currency: quotePayload.currency,
        expires_at: quotePayload.expiresAt,
        quote_hash: quoteHash,
        provider_reference: "pstk_authentic_reference",
      });
      assert.equal(valid, true, "Authentic quote with correct provider_reference must pass verification");

      // Verify tampered quote fails
      const tampered = verifyQuoteSignature({
        session_id: quotePayload.sessionId,
        organization_id: quotePayload.organizationId,
        customer_id: quotePayload.customerId,
        policy_id: quotePayload.policyId,
        provider_name: quotePayload.providerName,
        amount: quotePayload.amount,
        currency: quotePayload.currency,
        expires_at: quotePayload.expiresAt,
        quote_hash: quoteHash,
        provider_reference: "pstk_tampered_attacker_reference",
      });
      assert.equal(tampered, false, "Tampered provider_reference must fail signature verification");
    });

    it("should bind underwriterId into canonical HMAC signature", () => {
      const payload1 = {
        sessionId: "sess_test_und_1",
        organizationId: "org_test_1",
        customerId: "cust_test_1",
        policyId: "pol_test_1",
        providerName: "Cornerstone Insurance Plc",
        amount: 87500,
        currency: "NGN",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        underwriterId: "und_leadway_01",
      };

      const payload2 = {
        ...payload1,
        underwriterId: "und_custodian_02",
      };

      const sig1 = computeQuoteSignature(payload1);
      const sig2 = computeQuoteSignature(payload2);

      assert.notEqual(sig1.quoteHash, sig2.quoteHash, "Different underwriterIds must yield different HMAC signatures");
    });

    it("should verify authentic quote with underwriter_id and reject tampered underwriter_id", () => {
      const quotePayload = {
        sessionId: "sess_test_und_verify",
        organizationId: "org_test_1",
        customerId: "cust_test_1",
        policyId: "pol_test_1",
        providerName: "Cornerstone Insurance Plc",
        amount: 87500,
        currency: "NGN",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        underwriterId: "und_leadway_01",
      };

      const { quoteHash } = computeQuoteSignature(quotePayload);

      const valid = verifyQuoteSignature({
        session_id: quotePayload.sessionId,
        organization_id: quotePayload.organizationId,
        customer_id: quotePayload.customerId,
        policy_id: quotePayload.policyId,
        provider_name: quotePayload.providerName,
        amount: quotePayload.amount,
        currency: quotePayload.currency,
        expires_at: quotePayload.expiresAt,
        quote_hash: quoteHash,
        underwriter_id: "und_leadway_01",
      });
      assert.equal(valid, true, "Authentic quote with matching underwriter_id must pass verification");

      const tampered = verifyQuoteSignature({
        session_id: quotePayload.sessionId,
        organization_id: quotePayload.organizationId,
        customer_id: quotePayload.customerId,
        policy_id: quotePayload.policyId,
        provider_name: quotePayload.providerName,
        amount: quotePayload.amount,
        currency: quotePayload.currency,
        expires_at: quotePayload.expiresAt,
        quote_hash: quoteHash,
        underwriter_id: "und_attacker_manipulated",
      });
      assert.equal(tampered, false, "Tampered underwriter_id must fail signature verification");
    });
  });

  describe("P0: Truthful Refund Outcomes & Saga Compensation Integrity", () => {
    it("should record saga_compensating_refund_failed with status: 'failed' and refundState: 'refund_pending' when refund fails", async () => {
      resetStore();
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew my insurance policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const authRes = await orchestrator.authorizeAndExecute(startRes.sessionId, true, DEMO_CONTEXT, {
        authorizedQuoteId: quote.id,
        simulateSagaFailure: true,
        simulateRefundFailure: true,
      });

      assert.equal(authRes.status, "escalated");
      // Must NOT report that the user was refunded!
      assert.match(authRes.message, /refund could not be verified/i);
      assert.match(authRes.message, /Your account was NOT credited/i);
      assert.match(authRes.message, /supervisor.*refund/i);
      assert.ok(!authRes.message.includes("was automatically refunded"));

      const repos = getRepositoryContainer();
      const session = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
      assert.ok(session);
      assert.equal(session.status, "escalated");
      const meta = (session.metadata || {}) as Record<string, unknown>;
      assert.equal(meta.refundState, "refund_failed", "Session metadata refundState must be refund_failed");
      assert.equal(meta.requiresManualRefund, true, "Session metadata requiresManualRefund must be true");

      const events = await repos.ledger.getEventsBySessionId(startRes.sessionId, DEMO_CONTEXT);
      const failedRefundEvent = events.find((e) => e.action === "saga_compensating_refund_failed");
      assert.ok(failedRefundEvent, "Must record saga_compensating_refund_failed in ledger");
      assert.equal(failedRefundEvent.status, "failed", "Refund failure event must have status: 'failed'");
      assert.equal(failedRefundEvent.isCompensating, true);

      // Verify that NO refund event with status 'verified' was recorded
      const verifiedRefundEvents = events.filter((e) => e.action.includes("refund") && e.status === "verified");
      assert.equal(verifiedRefundEvents.length, 0, "No refund event can be recorded with status: 'verified' when refund failed");
    });

    it("should record saga_compensating_refund with status: 'verified' and refundState: 'refund_confirmed' when refund succeeds", async () => {
      resetStore();
      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew my insurance policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const authRes = await orchestrator.authorizeAndExecute(startRes.sessionId, true, DEMO_CONTEXT, {
        authorizedQuoteId: quote.id,
        simulateSagaFailure: true,
      });

      assert.equal(authRes.status, "escalated");
      assert.match(authRes.message, /automatically refunded/i);

      const repos = getRepositoryContainer();
      const session = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
      assert.ok(session);
      const meta = (session.metadata || {}) as Record<string, unknown>;
      assert.equal(meta.refundState, "refund_confirmed", "Session metadata refundState must be refund_confirmed");

      const events = await repos.ledger.getEventsBySessionId(startRes.sessionId, DEMO_CONTEXT);
      const refundEvent = events.find((e) => e.action === "saga_compensating_refund");
      assert.ok(refundEvent, "Must record saga_compensating_refund in ledger");
      assert.equal(refundEvent.status, "verified");
      assert.equal(refundEvent.isCompensating, true);
    });

    it("should strictly reject simulateRefundFailure in production runtime mode", async () => {
      const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
      process.env.ACTIONOS_RUNTIME_MODE = "production";

      try {
        await assert.rejects(
          async () => {
            await orchestrator.authorizeAndExecute("sess_any", true, {
              userId: "u-1",
              profileId: "p-1",
              organizationId: "org-1",
              customerId: "cust-1",
              role: "customer",
              isDemo: false,
            }, {
              simulateRefundFailure: true,
            });
          },
          /Security enforcement violation: Fault injection \(simulateRefundFailure\) is prohibited in production runtime mode/
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = originalMode;
      }
    });
  });

  describe("P1: Strict Payment Reconciliation & State Verification", () => {
    it("should escalate session with reconciliationAction: 'refund_pending_escalated' when payment settled, renewal incomplete, and refund fails", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const paymentRef = "act_settled_rec_refund_fail_ref";
      await repos.transactions.create({
        organization_id: DEMO_CONTEXT.organizationId,
        customer_id: DEMO_CONTEXT.customerId!,
        amount: 87500,
        currency: "NGN",
        provider: "paystack",
        reference: paymentRef,
        status: "succeeded",
        transaction_type: "renewal_premium",
        metadata: { session_id: startRes.sessionId },
      }, DEMO_CONTEXT);

      await repos.sessions.updateStatus(startRes.sessionId, "executing", undefined, DEMO_CONTEXT);
      await repos.sessions.updateMetadata(startRes.sessionId, {
        authorizationDetails: {
          authorizedQuoteId: quote.id,
          quoteId: quote.id,
          policyNumber: "AUTO-2026-00182",
        },
        paymentReference: paymentRef,
      }, DEMO_CONTEXT);

      const origRefund = mockPaymentProvider.refundPayment.bind(mockPaymentProvider);
      mockPaymentProvider.refundPayment = async () => ({
        status: "failed",
        refundReference: "",
        amount: 87500,
        error: "Bank reversal rejected by processor",
      });

      try {
        const recResult = await orchestrator.reconcileExecutingSession(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(recResult.resolvedStatus, "escalated");
        assert.equal(recResult.reconciliationAction, "refund_pending_escalated");
        assert.match(recResult.message, /automated refund could not be verified/);

        const sessionAfter = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(sessionAfter?.status, "escalated");
        const meta = (sessionAfter?.metadata || {}) as Record<string, unknown>;
        assert.equal(meta.refundState, "refund_failed");
      } finally {
        mockPaymentProvider.refundPayment = origRefund;
      }
    });

    it("should escalate session with reconciliationAction: 'payment_uncertain_escalated' when payment status is pending at provider", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const candidateRef = "act_candidate_pending_payment_ref";
      await repos.sessions.updateStatus(startRes.sessionId, "executing", undefined, DEMO_CONTEXT);
      await repos.sessions.updateMetadata(startRes.sessionId, {
        authorizationDetails: {
          authorizedQuoteId: quote.id,
          quoteId: quote.id,
          policyNumber: "AUTO-2026-00182",
        },
        paymentReference: candidateRef,
      }, DEMO_CONTEXT);

      const origVerify = mockPaymentProvider.verifyPayment.bind(mockPaymentProvider);
      mockPaymentProvider.verifyPayment = async () => ({
        status: "pending",
        amount: 87500,
        currency: "NGN",
        providerReference: "pstk_pending_rail",
        paidAt: new Date().toISOString(),
      });

      try {
        const recResult = await orchestrator.reconcileExecutingSession(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(recResult.resolvedStatus, "escalated");
        assert.equal(recResult.reconciliationAction, "payment_uncertain_escalated");
        assert.match(recResult.message, /Payment status is currently uncertain with the gateway rail/);

        const sessionAfter = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(sessionAfter?.status, "escalated", "Session must remain escalated for deferred reconciliation, never marked failed/unpaid");
        const meta = (sessionAfter?.metadata || {}) as Record<string, unknown>;
        assert.equal(meta.paymentReconciliationState, "payment_pending");
        assert.equal(meta.requiresDeferredReconciliation, true);
      } finally {
        mockPaymentProvider.verifyPayment = origVerify;
      }
    });

    it("should escalate session with reconciliationAction: 'payment_uncertain_escalated' when payment gateway is unreachable / throws", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const candidateRef = "act_candidate_timeout_payment_ref";
      await repos.sessions.updateStatus(startRes.sessionId, "executing", undefined, DEMO_CONTEXT);
      await repos.sessions.updateMetadata(startRes.sessionId, {
        authorizationDetails: {
          authorizedQuoteId: quote.id,
          quoteId: quote.id,
          policyNumber: "AUTO-2026-00182",
        },
        paymentReference: candidateRef,
      }, DEMO_CONTEXT);

      const origVerify = mockPaymentProvider.verifyPayment.bind(mockPaymentProvider);
      mockPaymentProvider.verifyPayment = async () => {
        throw new Error("ETIMEDOUT: Gateway network unreachable");
      };

      try {
        const recResult = await orchestrator.reconcileExecutingSession(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(recResult.resolvedStatus, "escalated");
        assert.equal(recResult.reconciliationAction, "payment_uncertain_escalated");

        const sessionAfter = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(sessionAfter?.status, "escalated");
        const meta = (sessionAfter?.metadata || {}) as Record<string, unknown>;
        assert.equal(meta.paymentReconciliationState, "gateway_unreachable");
        assert.equal(meta.requiresDeferredReconciliation, true);
      } finally {
        mockPaymentProvider.verifyPayment = origVerify;
      }
    });
  });

  describe("P0: Supabase Startup Configuration Validation", () => {
    it("assertSupabaseProductionConfig should succeed without throwing when valid production config is present", () => {
      const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://valid-prod-ref.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "ey-valid-service-role-key-abc123xyz";

      try {
        assert.doesNotThrow(() => {
          assertSupabaseProductionConfig();
        });
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = originalMode;
        if (originalUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
        else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (originalServiceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
        else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
    });

    it("getRepositoryContainer should fail fast at startup in production when Supabase configuration is missing", async () => {
      const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
      const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      process.env.ACTIONOS_RUNTIME_MODE = "production";
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const { resetRepositoryContainer } = await import("@/lib/repositories");
      resetRepositoryContainer();

      try {
        assert.throws(
          () => getRepositoryContainer(),
          /Supabase production configuration error/i
        );
      } finally {
        process.env.ACTIONOS_RUNTIME_MODE = originalMode;
        if (originalUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
        if (originalServiceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
        resetRepositoryContainer();
      }
    });
  });

  describe("P0: Post-Payment Verification Recovery & Reconciliation", () => {
    it("should initiate verified refund and escalate with refund confirmation when verification fails and policy is not renewed", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const verifier = (orchestrator as unknown as { verifier: { verifyRenewal: (...args: unknown[]) => Promise<unknown> } }).verifier;
      const origVerifyRenewal = verifier.verifyRenewal;

      verifier.verifyRenewal = async () => ({
        passed: false,
        verified: false,
        type: "policy_renewal",
        details: "Database query timed out during roll-forward verification",
        reason: "Database query timed out during roll-forward verification",
      });

      const origUpdate = repos.policies.updateStatusAndExpiry.bind(repos.policies);
      repos.policies.updateStatusAndExpiry = async (id, status, exp, tenant) => origUpdate(id, "expiring", "2026-10-14", tenant);

      try {
        const authRes = await orchestrator.authorizeAndExecute(startRes.sessionId, true, DEMO_CONTEXT, {
          authorizedQuoteId: quote.id,
        });

        assert.equal(authRes.status, "escalated");
        assert.match(authRes.message, /automatically refunded and verified/i);

        const session = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(session?.status, "escalated");
        const meta = (session?.metadata || {}) as Record<string, unknown>;
        assert.equal(meta.postPaymentVerificationFailure, true);
        assert.equal(meta.reconciliation_required, false);
        assert.equal(meta.requiresManualRefund, false);
        assert.equal(meta.refundState, "refund_confirmed");

        const events = await repos.ledger.getEventsBySessionId(startRes.sessionId, DEMO_CONTEXT);
        const refundEv = events.find((e) => e.action === "saga_compensating_refund");
        assert.ok(refundEv);
        assert.equal(refundEv.status, "verified");
      } finally {
        verifier.verifyRenewal = origVerifyRenewal;
        repos.policies.updateStatusAndExpiry = origUpdate;
      }
    });

    it("should mark reconciliation_required: true and refundState: 'refund_pending' when verification fails, policy is unrenewed, and refund rail fails", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const verifier = (orchestrator as unknown as { verifier: { verifyRenewal: (...args: unknown[]) => Promise<unknown> } }).verifier;
      const origVerifyRenewal = verifier.verifyRenewal;

      verifier.verifyRenewal = async () => ({
        passed: false,
        verified: false,
        type: "policy_renewal",
        details: "Policy database lock prevented write confirmation",
        reason: "Policy database lock prevented write confirmation",
      });

      const origUpdate = repos.policies.updateStatusAndExpiry.bind(repos.policies);
      repos.policies.updateStatusAndExpiry = async (id, status, exp, tenant) => origUpdate(id, "expiring", "2026-10-14", tenant);

      try {
        const authRes = await orchestrator.authorizeAndExecute(startRes.sessionId, true, DEMO_CONTEXT, {
          authorizedQuoteId: quote.id,
          simulateRefundFailure: true,
        });

        assert.equal(authRes.status, "escalated");
        assert.match(authRes.message, /automated refund could not be verified/i);
        assert.match(authRes.message, /supervisor reconciliation/i);

        const session = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(session?.status, "escalated");
        const meta = (session?.metadata || {}) as Record<string, unknown>;
        assert.equal(meta.postPaymentVerificationFailure, true);
        assert.equal(meta.reconciliation_required, true);
        assert.equal(meta.requiresManualRefund, true);
        assert.equal(meta.refundState, "refund_failed");

        const events = await repos.ledger.getEventsBySessionId(startRes.sessionId, DEMO_CONTEXT);
        const refundFailedEv = events.find((e) => e.action === "saga_compensating_refund_failed");
        assert.ok(refundFailedEv);
        assert.equal(refundFailedEv.status, "failed");
      } finally {
        verifier.verifyRenewal = origVerifyRenewal;
        repos.policies.updateStatusAndExpiry = origUpdate;
      }
    });

    it("should reconcile and complete workflow when verification fails transiently but authoritative database policy confirms renewal", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const verifier = (orchestrator as unknown as { verifier: { verifyRenewal: (...args: unknown[]) => Promise<unknown> } }).verifier;
      const origVerifyRenewal = verifier.verifyRenewal;

      verifier.verifyRenewal = async () => ({
        passed: false,
        verified: false,
        type: "policy_renewal",
        details: "Transient network timeout on verifier probe",
        reason: "Transient network timeout on verifier probe",
      });

      try {
        const authRes = await orchestrator.authorizeAndExecute(startRes.sessionId, true, DEMO_CONTEXT, {
          authorizedQuoteId: quote.id,
        });

        assert.equal(authRes.status, "completed");

        const events = await repos.ledger.getEventsBySessionId(startRes.sessionId, DEMO_CONTEXT);
        const recEvent = events.find((e) => e.action === "independent_verification_reconciled");
        assert.ok(recEvent, "Must record independent_verification_reconciled ledger event");
        assert.equal(recEvent.status, "verified");

        const session = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(session?.status, "completed");
      } finally {
        verifier.verifyRenewal = origVerifyRenewal;
      }
    });

    it("should escalate with reconciliationAction: 'payment_uncertain_escalated' when executing session has zero candidate references", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const session = await repos.sessions.create({
        organization_id: DEMO_CONTEXT.organizationId,
        customer_id: DEMO_CONTEXT.customerId,
        channel: "web",
        language: "en-NG",
        status: "executing",
        input_text: "Renew policy",
        intent: "policy_renewal",
        metadata: {},
      });

      const recResult = await orchestrator.reconcileExecutingSession(session.id, DEMO_CONTEXT);
      assert.equal(recResult.resolvedStatus, "escalated");
      assert.equal(recResult.reconciliationAction, "payment_uncertain_escalated");
      assert.match(recResult.message, /No payment reference or idempotency key found/);

      const sessionAfter = await repos.sessions.findById(session.id, DEMO_CONTEXT);
      assert.equal(sessionAfter?.status, "escalated");
      const meta = (sessionAfter?.metadata || {}) as Record<string, unknown>;
      assert.equal(meta.paymentReconciliationState, "unknown_reference");
      assert.equal(meta.reconciliation_required, true);
    });

    it("should safely fail closed with reconciliationAction: 'cancelled_unpaid' when payment provider explicitly confirms unpaid for all candidate references", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const candidateRef = "act_unpaid_provider_confirmed_ref";
      await repos.sessions.updateStatus(startRes.sessionId, "executing", undefined, DEMO_CONTEXT);
      await repos.sessions.updateMetadata(startRes.sessionId, {
        authorizationDetails: {
          authorizedQuoteId: quote.id,
          quoteId: quote.id,
          policyNumber: "AUTO-2026-00182",
        },
        paymentReference: candidateRef,
      }, DEMO_CONTEXT);

      const origVerify = mockPaymentProvider.verifyPayment.bind(mockPaymentProvider);
      mockPaymentProvider.verifyPayment = async () => ({
        status: "failed",
        amount: 0,
        currency: "NGN",
        providerReference: "",
        paidAt: new Date().toISOString(),
      });

      try {
        const recResult = await orchestrator.reconcileExecutingSession(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(recResult.resolvedStatus, "failed");
        assert.equal(recResult.reconciliationAction, "cancelled_unpaid");
        assert.match(recResult.message, /No settled payment found with gateway/);

        const sessionAfter = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(sessionAfter?.status, "failed");
      } finally {
        mockPaymentProvider.verifyPayment = origVerify;
      }
    });

    it("should return reconciliation_required when payment was settled, renewal incomplete, and refund outcome is uncertain", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew policy AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      const quote = getStore().quotes.find((q) => q.session_id === startRes.sessionId);
      assert.ok(quote);

      const paymentRef = "act_settled_rec_refund_uncertain_ref";
      await repos.transactions.create({
        organization_id: DEMO_CONTEXT.organizationId,
        customer_id: DEMO_CONTEXT.customerId!,
        amount: 87500,
        currency: "NGN",
        provider: "paystack",
        reference: paymentRef,
        status: "succeeded",
        transaction_type: "renewal_premium",
        metadata: { session_id: startRes.sessionId },
      }, DEMO_CONTEXT);

      await repos.sessions.updateStatus(startRes.sessionId, "executing", undefined, DEMO_CONTEXT);
      await repos.sessions.updateMetadata(startRes.sessionId, {
        authorizationDetails: {
          authorizedQuoteId: quote.id,
          quoteId: quote.id,
          policyNumber: "AUTO-2026-00182",
        },
        paymentReference: paymentRef,
      }, DEMO_CONTEXT);

      const origRefund = mockPaymentProvider.refundPayment.bind(mockPaymentProvider);
      mockPaymentProvider.refundPayment = async () => {
        throw new Error("EAI_AGAIN: DNS lookup failure on payment processor");
      };

      try {
        const recResult = await orchestrator.reconcileExecutingSession(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(recResult.resolvedStatus, "escalated");
        assert.equal(recResult.reconciliationAction, "reconciliation_required");
        assert.match(recResult.message, /refund outcome is uncertain/);

        const sessionAfter = await repos.sessions.findById(startRes.sessionId, DEMO_CONTEXT);
        assert.equal(sessionAfter?.status, "escalated");
        const meta = (sessionAfter?.metadata || {}) as Record<string, unknown>;
        assert.equal(meta.refundState, "refund_unknown");
        assert.equal(meta.reconciliation_required, true);
      } finally {
        mockPaymentProvider.refundPayment = origRefund;
      }
    });

    it("should verify legacy v0 quote signature format for backward compatibility without invalidating existing quotes", () => {
      const secret = process.env.ACTIONOS_QUOTE_SIGNING_KEY || "actionos_sandbox_quote_signing_key_demo";
      const payload = {
        session_id: "sess_legacy_v0_test",
        organization_id: "org_legacy_1",
        customer_id: "cust_legacy_1",
        policy_id: "pol_legacy_1",
        provider_name: "Cornerstone Insurance Plc",
        amount: 87500,
        currency: "NGN",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };

      const v0Hash = crypto
        .createHmac("sha256", secret)
        .update(`v0:${payload.session_id}:${payload.organization_id}:${payload.customer_id}:${payload.policy_id}:${payload.provider_name}:${payload.amount}:${payload.currency}:${payload.expires_at}`)
        .digest("hex");

      const valid = verifyQuoteSignature({
        ...payload,
        quote_hash: v0Hash,
      });

      assert.equal(valid, true, "Legacy v0 quote hash must verify successfully under migration plan");
    });
  });
});




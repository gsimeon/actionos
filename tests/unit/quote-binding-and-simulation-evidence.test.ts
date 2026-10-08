import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { resetStore } from "@/lib/actionos/mock-store";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { getRepositoryContainer } from "@/lib/repositories";
import { GenerateCertificateTool } from "@/lib/actionos/tools/generate-certificate";
import { VerifyPaymentTool } from "@/lib/actionos/tools/verify-payment";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";

describe("ActionOS Quote Binding, Expiration & Simulation Evidence Hardening", () => {
  it("should bind authorization gate to an immutable quote with unique quoteId, unexpired expiry, and provider", async () => {
    resetStore();

    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew my Toyota Camry insurance AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });

    assert.equal(startRes.authorizationRequired, true);
    assert.ok(startRes.authorizationDetails, "Authorization details must be populated");

    const auth = startRes.authorizationDetails;
    assert.ok(auth.quoteId, "Quote ID must be defined and non-empty");
    assert.ok(auth.amount > 0, "Quote amount must be positive");
    assert.equal(auth.currency, "NGN");
    assert.ok(auth.providerName, "Provider name must be resolved");
    assert.ok(auth.providerName.length > 0, "Provider name must not be empty");
    assert.ok(auth.expiresAt, "Quote expiration timestamp must be set");

    const expiresTime = new Date(auth.expiresAt).getTime();
    assert.ok(expiresTime > Date.now(), "Quote expiresAt must be in the future");
  });

  it("should strictly reject authorization when quote in session metadata has expired", async () => {
    resetStore();
    const repos = getRepositoryContainer();

    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew my Toyota Camry insurance AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });

    assert.ok(startRes.authorizationDetails);

    // Tamper expiration timestamp to 10 minutes in the past
    const expiredAuth = {
      ...startRes.authorizationDetails,
      expiresAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };

    await repos.sessions.updateMetadata(startRes.sessionId, {
      authorizationDetails: expiredAuth,
    });

    const execRes = await orchestrator.authorizeAndExecute(
      startRes.sessionId,
      true,
      DEMO_CONTEXT
    );

    assert.equal(execRes.status, "failed");
    assert.match(execRes.message, /Quote has expired|Quote expired/);
  });

  it("should reject authorization when custom amount does not match any approved quote", async () => {
    resetStore();

    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew my Toyota Camry insurance AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });

    assert.ok(startRes.sessionId);

    // Attempt to authorize with an unquoted/unapproved amount (e.g. 500 NGN)
    const execRes = await orchestrator.authorizeAndExecute(
      startRes.sessionId,
      true,
      DEMO_CONTEXT,
      { customAmount: 500 }
    );

    assert.equal(execRes.status, "failed");
    assert.match(execRes.message, /does not match any approved underwriter quote|does not match any verified quote/);
  });

  it("should permit authorization when custom amount matches an approved marketplace quote", async () => {
    resetStore();

    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew my Toyota Camry insurance AUTO-2026-00182",
      channel: "web",
      executionContext: DEMO_CONTEXT,
    });

    assert.ok(startRes.authorizationDetails?.quotes);
    const axaQuote = startRes.authorizationDetails.quotes.find((q) => q.underwriter === "AXA Mansard");
    assert.ok(axaQuote, "AXA Mansard quote must be present in marketplace");

    const execRes = await orchestrator.authorizeAndExecute(
      startRes.sessionId,
      true,
      DEMO_CONTEXT,
      { customAmount: axaQuote.amount, selectedUnderwriter: axaQuote.underwriter }
    );

    assert.equal(execRes.status, "completed");
  });

  it("should explicitly label generated certificates as simulated non-statutory documents in demo mode", async () => {
    const certTool = new GenerateCertificateTool();
    const execContext = createWorkflowExecutionContext(DEMO_CONTEXT, {
      sessionId: "ses_demo_cert_test",
      isSimulated: true,
    });

    const result = await certTool.execute(
      {
        customerId: DEMO_CONTEXT.customerId!,
        policyNumber: "AUTO-2026-00182",
        previousExpiry: "2026-10-14",
        newExpiry: "2027-10-14",
        amount: 87500,
      },
      execContext
    );

    assert.equal(result.success, true);
    assert.ok(result.data);
    assert.equal(result.data.isSimulated, true);
    assert.equal(result.data.legalStatus, "SIMULATED_DEMO_NON_STATUTORY");
    assert.match(result.data.authority, /Simulation Sandbox/);

    assert.ok(result.data.statutoryNotice);
    assert.match(result.data.statutoryNotice, /DEMO SIMULATION/);
    assert.match(result.data.document.file_name, /SIMULATED_DEMO_Certificate/);
  });

  it("should explicitly label payment verification with sandbox simulation gateway channel", async () => {
    const { mockPaymentProvider } = await import("@/lib/payments/mock");
    await mockPaymentProvider.requestPayment({
      customerId: DEMO_CONTEXT.customerId!,
      amount: 87500,
      currency: "NGN",
      reference: "ref_sim_001",
    });

    const payTool = new VerifyPaymentTool();
    const execContext = createWorkflowExecutionContext(DEMO_CONTEXT, {
      sessionId: "ses_demo_pay_test",
      isSimulated: true,
    });

    const result = await payTool.execute(
      {
        reference: "ref_sim_001",
        expectedAmount: 87500,
      },
      execContext
    );

    assert.equal(result.success, true);
    assert.ok(result.data);
    assert.equal(result.data.isSimulated, true);
    assert.equal(result.data.gatewayChannel, "sandbox_simulation");
    assert.match(result.data.verificationSource, /Simulation Sandbox Gateway/);
  });
});

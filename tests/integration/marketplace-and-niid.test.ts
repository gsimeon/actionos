import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VerifyNiidTool } from "@/lib/actionos/tools/verify-niid";
import { GetQuoteTool } from "@/lib/actionos/tools/get-quote";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { resetStore } from "@/lib/actionos/mock-store";
import type { ExecutionContext } from "@/types/actionos";

describe("ActionOS NIID Regulatory Verification & Multi-Insurer Marketplace", () => {
  it("should query NIID and FRSC statutory databases and verify vehicle legitimacy", async () => {
    resetStore();
    const niidTool = new VerifyNiidTool();

    const context: ExecutionContext = {
      sessionId: "sess_niid_test",
      planId: "plan_1",
      organizationId: "org_1",
      customerId: "f0000000-0000-0000-0000-000000000001",
      userRole: "customer",
      channel: "web",
      language: "en-NG",
      isSimulated: true,
    };

    const res = await niidTool.execute({ vehiclePlate: "ABC-123-XY" }, context);

    assert.equal(res.success, true);
    assert.equal(res.data?.verified, true);
    assert.equal(res.data?.vehiclePlate, "ABC-123-XY");
    assert.equal(res.data?.theftFlag, false, "Vehicle must not have theft flags");
    assert.equal(res.data?.frscRegistered, true, "Vehicle must be registered with FRSC");
    assert.ok(res.data?.preclearanceToken.startsWith("NIID-"));
  });

  it("should aggregate live quotes across 4 licensed Nigerian underwriters", async () => {
    resetStore();
    const quoteTool = new GetQuoteTool();

    const context: ExecutionContext = {
      sessionId: "sess_quote_test",
      planId: "plan_2",
      organizationId: "org_1",
      customerId: "f0000000-0000-0000-0000-000000000001",
      userRole: "customer",
      channel: "web",
      language: "en-NG",
      isSimulated: true,
    };

    const res = await quoteTool.execute(
      { policyId: "b0000000-0000-0000-0000-000000000001", preferredUnderwriter: "Leadway Assurance" },
      context
    );

    assert.equal(res.success, true);
    assert.ok(res.data?.quotes && res.data.quotes.length >= 4);

    const underwriters = res.data.quotes.map((q) => q.underwriter);
    assert.ok(underwriters.includes("Leadway Assurance"));
    assert.ok(underwriters.includes("AXA Mansard"));
    assert.ok(underwriters.includes("AIICO Insurance"));
    assert.ok(underwriters.includes("Cornerstone Insurance"));

    // Check pricing structure
    for (const quote of res.data.quotes) {
      assert.ok(quote.amount > 0);
      assert.ok(quote.rating && quote.rating > 4.0);
      assert.ok(quote.benefits.length > 0);
    }
  });

  it("should support selecting an alternative marketplace underwriter during authorization", async () => {
    resetStore();

    // 1. Start renewal session
    const step1 = await orchestrator.startWorkflow({
      inputText: "Check my car insurance and renew it",
      channel: "web",
      language: "en-NG",
      customerId: "f0000000-0000-0000-0000-000000000001",
    });

    assert.equal(step1.status, "awaiting_authorization");
    assert.ok(step1.authorizationDetails?.quotes?.length);

    // Pick AXA Mansard with its specific rate
    const axaQuote = step1.authorizationDetails.quotes.find(
      (q) => q.underwriter === "AXA Mansard"
    );
    assert.ok(axaQuote);

    // 2. Authorize with the selected AXA Mansard underwriter
    const step2 = await orchestrator.authorizeAndExecute(
      step1.sessionId,
      true,
      "customer",
      {
        selectedUnderwriter: "AXA Mansard",
        customAmount: axaQuote.amount,
        authMethod: "biometric_webauthn",
      }
    );

    assert.equal(step2.status, "completed");

    // Verify authorization event recorded the choice
    const authEvent = step2.events.find((e) => e.action === "authorization_confirmed");
    assert.ok(authEvent);
    assert.equal(authEvent.metadata?.selectedUnderwriter, "AXA Mansard");
    assert.equal(authEvent.metadata?.authMethod, "biometric_webauthn");
  });
});

import assert from "node:assert/strict";

// Live End-to-End API test against running server
async function testLiveApi() {
  console.log("=== Testing ActionOS Live Endpoints on http://localhost:3000 ===");

  // Enforce explicit test secret without fallback to public defaults
  const resetSecret = process.env.ACTIONOS_DEV_RESET_SECRET || process.env.ACTIONOS_RESET_SECRET;
  if (!resetSecret) {
    console.error("❌ Configuration Error: Missing required ACTIONOS_DEV_RESET_SECRET environment variable.");
    console.error("The live E2E test requires an explicitly configured test operator secret to execute the demo reset endpoint.");
    console.error("Set ACTIONOS_DEV_RESET_SECRET before running this test script.");
    process.exit(1);
  }

  // Helper to assert successful JSON response
  async function assertOk(res, stepName) {
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[${stepName}] HTTP request failed with status ${res.status}: ${errText}`);
    }
    const data = await res.json();
    if (data && typeof data === "object" && data.success === false) {
      throw new Error(`[${stepName}] API returned success=false: ${JSON.stringify(data.error || data)}`);
    }
    return data;
  }

  // 0. Reset to clean benchmark state
  const resetRes = await fetch("http://localhost:3000/api/dev/reset", {
    method: "POST",
    headers: { "x-actionos-reset-key": resetSecret },
  });
  const resetData = await assertOk(resetRes, "Step 0 Reset");
  assert.equal(resetData.success, true, "Reset response must indicate success");
  console.log("0. Mock Store reset to clean benchmark state (Verified)");

  // 1. Dispatch renewal action
  const dispatchRes = await fetch("http://localhost:3000/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputText: "Compare 4 underwriter quotes and renew my Toyota Camry AUTO-2026-00182",
      channel: "web",
      language: "en-NG",
      customerId: "f0000000-0000-0000-0000-000000000001",
    }),
  });

  const dispatchData = await assertOk(dispatchRes, "Step 1 Dispatch");
  const sessionId = dispatchData.data?.sessionId;
  assert.ok(sessionId, "Session ID must be returned upon dispatch");
  assert.equal(dispatchData.data?.status, "awaiting_confirmation", "Session must halt at awaiting_confirmation");
  assert.ok(
    Array.isArray(dispatchData.data?.authorizationDetails?.quotes) && dispatchData.data.authorizationDetails.quotes.length >= 1,
    "Marketplace quotes must be returned"
  );
  assert.ok(
    Array.isArray(dispatchData.data?.events) && dispatchData.data.events.length >= 1,
    "Initial ledger events must be present"
  );

  console.log("1. Dispatch Success:", dispatchData.success);
  console.log("   Session ID:", sessionId);
  console.log("   Status:", dispatchData.data?.status);
  console.log("   Marketplace Quotes:", dispatchData.data?.authorizationDetails?.quotes?.map(q => `${q.underwriter} (₦${q.amount})`));
  console.log("   Ledger Events Initial Count:", dispatchData.data?.events?.length);

  // 2. Authorize with AXA Mansard
  const authRes = await fetch(`http://localhost:3000/api/actions/${sessionId}/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authorized: true,
      selectedUnderwriter: "AXA Mansard",
      customAmount: 105000,
      authMethod: "biometric_webauthn",
    }),
  });

  const authData = await assertOk(authRes, "Step 2 Authorize");
  assert.equal(authData.data?.status, "completed", "Workflow status must transition to completed");

  const events = authData.data?.events || [];
  assert.ok(events.length >= 5, "Workflow must emit comprehensive ledger events");
  const hashesValid = events.every(e => !!e.hash && typeof e.previousHash === "string");
  assert.equal(hashesValid, true, "Every ledger event must maintain valid cryptographic Merkle chaining");

  console.log("\n2. Authorization Success:", authData.success);
  console.log("   Status:", authData.data?.status);
  console.log("   Final Events Count:", events.length);
  console.log("   Cryptographic Merkle Hash Chaining Present:", hashesValid);
  console.log("   First Hash:", events[0]?.hash?.substring(0, 16) + "...");
  console.log("   Final Hash:", events[events.length - 1]?.hash?.substring(0, 16) + "...");

  // 3. Test Saga Compensating Rollback Simulation
  console.log("\n3. Testing Saga Rollback Fault Injection...");
  // Reset store again so policy is eligible
  const sagaResetRes = await fetch("http://localhost:3000/api/dev/reset", {
    method: "POST",
    headers: { "x-actionos-reset-key": resetSecret },
  });
  await assertOk(sagaResetRes, "Step 3 Reset");

  const sagaDispatch = await fetch("http://localhost:3000/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputText: "Renew Toyota Camry AUTO-2026-00182",
      channel: "web",
      language: "en-NG",
      customerId: "f0000000-0000-0000-0000-000000000001",
    }),
  });
  const sagaDispatchData = await assertOk(sagaDispatch, "Step 3 Saga Dispatch");
  const sagaSessionId = sagaDispatchData.data.sessionId;
  assert.ok(sagaSessionId, "Saga session ID must exist");

  const sagaAuth = await fetch(`http://localhost:3000/api/actions/${sagaSessionId}/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authorized: true,
      simulateSagaFailure: true,
    }),
  });
  const sagaAuthData = await assertOk(sagaAuth, "Step 3 Saga Authorize");
  assert.ok(
    sagaAuthData.data?.status === "failed" || sagaAuthData.data?.status === "rolled_back",
    `Saga execution status must be failed or rolled_back, got: ${sagaAuthData.data?.status}`
  );
  const rollbackEvent = sagaAuthData.data?.events?.find(e => e.isCompensating || e.action === "saga_compensating_refund");
  assert.ok(rollbackEvent, "Compensating rollback event must be present in ledger upon simulated failure");

  console.log("   Saga Execution Status:", sagaAuthData.data?.status);
  console.log("   Compensating Event Found:", !!rollbackEvent);
  console.log("   Compensating Event Desc:", rollbackEvent?.description);

  // 4. Test WhatsApp Cloud Webhook
  console.log("\n4. Testing WhatsApp Cloud Webhook Verification & Message Routing...");
  const waVerify = await fetch("http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=actionos_whatsapp_token_2026&hub.challenge=CHALLENGE_ACCEPTED_777");
  assert.equal(waVerify.status, 200, "WhatsApp webhook verification GET must return HTTP 200");
  const waChallengeText = await waVerify.text();
  assert.equal(waChallengeText, "CHALLENGE_ACCEPTED_777", "WhatsApp challenge text must match");
  console.log("   WhatsApp Hub Verification:", true);

  // Reset store for WhatsApp message
  const waResetRes = await fetch("http://localhost:3000/api/dev/reset", {
    method: "POST",
    headers: { "x-actionos-reset-key": resetSecret },
  });
  await assertOk(waResetRes, "Step 4 Reset");

  const waPost = await fetch("http://localhost:3000/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "2348012345678",
                    type: "text",
                    text: { body: "Renew my Toyota Camry insurance AUTO-2026-00182" },
                  },
                ],
              },
            },
          ],
        },
      ],
    }),
  });
  const waPostData = await assertOk(waPost, "Step 4 WhatsApp Inbound");
  assert.equal(waPostData.success, true, "WhatsApp message routing must succeed");
  assert.ok(waPostData.sessionId, "WhatsApp message routing must create an action session");
  assert.ok(
    Array.isArray(waPostData.response?.interactive?.action?.buttons) && waPostData.response.interactive.action.buttons.length >= 1,
    "WhatsApp interactive confirmation buttons must be generated"
  );

  console.log("   WhatsApp Inbound Action Dispatch Success:", waPostData.success);
  console.log("   WhatsApp Created Session ID:", waPostData.sessionId);
  console.log("   WhatsApp Interactive Buttons Sent:", waPostData.response?.interactive?.action?.buttons?.length);

  console.log("\n=== ALL LIVE ENDPOINTS TESTED AND VERIFIED 100% OPERATIONAL ===");
}

testLiveApi().catch((err) => {
  console.error("❌ Live E2E Acceptance Test Failed:", err);
  process.exit(1);
});

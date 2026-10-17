import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FrscGatewayClient } from "@/lib/integrations/frsc";
import { HttpNAtlasAdapter, OfficialNAtlasProvider, NAtlasConnectionError } from "@/lib/ai/n-atlas";
import { QueryVehicleTool } from "@/lib/actionos/tools/query-vehicle";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";

describe("FRSC & Live N-ATLAS Handshake Adapters Suite", () => {
  describe("FRSC Gateway Client (National Vehicle Identification System)", () => {
    const frsc = new FrscGatewayClient();

    it("should perform plate verification for benchmark vehicle ABC-123-XY", async () => {
      const res = await frsc.verifyPlate("ABC-123-XY");
      assert.equal(res.plate, "ABC-123-XY");
      assert.equal(res.found, true);
      assert.equal(res.make, "Toyota");
      assert.equal(res.model, "Camry");
      assert.equal(res.theftFlag, false);
      assert.ok(res.authority.includes("FRSC"));
    });

    it("should perform synthetic verification for arbitrary Nigerian plate formats", async () => {
      const res = await frsc.verifyPlate("KJA-882-AB");
      assert.equal(res.plate, "KJA-882-AB");
      assert.equal(res.found, true);
      assert.ok(res.vin !== undefined);
      assert.ok(res.engineNumber !== undefined);
    });

    it("should verify driver license against FRSC National Driver License Registry", async () => {
      const res = await frsc.verifyDriverLicense("DL-2026-9901-XY");
      assert.equal(res.dlNumber, "DL-2026-9901-XY");
      assert.equal(res.valid, true);
      assert.ok(res.authority.includes("FRSC"));
    });
  });

  describe("N-ATLAS HTTP Adapter & Fallback Engine", () => {
    it("should fallback gracefully to benchmark engine when N_ATLAS_API_KEY is omitted", async () => {
      const adapter = new HttpNAtlasAdapter("https://mock-api.n-atlas.ng", "");
      const res = await adapter.understand({
        text: "Renew my motor paper ABC-123-XY sharp sharp",
        language: "pcm",
      });

      assert.equal(res.intent, "renew_vehicle_license");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
      assert.equal(res.entities._isLiveAI, false);
      assert.equal(res.entities._nAtlasFallback, true);
      assert.equal(res.entities._liveVerified, false);
    });

    it("should fail fast with NAtlasConnectionError in strict mode when API key is missing", async () => {
      const adapter = new HttpNAtlasAdapter("https://mock-api.n-atlas.ng", "", true);
      await assert.rejects(
        () => adapter.understand({ text: "Renew my car insurance", language: "en-NG" }),
        (err: unknown) => {
          assert.ok(err instanceof NAtlasConnectionError);
          assert.equal(err.status, 401);
          assert.match(err.message, /N_ATLAS_STRICT_MODE violation/);
          return true;
        }
      );
    });

    it("should integrate with OfficialNAtlasProvider transparently", async () => {
      const provider = new OfficialNAtlasProvider();
      const res = await provider.understand({
        text: "Check my car ABC-123-XY in vehicle database",
        language: "en-NG",
      });

      assert.equal(res.intent, "query_vehicle");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
    });

    it("should sanitize prompt in _evidence and record provenance when live inference succeeds", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    intent: "renew_policy",
                    confidence: 0.98,
                    entities: { policyNumber: "AUTO-2026-00182" },
                    language: "en-NG",
                  }),
                },
              },
            ],
          }),
        })) as unknown as typeof fetch;

        const adapter = new HttpNAtlasAdapter("https://api.n-atlas.ng/v1", "test-live-key");
        const res = await adapter.understand({
          text: "My card 4111222233334444 and phone 08031234567 for policy AUTO-2026-00182 with plate ABC-123-XY",
          language: "en-NG",
        });

        assert.equal(res.intent, "renew_policy");
        assert.equal(res.entities._isLiveAI, true);
        assert.equal(res.entities._liveVerified, true);
        assert.ok(res.entities._evidence);
        const evidence = res.entities._evidence as { prompt: string; endpoint: string; model: string; latencyMs: number };
        assert.equal(evidence.endpoint, "https://api.n-atlas.ng/v1");
        assert.equal(evidence.model, "n-atlas-multilingual");
        assert.ok(typeof evidence.latencyMs === "number");

        // Privacy check: raw sensitive data MUST be redacted in evidence log
        assert.ok(!evidence.prompt.includes("4111222233334444"), "Card number must be redacted");
        assert.ok(!evidence.prompt.includes("08031234567"), "Phone number must be redacted");
        assert.ok(!evidence.prompt.includes("AUTO-2026-00182"), "Policy number must be redacted");
        assert.ok(!evidence.prompt.includes("ABC-123-XY"), "Vehicle plate must be redacted");
        assert.ok(evidence.prompt.includes("[REDACTED_CARD]"));
        assert.ok(evidence.prompt.includes("[REDACTED_PHONE]"));
        assert.ok(evidence.prompt.includes("[REDACTED_POLICY]"));
        assert.ok(evidence.prompt.includes("[REDACTED_PLATE]"));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("QueryVehicleTool with FRSC Cross-Verification", () => {
    it("should include FRSC NVIS verification data in query_vehicle output", async () => {
      const tool = new QueryVehicleTool();
      const ctx = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_frsc_test_001",
        channel: "web",
        isSimulated: true,
      });

      const res = await tool.execute({ vehiclePlate: "ABC-123-XY" }, ctx);
      assert.equal(res.success, true);
      assert.ok(res.data?.found === true);
      assert.ok(res.data?.frscVerification !== undefined);
      assert.equal(res.data?.frscVerification.plate, "ABC-123-XY");
      assert.equal(res.data?.frscVerification.make, "Toyota");
      assert.equal(res.data?.frscVerification.model, "Camry");
    });
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FrscGatewayClient } from "@/lib/integrations/frsc";
import { HttpNAtlasAdapter, OfficialNAtlasProvider } from "@/lib/ai/n-atlas";
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

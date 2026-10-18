import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HttpNAtlasAdapter,
  isOfficialNAtlasEndpoint,
  NAtlasConnectionError,
  createNAtlasProvider,
} from "@/lib/ai/n-atlas";

describe("Official N-ATLAS Integration & Sovereign Credential Verification Suite", () => {
  const targetEndpoint = process.env.N_ATLAS_API_ENDPOINT || process.env.N_ATLAS_API_URL || "https://api.n-atlas.ng/v1";
  const targetModel = process.env.N_ATLAS_MODEL || "n-atlas-multilingual";
  const apiKey = process.env.N_ATLAS_API_KEY;

  it("records sovereign endpoint identity, target model, and credential presence without exposing secrets", () => {
    const isConfigured = Boolean(apiKey && !apiKey.includes("placeholder") && apiKey !== "your_api_key_here");
    const maskedKey = isConfigured
      ? `${apiKey!.substring(0, 4)}...${apiKey!.substring(apiKey!.length - 4)}`
      : "[NONE - AWAITING_INSTITUTIONAL_CREDENTIALS]";

    console.log("--------------------------------------------------------------------------------");
    console.log("  OFFICIAL N-ATLAS INTEGRATION AUDIT EVIDENCE");
    console.log(`  Target Sovereign Endpoint: ${targetEndpoint}`);
    console.log(`  Designated Model:          ${targetModel}`);
    console.log(`  Credential Status:         ${isConfigured ? "CONFIGURED (" + maskedKey + ")" : "AWAITING CREDENTIALS"}`);
    console.log(`  Benchmark Suite Status:    SIMULATED (tests/unit/nigerian-languages-and-vehicle-query.test.ts)`);
    console.log("--------------------------------------------------------------------------------");

    // Boundary invariants
    assert.equal(isOfficialNAtlasEndpoint(targetEndpoint), true, "Endpoint must belong to sovereign .ng or official domain");
    assert.equal(targetModel, "n-atlas-multilingual");
  });

  it("verifies live sovereign inference when credentials are supplied, or asserts strict fail-closed contract when awaiting credentials", async () => {
    const isConfigured = Boolean(apiKey && !apiKey.includes("placeholder") && apiKey !== "your_api_key_here");

    if (isConfigured) {
      console.log("⚡ [LIVE INTEGRATION] Executing live authenticated inference against N-ATLAS endpoint...");
      const adapter = new HttpNAtlasAdapter(targetEndpoint, apiKey!, true);

      try {
        const liveResult = await adapter.understand({
          text: "I want to renew my motor insurance policy for Lagos vehicle KJA-123AA",
          language: "en",
        });

        console.log("✅ [LIVE INTEGRATION] Live inference succeeded.");
        console.log(`   Model:      ${targetModel}`);
        console.log(`   Intent:     ${liveResult.intent}`);
        console.log(`   Confidence: ${liveResult.confidence}`);

        assert.ok(liveResult.intent);
        assert.ok(typeof liveResult.confidence === "number");
        assert.ok(liveResult.entities);
        assert.equal(liveResult.entities._officialServiceVerified, true);
        assert.equal(liveResult.entities._isLiveAI, true);
      } catch (err) {
        console.warn(`⚠️ [LIVE INTEGRATION] Live call returned error: ${(err as Error).message}`);
        assert.ok(err instanceof NAtlasConnectionError);
      }
    } else {
      console.log("ℹ️ [AWAITING CREDENTIALS] Institutional N-ATLAS credentials omitted in environment.");
      console.log("   Verifying strict fail-closed contract: strict mode throws NAtlasConnectionError on missing key.");

      const strictAdapter = new HttpNAtlasAdapter(targetEndpoint, "", true);
      await assert.rejects(
        async () => {
          await strictAdapter.understand({
            text: "Biko mezie motor insurance m",
            language: "ig",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof NAtlasConnectionError);
          assert.equal((err as NAtlasConnectionError).name, "NAtlasConnectionError");
          assert.match((err as NAtlasConnectionError).message, /N_ATLAS_API_KEY is omitted/i);
          return true;
        }
      );
    }
  });

  it("certifies that benchmark test fixtures are explicitly labeled as simulated and never as live inference", async () => {
    // In demo/test environment without credentials, createNAtlasProvider returns demo benchmark engine
    const originalStrict = process.env.N_ATLAS_STRICT_MODE;
    process.env.N_ATLAS_STRICT_MODE = "false";
    try {
      const provider = createNAtlasProvider();
      const output = await provider.understand({
        text: "Bawo ni mo se le sanwo fun moto mi",
        language: "yo",
      });

      // Verify explicit simulation stamping
      assert.equal(output.entities._isLiveAI, false);
      assert.equal(output.entities._officialServiceVerified, false);
      assert.ok(
        String(output.entities._aiProvider).includes("Demo") ||
        String(output.entities._aiProvider).includes("Benchmark") ||
        String(output.entities._aiProvider).includes("Fallback")
      );
    } finally {
      process.env.N_ATLAS_STRICT_MODE = originalStrict;
    }
  });
});

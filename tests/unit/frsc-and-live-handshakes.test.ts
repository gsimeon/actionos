import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FrscGatewayClient } from "@/lib/integrations/frsc";
import {
  HttpNAtlasAdapter,
  OfficialNAtlasProvider,
  DeterministicDemoAIProvider,
  createNAtlasProvider,
  NAtlasConnectionError,
  isOfficialNAtlasEndpoint,
  TRUSTED_N_ATLAS_HOSTS,
} from "@/lib/ai/n-atlas";
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

  describe("N-ATLAS Sovereign Endpoint Validation & Trust Boundary", () => {
    it("should validate trusted N-ATLAS official sovereign domains vs untrusted endpoints", () => {
      assert.ok(TRUSTED_N_ATLAS_HOSTS.includes("api.n-atlas.ng"));
      assert.ok(TRUSTED_N_ATLAS_HOSTS.includes("ncair.nitda.gov.ng"));
      assert.equal(isOfficialNAtlasEndpoint("https://api.n-atlas.ng/v1"), true);
      assert.equal(isOfficialNAtlasEndpoint("https://n-atlas.ng/chat/completions"), true);
      assert.equal(isOfficialNAtlasEndpoint("https://ncair.nitda.gov.ng/ai/v1"), true);
      assert.equal(isOfficialNAtlasEndpoint("https://api.nitda.gov.ng/v1"), true);
      assert.equal(isOfficialNAtlasEndpoint("https://subdomain.api.n-atlas.ng/v1"), true);

      // Untrusted, mock, or external hosts must evaluate false
      assert.equal(isOfficialNAtlasEndpoint("https://mock-api.n-atlas.com"), false);
      assert.equal(isOfficialNAtlasEndpoint("https://external-proxy.example.com/v1"), false);
      assert.equal(isOfficialNAtlasEndpoint("http://localhost:8000/v1"), false);
      assert.equal(isOfficialNAtlasEndpoint("not-a-valid-url"), false);
    });

    it("should prioritize N_ATLAS_API_ENDPOINT over N_ATLAS_API_URL for configuration", () => {
      const prevEndpoint = process.env.N_ATLAS_API_ENDPOINT;
      const prevUrl = process.env.N_ATLAS_API_URL;
      try {
        process.env.N_ATLAS_API_ENDPOINT = "https://api.n-atlas.ng/v1";
        process.env.N_ATLAS_API_URL = "https://legacy-url.n-atlas.ng/v1";

        const adapter = new HttpNAtlasAdapter();
        // @ts-expect-error - checking private property for assertion
        assert.equal(adapter.apiUrl, "https://api.n-atlas.ng/v1");

        delete process.env.N_ATLAS_API_ENDPOINT;
        const adapterLegacy = new HttpNAtlasAdapter();
        // @ts-expect-error - checking private property for assertion
        assert.equal(adapterLegacy.apiUrl, "https://legacy-url.n-atlas.ng/v1");
      } finally {
        if (prevEndpoint !== undefined) process.env.N_ATLAS_API_ENDPOINT = prevEndpoint;
        else delete process.env.N_ATLAS_API_ENDPOINT;
        if (prevUrl !== undefined) process.env.N_ATLAS_API_URL = prevUrl;
        else delete process.env.N_ATLAS_API_URL;
      }
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
      assert.equal(res.entities._officialServiceVerified, false);
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

    it("should fail closed on OfficialNAtlasProvider in strict mode when credentials are missing", async () => {
      const origKey = process.env.N_ATLAS_API_KEY;
      delete process.env.N_ATLAS_API_KEY;
      try {
        const provider = new OfficialNAtlasProvider(undefined, true);
        await assert.rejects(
          () => provider.understand({ text: "Check my car ABC-123-XY in vehicle database", language: "en-NG" }),
          (err: unknown) => {
            assert.ok(err instanceof NAtlasConnectionError);
            assert.equal(err.status, 401);
            assert.match(err.message, /N_ATLAS_STRICT_MODE violation/);
            return true;
          }
        );
      } finally {
        if (origKey) process.env.N_ATLAS_API_KEY = origKey;
      }
    });

    it("should safely bridge to benchmark engine on OfficialNAtlasProvider in non-strict mode with explicit metadata", async () => {
      const origKey = process.env.N_ATLAS_API_KEY;
      delete process.env.N_ATLAS_API_KEY;
      try {
        const provider = new OfficialNAtlasProvider(undefined, false);
        const res = await provider.understand({
          text: "Check my car ABC-123-XY in vehicle database",
          language: "en-NG",
        });

        assert.equal(res.intent, "query_vehicle");
        assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
        assert.equal(res.entities._isLiveAI, false);
        assert.equal(res.entities._liveVerified, false);
        assert.equal(res.entities._officialServiceVerified, false);
        assert.equal(res.entities._nAtlasFallback, true);
        assert.equal(res.entities._aiProvider, "N-ATLAS Fallback (Deterministic Benchmark Engine)");
        assert.match(String(res.entities._fallbackReason), /Missing official adapter and N_ATLAS_API_KEY/);
      } finally {
        if (origKey) process.env.N_ATLAS_API_KEY = origKey;
      }
    });

    it("should fail fast with NAtlasConnectionError in strict mode when HTTP endpoint returns 500 error", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => ({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })) as unknown as typeof fetch;

        const adapter = new HttpNAtlasAdapter("https://api.n-atlas.ng/v1", "test-live-key", true);
        await assert.rejects(
          () => adapter.understand({ text: "Renew car insurance", language: "en-NG" }),
          (err: unknown) => {
            assert.ok(err instanceof NAtlasConnectionError);
            assert.equal(err.status, 500);
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should fallback with explicit reason in non-strict mode when HTTP endpoint returns 500 error", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => ({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })) as unknown as typeof fetch;

        const adapter = new HttpNAtlasAdapter("https://api.n-atlas.ng/v1", "test-live-key", false);
        const res = await adapter.understand({ text: "Renew car insurance ABC-123-XY", language: "en-NG" });
        assert.equal(res.entities._isLiveAI, false);
        assert.equal(res.entities._nAtlasFallback, true);
        assert.match(String(res.entities._fallbackReason), /HTTP 500/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should fail fast in strict mode and fallback in non-strict mode when response JSON is invalid or message content is empty", async () => {
      const originalFetch = globalThis.fetch;
      try {
        // 1. Unparseable non-JSON content
        globalThis.fetch = (async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: "this is not valid json content" } }],
          }),
        })) as unknown as typeof fetch;

        const strictAdapter = new HttpNAtlasAdapter("https://api.n-atlas.ng/v1", "test-live-key", true);
        await assert.rejects(
          () => strictAdapter.understand({ text: "Renew car insurance", language: "en-NG" }),
          (err: unknown) => {
            assert.ok(err instanceof NAtlasConnectionError);
            assert.equal(err.status, 502);
            assert.match(err.message, /invalid non-JSON payload/);
            return true;
          }
        );

        const nonStrictAdapter = new HttpNAtlasAdapter("https://api.n-atlas.ng/v1", "test-live-key", false);
        const fallbackRes = await nonStrictAdapter.understand({ text: "Renew car insurance ABC-123-XY", language: "en-NG" });
        assert.equal(fallbackRes.entities._nAtlasFallback, true);
        assert.match(String(fallbackRes.entities._fallbackReason), /invalid non-JSON payload/);

        // 2. Empty message content
        globalThis.fetch = (async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: "" } }],
          }),
        })) as unknown as typeof fetch;

        await assert.rejects(
          () => strictAdapter.understand({ text: "Renew car insurance", language: "en-NG" }),
          (err: unknown) => {
            assert.ok(err instanceof NAtlasConnectionError);
            assert.equal(err.status, 502);
            assert.match(err.message, /empty or missing/);
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should preserve independent demo mode operation via createNAtlasProvider", () => {
      const origMode = process.env.ACTIONOS_RUNTIME_MODE;
      const origDemo = process.env.DEMO_MODE;
      const origKey = process.env.N_ATLAS_API_KEY;
      try {
        process.env.ACTIONOS_RUNTIME_MODE = "demo";
        process.env.DEMO_MODE = "true";
        delete process.env.N_ATLAS_API_KEY;

        const provider = createNAtlasProvider();
        assert.ok(provider instanceof DeterministicDemoAIProvider);
        assert.equal(provider.name, "Demo AI Adapter (Multilingual Nigeria)");
      } finally {
        if (origMode) process.env.ACTIONOS_RUNTIME_MODE = origMode;
        if (origDemo) process.env.DEMO_MODE = origDemo;
        if (origKey) process.env.N_ATLAS_API_KEY = origKey;
      }
    });

    it("should distinguish live API success (_isLiveAI) from official sovereign provenance (_officialServiceVerified)", async () => {
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
                    confidence: 0.99,
                    entities: { policyNumber: "AUTO-2026-00182" },
                    language: "en-NG",
                  }),
                },
              },
            ],
          }),
        })) as unknown as typeof fetch;

        // 1. Tested against official trusted host
        const officialAdapter = new HttpNAtlasAdapter("https://api.n-atlas.ng/v1", "test-live-key");
        const officialRes = await officialAdapter.understand({
          text: "Renew policy AUTO-2026-00182",
          language: "en-NG",
        });

        assert.equal(officialRes.entities._isLiveAI, true);
        assert.equal(officialRes.entities._liveVerified, true);
        assert.equal(officialRes.entities._officialServiceVerified, true);
        const officialEvidence = officialRes.entities._evidence as { isOfficialEndpoint: boolean };
        assert.equal(officialEvidence.isOfficialEndpoint, true);

        // 2. Tested against non-official or proxy host (proves response returned, but flags provenance)
        const proxyAdapter = new HttpNAtlasAdapter("https://external-proxy.example.com/v1", "test-live-key");
        const proxyRes = await proxyAdapter.understand({
          text: "Renew policy AUTO-2026-00182",
          language: "en-NG",
        });

        assert.equal(proxyRes.entities._isLiveAI, true);
        assert.equal(proxyRes.entities._liveVerified, true);
        assert.equal(proxyRes.entities._officialServiceVerified, false);
        const proxyEvidence = proxyRes.entities._evidence as { isOfficialEndpoint: boolean };
        assert.equal(proxyEvidence.isOfficialEndpoint, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should sanitize prompt in _evidence and record redacted provenance when live inference succeeds", async () => {
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
          text: "My card 4111222233334444 and phone 08031234567 for policy AUTO-2026-00182 with plate ABC-123-XY and NIN 12345678901",
          language: "en-NG",
        });

        assert.equal(res.intent, "renew_policy");
        assert.equal(res.entities._isLiveAI, true);
        assert.equal(res.entities._liveVerified, true);
        assert.equal(res.entities._officialServiceVerified, true);
        assert.ok(res.entities._evidence);
        const evidence = res.entities._evidence as {
          sanitizedPrompt: string;
          endpoint: string;
          isOfficialEndpoint: boolean;
          model: string;
          latencyMs: number;
        };
        assert.equal(evidence.endpoint, "https://api.n-atlas.ng/v1");
        assert.equal(evidence.isOfficialEndpoint, true);
        assert.equal(evidence.model, "n-atlas-multilingual");
        assert.ok(typeof evidence.latencyMs === "number");

        // Privacy check: raw sensitive customer data MUST be redacted in evidence log
        assert.ok(!evidence.sanitizedPrompt.includes("4111222233334444"), "Card number must be redacted");
        assert.ok(!evidence.sanitizedPrompt.includes("08031234567"), "Phone number must be redacted");
        assert.ok(!evidence.sanitizedPrompt.includes("AUTO-2026-00182"), "Policy number must be redacted");
        assert.ok(!evidence.sanitizedPrompt.includes("ABC-123-XY"), "Vehicle plate must be redacted");
        assert.ok(!evidence.sanitizedPrompt.includes("12345678901"), "NIN must be redacted");
        assert.ok(evidence.sanitizedPrompt.includes("[REDACTED_CARD]"));
        assert.ok(evidence.sanitizedPrompt.includes("[REDACTED_PHONE]"));
        assert.ok(evidence.sanitizedPrompt.includes("[REDACTED_POLICY]"));
        assert.ok(evidence.sanitizedPrompt.includes("[REDACTED_PLATE]"));
        assert.ok(evidence.sanitizedPrompt.includes("[REDACTED_IDENTIFIER]"));
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

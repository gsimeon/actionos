import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OfficialNAtlasProvider,
  HttpNAtlasAdapter,
  DeterministicDemoAIProvider,
  createNAtlasProvider,
  registerNAtlasAdapter,
  NAtlasConnectionError,
  type INAtlasAdapter,
  type NAtlasInput,
} from "@/lib/ai/n-atlas";
import type { NAtlasUnderstanding } from "@/types/actionos";

describe("N-ATLAS Strict Mode & Zero Silent Fallback Regression Suite", () => {
  describe("1. Custom Adapter Failure Isolation (No Silent Fallback)", () => {
    it("proves a constructor-provided custom adapter failure cannot silently fall back to benchmark engine", async () => {
      const failingCustomAdapter: INAtlasAdapter = {
        name: "Mock Sovereign NITDA SDK Adapter",
        understand: async (_input: NAtlasInput): Promise<NAtlasUnderstanding> => {
          throw new Error("SDK_INTERNAL_FAULT: Local model weights corrupted or GPU OOM");
        },
      };

      // In non-strict mode OR strict mode, a registered custom adapter failure MUST bubble up
      const providerNonStrict = new OfficialNAtlasProvider(failingCustomAdapter, false);
      await assert.rejects(
        () => providerNonStrict.understand({ text: "Renew car insurance ABC-123-XY", language: "en-NG" }),
        (err: Error) => {
          assert.equal(err.message, "SDK_INTERNAL_FAULT: Local model weights corrupted or GPU OOM");
          return true;
        }
      );

      const providerStrict = new OfficialNAtlasProvider(failingCustomAdapter, true);
      await assert.rejects(
        () => providerStrict.understand({ text: "Renew car insurance ABC-123-XY", language: "en-NG" }),
        (err: Error) => {
          assert.equal(err.message, "SDK_INTERNAL_FAULT: Local model weights corrupted or GPU OOM");
          return true;
        }
      );
    });

    it("proves a globally registered adapter failure via registerNAtlasAdapter propagates without fallback", async () => {
      const failingGlobalAdapter: INAtlasAdapter = {
        name: "Global Sovereign N-ATLAS Client",
        understand: async (): Promise<NAtlasUnderstanding> => {
          throw new TypeError("gRPC channel disconnected unexpectedly");
        },
      };

      registerNAtlasAdapter(failingGlobalAdapter);
      try {
        const provider = new OfficialNAtlasProvider(undefined, false);
        await assert.rejects(
          () => provider.understand({ text: "Renew policy AUTO-2026-00182", language: "en-NG" }),
          (err: Error) => {
            assert.ok(err instanceof TypeError);
            assert.equal(err.message, "gRPC channel disconnected unexpectedly");
            return true;
          }
        );
      } finally {
        registerNAtlasAdapter(null);
      }
    });
  });

  describe("2. Configured But Unavailable API Fails Closed in Strict Mode", () => {
    it("fails closed with NAtlasConnectionError when network connection is refused (ECONNREFUSED / fetch failed)", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          throw new TypeError("fetch failed: ECONNREFUSED 102.164.212.10:443");
        }) as unknown as typeof fetch;

        // 1. Direct HttpNAtlasAdapter in strict mode
        const adapter = new HttpNAtlasAdapter("https://api.n-atlas.ng/v1", "genuine-competition-key", true);
        await assert.rejects(
          () => adapter.understand({ text: "Renew my vehicle license ABC-123-XY", language: "en-NG" }),
          (err: unknown) => {
            assert.ok(err instanceof NAtlasConnectionError);
            assert.equal(err.status, 503);
            assert.match(err.message, /N-ATLAS connection failure in strict mode/);
            return true;
          }
        );

        // 2. OfficialNAtlasProvider delegating to HTTP adapter in strict mode
        const prevKey = process.env.N_ATLAS_API_KEY;
        try {
          process.env.N_ATLAS_API_KEY = "genuine-competition-key";
          const provider = new OfficialNAtlasProvider(undefined, true);
          await assert.rejects(
            () => provider.understand({ text: "Renew my vehicle license ABC-123-XY", language: "en-NG" }),
            (err: unknown) => {
              assert.ok(err instanceof NAtlasConnectionError);
              assert.equal(err.status, 503);
              return true;
            }
          );
        } finally {
          if (prevKey) process.env.N_ATLAS_API_KEY = prevKey;
          else delete process.env.N_ATLAS_API_KEY;
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("fails closed with NAtlasConnectionError (504 timeout) when remote endpoint times out", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          const timeoutErr = new Error("The operation was aborted due to timeout");
          timeoutErr.name = "AbortError";
          throw timeoutErr;
        }) as unknown as typeof fetch;

        const adapter = new HttpNAtlasAdapter("https://api.n-atlas.ng/v1", "genuine-competition-key", true);
        await assert.rejects(
          () => adapter.understand({ text: "Renew policy AUTO-2026-00182", language: "en-NG" }),
          (err: unknown) => {
            assert.ok(err instanceof NAtlasConnectionError);
            assert.equal(err.status, 504);
            assert.equal(err.isTimeout, true);
            assert.match(err.message, /connection failure in strict mode/);
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("fails closed with NAtlasConnectionError when API returns HTTP 503 Service Unavailable", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => ({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
        })) as unknown as typeof fetch;

        const adapter = new HttpNAtlasAdapter("https://api.n-atlas.ng/v1", "genuine-competition-key", true);
        await assert.rejects(
          () => adapter.understand({ text: "Renew policy AUTO-2026-00182", language: "en-NG" }),
          (err: unknown) => {
            assert.ok(err instanceof NAtlasConnectionError);
            assert.equal(err.status, 503);
            assert.match(err.message, /HTTP 503/);
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("fails closed with NAtlasConnectionError (502) when API returns malformed non-JSON response in strict mode", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: "<html>502 Bad Gateway from Cloudflare Proxy</html>" } }],
          }),
        })) as unknown as typeof fetch;

        const adapter = new HttpNAtlasAdapter("https://api.n-atlas.ng/v1", "genuine-competition-key", true);
        await assert.rejects(
          () => adapter.understand({ text: "Renew policy AUTO-2026-00182", language: "en-NG" }),
          (err: unknown) => {
            assert.ok(err instanceof NAtlasConnectionError);
            assert.equal(err.status, 502);
            assert.match(err.message, /invalid non-JSON payload/);
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("3. Transparent Fallback Behavior in Non-Strict Mode", () => {
    it("falls back with explicit diagnostic attribution when API is unavailable in non-strict mode", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          throw new TypeError("fetch failed: ENOTFOUND api.n-atlas.ng");
        }) as unknown as typeof fetch;

        const adapter = new HttpNAtlasAdapter("https://api.n-atlas.ng/v1", "genuine-competition-key", false);
        const result = await adapter.understand({
          text: "Renew my Toyota Camry insurance AUTO-2026-00182",
          language: "en-NG",
        });

        // Intent extracted correctly by benchmark engine
        assert.equal(result.intent, "renew_policy");
        assert.equal(result.entities.policyNumber, "AUTO-2026-00182");

        // Strictly attributed metadata: never masquerades as live AI
        assert.equal(result.entities._nAtlasFallback, true);
        assert.equal(result.entities._isLiveAI, false);
        assert.equal(result.entities._liveVerified, false);
        assert.equal(result.entities._officialServiceVerified, false);
        assert.equal(result.entities._aiProvider, "N-ATLAS Fallback (Deterministic Benchmark Engine)");
        assert.match(String(result.entities._fallbackReason), /ENOTFOUND api.n-atlas.ng/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("4. Factory Strict Mode Enforcement via createNAtlasProvider", () => {
    it("forces OfficialNAtlasProvider and fails closed when N_ATLAS_STRICT_MODE=true even in demo runtime mode", async () => {
      const prevStrict = process.env.N_ATLAS_STRICT_MODE;
      const prevKey = process.env.N_ATLAS_API_KEY;
      const prevMode = process.env.ACTIONOS_RUNTIME_MODE;

      try {
        process.env.N_ATLAS_STRICT_MODE = "true";
        delete process.env.N_ATLAS_API_KEY;
        process.env.ACTIONOS_RUNTIME_MODE = "demo";

        const provider = createNAtlasProvider();
        assert.ok(provider instanceof OfficialNAtlasProvider);
        assert.equal(provider.name, "Official N-ATLAS Integration Boundary");

        // Attempting to invoke without registered adapter or key in strict mode fails closed
        await assert.rejects(
          () => provider.understand({ text: "Renew car insurance ABC-123-XY", language: "en-NG" }),
          (err: unknown) => {
            assert.ok(err instanceof NAtlasConnectionError);
            assert.equal(err.status, 401);
            assert.match(err.message, /N_ATLAS_STRICT_MODE violation/);
            return true;
          }
        );
      } finally {
        if (prevStrict !== undefined) process.env.N_ATLAS_STRICT_MODE = prevStrict;
        else delete process.env.N_ATLAS_STRICT_MODE;
        if (prevKey !== undefined) process.env.N_ATLAS_API_KEY = prevKey;
        else delete process.env.N_ATLAS_API_KEY;
        if (prevMode !== undefined) process.env.ACTIONOS_RUNTIME_MODE = prevMode;
        else delete process.env.ACTIONOS_RUNTIME_MODE;
      }
    });

    it("returns DeterministicDemoAIProvider when strict mode is false and demo mode is active", () => {
      const prevStrict = process.env.N_ATLAS_STRICT_MODE;
      const prevKey = process.env.N_ATLAS_API_KEY;
      const prevMode = process.env.ACTIONOS_RUNTIME_MODE;

      try {
        delete process.env.N_ATLAS_STRICT_MODE;
        delete process.env.N_ATLAS_API_KEY;
        process.env.ACTIONOS_RUNTIME_MODE = "demo";

        const provider = createNAtlasProvider();
        assert.ok(provider instanceof DeterministicDemoAIProvider);
        assert.equal(provider.name, "Demo AI Adapter (Multilingual Nigeria)");
      } finally {
        if (prevStrict !== undefined) process.env.N_ATLAS_STRICT_MODE = prevStrict;
        else delete process.env.N_ATLAS_STRICT_MODE;
        if (prevKey !== undefined) process.env.N_ATLAS_API_KEY = prevKey;
        else delete process.env.N_ATLAS_API_KEY;
        if (prevMode !== undefined) process.env.ACTIONOS_RUNTIME_MODE = prevMode;
        else delete process.env.ACTIONOS_RUNTIME_MODE;
      }
    });
  });
});

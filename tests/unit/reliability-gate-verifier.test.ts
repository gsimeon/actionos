import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveGateMode,
  isPlaceholderUrl,
  classifyRpcResult,
  classifyTableExistence,
  classifyRlsDenial,
  verifyMigrationsInventory,
  generateSummaryMarkdown,
  runValidation,
  EXPECTED_CORE_TABLES,
  SENSITIVE_RPC_ENDPOINTS,
} from "../../scripts/verify-supabase-staging.mjs";

describe("ActionOS Reliability Gate v2: Verifier & Invariant Testing Suite", () => {
  describe("1. Mode Resolution & Fallback Prevention (Finding 2)", () => {
    it("resolves explicit --mode=staging-required CLI argument", () => {
      const mode = resolveGateMode(["node", "script.mjs", "--mode=staging-required"], {});
      assert.equal(mode, "staging-required");
    });

    it("resolves explicit --mode=offline CLI argument", () => {
      const mode = resolveGateMode(["node", "script.mjs", "--mode=offline"], {});
      assert.equal(mode, "offline");
    });

    it("resolves RELIABILITY_GATE_MODE environment variable", () => {
      const modeStaging = resolveGateMode([], { RELIABILITY_GATE_MODE: "staging-required" });
      assert.equal(modeStaging, "staging-required");

      const modeOffline = resolveGateMode([], { RELIABILITY_GATE_MODE: "offline" });
      assert.equal(modeOffline, "offline");
    });

    it("auto mode detects offline when staging URL is omitted or placeholder", () => {
      const emptyMode = resolveGateMode([], {});
      assert.equal(emptyMode, "offline");

      const placeholderMode = resolveGateMode([], {
        SUPABASE_STAGING_URL: "https://demo-project.supabase.co",
      });
      assert.equal(placeholderMode, "offline");
    });

    it("auto mode selects staging-required when a non-placeholder staging URL is present", () => {
      const mode = resolveGateMode([], {
        SUPABASE_STAGING_URL: "https://kyfcvolkxxtsbouuzdtm.supabase.co",
      });
      assert.equal(mode, "staging-required");
    });

    it("correctly identifies placeholder and demo endpoints", () => {
      assert.equal(isPlaceholderUrl(""), true);
      assert.equal(isPlaceholderUrl(undefined), true);
      assert.equal(isPlaceholderUrl("https://demo-project.supabase.co"), true);
      assert.equal(isPlaceholderUrl("https://placeholder-url.supabase.co"), true);
      assert.equal(isPlaceholderUrl("https://example.com"), true);
      assert.equal(isPlaceholderUrl("https://kyfcvolkxxtsbouuzdtm.supabase.co"), false);
      assert.equal(isPlaceholderUrl("https://prod-subdomain.supabase.co"), false);
    });
  });

  describe("2. Strict RPC Denial Classification (Finding 1)", () => {
    it("strictly flags an unprivileged RPC execution that returned data as a critical security leak", () => {
      const result = classifyRpcResult({
        data: { success: true, transaction_id: "tx_123" },
        error: null,
        status: 200,
      });

      assert.equal(result.isPermissionDenied, false);
      assert.equal(result.isCriticalLeak, true);
      assert.equal(result.category, "security_leak");
      assert.match(result.reason, /CRITICAL SECURITY FAILURE/);
    });

    it("strictly rejects network errors from being mistaken as permission denials", () => {
      const fetchErrorResult = classifyRpcResult({
        data: null,
        error: new TypeError("fetch failed: ECONNREFUSED 127.0.0.1:443"),
      });

      assert.equal(fetchErrorResult.isPermissionDenied, false);
      assert.equal(fetchErrorResult.isCriticalLeak, false);
      assert.equal(fetchErrorResult.category, "network_failure");
      assert.match(fetchErrorResult.reason, /Network\/Connectivity error/);

      const timeoutResult = classifyRpcResult({
        data: null,
        error: { message: "ETIMEDOUT: Connection timed out" },
      });
      assert.equal(timeoutResult.isPermissionDenied, false);
      assert.equal(timeoutResult.category, "network_failure");
    });

    it("strictly rejects server 500 crashes from being counted as permission denials", () => {
      const result = classifyRpcResult({
        data: null,
        error: { code: "XX000", message: "internal PostgreSQL server crash" },
        status: 500,
      });

      assert.equal(result.isPermissionDenied, false);
      assert.equal(result.category, "server_error");
      assert.match(result.reason, /HTTP 500/);
    });

    it("strictly rejects unexpected bad requests (HTTP 400) from being counted as permission denials", () => {
      // If code is 400, it means the RPC was reachable by the role and parsed input arguments
      const result = classifyRpcResult({
        data: null,
        error: { code: "22P02", message: "invalid input syntax for type uuid" },
        status: 400,
      });

      assert.equal(result.isPermissionDenied, false);
      assert.equal(result.category, "unexpected_error");
    });

    it("accepts PostgREST PGRST202 (not exposed/function revoked) as valid privilege revocation", () => {
      const result = classifyRpcResult({
        data: null,
        error: { code: "PGRST202", message: "Could not find the function public.settle_payment_webhook in the schema cache" },
        status: 404,
      });

      assert.equal(result.isPermissionDenied, true);
      assert.equal(result.isCriticalLeak, false);
      assert.equal(result.category, "permission_denied");
      assert.match(result.reason, /Privilege strictly revoked/);
    });

    it("accepts PostgreSQL 42501 (insufficient privilege) as valid privilege revocation", () => {
      const result = classifyRpcResult({
        data: null,
        error: { code: "42501", message: "permission denied for function settle_payment_webhook" },
        status: 403,
      });

      assert.equal(result.isPermissionDenied, true);
      assert.equal(result.isCriticalLeak, false);
      assert.equal(result.category, "permission_denied");
    });
  });

  describe("3. Table Schema & Catalog Existence Verification (Finding 3)", () => {
    it("confirms existence when table responds cleanly (HTTP 200)", () => {
      const result = classifyTableExistence({ error: null, status: 200, count: 5 }, "policies");
      assert.equal(result.exists, true);
      assert.equal(result.category, "table_present");
    });

    it("confirms existence when table exists in PostgreSQL catalog but role has restricted SELECT (42501)", () => {
      const result = classifyTableExistence(
        {
          error: { code: "42501", message: "permission denied for table tools" },
          status: 403,
        },
        "tools"
      );
      assert.equal(result.exists, true);
      assert.equal(result.category, "table_restricted");
    });

    it("strictly rejects PGRST116 cardinality mismatch as proof of table existence", () => {
      const result = classifyTableExistence(
        {
          error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
          status: 406,
        },
        "non_existent_table"
      );

      assert.equal(result.exists, false);
      assert.equal(result.category, "cardinality_error");
      assert.match(result.reason, /invalid proof of table existence/);
    });

    it("classifies PGRST205 or 42P01 as a missing relation failure", () => {
      const result = classifyTableExistence(
        {
          error: { code: "PGRST205", message: "Could not find the relation non_existent in the schema cache" },
          status: 404,
        },
        "non_existent"
      );

      assert.equal(result.exists, false);
      assert.equal(result.category, "relation_missing");
    });

    it("classifies network errors during table probe as failures", () => {
      const result = classifyTableExistence(
        {
          error: { message: "fetch failed: ECONNRESET" },
        },
        "organizations"
      );

      assert.equal(result.exists, false);
      assert.equal(result.category, "network_failure");
    });
  });

  describe("4. Row Level Security (RLS) Isolation Verification", () => {
    it("flags unauthenticated reads returning data as critical RLS breaches", () => {
      const result = classifyRlsDenial(
        {
          data: [{ id: "pol_1", premium: 100000 }],
          error: null,
          status: 200,
        },
        "policies"
      );

      assert.equal(result.isIsolated, false);
      assert.equal(result.isCriticalLeak, true);
      assert.equal(result.category, "data_leak");
      assert.match(result.reason, /CRITICAL RLS BREACH/);
    });

    it("accepts empty array (0 records) as proof of RLS tenant isolation filter", () => {
      const result = classifyRlsDenial(
        {
          data: [],
          error: null,
          status: 200,
        },
        "policies"
      );

      assert.equal(result.isIsolated, true);
      assert.equal(result.isCriticalLeak, false);
      assert.equal(result.category, "rls_empty_filter");
    });

    it("accepts explicit permission denial (42501 / PGRST205) as proof of isolation", () => {
      const result = classifyRlsDenial(
        {
          data: null,
          error: { code: "42501", message: "permission denied for table action_ledger_events" },
          status: 403,
        },
        "action_ledger_events"
      );

      assert.equal(result.isIsolated, true);
      assert.equal(result.isCriticalLeak, false);
      assert.equal(result.category, "permission_denied");
    });

    it("rejects network exceptions during RLS checks as failures", () => {
      const result = classifyRlsDenial(
        {
          data: null,
          error: { message: "fetch failed: network timeout" },
        },
        "policies"
      );

      assert.equal(result.isIsolated, false);
      assert.equal(result.category, "network_failure");
    });
  });

  describe("5. SQL Migration Inventory Verification", () => {
    it("validates sequential migration files and essential security migrations", () => {
      const inventory = verifyMigrationsInventory();
      assert.equal(inventory.passed, true);
      assert.ok(inventory.checks.length >= 5);

      const countCheck = inventory.checks.find((c) => c.name === "migration_file_count");
      assert.equal(countCheck?.status, "passed");

      const seqCheck = inventory.checks.find((c) => c.name === "migration_naming_sequential");
      assert.equal(seqCheck?.status, "passed");

      const webhookCheck = inventory.checks.find((c) => c.name === "migration_atomic_payment_webhook_settlement");
      assert.equal(webhookCheck?.status, "passed");

      const refundCheck = inventory.checks.find((c) => c.name === "migration_atomic_refund_settlement_and_balance_reservation");
      assert.equal(refundCheck?.status, "passed");

      const grantsCheck = inventory.checks.find((c) => c.name === "migration_harden_rpc_execution_grants");
      assert.equal(grantsCheck?.status, "passed");
    });
  });

  describe("6. Gate Execution & Failure Guardrails (Finding 2 & Done Criteria)", () => {
    it("fails immediately in staging-required mode if SUPABASE_STAGING_URL is missing", async () => {
      const result = await runValidation(
        {
          RELIABILITY_GATE_MODE: "staging-required",
          SUPABASE_STAGING_URL: "",
          SUPABASE_STAGING_ANON_KEY: "",
        },
        []
      );

      assert.equal(result.exitCode, 1);
      assert.equal(result.report.status, "failed");
      assert.equal(result.report.liveVerified, false);
      assert.match(result.report.error, /STAGING-REQUIRED FAILURE: Missing valid SUPABASE_STAGING_URL/);
    });

    it("fails immediately in staging-required mode if placeholder URL is provided", async () => {
      const result = await runValidation(
        {
          RELIABILITY_GATE_MODE: "staging-required",
          SUPABASE_STAGING_URL: "https://demo-project.supabase.co",
          SUPABASE_STAGING_ANON_KEY: "some-anon-key",
        },
        []
      );

      assert.equal(result.exitCode, 1);
      assert.equal(result.report.status, "failed");
      assert.match(result.report.error, /STAGING-REQUIRED FAILURE: Missing valid SUPABASE_STAGING_URL/);
    });

    it("passes deterministically in offline mode and explicitly records liveVerified: false", async () => {
      const result = await runValidation(
        {
          RELIABILITY_GATE_MODE: "offline",
        },
        []
      );

      assert.equal(result.exitCode, 0);
      assert.equal(result.report.status, "passed");
      assert.equal(result.report.mode, "offline");
      assert.equal(result.report.liveVerified, false);
      assert.equal(result.report.targetUrl, "offline");
    });

    it("generates markdown summary correctly formatted for GitHub Actions", () => {
      const mockReport = {
        timestamp: "2026-10-16T17:30:00Z",
        mode: "offline",
        targetUrl: "offline",
        liveVerified: false,
        status: "passed",
        summary: {
          total: 5,
          passed: 5,
          failed: 0,
          skipped: 0,
          passPercentage: 100,
        },
        checks: [
          { name: "migration_file_count", category: "migrations", status: "passed", details: "Found 13 files" },
          { name: "migration_naming_sequential", category: "migrations", status: "passed", details: "All sequential" },
        ],
      };

      const md = generateSummaryMarkdown(mockReport);
      assert.match(md, /ActionOS Reliability Gate v2: Verification Summary/);
      assert.match(md, /OFFLINE \(Local Invariants Only\)/);
      assert.match(md, /Offline Mode Notice/);
      assert.match(md, /migration_file_count/);
    });
  });

  describe("7. Target Inventory Sanity", () => {
    it("defines 15 core database tables", () => {
      assert.equal(EXPECTED_CORE_TABLES.length, 15);
      assert.ok(EXPECTED_CORE_TABLES.includes("policies"));
      assert.ok(EXPECTED_CORE_TABLES.includes("action_ledger_events"));
      assert.ok(EXPECTED_CORE_TABLES.includes("quotes"));
      assert.ok(EXPECTED_CORE_TABLES.includes("renewals"));
    });

    it("defines 5 sensitive RPC endpoints requiring execution revocation", () => {
      assert.equal(SENSITIVE_RPC_ENDPOINTS.length, 5);
      const names = SENSITIVE_RPC_ENDPOINTS.map((e) => e.name);
      assert.ok(names.includes("settle_payment_webhook"));
      assert.ok(names.includes("reserve_refund_balance"));
      assert.ok(names.includes("release_refund_reservation"));
      assert.ok(names.includes("finalize_atomic_refund_settlement"));
      assert.ok(names.includes("claim_and_accept_quote"));
    });
  });
});

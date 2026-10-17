import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ActionOS Reliability Gate v2: Supabase Staging & Security Invariants Verifier
 * 
 * Invariant Guarantees:
 * 1. Explicit Modes:
 *    - 'staging-required': Fails fast if credentials are missing or placeholder.
 *    - 'offline': Runs deterministic local invariants and explicitly flags live validation as unverified.
 *    - 'auto': Selects 'staging-required' if staging credentials are provided, else 'offline'.
 * 2. Strict Error Classification:
 *    - Network errors, timeouts, 500s, and unhandled client exceptions are strictly categorized as failures.
 *    - Permission denials are only accepted when explicit expected PostgREST/Postgres codes match.
 * 3. Schema & Table Verification:
 *    - Tables must exist in PostgREST catalog (HTTP 200/206 or explicit 42501 privilege restriction).
 *    - PGRST205/42P01 (relation missing) and PGRST116 are rejected as existence proof.
 * 4. Audit & Machine-Readable Output:
 *    - Emits reliability-gate-report.json and Markdown to $GITHUB_STEP_SUMMARY.
 */

export const EXPECTED_CORE_TABLES = [
  "organizations",
  "profiles",
  "customers",
  "assets",
  "policies",
  "renewals",
  "quotes",
  "tools",
  "action_sessions",
  "action_plans",
  "action_steps",
  "action_ledger_events",
  "transactions",
  "documents",
  "notifications",
];

export const SENSITIVE_RPC_ENDPOINTS = [
  { name: "settle_payment_webhook", args: { p_transaction_reference: "probe_ref_unauthorized" } },
  { name: "reserve_refund_balance", args: { p_organization_id: "a0000000-0000-0000-0000-000000000001", p_amount: 100 } },
  { name: "release_refund_reservation", args: { p_reservation_id: "probe_res_unauthorized" } },
  { name: "finalize_atomic_refund_settlement", args: { p_refund_transaction_id: "probe_tx_unauthorized" } },
  { name: "claim_and_accept_quote", args: { p_quote_id: "probe_quote_unauthorized" } },
];

/**
 * Resolves the verification mode from CLI args or environment variables.
 * @param {string[]} [argv]
 * @param {Record<string, string | undefined>} [env]
 * @returns {'staging-required' | 'offline'}
 */
export function resolveGateMode(argv = process.argv, env = process.env) {
  const modeArg = argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1];
  const requestedMode = modeArg || env.RELIABILITY_GATE_MODE || env.VERIFY_MODE || "auto";

  if (requestedMode === "staging-required" || requestedMode === "staging") {
    return "staging-required";
  }
  if (requestedMode === "offline" || requestedMode === "ci-offline") {
    return "offline";
  }

  // Auto-detect mode
  const stagingUrl = env.SUPABASE_STAGING_URL || "";
  const isPlaceholder = !stagingUrl || stagingUrl.includes("demo-project.supabase.co") || stagingUrl.includes("placeholder");

  return isPlaceholder ? "offline" : "staging-required";
}

/**
 * Checks if a URL or host is a placeholder or demo endpoint.
 * @param {string} [url]
 * @returns {boolean}
 */
export function isPlaceholderUrl(url) {
  if (!url || typeof url !== "string") return true;
  const lower = url.toLowerCase();
  return (
    lower.includes("demo-project.supabase.co") ||
    lower.includes("placeholder") ||
    lower.includes("example.com") ||
    lower === "http://localhost:54321" && !process.env.ACTIONOS_ALLOW_LOCAL_SUPABASE
  );
}

/**
 * Classifies an RPC call result to ensure it was strictly denied by PostgreSQL / PostgREST permissions.
 * Never treats network failures, 500s, or client exceptions as permission denials.
 * 
 * @param {{ data: any, error: any, status?: number }} result
 * @returns {{ isPermissionDenied: boolean, isCriticalLeak: boolean, category: string, reason: string }}
 */
export function classifyRpcResult(result) {
  const { data, error, status } = result;

  // 1. Critical security failure: RPC actually executed and returned data
  if (!error) {
    return {
      isPermissionDenied: false,
      isCriticalLeak: true,
      category: "security_leak",
      reason: `CRITICAL SECURITY FAILURE: Sensitive RPC executed by unprivileged role! Returned: ${JSON.stringify(data)}`,
    };
  }

  // 2. Network failures or thrown network-level errors
  const errMsg = (error?.message || "").toLowerCase();
  if (
    errMsg.includes("fetch failed") ||
    errMsg.includes("networkerror") ||
    errMsg.includes("econnrefused") ||
    errMsg.includes("etimedout") ||
    errMsg.includes("enotfound") ||
    errMsg.includes("abort")
  ) {
    return {
      isPermissionDenied: false,
      isCriticalLeak: false,
      category: "network_failure",
      reason: `Network/Connectivity error during RPC probe: ${error.message}`,
    };
  }

  // 3. Server errors (HTTP 5xx)
  if (status && status >= 500) {
    return {
      isPermissionDenied: false,
      isCriticalLeak: false,
      category: "server_error",
      reason: `Database/Server responded with HTTP ${status}: ${error.message} (code: ${error.code})`,
    };
  }

  // 4. Recognized permission denials:
  // PostgREST returns 404 with PGRST202 when an RPC is revoked or not granted EXECUTE to the role.
  // Postgres returns 403 / 401 with 42501 (insufficient privilege) or PGRST301 (JWT forbidden).
  const isPostgrestRevoked = status === 404 && error.code === "PGRST202";
  const isPostgresPermissionDenied = (status === 403 || status === 401) && (error.code === "42501" || error.code === "PGRST301");

  if (isPostgrestRevoked || isPostgresPermissionDenied) {
    return {
      isPermissionDenied: true,
      isCriticalLeak: false,
      category: "permission_denied",
      reason: `Privilege strictly revoked: HTTP ${status}, code: ${error.code} (${error.message || "access denied"})`,
    };
  }

  // 5. Unrecognized error (e.g. invalid arguments or bad request HTTP 400).
  // If PostgREST returns 400 invalid input syntax, it means the RPC WAS reachable and parsed!
  return {
    isPermissionDenied: false,
    isCriticalLeak: false,
    category: "unexpected_error",
    reason: `Unexpected error status HTTP ${status}, code: ${error.code}: ${error.message}`,
  };
}

/**
 * Classifies a PostgREST table existence check result.
 * Distinguishes relation presence from PGRST116 or missing relation errors.
 * 
 * @param {{ data?: any, error: any, status?: number, count?: number | null }} result
 * @param {string} tableName
 * @returns {{ exists: boolean, category: string, reason: string }}
 */
export function classifyTableExistence(result, tableName) {
  const { error, status } = result;

  // 1. Success response (HTTP 200, 204, 206 or any 2xx)
  const is2xx = status !== undefined && status >= 200 && status < 300;
  if (!error && (is2xx || status === undefined)) {
    return {
      exists: true,
      category: "table_present",
      reason: `Table '${tableName}' exists and responded in PostgREST catalog (status: ${status || 200})`,
    };
  }

  // 2. Permission denied (HTTP 401 / 403 with 42501)
  // Table exists in Postgres catalog, but anon has zero SELECT privilege on it.
  if (status && (status === 401 || status === 403) && error?.code === "42501") {
    return {
      exists: true,
      category: "table_restricted",
      reason: `Table '${tableName}' exists in PostgreSQL catalog (SELECT privilege restricted for role: 42501)`,
    };
  }

  // 3. Reject PGRST116 as proof of table existence
  if (error?.code === "PGRST116") {
    return {
      exists: false,
      category: "cardinality_error",
      reason: `Table '${tableName}' returned PGRST116 (cardinality mismatch is invalid proof of table existence)`,
    };
  }

  // 4. Missing relation in schema catalog
  if (error?.code === "PGRST205" || error?.code === "42P01" || status === 404) {
    return {
      exists: false,
      category: "relation_missing",
      reason: `Table '${tableName}' not found in schema catalog (HTTP ${status}, code: ${error?.code}): ${error?.message}`,
    };
  }

  // 5. Network errors or timeouts
  const errMsg = (error?.message || "").toLowerCase();
  if (
    errMsg.includes("fetch failed") ||
    errMsg.includes("networkerror") ||
    errMsg.includes("econnrefused") ||
    errMsg.includes("etimedout")
  ) {
    return {
      exists: false,
      category: "network_failure",
      reason: `Network failure querying table '${tableName}': ${error.message}`,
    };
  }

  // 6. Generic failure
  return {
    exists: false,
    category: "unexpected_error",
    reason: `Table '${tableName}' query failed with HTTP ${status}, code: ${error?.code}: ${error?.message}`,
  };
}

/**
 * Classifies unauthenticated Row Level Security (RLS) isolation on sensitive tables.
 * 
 * @param {{ data: any, error: any, status?: number }} result
 * @param {string} tableName
 * @returns {{ isIsolated: boolean, isCriticalLeak: boolean, category: string, reason: string }}
 */
export function classifyRlsDenial(result, tableName) {
  const { data, error, status } = result;

  // 1. Data leaked: unauthenticated caller retrieved rows!
  if (!error && Array.isArray(data) && data.length > 0) {
    return {
      isIsolated: false,
      isCriticalLeak: true,
      category: "data_leak",
      reason: `CRITICAL RLS BREACH: Unauthenticated query on '${tableName}' returned ${data.length} records!`,
    };
  }

  // 2. Data hidden: RLS policy filtered rows to empty array
  if (!error && Array.isArray(data) && data.length === 0) {
    return {
      isIsolated: true,
      isCriticalLeak: false,
      category: "rls_empty_filter",
      reason: `RLS strictly hides '${tableName}' records from unauthenticated callers (0 records returned)`,
    };
  }

  // 3. Network failures or thrown network-level errors
  const errMsg = (error?.message || "").toLowerCase();
  if (
    errMsg.includes("fetch failed") ||
    errMsg.includes("networkerror") ||
    errMsg.includes("econnrefused") ||
    errMsg.includes("etimedout") ||
    errMsg.includes("enotfound") ||
    errMsg.includes("abort")
  ) {
    return {
      isIsolated: false,
      isCriticalLeak: false,
      category: "network_failure",
      reason: `Network/connectivity error during RLS check on '${tableName}': ${error.message}`,
    };
  }

  // 4. Server errors (HTTP 5xx)
  if (status && status >= 500) {
    return {
      isIsolated: false,
      isCriticalLeak: false,
      category: "server_error",
      reason: `Database/server error (HTTP ${status}) during RLS check on '${tableName}': ${error?.message || "server crash"}`,
    };
  }

  // 5. Relation missing (PGRST205, 42P01, 404)
  // PGRST205 indicates the relation is not found in the PostgREST schema cache.
  // This is a missing table or schema cache defect, NEVER an RLS isolation pass!
  if (error?.code === "PGRST205" || error?.code === "42P01" || status === 404) {
    return {
      isIsolated: false,
      isCriticalLeak: false,
      category: "relation_missing",
      reason: `Relation '${tableName}' not found in PostgREST schema cache (code: ${error?.code}, status: ${status}) - cannot verify RLS isolation!`,
    };
  }

  // 6. Explicit PostgreSQL permission denials
  // Postgres returns 42501 (insufficient_privilege) when table exists but role lacks SELECT.
  // PostgREST returns PGRST301 when JWT credentials forbid access.
  const isPostgres42501 = (status === 401 || status === 403) && error?.code === "42501";
  const isPostgrest301 = (status === 401 || status === 403) && error?.code === "PGRST301";
  if (isPostgres42501 || isPostgrest301) {
    return {
      isIsolated: true,
      isCriticalLeak: false,
      category: "permission_denied",
      reason: `Unauthenticated query on '${tableName}' strictly blocked by database permissions (HTTP ${status}, code: ${error.code})`,
    };
  }

  // 7. Unexpected error (e.g. invalid query syntax, cardinality error, bad request 400)
  return {
    isIsolated: false,
    isCriticalLeak: false,
    category: "unexpected_error",
    reason: `Unexpected query result on '${tableName}' (HTTP ${status}, code: ${error?.code}): ${error?.message}`,
  };
}

/**
 * Verifies local SQL migration inventory.
 * @param {string} [migrationsDirPath]
 * @returns {{ passed: boolean, checks: Array<{ name: string, status: string, message: string }> }}
 */
export function verifyMigrationsInventory(migrationsDirPath = path.join(process.cwd(), "supabase", "migrations")) {
  const checks = [];
  if (!fs.existsSync(migrationsDirPath)) {
    checks.push({
      name: "migrations_directory_exists",
      status: "failed",
      message: `Migrations directory not found at: ${migrationsDirPath}`,
    });
    return { passed: false, checks };
  }

  const files = fs.readdirSync(migrationsDirPath).filter((f) => f.endsWith(".sql")).sort();

  if (files.length < 10) {
    checks.push({
      name: "migration_file_count",
      status: "failed",
      message: `Expected at least 10 migration files, found ${files.length}`,
    });
  } else {
    checks.push({
      name: "migration_file_count",
      status: "passed",
      message: `Found ${files.length} sequential migration files in inventory`,
    });
  }

  // Check sequential timestamp prefix
  const timestampRegex = /^\d{14}_/;
  const nonSequential = files.filter((f) => !timestampRegex.test(f));
  if (nonSequential.length > 0) {
    checks.push({
      name: "migration_naming_sequential",
      status: "failed",
      message: `Non-sequential migration filenames detected: ${nonSequential.join(", ")}`,
    });
  } else {
    checks.push({
      name: "migration_naming_sequential",
      status: "passed",
      message: "All migration files adhere to YYYYMMDDHHMMSS timestamp prefix conventions",
    });
  }

  // Check mandatory security migrations
  const keyMigrations = [
    { key: "atomic_payment_webhook_settlement", title: "Atomic payment webhook settlement migration" },
    { key: "atomic_refund_settlement_and_balance_reservation", title: "Atomic refund settlement & balance reservation migration" },
    { key: "harden_rpc_execution_grants", title: "RPC execution grants hardening migration" },
  ];

  for (const { key, title } of keyMigrations) {
    const found = files.some((f) => f.includes(key));
    checks.push({
      name: `migration_${key}`,
      status: found ? "passed" : "failed",
      message: found ? `${title} present` : `Missing mandatory migration: ${title}`,
    });
  }

  const allPassed = checks.every((c) => c.status === "passed");
  return { passed: allPassed, checks };
}

/**
 * Generates formatted Markdown for GitHub Actions Step Summary.
 * @param {any} report
 * @returns {string}
 */
export function generateSummaryMarkdown(report) {
  const isSuccess = report.status === "passed";
  const statusBadge = isSuccess ? "✅ **PASSED**" : "❌ **FAILED**";
  const liveBadge = report.liveVerified ? "🌐 **LIVE STAGING CERTIFIED**" : "📦 **OFFLINE (Local Invariants Only)**";

  let md = `## 🛡️ ActionOS Reliability Gate v2: Verification Summary\n\n`;
  md += `| Attribute | Value |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **Overall Status** | ${statusBadge} |\n`;
  md += `| **Verification Mode** | \`${report.mode}\` |\n`;
  md += `| **Live Database Verification** | ${liveBadge} |\n`;
  md += `| **Target Endpoint** | \`${report.targetUrl || "N/A (Offline)"}\` |\n`;
  md += `| **Total Invariant Checks** | ${report.summary.total} |\n`;
  md += `| **Passing Invariants** | ${report.summary.passed} (${report.summary.passPercentage}%) |\n`;
  md += `| **Failed Invariants** | ${report.summary.failed} |\n`;
  md += `| **Skipped Checks** | ${report.summary.skipped} |\n\n`;

  if (!report.liveVerified) {
    md += `> [!WARNING]\n`;
    md += `> **Offline Mode Notice**: This run verified local deterministic SQL migration artifacts only. Live PostgreSQL Row-Level Security and RPC permission revocations were **not** verified against a live Supabase staging database.\n\n`;
  }

  md += `### Invariant Checklist\n\n`;
  md += `| Category | Invariant Check | Status | Details |\n`;
  md += `| :--- | :--- | :---: | :--- |\n`;

  for (const check of report.checks) {
    const icon = check.status === "passed" ? "✅" : check.status === "failed" ? "❌" : "⏭️";
    md += `| \`${check.category}\` | ${check.name} | ${icon} | ${check.details} |\n`;
  }

  md += `\n*Report generated at: ${report.timestamp}*\n`;
  return md;
}

/**
 * Main validation runner.
 * @param {Record<string, string | undefined>} [envOverride]
 * @param {string[]} [argvOverride]
 * @returns {Promise<{ exitCode: number, report: any }>}
 */
export async function runValidation(envOverride = process.env, argvOverride = process.argv) {
  const env = envOverride;
  const mode = resolveGateMode(argvOverride, env);

  const stagingUrl = env.SUPABASE_STAGING_URL || "";
  const stagingAnonKey = env.SUPABASE_STAGING_ANON_KEY || "";
  const serviceRoleKey = env.SUPABASE_STAGING_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";

  // In staging-required mode, strictly require staging credentials
  if (mode === "staging-required") {
    if (!stagingUrl || isPlaceholderUrl(stagingUrl)) {
      const errMessage = `STAGING-REQUIRED FAILURE: Missing valid SUPABASE_STAGING_URL. Found: '${stagingUrl || "(empty)"}'. Cannot certify live staging invariants.`;
      console.error(`\n❌ [FATAL] ${errMessage}`);
      const failedReport = {
        timestamp: new Date().toISOString(),
        mode,
        targetUrl: stagingUrl || "MISSING",
        liveVerified: false,
        status: "failed",
        error: errMessage,
        summary: { total: 1, passed: 0, failed: 1, skipped: 0, passPercentage: 0 },
        checks: [
          {
            name: "staging_credentials_presence",
            category: "configuration",
            status: "failed",
            details: errMessage,
          },
        ],
      };
      return { exitCode: 1, report: failedReport };
    }

    if (!stagingAnonKey || stagingAnonKey.includes("demo-publishable-key")) {
      const errMessage = "STAGING-REQUIRED FAILURE: Missing valid SUPABASE_STAGING_ANON_KEY for live staging verification.";
      console.error(`\n❌ [FATAL] ${errMessage}`);
      const failedReport = {
        timestamp: new Date().toISOString(),
        mode,
        targetUrl: stagingUrl,
        liveVerified: false,
        status: "failed",
        error: errMessage,
        summary: { total: 1, passed: 0, failed: 1, skipped: 0, passPercentage: 0 },
        checks: [
          {
            name: "staging_anon_key_presence",
            category: "configuration",
            status: "failed",
            details: errMessage,
          },
        ],
      };
      return { exitCode: 1, report: failedReport };
    }
  }

  console.log("================================================================================");
  console.log("       ACTIONOS RELIABILITY GATE v2: SUPABASE & SECURITY VALIDATION             ");
  console.log("================================================================================");
  console.log(`Execution Mode:   ${mode.toUpperCase()}`);
  console.log(`Target URL:       ${stagingUrl || "None (Offline Deterministic Mode)"}`);
  console.log(`Publishable Key:  ${stagingAnonKey ? stagingAnonKey.substring(0, 16) + "..." : "None"}`);
  console.log(`Service Role Key: ${serviceRoleKey ? "[CONFIGURED]" : "[OMITTED - verifying unprivileged anon role]"}`);
  console.log("================================================================================\n");

  const checks = [];

  function record(name, category, passed, details, meta = {}) {
    checks.push({
      name,
      category,
      status: passed ? "passed" : "failed",
      details,
      ...meta,
    });
    if (passed) {
      console.log(`  ✅ [PASS] [${category}] ${name}: ${details}`);
    } else {
      console.error(`  ❌ [FAIL] [${category}] ${name}: ${details}`);
    }
  }

  // 1. Local SQL Migrations Inventory
  console.log("1. Verifying SQL Migration Inventory & Sequential Ordering...");
  const migrationResult = verifyMigrationsInventory();
  for (const c of migrationResult.checks) {
    record(c.name, "migrations", c.status === "passed", c.message);
  }

  // 2. Live Supabase Checks (only if in staging-required or live credentials available)
  let liveVerified = false;

  if (mode === "staging-required") {
    liveVerified = true;
    const anonClient = createClient(stagingUrl, stagingAnonKey, {
      auth: { persistSession: false },
    });

    // 2.1 Table Schema & Catalog Verification
    console.log("\n2. Verifying PostgREST Catalog & Table Schema Presence...");
    for (const table of EXPECTED_CORE_TABLES) {
      try {
        const queryRes = await anonClient.from(table).select("*", { count: "exact", head: true });
        const classification = classifyTableExistence(queryRes, table);
        record(`table_catalog_${table}`, "schema", classification.exists, classification.reason);
      } catch (err) {
        record(`table_catalog_${table}`, "schema", false, `Network/Client exception querying '${table}': ${err.message}`, {
          errorType: err.name,
        });
      }
    }

    // 2.2 Row Level Security (RLS) Invariants
    console.log("\n3. Verifying Row Level Security (RLS) Invariants...");
    try {
      const policyRes = await anonClient.from("policies").select("id, policy_number, premium");
      const rlsPolicy = classifyRlsDenial(policyRes, "policies");
      record("rls_policies_isolation", "rls", rlsPolicy.isIsolated && !rlsPolicy.isCriticalLeak, rlsPolicy.reason);
    } catch (err) {
      record("rls_policies_isolation", "rls", false, `Exception during policies RLS check: ${err.message}`);
    }

    try {
      const ledgerRes = await anonClient.from("action_ledger_events").select("id, action, hash");
      const rlsLedger = classifyRlsDenial(ledgerRes, "action_ledger_events");
      record("rls_ledger_isolation", "rls", rlsLedger.isIsolated && !rlsLedger.isCriticalLeak, rlsLedger.reason);
    } catch (err) {
      record("rls_ledger_isolation", "rls", false, `Exception during ledger RLS check: ${err.message}`);
    }

    // 2.3 Privileged RPC Permission Revocation
    console.log("\n4. Verifying Privileged RPC Execution Revocation (anon denied)...");
    for (const { name, args } of SENSITIVE_RPC_ENDPOINTS) {
      try {
        const rpcRes = await anonClient.rpc(name, args);
        const classification = classifyRpcResult(rpcRes);
        record(
          `rpc_revocation_${name}`,
          "rpc",
          classification.isPermissionDenied && !classification.isCriticalLeak,
          classification.reason
        );
      } catch (err) {
        // A thrown exception from fetch is a network or client error, NEVER a valid denial!
        record(
          `rpc_revocation_${name}`,
          "rpc",
          false,
          `Network/Client exception invoking RPC '${name}': ${err.message}`
        );
      }
    }

    // 2.4 Service Role Key Authentication Verification (if provided)
    if (serviceRoleKey) {
      console.log("\n5. Verifying Service Role Admin Credentials...");
      try {
        const adminClient = createClient(stagingUrl, serviceRoleKey, {
          auth: { persistSession: false },
        });
        const { data, error } = await adminClient.from("organizations").select("id, name").limit(1);
        if (error) {
          record("service_role_authentication", "service_role", false, `Service role query failed: ${error.message}`);
        } else {
          record(
            "service_role_authentication",
            "service_role",
            true,
            `Service role authentication verified (organizations returned: ${data?.length || 0})`
          );
        }
      } catch (err) {
        record("service_role_authentication", "service_role", false, `Service role check threw exception: ${err.message}`);
      }
    } else {
      console.log("\n5. Service Role Key not supplied (Skipping admin tests)");
      checks.push({
        name: "service_role_authentication",
        category: "service_role",
        status: "skipped",
        details: "SUPABASE_STAGING_SERVICE_ROLE_KEY omitted in environment",
      });
    }
  } else {
    console.log("\n2. Offline Mode Active: Explicitly logging skipped live database checks for transparent reporting.");
    console.log("   (To certify live database security, run with --mode=staging-required and provide staging credentials)\n");

    for (const table of EXPECTED_CORE_TABLES) {
      checks.push({
        name: `table_catalog_${table}`,
        category: "schema",
        status: "skipped",
        details: `[OFFLINE MODE] Live PostgREST catalog check skipped for '${table}'. Required staging credentials omitted.`,
      });
    }

    checks.push({
      name: "rls_policies_isolation",
      category: "rls",
      status: "skipped",
      details: "[OFFLINE MODE] Live RLS query on 'policies' skipped. Required staging credentials omitted.",
    });

    checks.push({
      name: "rls_ledger_isolation",
      category: "rls",
      status: "skipped",
      details: "[OFFLINE MODE] Live RLS query on 'action_ledger_events' skipped. Required staging credentials omitted.",
    });

    for (const { name } of SENSITIVE_RPC_ENDPOINTS) {
      checks.push({
        name: `rpc_revocation_${name}`,
        category: "rpc",
        status: "skipped",
        details: `[OFFLINE MODE] Live RPC execution check skipped for '${name}'. Required staging credentials omitted.`,
      });
    }

    checks.push({
      name: "service_role_authentication",
      category: "service_role",
      status: "skipped",
      details: "[OFFLINE MODE] Live service role admin query skipped. Required staging credentials omitted.",
    });
  }

  // Calculate metrics
  const total = checks.length;
  const passed = checks.filter((c) => c.status === "passed").length;
  const failed = checks.filter((c) => c.status === "failed").length;
  const skipped = checks.filter((c) => c.status === "skipped").length;
  const passPercentage = total > 0 ? Math.round((passed / (total - skipped || 1)) * 100) : 0;
  const isOverallSuccess = failed === 0;

  const report = {
    timestamp: new Date().toISOString(),
    mode,
    targetUrl: liveVerified ? stagingUrl : "offline",
    liveVerified,
    status: isOverallSuccess ? "passed" : "failed",
    summary: {
      total,
      passed,
      failed,
      skipped,
      passPercentage,
    },
    checks,
  };

  // Write machine-readable JSON report
  const reportPath = path.join(process.cwd(), "reliability-gate-report.json");
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(`\n📄 Machine-readable report saved to: ${reportPath}`);
  } catch (err) {
    console.warn(`Failed to write JSON report to ${reportPath}: ${err.message}`);
  }

  // Write GitHub Actions Step Summary if in CI environment
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      const summaryMd = generateSummaryMarkdown(report);
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMd, "utf-8");
      console.log("📋 Appended verification summary to $GITHUB_STEP_SUMMARY");
    } catch (err) {
      console.warn(`Failed to write to $GITHUB_STEP_SUMMARY: ${err.message}`);
    }
  }

  console.log("\n================================================================================");
  console.log(`RELIABILITY GATE RESULTS: ${passed} / ${total - skipped} verified invariants passed (${passPercentage}%)`);
  if (skipped > 0) {
    console.log(`Skipped Invariants: ${skipped}`);
  }
  console.log("================================================================================");

  if (!isOverallSuccess) {
    console.error("❌ ActionOS Reliability Gate verification failed. Review failure details above.");
    return { exitCode: 1, report };
  }

  if (liveVerified) {
    console.log("✅ ActionOS Reliability Gate: Live staging database security invariants verified!");
  } else {
    console.log("✅ ActionOS Reliability Gate: Offline deterministic invariants verified (Live DB unverified).");
  }

  return { exitCode: 0, report };
}

// Direct execution check
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runValidation()
    .then(({ exitCode }) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error("Fatal unhandled exception in reliability gate:", err);
      process.exit(1);
    });
}

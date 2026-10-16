import { createClient } from "@supabase/supabase-js";

/**
 * ActionOS Live Database Diagnostic Utility
 * 
 * Safety & Configuration Invariants:
 * 1. Zero hardcoded project URLs or publishable keys in source code.
 * 2. Explicit environment variable requirements (SUPABASE_URL / SUPABASE_ANON_KEY).
 * 3. Production guard: Blocks execution against production endpoints without explicit opt-in (--allow-prod or ACTIONOS_ALLOW_PROD=true).
 */

const rawUrl = process.env.SUPABASE_URL || process.env.SUPABASE_STAGING_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_STAGING_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!rawUrl || !rawKey) {
  console.error("❌ Configuration Error: Missing required Supabase connection parameters.");
  console.error("Please supply the target database via environment variables:");
  console.error("  - SUPABASE_URL (or SUPABASE_STAGING_URL)");
  console.error("  - SUPABASE_ANON_KEY (or SUPABASE_STAGING_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
  console.error("\nExample:");
  console.error("  SUPABASE_URL=https://your-project.supabase.co SUPABASE_ANON_KEY=sb_publishable_... npm run db:check");
  process.exit(1);
}

// Safety guard: detect production endpoints
const isProductionUrl = rawUrl.toLowerCase().includes("prod") || process.env.ACTIONOS_ENV === "production";
const allowProd = process.argv.includes("--allow-prod") || process.env.ACTIONOS_ALLOW_PROD === "true";

if (isProductionUrl && !allowProd) {
  console.error("🛑 SAFETY GUARD: The target URL appears to be a PRODUCTION database.");
  console.error("Target URL:", rawUrl);
  console.error("To execute diagnostics against production, explicitly provide --allow-prod or ACTIONOS_ALLOW_PROD=true.");
  process.exit(1);
}

const supabase = createClient(rawUrl, rawKey, {
  auth: { persistSession: false },
});

async function check() {
  console.log("================================================================================");
  console.log("             ACTIONOS LIVE DATABASE CONNECTION DIAGNOSTIC                       ");
  console.log("================================================================================");
  console.log(`Target URL:   ${rawUrl}`);
  console.log(`Key:          ${rawKey.substring(0, 16)}...`);
  console.log(`Environment:  ${isProductionUrl ? "PRODUCTION (Explicitly Authorized)" : "Staging / Development"}`);
  console.log("================================================================================\n");

  const tables = [
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

  let verifiedTables = 0;

  for (const table of tables) {
    try {
      const { error, count, status } = await supabase.from(table).select("*", { count: "exact", head: true });
      if (error) {
        if ((status === 401 || status === 403) && error.code === "42501") {
          console.log(`🔒 Table '${table}': exists in schema (SELECT restricted for current role: 42501)`);
          verifiedTables++;
        } else {
          console.error(`❌ Table '${table}': ${error.message} (HTTP ${status}, code: ${error.code})`);
        }
      } else {
        console.log(`✅ Table '${table}': exists and accessible (record count = ${count ?? 0})`);
        verifiedTables++;
      }
    } catch (err) {
      console.error(`❌ Table '${table}' exception:`, err.message);
    }
  }

  console.log("\n================================================================================");
  console.log(`DIAGNOSTIC SUMMARY: ${verifiedTables} / ${tables.length} tables verified`);
  console.log("================================================================================");

  if (verifiedTables === tables.length) {
    console.log("✅ All core database tables confirmed present.");
    process.exit(0);
  } else {
    console.error("⚠️ Some database tables failed verification. Check logs above.");
    process.exit(1);
  }
}

check().catch((err) => {
  console.error("Fatal diagnostic error:", err);
  process.exit(1);
});

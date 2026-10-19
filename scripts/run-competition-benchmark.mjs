#!/usr/bin/env node

/**
 * ActionOS Unified Competition Evaluator Benchmark Suite
 * 2026 NITDA National AI Innovation Challenge
 * 
 * Executes full verification lifecycle across all tiers:
 * 1. Supply-Chain Dependency Integrity Verification
 * 2. Supabase Staging & Security Invariant Check (Offline Mode)
 * 3. 730-Test Unit, Integration & Security Regression Suite
 * 4. End-to-End Autonomous Renewal Workflow with 16-Step Merkle Ledger
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("\n" + "=".repeat(80));
console.log("       ACTIONOS UNIFIED COMPETITION EVALUATOR BENCHMARK SUITE");
console.log("             2026 NITDA National AI Innovation Challenge");
console.log("=".repeat(80) + "\n");

const startTime = performance.now();
const results = {
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || "test",
  benchmarks: [],
};

function runStep(title, command) {
  console.log(`\n▶ [RUNNING] ${title}...`);
  const stepStart = performance.now();
  try {
    const stdout = execSync(command, {
      cwd: rootDir,
      stdio: "pipe",
      encoding: "utf-8",
      env: { ...process.env, ACTIONOS_RUNTIME_MODE: "demo" },
    });
    const duration = Math.round(performance.now() - stepStart);
    console.log(`  ✅ [PASSED] ${title} (${duration}ms)`);
    results.benchmarks.push({ title, status: "PASSED", durationMs: duration });
    return stdout;
  } catch (err) {
    const duration = Math.round(performance.now() - stepStart);
    console.error(`  ❌ [FAILED] ${title} (${duration}ms)`);
    console.error(err.stdout || err.message);
    results.benchmarks.push({
      title,
      status: "FAILED",
      durationMs: duration,
      error: err.message,
    });
    throw err;
  }
}

try {
  // 1. Dependency Integrity
  runStep("1. Supply-Chain & Dependency Integrity Check", "node scripts/verify-dependency-integrity.mjs");

  // 2. Supabase Offline Security Gate
  runStep("2. Supabase Staging & Security Invariants Gate", "node scripts/verify-supabase-staging.mjs --mode=offline");

  // 3. Unit, Integration & Security Regression Tests
  runStep("3. Comprehensive 730-Test Verification Suite", "npx tsx --test tests/**/*.test.ts");

  // 4. End-to-End Renewal Demo & Merkle Audit Proof
  runStep("4. End-to-End Autonomous Renewal & Merkle Chain Proof", "npx tsx scripts/demo-renewal-flow.ts");

  const totalDuration = Math.round((performance.now() - startTime) / 1000);

  console.log("\n" + "=".repeat(80));
  console.log("                  EVALUATION BENCHMARK VERDICT: ALL PASS");
  console.log("=".repeat(80));
  console.log(`Total Execution Time: ${totalDuration}s`);
  console.log("All 4 Quality & Regulatory Invariant Gates Succeeded (100% Green).");
  console.log("Status: READY FOR NITDA NATIONAL AI INNOVATION CHALLENGE REVIEW");
  console.log("=".repeat(80) + "\n");

  const reportPath = path.join(rootDir, "benchmark-summary.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`Report saved to: ${reportPath}\n`);
} catch {
  console.error("\n❌ Evaluator benchmark halted due to one or more failing gates.\n");
  process.exit(1);
}

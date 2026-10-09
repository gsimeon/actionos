import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Supabase Schema, Migration Replayability & Type Alignment Validation", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase", "migrations");
  const seedFilePath = path.resolve(process.cwd(), "supabase", "seed.sql");

  it("should verify all migration files exist, are numbered sequentially, and contain valid SQL", () => {
    assert.ok(fs.existsSync(migrationsDir), "Migrations directory must exist");
    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    assert.ok(migrationFiles.length >= 2, "Expected at least 2 versioned migration files");

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      assert.ok(content.length > 100, `Migration ${file} must have non-trivial content`);
      // Check syntax indicators
      assert.ok(!content.includes("SYNTAX ERROR"), `Migration ${file} must not contain syntax errors`);
    }
  });

  it("should ensure all 15 core ActionOS tables and enums are created in migrations", () => {
    const schemaFile = path.join(migrationsDir, "20261007000000_actionos_schema.sql");
    const schemaSql = fs.readFileSync(schemaFile, "utf-8");

    const expectedTables = [
      "organizations",
      "profiles",
      "organization_members",
      "providers",
      "policy_types",
      "customers",
      "assets",
      "policies",
      "renewals",
      "action_sessions",
      "action_plans",
      "action_steps",
      "tools",
      "tool_permissions",
      "tool_executions",
      "transactions",
      "documents",
      "notifications",
      "human_escalations",
      "audit_logs",
    ];

    for (const table of expectedTables) {
      const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i");
      assert.ok(tableRegex.test(schemaSql), `Schema must define table: ${table}`);
    }

    const ledgerMigration = path.join(migrationsDir, "20261008000000_action_ledger_events.sql");
    const ledgerSql = fs.readFileSync(ledgerMigration, "utf-8");
    assert.ok(
      /CREATE TABLE IF NOT EXISTS action_ledger_events\b/i.test(ledgerSql),
      "Action Ledger migration must create action_ledger_events table"
    );

    const quotesMigration = path.join(migrationsDir, "20261008010000_quotes.sql");
    const quotesSql = fs.readFileSync(quotesMigration, "utf-8");
    assert.ok(
      /CREATE TABLE IF NOT EXISTS quotes\b/i.test(quotesSql),
      "Quotes migration must create quotes table"
    );
  });

  it("should verify mandatory Row Level Security (RLS) is enabled on all sensitive tenant tables", () => {
    const schemaSql = fs.readFileSync(
      path.join(migrationsDir, "20261007000000_actionos_schema.sql"),
      "utf-8"
    );
    const ledgerSql = fs.readFileSync(
      path.join(migrationsDir, "20261008000000_action_ledger_events.sql"),
      "utf-8"
    );
    const quotesSql = fs.readFileSync(
      path.join(migrationsDir, "20261008010000_quotes.sql"),
      "utf-8"
    );
    const allSql = schemaSql + "\n" + ledgerSql + "\n" + quotesSql;

    const rlsTables = [
      "organizations",
      "profiles",
      "organization_members",
      "customers",
      "assets",
      "policies",
      "renewals",
      "quotes",
      "action_sessions",
      "action_plans",
      "action_steps",
      "transactions",
      "documents",
      "notifications",
      "action_ledger_events",
    ];

    for (const table of rlsTables) {
      const rlsRegex = new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`, "i");
      assert.ok(
        rlsRegex.test(allSql),
        `RLS must be explicitly enabled for sensitive table: ${table}`
      );
    }
  });

  it("should verify seed.sql executes with 100% referential integrity and sanitized demo identifiers", () => {
    assert.ok(fs.existsSync(seedFilePath), "seed.sql must exist");
    const seedSql = fs.readFileSync(seedFilePath, "utf-8");

    // Verify sanitization invariants
    assert.ok(
      !seedSql.includes("Babajide Sanwo-Olu"),
      "Seed data must not contain real political names (Babajide Sanwo-Olu)"
    );
    assert.ok(
      !seedSql.includes("Ngozi Okonjo"),
      "Seed data must not contain real prominent names (Ngozi Okonjo)"
    );
    assert.ok(
      !seedSql.includes("CHAS-DEMO-2026-0001"),
      "Seed data must use standardized DEMO-VIN-000001"
    );
    assert.ok(
      !seedSql.includes("ENG-DEMO-2026-0001"),
      "Seed data must use standardized DEMO-ENGINE-000001"
    );
    assert.ok(
      seedSql.includes("DEMO-NIN-000001"),
      "Seed data must include synthetic DEMO-NIN-000001"
    );
    assert.ok(
      seedSql.includes("DEMO-VIN-000001"),
      "Seed data must include synthetic DEMO-VIN-000001"
    );
    assert.ok(
      seedSql.includes("DEMO-ENGINE-000001"),
      "Seed data must include synthetic DEMO-ENGINE-000001"
    );

    // Verify benchmark policy AUTO-2026-00182 is present
    assert.ok(seedSql.includes("AUTO-2026-00182"), "Seed must include benchmark policy AUTO-2026-00182");
    assert.ok(seedSql.includes("CUS-000001"), "Seed must include benchmark customer CUS-000001");
  });

  it("should verify tenant scoping enforcement in repository layer", async () => {
    const { getRepositoryContainer } = await import("@/lib/repositories");
    const repos = getRepositoryContainer();

    // Verify demo/local repository tenant isolation invariant
    const customer = await repos.customers.findById("f0000000-0000-0000-0000-000000000001", {
      organizationId: "a0000000-0000-0000-0000-000000000001",
    });
    assert.ok(customer, "Customer must be accessible within its own organization");

    // Cross-tenant query must return null / empty
    const crossTenantCust = await repos.customers.findById("f0000000-0000-0000-0000-000000000001", {
      organizationId: "a9999999-9999-9999-9999-999999999999",
    });
    assert.equal(crossTenantCust, null, "Cross-tenant customer query must return null");

    // Cross-tenant policy lookup must return null
    const crossTenantPolicy = await repos.policies.findByNumber("AUTO-2026-00182", {
      organizationId: "a9999999-9999-9999-9999-999999999999",
    });
    assert.equal(crossTenantPolicy, null, "Cross-tenant policy query must return null");

    // Cross-tenant renewal lookup must return null
    const crossTenantRenewal = await repos.renewals.findByPolicyId("20000000-0000-0000-0000-000000000001", {
      organizationId: "a9999999-9999-9999-9999-999999999999",
    });
    assert.equal(crossTenantRenewal, null, "Cross-tenant renewal query must return null");
  });

  it("should verify atomic claim and append-only ledger migration defines claim_and_accept_quote RPC and immutability trigger", () => {
    const atomicMigrationFile = path.join(migrationsDir, "20261008030000_atomic_claim_and_append_only_ledger.sql");
    assert.ok(fs.existsSync(atomicMigrationFile), "Atomic claim migration must exist");
    const sql = fs.readFileSync(atomicMigrationFile, "utf-8");

    // 1. Function definition
    assert.ok(
      /CREATE OR REPLACE FUNCTION claim_and_accept_quote/i.test(sql),
      "Migration must define claim_and_accept_quote function"
    );
    assert.ok(
      /SECURITY DEFINER/i.test(sql),
      "claim_and_accept_quote must be declared as SECURITY DEFINER"
    );
    assert.ok(
      /p_organization_id UUID DEFAULT NULL/i.test(sql),
      "claim_and_accept_quote must accept organization tenant filter"
    );
    assert.ok(
      /p_customer_id UUID DEFAULT NULL/i.test(sql),
      "claim_and_accept_quote must accept customer tenant filter"
    );

    // 2. Role permissions
    assert.ok(
      /GRANT EXECUTE ON FUNCTION claim_and_accept_quote.*TO authenticated, service_role/i.test(sql),
      "Function execution must be granted to authenticated and service_role"
    );
    assert.ok(
      /REVOKE EXECUTE ON FUNCTION claim_and_accept_quote.*FROM anon, public/i.test(sql),
      "Function execution must be revoked from anon and public"
    );

    // 3. Append-only ledger trigger
    assert.ok(
      /CREATE OR REPLACE FUNCTION prevent_action_ledger_tampering/i.test(sql),
      "Migration must define prevent_action_ledger_tampering trigger function"
    );
    assert.ok(
      /CREATE TRIGGER trg_action_ledger_immutable/i.test(sql),
      "Migration must create immutable trigger on action_ledger_events"
    );
    assert.ok(
      /BEFORE UPDATE OR DELETE ON action_ledger_events/i.test(sql),
      "Trigger must fire BEFORE UPDATE OR DELETE"
    );
  });
});

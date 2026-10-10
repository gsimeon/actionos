import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { resetStore } from "@/lib/actionos/mock-store";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { getRepositoryContainer } from "@/lib/repositories";

describe("ActionOS Vehicle Database Query & Registration Workflow (Multilingual Nigeria)", () => {
  it("should process vehicle query in Nigerian Pidgin and return localized response", async () => {
    resetStore();

    const res = await orchestrator.startWorkflow({
      inputText: "Check my motor ABC-123-XY for inside vehicle database sharp sharp",
      channel: "web",
      language: "pcm",
      executionContext: DEMO_CONTEXT,
    });

    assert.equal(res.status, "completed");
    assert.equal(res.intent, "query_vehicle");
    assert.ok(res.message.includes("We don see your motor"));
    assert.ok(res.message.includes("ABC-123-XY"));
    assert.ok(res.message.includes("DEMO-VIN-000001"));

    // Verify cryptographic action ledger recorded the event
    assert.ok(res.events.length >= 3);
    const vehicleQueryEvent = res.events.find((e) => e.tool === "query_vehicle" || e.action === "vehicle_query");
    assert.ok(vehicleQueryEvent, "Ledger must record query_vehicle execution");
  });

  it("should process vehicle query in Yorùbá and return localized response", async () => {
    resetStore();

    const res = await orchestrator.startWorkflow({
      inputText: "Ṣayẹwo ọkọ ABC-123-XY ninu data",
      channel: "web",
      language: "yo",
      executionContext: DEMO_CONTEXT,
    });

    assert.equal(res.status, "completed");
    assert.equal(res.intent, "query_vehicle");
    assert.ok(res.message.includes("A ti rí ọkọ rẹ"));
    assert.ok(res.message.includes("ABC-123-XY"));
    assert.ok(res.message.includes("DEMO-VIN-000001"));
  });

  it("should process vehicle query in Hausa and return localized response", async () => {
    resetStore();

    const res = await orchestrator.startWorkflow({
      inputText: "Duba motata ABC-123-XY a cikin ma'adanar bayanai",
      channel: "web",
      language: "ha",
      executionContext: DEMO_CONTEXT,
    });

    assert.equal(res.status, "completed");
    assert.equal(res.intent, "query_vehicle");
    assert.ok(res.message.includes("Mun sami motarka"));
    assert.ok(res.message.includes("ABC-123-XY"));
    assert.ok(res.message.includes("DEMO-VIN-000001"));
  });

  it("should process vehicle query in Igbo and return localized response", async () => {
    resetStore();

    const res = await orchestrator.startWorkflow({
      inputText: "Lelee ụgbọ ala m ABC-123-XY n'ọdụ data",
      channel: "web",
      language: "ig",
      executionContext: DEMO_CONTEXT,
    });

    assert.equal(res.status, "completed");
    assert.equal(res.intent, "query_vehicle");
    assert.ok(res.message.includes("Anyị ahụla ụgbọ ala gị"));
    assert.ok(res.message.includes("ABC-123-XY"));
    assert.ok(res.message.includes("DEMO-VIN-000001"));
  });

  it("should process vehicle query in English and return localized response", async () => {
    resetStore();

    const res = await orchestrator.startWorkflow({
      inputText: "Query vehicle database for car ABC-123-XY",
      channel: "web",
      language: "en-NG",
      executionContext: DEMO_CONTEXT,
    });

    assert.equal(res.status, "completed");
    assert.equal(res.intent, "query_vehicle");
    assert.ok(res.message.includes("Vehicle"));
    assert.ok(res.message.includes("ABC-123-XY"));
    assert.ok(res.message.includes("DEMO-VIN-000001"));
  });

  it("should process vehicle registration in Nigerian Pidgin end-to-end", async () => {
    resetStore();

    const res = await orchestrator.startWorkflow({
      inputText: "I wan register my motor LAG-777-AA sharp sharp",
      channel: "web",
      language: "pcm",
      executionContext: DEMO_CONTEXT,
    });

    assert.equal(res.status, "completed");
    assert.equal(res.intent, "register_vehicle");
    assert.ok(res.message.includes("Oya! Vehicle registration don succeed"));
    assert.ok(res.message.includes("LAG-777-AA"));

    // Verify newly registered vehicle is in repository
    const repos = getRepositoryContainer();
    const registered = await repos.assets.findByIdentifier("LAG-777-AA", {
      organizationId: DEMO_CONTEXT.organizationId,
      customerId: DEMO_CONTEXT.customerId,
    });
    assert.ok(registered);
    assert.equal(registered.identifier, "LAG-777-AA");
  });

  it("should enforce tenant boundaries so Customer A cannot query Customer B's vehicle", async () => {
    resetStore();

    // Customer 2's context
    const customer2Context = {
      ...DEMO_CONTEXT,
      customerId: "f0000000-0000-0000-0000-000000000002",
    };

    // Customer 2 tries to query Customer 1's vehicle (ABC-123-XY)
    const res = await orchestrator.startWorkflow({
      inputText: "Query vehicle database for car ABC-123-XY",
      channel: "web",
      language: "en-NG",
      executionContext: customer2Context,
    });

    assert.equal(res.status, "completed");
    // Should fail closed with vehicle not found message
    assert.ok(
      res.message.includes("No existing vehicle record found") ||
      res.message.includes("not found"),
      "Must not expose vehicle belonging to another customer"
    );
  });
});

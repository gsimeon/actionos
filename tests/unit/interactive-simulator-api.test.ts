import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { POST as simulatorHandler } from "@/app/api/simulator/route";
import { resetStore } from "@/lib/actionos/mock-store";
import { resetProcessedWebhookMemoryCache } from "@/app/api/webhooks/payment/route";

describe("ActionOS Interactive Regulatory & Webhook Simulator API Suite", () => {
  describe("1. Statutory Regulatory Trifecta Probes", () => {
    it("should probe FRSC NVIS for clean benchmark vehicle ABC-123-XY", async () => {
      resetStore();
      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "probe_frsc", plate: "ABC-123-XY" }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.data?.plate, "ABC-123-XY");
      assert.equal(json.data?.theftFlag, false);
      assert.equal(json.data?.found, true);
      assert.ok(typeof json.latencyMs === "number");
    });

    it("should probe FRSC NVIS and detect stolen vehicle flag for STOLEN-999-XX", async () => {
      resetStore();
      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "probe_frsc", plate: "STOLEN-999-XX" }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.data?.theftFlag, true, "Must flag stolen vehicle");
    });

    it("should probe LACVIS and verify 84% passing brake efficiency for ABC-123-XY", async () => {
      resetStore();
      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "probe_lacvis", plate: "ABC-123-XY" }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.data?.overallResult, "PASSED");
      assert.equal(json.data?.brakeEfficiencyPct, 84);
      assert.equal(json.data?.brakeEfficiencyStatus, "PASSED");
    });

    it("should probe LACVIS and detect brake failure (42%) for FAIL-123-XX", async () => {
      resetStore();
      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "probe_lacvis", plate: "FAIL-123-XX" }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.data?.overallResult, "REQUIRES_RETEST");
      assert.equal(json.data?.brakeEfficiencyPct, 52);
      assert.equal(json.data?.brakeEfficiencyStatus, "FAILED");
    });

    it("should probe NIID and retrieve e-sticker and pre-clearance token for ABC-123-XY", async () => {
      resetStore();
      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "probe_niid", plate: "ABC-123-XY" }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.data?.found, true);
      assert.equal(json.data?.activePolicy, false, "Must be eligible for renewal");
      assert.ok(json.data?.eStickerNumber?.startsWith("NAICOM-STK-"));
      assert.ok(json.data?.preclearanceToken?.startsWith("NIID-SANDBOX-"));
    });

    it("should probe NIID and flag active existing policy conflict for ACTIVE-999-OK", async () => {
      resetStore();
      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "probe_niid", plate: "ACTIVE-999-OK" }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.data?.activePolicy, true, "Must detect active unexpired coverage");
      assert.ok(typeof json.data?.daysUntilExpiry === "number" && json.data.daysUntilExpiry > 30);
    });
  });

  describe("2. Multi-Rail Webhook Simulation", () => {
    it("should simulate Paystack charge.success webhook dispatch", async () => {
      resetStore();
      resetProcessedWebhookMemoryCache();

      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate_webhook",
          provider: "paystack",
          eventType: "charge.success",
          amount: 87500,
          reference: "sim_paystack_ref_001",
        }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.provider, "paystack");
      assert.equal(json.eventType, "charge.success");
      assert.equal(json.status, 200);
    });

    it("should simulate Flutterwave charge.completed webhook dispatch", async () => {
      resetStore();
      resetProcessedWebhookMemoryCache();

      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate_webhook",
          provider: "flutterwave",
          eventType: "charge.completed",
          amount: 87500,
          reference: "sim_flutterwave_ref_001",
        }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.provider, "flutterwave");
      assert.equal(json.eventType, "charge.completed");
      assert.equal(json.status, 200);
    });
  });

  describe("3. 1-Click Competition Scenarios", () => {
    it("should execute stolen_vehicle competition scenario and observe safety halt", async () => {
      resetStore();
      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_scenario", scenarioId: "stolen_vehicle" }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.scenarioId, "stolen_vehicle");
      assert.equal(json.outcome, "HALTED_SAFETY_ALERT");
      assert.equal(json.details?.theftFlag, true);
    });

    it("should execute lacvis_brake_failure competition scenario and observe statutory denial", async () => {
      resetStore();
      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_scenario", scenarioId: "lacvis_brake_failure" }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.scenarioId, "lacvis_brake_failure");
      assert.equal(json.outcome, "STATUTORY_DENIAL");
      assert.equal(json.details?.overallResult, "REQUIRES_RETEST");
    });

    it("should execute active_policy_conflict competition scenario and observe duplicate prevention", async () => {
      resetStore();
      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_scenario", scenarioId: "active_policy_conflict" }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.scenarioId, "active_policy_conflict");
      assert.equal(json.outcome, "DUPLICATE_RENEWAL_PREVENTED");
      assert.equal(json.details?.activeExistingPolicy, true);
    });

    it("should execute declined_payment scenario and observe SAFE_FAIL_CLOSED invariant", async () => {
      resetStore();
      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_scenario", scenarioId: "declined_payment" }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.scenarioId, "declined_payment");
      assert.equal(json.outcome, "SAFE_FAIL_CLOSED");
      assert.equal(json.details?.failClosedInvariantMet, true);
      assert.notEqual(json.details?.policyStatus, "renewed");
      assert.equal(json.details?.statutoryCertificateIssued, false);
    });

    it("should execute webhook_replay scenario and observe IDEMPOTENT_DEDUPLICATION_VERIFIED", async () => {
      resetStore();
      resetProcessedWebhookMemoryCache();
      const req = new Request("http://localhost:3000/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_scenario", scenarioId: "webhook_replay" }),
      });

      const res = await simulatorHandler(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.scenarioId, "webhook_replay");
      assert.equal(json.outcome, "IDEMPOTENT_DEDUPLICATION_VERIFIED");
      assert.equal(json.details?.idempotencyInvariantPreserved, true);
      assert.equal(json.details?.matchingDatabaseTransactionsCount, 1);
      assert.equal(json.details?.initialDelivery?.duplicate, false);
      assert.equal(json.details?.replayedDelivery?.duplicate, true);
    });
  });
});

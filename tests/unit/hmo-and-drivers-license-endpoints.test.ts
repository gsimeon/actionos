import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetStore } from "@/lib/actionos/mock-store";
import { resetRepositoryContainer } from "@/lib/repositories";
import { POST as renewHmoEndpoint } from "@/app/api/health/renew-hmo/route";
import { POST as renewDriverLicenseEndpoint } from "@/app/api/licensing/renew-driver-license/route";
import { RenewHmoPolicyTool } from "@/lib/actionos/tools/renew-hmo-policy";
import { RenewDriverLicenseTool } from "@/lib/actionos/tools/renew-driver-license";
import { toolRegistry } from "@/lib/actionos/tool-registry";
import { DEMO_CONTEXT as CANONICAL_DEMO_AUTH } from "@/lib/security/auth-context";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";

const DEMO_CUSTOMER = CANONICAL_DEMO_AUTH.customerId!;

const DEMO_CONTEXT = createWorkflowExecutionContext(CANONICAL_DEMO_AUTH, {
  sessionId: "sess_hmo_dl_test_001",
  planId: "plan_hmo_dl_test_001",
  channel: "web",
  language: "en-NG",
  isSimulated: true,
});

describe("ActionOS Health HMO & Driver's License Vertical Suite", () => {
  beforeEach(() => {
    resetStore();
    resetRepositoryContainer();
  });

  describe("Tool Registration & Execution", () => {
    it("should register both RenewHmoPolicyTool and RenewDriverLicenseTool in toolRegistry", () => {
      const hmoTool = toolRegistry.get("renew_hmo_policy");
      const dlTool = toolRegistry.get("renew_driver_license");

      assert.ok(hmoTool);
      assert.equal(hmoTool.name, "renew_hmo_policy");
      assert.ok(dlTool);
      assert.equal(dlTool.name, "renew_driver_license");
    });

    it("should execute RenewHmoPolicyTool directly with proper statutory outputs", async () => {
      const tool = new RenewHmoPolicyTool();
      const result = await tool.execute(
        {
          customerId: DEMO_CUSTOMER,
          nhiaNumber: "NHIA-00829104",
          tier: "gold",
        },
        DEMO_CONTEXT
      );

      assert.equal(result.success, true);
      assert.ok(result.data);
      assert.equal(result.data.renewed, true);
      assert.equal(result.data.tier, "gold");
      assert.ok(result.data.digitalCard);
      assert.ok(result.data.digitalCard.digitalCardNumber.length > 5);
      assert.ok(result.data.hmoDocument);
    });

    it("should execute RenewDriverLicenseTool directly with FRSC statutory outputs", async () => {
      const tool = new RenewDriverLicenseTool();
      const result = await tool.execute(
        {
          customerId: DEMO_CUSTOMER,
          dlNumber: "FRSC-LA-2024-009182",
          durationYears: 3,
        },
        DEMO_CONTEXT
      );

      assert.equal(result.success, true);
      assert.ok(result.data);
      assert.equal(result.data.renewed, true);
      assert.equal(result.data.durationYears, 3);
      assert.ok(result.data.temporaryPermitNumber);
      assert.ok(result.data.permitDocument);
      assert.ok(result.data.captureCenter);
    });
  });

  describe("REST API Endpoints", () => {
    it("POST /api/health/renew-hmo should renew HMO policy and return 200 with result payload", async () => {
      const req = new Request("http://localhost:3000/api/health/renew-hmo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actionos-auth": JSON.stringify(CANONICAL_DEMO_AUTH),
        },
        body: JSON.stringify({
          nhiaNumber: "NHIA-00829104",
          tier: "platinum",
        }),
      });

      const res = await renewHmoEndpoint(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.tier, "platinum");
      assert.equal(json.data.renewed, true);
      assert.ok(json.data.digitalCard);
    });

    it("POST /api/health/renew-hmo should reject invalid tier with 400 validation error", async () => {
      const req = new Request("http://localhost:3000/api/health/renew-hmo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actionos-auth": JSON.stringify(CANONICAL_DEMO_AUTH),
        },
        body: JSON.stringify({
          nhiaNumber: "NHIA-00829104",
          tier: "invalid_tier",
        }),
      });

      const res = await renewHmoEndpoint(req);
      assert.equal(res.status, 400);

      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, "VALIDATION_ERROR");
    });

    it("POST /api/licensing/renew-driver-license should renew driver's license and return 200", async () => {
      const req = new Request("http://localhost:3000/api/licensing/renew-driver-license", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actionos-auth": JSON.stringify(CANONICAL_DEMO_AUTH),
        },
        body: JSON.stringify({
          dlNumber: "FRSC-LA-2024-009182",
          durationYears: 5,
        }),
      });

      const res = await renewDriverLicenseEndpoint(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.durationYears, 5);
      assert.equal(json.data.renewed, true);
      assert.ok(json.data.temporaryPermitNumber);
    });

    it("POST /api/licensing/renew-driver-license should reject invalid duration with 400", async () => {
      const req = new Request("http://localhost:3000/api/licensing/renew-driver-license", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actionos-auth": JSON.stringify(CANONICAL_DEMO_AUTH),
        },
        body: JSON.stringify({
          dlNumber: "FRSC-LA-2024-009182",
          durationYears: 4, // Only 3 or 5 permitted by FRSC
        }),
      });

      const res = await renewDriverLicenseEndpoint(req);
      assert.equal(res.status, 400);

      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, "VALIDATION_ERROR");
    });
  });
});

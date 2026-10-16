import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetStore } from "@/lib/actionos/mock-store";
import { getRepositoryContainer, resetRepositoryContainer } from "@/lib/repositories";
import { createNAtlasProvider } from "@/lib/ai/n-atlas";
import { VerifyVehicleInspectionTool } from "@/lib/actionos/tools/verify-vehicle-inspection";
import { RenewVehicleLicenseTool } from "@/lib/actionos/tools/renew-vehicle-license";
import { ActionOSPlanner } from "@/lib/actionos/planner";
import { ActionOSOrchestrator } from "@/lib/actionos/orchestrator";
import { ActionOSPermissions } from "@/lib/actionos/permissions";
import { toolRegistry } from "@/lib/actionos/tool-registry";
import { POST as renewLicenseEndpoint } from "@/app/api/vehicles/renew-license/route";
import { DEMO_CONTEXT as CANONICAL_DEMO_AUTH } from "@/lib/security/auth-context";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";

const DEMO_ORG = CANONICAL_DEMO_AUTH.organizationId;
const DEMO_CUSTOMER = CANONICAL_DEMO_AUTH.customerId!;

const DEMO_CONTEXT = createWorkflowExecutionContext(CANONICAL_DEMO_AUTH, {
  sessionId: "sess_veh_test_001",
  planId: "plan_veh_test_001",
  channel: "web",
  language: "en-NG",
  isSimulated: true,
});

describe("Vehicle License & Roadworthiness Vertical", () => {
  beforeEach(() => {
    resetStore();
    resetRepositoryContainer();
  });

  describe("N-ATLAS Multilingual Understanding for Vehicle License & Roadworthiness", () => {
    const natlas = createNAtlasProvider();

    it("should detect vehicle license & roadworthiness renewal in English", async () => {
      const res = await natlas.understand({
        text: "Renew vehicle license and roadworthiness inspection for car ABC-123-XY.",
        language: "en-NG",
      });

      assert.equal(res.intent, "renew_vehicle_license");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
      assert.ok(res.confidence >= 0.95);
    });

    it("should detect vehicle license renewal in Nigerian Pidgin", async () => {
      const res = await natlas.understand({
        text: "Renew my motor paper and roadworthiness sharp sharp for ABC-123-XY.",
        language: "pcm",
      });

      assert.equal(res.intent, "renew_vehicle_license");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
      assert.equal(res.entities.detectedLanguage, "pcm");
    });

    it("should detect vehicle license renewal in Yorùbá", async () => {
      const res = await natlas.understand({
        text: "Sọ iwe-aṣẹ ọkọ ati iwe-ẹri ijẹrisi ọkọ di ọtun fun ABC-123-XY.",
        language: "yo",
      });

      assert.equal(res.intent, "renew_vehicle_license");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
      assert.equal(res.entities.detectedLanguage, "yo");
    });

    it("should detect vehicle license renewal in Hausa", async () => {
      const res = await natlas.understand({
        text: "Sabunta lasisin mota da takardar duba mota don ABC-123-XY.",
        language: "ha",
      });

      assert.equal(res.intent, "renew_vehicle_license");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
      assert.equal(res.entities.detectedLanguage, "ha");
    });

    it("should detect vehicle license renewal in Igbo", async () => {
      const res = await natlas.understand({
        text: "Megharia akwukwo ugbo ala na nyocha nchekwa maka ABC-123-XY.",
        language: "ig",
      });

      assert.equal(res.intent, "renew_vehicle_license");
      assert.equal(res.entities.vehiclePlate, "ABC-123-XY");
      assert.equal(res.entities.detectedLanguage, "ig");
    });
  });

  describe("VerifyVehicleInspectionTool (MVAA / LACVIS Inspection Verification)", () => {
    const tool = new VerifyVehicleInspectionTool();

    it("should be properly registered in ActionOSToolRegistry", () => {
      const registered = toolRegistry.get("verify_vehicle_inspection");
      assert.ok(registered);
      assert.equal(registered.name, "verify_vehicle_inspection");
      assert.equal(registered.category, "regulatory");
    });

    it("should pass permissions check for customer role within limit", () => {
      const perm = ActionOSPermissions.checkPermission({
        role: "customer",
        toolName: "verify_vehicle_inspection",
      });
      assert.equal(perm.allowed, true);
      assert.equal(perm.requiresApproval, false);
    });

    it("should execute computerized LACVIS inspection verification with compliant benchmarks", async () => {
      const res = await tool.execute(
        {
          vehiclePlate: "ABC-123-XY",
          chassisNumber: "DEMO-VIN-000001",
          language: "en-NG",
        },
        DEMO_CONTEXT
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.verified, true);
      assert.equal(res.data.vehiclePlate, "ABC-123-XY");
      assert.equal(res.data.overallResult, "PASSED");
      assert.ok(res.data.inspectionId.startsWith("LACVIS-"));
      assert.ok(res.data.brakeEfficiency.includes("84%"));
      assert.ok(res.data.emissionStatus.includes("COMPLIANT"));
      assert.equal(res.data.mvaaRegistryStatus, "ACTIVE");
      assert.ok(res.data.localizedMessage.includes("ABC-123-XY"));
    });

    it("should format inspection clearance in Nigerian Pidgin when requested", async () => {
      const res = await tool.execute(
        {
          vehiclePlate: "ABC-123-XY",
          language: "pcm",
        },
        DEMO_CONTEXT
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.ok(res.data.localizedMessage.includes("Motor ABC-123-XY don pass"));
    });
  });

  describe("RenewVehicleLicenseTool", () => {
    const tool = new RenewVehicleLicenseTool();

    it("should be properly registered in ActionOSToolRegistry", () => {
      const registered = toolRegistry.get("renew_vehicle_license");
      assert.ok(registered);
      assert.equal(registered.name, "renew_vehicle_license");
    });

    it("should pass permissions check for customer role", () => {
      const perm = ActionOSPermissions.checkPermission({
        role: "customer",
        toolName: "renew_vehicle_license",
        amount: 23500,
      });
      assert.equal(perm.allowed, true);
      assert.equal(perm.requiresApproval, false);
    });

    it("should execute full vehicle license & roadworthiness renewal with document issuance and ledger transaction", async () => {
      const repos = getRepositoryContainer();

      const res = await tool.execute(
        {
          customerId: DEMO_CUSTOMER,
          vehiclePlate: "ABC-123-XY",
          licenseDurationMonths: 12,
          includeRoadworthiness: true,
          language: "en-NG",
        },
        DEMO_CONTEXT
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.renewed, true);
      assert.equal(res.data.vehiclePlate, "ABC-123-XY");
      assert.equal(res.data.statutoryFee, 23500);
      assert.ok(res.data.mvaaLicenseNumber.startsWith("MVAA-"));
      assert.ok(res.data.roadworthinessNumber?.startsWith("LACVIS-"));
      assert.equal(res.data.documents.length, 2);

      // Verify documents created in repository
      const docs = await repos.documents.findAll({ customerId: DEMO_CUSTOMER, tenant: DEMO_CONTEXT.auth });
      assert.ok(docs.some((d) => d.file_name.includes("Vehicle_License")));
      assert.ok(docs.some((d) => d.file_name.includes("Roadworthiness")));

      // Verify transaction recorded
      const tx = await repos.transactions.findByReference(res.data.transaction.reference, DEMO_CONTEXT.auth);
      assert.ok(tx);
      assert.equal(tx?.amount, 23500);
      assert.equal(tx?.transaction_type, "fee");
      assert.equal(tx?.status, "succeeded");

      // Verify notification created
      const notifs = await repos.notifications.findAll({ customerId: DEMO_CUSTOMER, tenant: DEMO_CONTEXT.auth });
      assert.ok(notifs.some((n) => n.title.includes("Vehicle License")));
    });

    it("should support renewal without roadworthiness with adjusted fee", async () => {
      const res = await tool.execute(
        {
          customerId: DEMO_CUSTOMER,
          vehiclePlate: "ABC-123-XY",
          includeRoadworthiness: false,
        },
        DEMO_CONTEXT
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.statutoryFee, 15000); // 12,500 + 2,500 admin
      assert.equal(res.data.roadworthinessNumber, undefined);
      assert.equal(res.data.documents.length, 1);
    });

    it("should strictly prevent cross-tenant vehicle license renewal", async () => {
      const repos = getRepositoryContainer();
      // Create a vehicle belonging to another customer
      const foreignVehicle = await repos.assets.create(
        {
          customer_id: "f0000000-0000-0000-0000-000000000002",
          name: "Foreign Honda Civic",
          identifier: "FOR-999-ZZ",
          asset_type: "vehicle",
          metadata: { make: "Honda", model: "Civic" },
        },
        {
          organizationId: DEMO_ORG,
          role: "agent",
        }
      );

      const res = await tool.execute(
        {
          customerId: DEMO_CUSTOMER,
          vehiclePlate: foreignVehicle.identifier,
        },
        DEMO_CONTEXT
      );

      // Customer role cannot renew vehicle belonging to another customer
      assert.equal(res.success, false);
      assert.equal(res.error?.code, "FORBIDDEN");
    });
  });

  describe("ActionOSPlanner for renew_vehicle_license", () => {
    const planner = new ActionOSPlanner();

    it("should generate ordered 4-step plan for renew_vehicle_license intent", () => {
      const planned = planner.createPlan({
        sessionId: "sess_plan_test",
        understanding: {
          intent: "renew_vehicle_license",
          confidence: 0.98,
          entities: {
            vehiclePlate: "ABC-123-XY",
            detectedLanguage: "en-NG",
          },
          normalizedText: "Renew vehicle license",
        },
        customerId: DEMO_CUSTOMER,
        organizationId: DEMO_ORG,
      });

      assert.equal(planned.plan.intent, "renew_vehicle_license");
      assert.equal(planned.steps.length, 4);
      assert.equal(planned.steps[0].tool_name, "get_customer");
      assert.equal(planned.steps[1].tool_name, "query_vehicle");
      assert.equal(planned.steps[2].tool_name, "verify_vehicle_inspection");
      assert.equal(planned.steps[3].tool_name, "renew_vehicle_license");
    });
  });

  describe("ActionOSOrchestrator End-to-End Workflow Execution", () => {
    it("should autonomously run renew_vehicle_license workflow to completion", async () => {
      const orchestrator = new ActionOSOrchestrator();

      const result = await orchestrator.startWorkflow({
        inputText: "Renew vehicle license and roadworthiness inspection for car ABC-123-XY.",
        channel: "web",
        language: "en-NG",
        executionContext: DEMO_CONTEXT.auth,
      });

      assert.equal(result.status, "completed");
      assert.equal(result.intent, "renew_vehicle_license");
      assert.equal(result.authorizationRequired, false);
      assert.ok(result.message.includes("Vehicle license and roadworthiness"));
      assert.ok(result.events.length >= 4);

      // Verify that ledger events were hash-chained
      const repos = getRepositoryContainer();
      const events = await repos.ledger.getEventsBySessionId(result.sessionId, DEMO_CONTEXT.auth);
      assert.ok(events.length >= 4);
      assert.ok(events.some((e) => e.tool === "renew_vehicle_license"));
      assert.ok(events.some((e) => e.tool === "verify_vehicle_inspection"));
    });
  });

  describe("REST API Endpoint POST /api/vehicles/renew-license", () => {
    it("should renew vehicle license through HTTP endpoint", async () => {
      const req = new Request("http://localhost:3000/api/vehicles/renew-license", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actionos-auth": JSON.stringify({
            userId: "usr_demo",
            organizationId: DEMO_ORG,
            customerId: DEMO_CUSTOMER,
            role: "customer",
            isDemo: true,
          }),
        },
        body: JSON.stringify({
          customerId: DEMO_CUSTOMER,
          vehiclePlate: "ABC-123-XY",
          includeRoadworthiness: true,
          language: "en-NG",
        }),
      });

      const res = await renewLicenseEndpoint(req);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data.mvaaLicenseNumber);
      assert.ok(body.data.roadworthinessNumber);
      assert.equal(body.data.documents.length, 2);
    });

    it("should reject invalid duration months with 400 validation error", async () => {
      const req = new Request("http://localhost:3000/api/vehicles/renew-license", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actionos-auth": JSON.stringify({
            userId: "usr_demo",
            organizationId: DEMO_ORG,
            customerId: DEMO_CUSTOMER,
            role: "customer",
            isDemo: true,
          }),
        },
        body: JSON.stringify({
          vehiclePlate: "ABC-123-XY",
          licenseDurationMonths: 99, // Outside allowed 6-24
        }),
      });

      const res = await renewLicenseEndpoint(req);
      assert.equal(res.status, 400);

      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(body.error.code, "VALIDATION_ERROR");
    });
  });
});

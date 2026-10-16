import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FrscGatewayClient,
  FrscGatewayError,
  normalizePlateNumber,
  validatePlateNumber,
  normalizeDriverLicense,
  validateDriverLicense,
} from "@/lib/integrations/frsc";
import {
  LacvisGatewayClient,
  LacvisGatewayError,
} from "@/lib/integrations/lacvis";
import { VerifyVehicleInspectionTool } from "@/lib/actionos/tools/verify-vehicle-inspection";
import { VerifyNiidTool } from "@/lib/actionos/tools/verify-niid";
import { QueryVehicleTool } from "@/lib/actionos/tools/query-vehicle";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import { resetStore } from "@/lib/actionos/mock-store";
import { getRepositoryContainer } from "@/lib/repositories";

describe("Hardened FRSC & LACVIS Regulatory Gateway Adapters Suite", () => {
  describe("1. Plate & Driver's License Normalization & Validation", () => {
    it("should normalize diverse Nigerian license plate formats to standard AAA-123-AA", () => {
      assert.equal(normalizePlateNumber("abc 123 xy"), "ABC-123-XY");
      assert.equal(normalizePlateNumber("kja-821aa"), "KJA-821-AA");
      assert.equal(normalizePlateNumber("LAG440BD"), "LAG-440-BD");
      assert.equal(normalizePlateNumber("  RBC-901-DZ  "), "RBC-901-DZ");
    });

    it("should validate legitimate Nigerian license plates", () => {
      assert.equal(validatePlateNumber("ABC-123-XY").valid, true);
      assert.equal(validatePlateNumber("KJA-821-AA").valid, true);
      assert.equal(validatePlateNumber("LAG440BD").valid, true);
      assert.equal(validatePlateNumber("ABJ-12-CD").valid, true);
    });

    it("should reject invalid plate numbers", () => {
      assert.equal(validatePlateNumber("").valid, false);
      assert.equal(validatePlateNumber("   ").valid, false);
      assert.equal(validatePlateNumber("123-ABC").valid, false);
      assert.equal(validatePlateNumber("INVALID-TOO-LONG-PLATE").valid, false);
      assert.equal(validatePlateNumber("XYZ").valid, false);
    });

    it("should normalize and validate Nigerian driver's license numbers", () => {
      assert.equal(normalizeDriverLicense("  abc 1234 5678  "), "ABC12345678");
      assert.equal(validateDriverLicense("ABC12345678").valid, true);
      assert.equal(validateDriverLicense("KJA987654321A").valid, true);
      assert.equal(validateDriverLicense("").valid, false);
      assert.equal(validateDriverLicense("123").valid, false);
    });
  });

  describe("2. FRSC Gateway Client - Production Security & Fail-Closed Guardrails", () => {
    it("should throw FRSC_CONFIGURATION_ERROR in production mode if API key is missing", async () => {
      const prevMode = process.env.ACTIONOS_RUNTIME_MODE;
      process.env.ACTIONOS_RUNTIME_MODE = "production";

      try {
        const client = new FrscGatewayClient({ apiKey: "", apiUrl: "https://nvis.frsc.gov.ng/api/v1" });
        await assert.rejects(
          async () => client.verifyPlate("ABC-123-XY"),
          (err: unknown) => {
            assert.ok(err instanceof FrscGatewayError);
            assert.equal(err.code, "FRSC_CONFIGURATION_ERROR");
            assert.match(err.message, /Production mode error/);
            return true;
          }
        );
      } finally {
        if (prevMode !== undefined) {
          process.env.ACTIONOS_RUNTIME_MODE = prevMode;
        } else {
          delete process.env.ACTIONOS_RUNTIME_MODE;
        }
      }
    });

    it("should throw FRSC_INVALID_PLATE_FORMAT for malformed plate inputs", async () => {
      const client = new FrscGatewayClient();
      await assert.rejects(
        async () => client.verifyPlate("NOT_A_VALID_PLATE"),
        (err: unknown) => {
          assert.ok(err instanceof FrscGatewayError);
          assert.equal(err.code, "FRSC_INVALID_PLATE_FORMAT");
          return true;
        }
      );
    });

    it("should strictly fail closed in production when upstream network request fails", async () => {
      const prevMode = process.env.ACTIONOS_RUNTIME_MODE;
      process.env.ACTIONOS_RUNTIME_MODE = "production";

      try {
        // Pointing to a dead port to simulate network failure
        const client = new FrscGatewayClient({
          apiKey: "frsc_live_prod_key_test_12345",
          apiUrl: "http://127.0.0.1:59999/api/v1",
        });

        await assert.rejects(
          async () => client.verifyPlate("ABC-123-XY"),
          (err: unknown) => {
            assert.ok(err instanceof FrscGatewayError);
            assert.equal(err.code, "FRSC_NETWORK_ERROR");
            assert.match(err.message, /live query failed/i);
            return true;
          }
        );
      } finally {
        if (prevMode !== undefined) {
          process.env.ACTIONOS_RUNTIME_MODE = prevMode;
        } else {
          delete process.env.ACTIONOS_RUNTIME_MODE;
        }
      }
    });

    it("should throw FRSC_CONFIGURATION_ERROR in production mode for verifyDriverLicense if API key is missing", async () => {
      const prevMode = process.env.ACTIONOS_RUNTIME_MODE;
      process.env.ACTIONOS_RUNTIME_MODE = "production";

      try {
        const client = new FrscGatewayClient({ apiKey: "", apiUrl: "https://nvis.frsc.gov.ng/api/v1" });
        await assert.rejects(
          async () => client.verifyDriverLicense("ABC12345678"),
          (err: unknown) => {
            assert.ok(err instanceof FrscGatewayError);
            assert.equal(err.code, "FRSC_CONFIGURATION_ERROR");
            return true;
          }
        );
      } finally {
        if (prevMode !== undefined) {
          process.env.ACTIONOS_RUNTIME_MODE = prevMode;
        } else {
          delete process.env.ACTIONOS_RUNTIME_MODE;
        }
      }
    });
  });

  describe("3. FRSC Gateway Client - Demo & Sandbox Simulation Fixtures", () => {
    const client = new FrscGatewayClient();

    it("should resolve benchmark Toyota Camry for ABC-123-XY in sandbox", async () => {
      const res = await client.verifyPlate("ABC-123-XY");
      assert.equal(res.plate, "ABC-123-XY");
      assert.equal(res.found, true);
      assert.equal(res.make, "Toyota");
      assert.equal(res.model, "Camry");
      assert.equal(res.year, 2022);
      assert.equal(res.theftFlag, false);
      assert.equal(res.isSimulated, true);
      assert.equal(res.chassisNumber, "DEMO-VIN-000001");
    });

    it("should detect stolen vehicle sandbox fixture STOLEN-999-XX", async () => {
      const res = await client.verifyPlate("STOLEN-999-XX");
      assert.equal(res.found, true);
      assert.equal(res.theftFlag, true);
      assert.equal(res.isSimulated, true);
    });

    it("should return found: false for unregistered sandbox plates starting with NOT-", async () => {
      const res = await client.verifyPlate("NOT-404-NF");
      assert.equal(res.found, false);
      assert.equal(res.theftFlag, false);
    });

    it("should verify standard driver's license in sandbox mode", async () => {
      const res = await client.verifyDriverLicense("KJA12345678");
      assert.equal(res.valid, true);
      assert.equal(res.isSimulated, true);
      assert.equal(res.holderName, "Demo Customer");
    });

    it("should flag revoked driver's licenses in sandbox mode", async () => {
      const res = await client.verifyDriverLicense("REVOKED123456");
      assert.equal(res.valid, false);
    });
  });

  describe("4. LACVIS Roadworthiness Gateway Client", () => {
    it("should throw LACVIS_CONFIGURATION_ERROR in production mode if API key is missing", async () => {
      const prevMode = process.env.ACTIONOS_RUNTIME_MODE;
      process.env.ACTIONOS_RUNTIME_MODE = "production";

      try {
        const client = new LacvisGatewayClient({ apiKey: "", apiUrl: "https://lacvis.lagosstate.gov.ng/api/v1" });
        await assert.rejects(
          async () => client.verifyInspection("ABC-123-XY"),
          (err: unknown) => {
            assert.ok(err instanceof LacvisGatewayError);
            assert.equal(err.code, "LACVIS_CONFIGURATION_ERROR");
            assert.match(err.message, /Production mode error/);
            return true;
          }
        );
      } finally {
        if (prevMode !== undefined) {
          process.env.ACTIONOS_RUNTIME_MODE = prevMode;
        } else {
          delete process.env.ACTIONOS_RUNTIME_MODE;
        }
      }
    });

    it("should return compliant passing roadworthiness test in sandbox mode", async () => {
      const client = new LacvisGatewayClient();
      const res = await client.verifyInspection("ABC-123-XY", "DEMO-VIN-000001");

      assert.equal(res.overallResult, "PASSED");
      assert.equal(res.visualInspection, "PASSED");
      assert.equal(res.brakeEfficiencyStatus, "PASSED");
      assert.ok(res.brakeEfficiencyPct >= 70, "Brake efficiency must be >= 70%");
      assert.equal(res.emissionStatus, "PASSED");
      assert.ok(res.emissionCoPct <= 0.5, "CO must be <= 0.5%");
      assert.ok(res.emissionHcPpm <= 120, "HC must be <= 120ppm");
      assert.equal(res.isSimulated, true);
      assert.ok(res.inspectionId.startsWith("LACVIS-SIM-"));
    });

    it("should return failing roadworthiness test for test plate starting with FAIL", async () => {
      const client = new LacvisGatewayClient();
      const res = await client.verifyInspection("FAIL-123-XX");

      assert.equal(res.overallResult, "REQUIRES_RETEST");
      assert.equal(res.visualInspection, "FAILED");
      assert.equal(res.brakeEfficiencyStatus, "FAILED");
      assert.ok(res.brakeEfficiencyPct < 70, "Brake efficiency must be < 70% for failed test");
      assert.equal(res.emissionStatus, "FAILED");
    });
  });

  describe("5. End-to-End Tool Integrations with Hardened Gateways", () => {
    it("should execute VerifyVehicleInspectionTool using lacvisGateway", async () => {
      const tool = new VerifyVehicleInspectionTool();
      const res = await tool.execute(
        {
          vehiclePlate: "ABC-123-XY",
          chassisNumber: "DEMO-VIN-000001",
          language: "en-NG",
        },
        createWorkflowExecutionContext(DEMO_CONTEXT, { sessionId: "ses_lacvis_test" })
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.verified, true);
      assert.equal(res.data.overallResult, "PASSED");
      assert.ok(res.data.brakeEfficiency.includes("84%"));
      assert.ok(res.data.emissionStatus.includes("COMPLIANT"));
    });

    it("should reject inspection clearance in VerifyVehicleInspectionTool for failing test plates", async () => {
      const tool = new VerifyVehicleInspectionTool();
      const res = await tool.execute(
        {
          vehiclePlate: "FAIL-123-XX",
          chassisNumber: "DEMO-VIN-FAIL01",
          language: "en-NG",
        },
        createWorkflowExecutionContext(DEMO_CONTEXT, { sessionId: "ses_lacvis_fail_test" })
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.verified, false);
      assert.equal(res.data.overallResult, "REQUIRES_RETEST");
      assert.ok(res.data.emissionStatus.includes("NON-COMPLIANT"));
    });

    it("should cross-verify FRSC theft flag in VerifyNiidTool", async () => {
      const niidTool = new VerifyNiidTool();
      const context = createWorkflowExecutionContext(DEMO_CONTEXT, { sessionId: "ses_niid_stolen_test" });

      const stolenRes = await niidTool.execute(
        { vehiclePlate: "STOLEN-999-XX" },
        context
      );

      assert.equal(stolenRes.success, true);
      assert.ok(stolenRes.data);
      assert.equal(stolenRes.data.theftFlag, true);
      assert.equal(stolenRes.data.verified, false, "Stolen vehicle must fail NIID verification");

      const cleanRes = await niidTool.execute(
        { vehiclePlate: "ABC-123-XY" },
        context
      );
      assert.equal(cleanRes.success, true);
      assert.ok(cleanRes.data);
      assert.equal(cleanRes.data.theftFlag, false);
      assert.equal(cleanRes.data.verified, true);
    });

    it("should enrich vehicle query with FRSC data in QueryVehicleTool", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      await repos.assets.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          name: "Toyota Camry 2022",
          asset_type: "vehicle",
          identifier: "ABC-123-XY",
          metadata: {
            plate: "ABC-123-XY",
            vin: "DEMO-VIN-000001",
            color: "Midnight Black",
          },
        },
        {
          organizationId: DEMO_CONTEXT.organizationId,
          customerId: DEMO_CONTEXT.customerId,
          role: DEMO_CONTEXT.role,
        }
      );

      const queryTool = new QueryVehicleTool();
      const context = createWorkflowExecutionContext(DEMO_CONTEXT, { sessionId: "ses_query_veh_test" });

      const res = await queryTool.execute(
        { vehiclePlate: "ABC-123-XY" },
        context
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.found, true);
      assert.equal(res.data.plate, "ABC-123-XY");
      assert.ok(res.data.frscVerification);
      assert.equal(res.data.frscVerification.found, true);
      assert.equal(res.data.frscVerification.theftFlag, false);
      assert.equal(res.data.frscVerification.make, "Toyota");
    });
  });
});

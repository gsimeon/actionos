import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NiidGatewayClient,
  NiidGatewayError,
  niidGateway,
} from "@/lib/integrations/niid";
import { VerifyNiidTool } from "@/lib/actionos/tools/verify-niid";
import { GenerateCertificateTool } from "@/lib/actionos/tools/generate-certificate";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import { resetStore } from "@/lib/actionos/mock-store";

describe("Hardened NIID / NAICOM Statutory Gateway Suite", () => {
  describe("1. Parameter Validation & Normalization", () => {
    it("should reject query when plate, chassis, and policy are all omitted", async () => {
      const client = new NiidGatewayClient();
      await assert.rejects(
        () => client.verifyPolicy({}),
        (err: unknown) => {
          assert.ok(err instanceof NiidGatewayError);
          assert.equal(err.code, "NIID_INVALID_INPUT");
          assert.ok(err.message.includes("At least one lookup parameter"));
          return true;
        }
      );
    });

    it("should reject malformed plate format in lookup query", async () => {
      const client = new NiidGatewayClient();
      await assert.rejects(
        () => client.verifyPolicy({ plateNumber: "INVALID_PLATE_123" }),
        (err: unknown) => {
          assert.ok(err instanceof NiidGatewayError);
          assert.equal(err.code, "NIID_INVALID_INPUT");
          return true;
        }
      );
    });

    it("should normalize diverse plate string permutations to standard format", async () => {
      const client = new NiidGatewayClient();
      const res = await client.verifyPolicy({ plateNumber: "abc 123 xy" });
      assert.equal(res.vehiclePlate, "ABC-123-XY");
      assert.equal(res.found, true);
    });

    it("should reject certificate registration missing mandatory fields", async () => {
      const client = new NiidGatewayClient();
      await assert.rejects(
        () =>
          client.registerCertificate({
            policyNumber: "",
            vehiclePlate: "ABC-123-XY",
            chassisNumber: "VIN-12345",
            customerName: "Chief Adeleke",
            underwriterId: "",
            underwriterName: "Leadway",
            coverageStartDate: "2026-10-15",
            coverageEndDate: "2027-10-15",
            premiumPaid: 87500,
          }),
        (err: unknown) => {
          assert.ok(err instanceof NiidGatewayError);
          assert.equal(err.code, "NIID_INVALID_INPUT");
          return true;
        }
      );
    });
  });

  describe("2. Production Security & Fail-Closed Guardrails", () => {
    it("should throw NIID_CONFIGURATION_ERROR in production mode if API key is missing", async () => {
      const prevMode = process.env.ACTIONOS_RUNTIME_MODE;
      const prevKey = process.env.NIID_API_KEY;

      try {
        process.env.ACTIONOS_RUNTIME_MODE = "production";
        delete process.env.NIID_API_KEY;

        const client = new NiidGatewayClient({ apiKey: "" });

        await assert.rejects(
          () => client.verifyPolicy({ plateNumber: "ABC-123-XY" }),
          (err: unknown) => {
            assert.ok(err instanceof NiidGatewayError);
            assert.equal(err.code, "NIID_CONFIGURATION_ERROR");
            assert.ok(err.message.includes("Production mode requires NIID_API_KEY"));
            return true;
          }
        );
      } finally {
        if (prevMode !== undefined) {
          process.env.ACTIONOS_RUNTIME_MODE = prevMode;
        } else {
          delete process.env.ACTIONOS_RUNTIME_MODE;
        }
        if (prevKey) process.env.NIID_API_KEY = prevKey;
      }
    });

    it("should throw NIID_CONFIGURATION_ERROR in production mode for registerCertificate if API key is missing", async () => {
      const prevMode = process.env.ACTIONOS_RUNTIME_MODE;
      const prevKey = process.env.NIID_API_KEY;

      try {
        process.env.ACTIONOS_RUNTIME_MODE = "production";
        delete process.env.NIID_API_KEY;

        const client = new NiidGatewayClient({ apiKey: "" });

        await assert.rejects(
          () =>
            client.registerCertificate({
              policyNumber: "POL-2026-001",
              vehiclePlate: "ABC-123-XY",
              chassisNumber: "VIN-12345",
              customerName: "Chief Adeleke",
              underwriterId: "leadway",
              underwriterName: "Leadway Assurance",
              coverageStartDate: "2026-10-15",
              coverageEndDate: "2027-10-15",
              premiumPaid: 87500,
            }),
          (err: unknown) => {
            assert.ok(err instanceof NiidGatewayError);
            assert.equal(err.code, "NIID_CONFIGURATION_ERROR");
            return true;
          }
        );
      } finally {
        if (prevMode !== undefined) {
          process.env.ACTIONOS_RUNTIME_MODE = prevMode;
        } else {
          delete process.env.ACTIONOS_RUNTIME_MODE;
        }
        if (prevKey) process.env.NIID_API_KEY = prevKey;
      }
    });

    it("should fail closed in production when upstream network request fails", async () => {
      const prevMode = process.env.ACTIONOS_RUNTIME_MODE;

      try {
        process.env.ACTIONOS_RUNTIME_MODE = "production";

        // Point to an invalid, unreachable port to guarantee network failure
        const client = new NiidGatewayClient({
          apiUrl: "http://127.0.0.1:59999/api/v2",
          apiKey: "test_prod_niid_key",
        });

        await assert.rejects(
          () => client.verifyPolicy({ plateNumber: "ABC-123-XY" }),
          (err: unknown) => {
            assert.ok(err instanceof NiidGatewayError);
            assert.equal(err.code, "NIID_NETWORK_ERROR");
            assert.ok(err.message.includes("Failed to reach NIID Central Portal"));
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

  describe("3. Sandbox Simulation Fixtures", () => {
    it("should resolve benchmark Toyota Camry policy for ABC-123-XY", async () => {
      const res = await niidGateway.verifyPolicy({ plateNumber: "ABC-123-XY" });
      assert.equal(res.found, true);
      assert.equal(res.verified, true);
      assert.equal(res.vehiclePlate, "ABC-123-XY");
      assert.equal(res.policyNumber, "AUTO-2026-00182");
      assert.equal(res.underwriterName, "Leadway Assurance Company Limited");
      assert.equal(res.activePolicy, false, "Must be eligible for renewal");
      assert.ok(res.preclearanceToken.startsWith("NIID-SANDBOX-"));
      assert.ok(res.eStickerNumber?.startsWith("NAICOM-STK-"));
    });

    it("should flag active existing policy conflict for ACTIVE-999-OK fixture", async () => {
      const res = await niidGateway.verifyPolicy({ plateNumber: "ACTIVE-999-OK" });
      assert.equal(res.found, true);
      assert.equal(res.activePolicy, true, "Must flag active existing policy");
      assert.ok(typeof res.daysUntilExpiry === "number" && res.daysUntilExpiry > 30);
      assert.equal(res.underwriterName, "AIICO Insurance Plc");
    });

    it("should return found: false for unregistered sandbox plate NOT-404-NF", async () => {
      const res = await niidGateway.verifyPolicy({ plateNumber: "NOT-404-NF" });
      assert.equal(res.found, false);
      assert.equal(res.verified, false);
      assert.ok(res.preclearanceToken.startsWith("NIID-SANDBOX-"));
    });

    it("should register certificate and generate official NAICOM e-sticker in sandbox", async () => {
      const reg = await niidGateway.registerCertificate({
        policyNumber: "AUTO-2026-00182",
        vehiclePlate: "ABC-123-XY",
        chassisNumber: "DEMO-VIN-000001",
        customerName: "Chief Babatunde Adeleke",
        underwriterId: "leadway",
        underwriterName: "Leadway Assurance Company Limited",
        coverageStartDate: "2026-10-15",
        coverageEndDate: "2027-10-14",
        premiumPaid: 87500,
        currency: "NGN",
      });

      assert.equal(reg.success, true);
      assert.ok(reg.eStickerNumber.startsWith("NAICOM-STK-"));
      assert.ok(reg.naicomPolicyUid.startsWith("NAICOM-UID-"));
      assert.ok(reg.registrationNumber.startsWith("NIID-REG-"));
      assert.ok(reg.verificationHash.length === 64, "Must be valid SHA-256 hash");
      assert.ok(reg.qrVerificationUrl.includes("niid.nigeriainsurers.org"));
      assert.equal(reg.isSimulated, true);
    });
  });

  describe("4. Tool Integrations (VerifyNiidTool & GenerateCertificateTool)", () => {
    it("should execute VerifyNiidTool using niidGateway and cross-verify with FRSC", async () => {
      resetStore();
      const tool = new VerifyNiidTool();
      const context = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_niid_full",
        planId: "plan_1",
        channel: "web",
        language: "en-NG",
        isSimulated: true,
      });

      const res = await tool.execute({ vehiclePlate: "ABC-123-XY" }, context);
      assert.equal(res.success, true);
      assert.equal(res.data?.verified, true);
      assert.equal(res.data?.theftFlag, false);
      assert.equal(res.data?.frscRegistered, true);
      assert.equal(res.data?.niidRecordFound, true);
      assert.equal(res.data?.activeExistingPolicy, false);
      assert.ok(res.data?.preclearanceToken.startsWith("NIID-"));
    });

    it("should reject verification in VerifyNiidTool when vehicle has active policy conflict", async () => {
      resetStore();
      const tool = new VerifyNiidTool();
      const context = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_niid_active",
        planId: "plan_1",
        channel: "web",
        language: "en-NG",
        isSimulated: true,
      });

      const res = await tool.execute({ vehiclePlate: "ACTIVE-999-OK" }, context);
      assert.equal(res.success, true);
      assert.equal(res.data?.activeExistingPolicy, true);
      assert.equal(res.data?.verified, false, "Vehicle with active unexpired policy should not be cleared for duplicate renewal");
    });

    it("should attach statutory NAICOM e-sticker and verification hash in GenerateCertificateTool", async () => {
      resetStore();
      const tool = new GenerateCertificateTool();
      const context = createWorkflowExecutionContext(DEMO_CONTEXT, {
        sessionId: "sess_cert_niid",
        planId: "plan_1",
        channel: "web",
        language: "en-NG",
        isSimulated: true,
      });

      const res = await tool.execute(
        {
          customerId: DEMO_CONTEXT.customerId || "c0000000-0000-0000-0000-000000000001",
          policyNumber: "AUTO-2026-00182",
          previousExpiry: "2026-10-14",
          newExpiry: "2027-10-14",
          amount: 87500,
          vehiclePlate: "ABC-123-XY",
        },
        context
      );

      assert.equal(res.success, true);
      assert.ok(res.data?.certificateId);
      assert.ok(res.data?.documentNumber.startsWith("CERT-ACT-"));
      assert.ok(res.data?.eStickerNumber?.startsWith("NAICOM-STK-"));
      assert.ok(res.data?.naicomPolicyUid?.startsWith("NAICOM-UID-"));
      assert.ok(res.data?.verificationHash);
    });
  });
});

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetStore } from "@/lib/actionos/mock-store";
import { getRepositoryContainer, resetRepositoryContainer } from "@/lib/repositories";
import { createNAtlasProvider } from "@/lib/ai/n-atlas";
import { VerifyDriverLicenseTool } from "@/lib/actionos/tools/verify-driver-license";
import { RenewDriverLicenseTool, FRSC_CAPTURE_CENTERS } from "@/lib/actionos/tools/renew-driver-license";
import { ActionOSPlanner } from "@/lib/actionos/planner";
import { ActionOSPermissions } from "@/lib/actionos/permissions";
import { toolRegistry } from "@/lib/actionos/tool-registry";
import { DEMO_CONTEXT as CANONICAL_DEMO_AUTH } from "@/lib/security/auth-context";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import { verifier } from "@/lib/actionos/verifier";

const DEMO_ORG = CANONICAL_DEMO_AUTH.organizationId;
const DEMO_CUSTOMER = CANONICAL_DEMO_AUTH.customerId!;

const DEMO_CONTEXT = createWorkflowExecutionContext(CANONICAL_DEMO_AUTH, {
  sessionId: "sess_dl_test_001",
  planId: "plan_dl_test_001",
  channel: "web",
  language: "en-NG",
  isSimulated: true,
});

describe("FRSC Driver's License Renewal Pipeline Suite", () => {
  beforeEach(() => {
    resetStore();
    resetRepositoryContainer();
  });

  describe("1. N-ATLAS Multilingual Understanding for Driver's Licensing", () => {
    const natlas = createNAtlasProvider();

    it("should detect driver's license renewal in English", async () => {
      const res = await natlas.understand({
        text: "Please renew my driver license ABC12345678 for 3 years.",
        language: "en-NG",
      });

      assert.equal(res.intent, "renew_driver_license");
      assert.equal(res.entities.dlNumber, "ABC12345678");
      assert.ok(res.confidence >= 0.85);
    });

    it("should detect driver's license renewal in Nigerian Pidgin", async () => {
      const res = await natlas.understand({
        text: "I wan renew my driving license sharp sharp for ABC12345678.",
        language: "pcm",
      });

      assert.equal(res.intent, "renew_driver_license");
      assert.equal(res.entities.dlNumber, "ABC12345678");
      assert.equal(res.entities.detectedLanguage, "pcm");
    });

    it("should detect driver's license renewal in Yorùbá", async () => {
      const res = await natlas.understand({
        text: "Sọ iwe-aṣẹ awakọ mi di ọtun fun ABC12345678.",
        language: "yo",
      });

      assert.equal(res.intent, "renew_driver_license");
      assert.equal(res.entities.dlNumber, "ABC12345678");
      assert.equal(res.entities.detectedLanguage, "yo");
    });

    it("should detect driver's license renewal in Hausa", async () => {
      const res = await natlas.understand({
        text: "Sabunta lasisin tuki na ABC12345678.",
        language: "ha",
      });

      assert.equal(res.intent, "renew_driver_license");
      assert.equal(res.entities.dlNumber, "ABC12345678");
      assert.equal(res.entities.detectedLanguage, "ha");
    });

    it("should detect driver's license renewal in Igbo", async () => {
      const res = await natlas.understand({
        text: "Megharia akwukwo ikike ikwo ugboala m maka ABC12345678.",
        language: "ig",
      });

      assert.equal(res.intent, "renew_driver_license");
      assert.equal(res.entities.dlNumber, "ABC12345678");
      assert.equal(res.entities.detectedLanguage, "ig");
    });

    it("should detect driver's license verification intent", async () => {
      const res = await natlas.understand({
        text: "Check if my driver license ABC12345678 is valid on FRSC portal.",
        language: "en-NG",
      });

      assert.equal(res.intent, "verify_driver_license");
      assert.equal(res.entities.dlNumber, "ABC12345678");
    });
  });

  describe("2. VerifyDriverLicenseTool (FRSC NVIS Registry Lookup)", () => {
    it("should be registered in ActionOSToolRegistry", () => {
      const tool = toolRegistry.getTool("verify_driver_license");
      assert.ok(tool);
      assert.equal(tool.name, "verify_driver_license");
    });

    it("should pass permissions check for customer role", () => {
      const perm = ActionOSPermissions.checkPermission({
        role: "customer",
        toolName: "verify_driver_license",
      });
      assert.equal(perm.allowed, true);
    });

    it("should verify valid driver's license against FRSC registry", async () => {
      const tool = new VerifyDriverLicenseTool();
      const res = await tool.execute(
        { dlNumber: "ABC12345678" },
        DEMO_CONTEXT
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.verified, true);
      assert.equal(res.data.dlNumber, "ABC12345678");
      assert.ok(res.data.holderName);
      assert.ok(res.data.authority.includes("FRSC"));
    });

    it("should reject malformed driver's license number format", async () => {
      const tool = new VerifyDriverLicenseTool();
      const res = await tool.execute(
        { dlNumber: "123" }, // Too short, fails NIGERIAN_DL_REGEX
        DEMO_CONTEXT
      );

      assert.equal(res.success, false);
      assert.equal(res.error?.code, "INVALID_DL_FORMAT");
    });

    it("should reject revoked driver's license on the FRSC registry", async () => {
      const tool = new VerifyDriverLicenseTool();
      const res = await tool.execute(
        { dlNumber: "REVOKED123456" },
        DEMO_CONTEXT
      );

      assert.equal(res.success, false);
      assert.equal(res.error?.code, "DL_NOT_FOUND_OR_REVOKED");
    });
  });

  describe("3. RenewDriverLicenseTool (Statutory Fees, Appointment & Temporary Permit)", () => {
    it("should be registered in ActionOSToolRegistry", () => {
      const tool = toolRegistry.getTool("renew_driver_license");
      assert.ok(tool);
      assert.equal(tool.name, "renew_driver_license");
    });

    it("should compute 3-year statutory renewal fee of ₦10,500 and book DLC appointment", async () => {
      const tool = new RenewDriverLicenseTool();
      const res = await tool.execute(
        {
          dlNumber: "ABC12345678",
          durationYears: 3,
          captureCenterId: "DLC-LAG-01",
          paymentReference: "PAY-DL-3YR-001",
        },
        DEMO_CONTEXT
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.renewed, true);
      assert.equal(res.data.durationYears, 3);
      assert.equal(res.data.statutoryFee, 10500);
      assert.ok(res.data.temporaryPermitNumber.startsWith("FRSC-TMP-"));
      assert.equal(res.data.captureCenter.id, "DLC-LAG-01");
      assert.equal(res.data.captureCenter.name, "FRSC Ojodu Berger Driver License Centre");
      assert.ok(res.data.captureCenter.appointmentWindow.includes("09:00 AM - 01:00 PM"));
      assert.ok(res.data.qrVerificationUrl.includes(res.data.temporaryPermitNumber));
      assert.equal(res.data.verificationHash.length, 64);

      // Verify document was recorded
      const repos = getRepositoryContainer();
      const docs = await repos.documents.findAll();
      const permitDoc = docs.find((d) => d.id === res.data!.permitDocument.id);
      assert.ok(permitDoc);
      assert.equal(permitDoc.document_type, "certificate");
      assert.ok(permitDoc.file_name.includes("FRSC_Permit_"));

      // Verify transaction was recorded
      const txs = await repos.transactions.findAll();
      const dlTx = txs.find((t) => t.id === res.data!.transaction.id);
      assert.ok(dlTx);
      assert.equal(dlTx.amount, 10500);
      assert.equal(dlTx.status, "succeeded");
    });

    it("should compute 5-year statutory renewal fee of ₦15,750 for Lekki DLC", async () => {
      const tool = new RenewDriverLicenseTool();
      const res = await tool.execute(
        {
          dlNumber: "ABC12345678",
          durationYears: 5,
          captureCenterId: "DLC-LAG-02",
          paymentReference: "PAY-DL-5YR-001",
        },
        DEMO_CONTEXT
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.durationYears, 5);
      assert.equal(res.data.statutoryFee, 15750);
      assert.equal(res.data.captureCenter.id, "DLC-LAG-02");
      assert.equal(res.data.captureCenter.name, "FRSC Lekki Driver License Centre");
    });

    it("should enforce transaction limit checks for customer role", () => {
      const withinLimit = ActionOSPermissions.checkPermission({
        role: "customer",
        toolName: "renew_driver_license",
        amount: 15750,
      });
      assert.equal(withinLimit.allowed, true);

      const exceedsLimit = ActionOSPermissions.checkPermission({
        role: "customer",
        toolName: "renew_driver_license",
        amount: 800_000,
      });
      assert.equal(exceedsLimit.allowed, false);
      assert.equal(exceedsLimit.requiresApproval, true);
    });

    it("should list valid FRSC capture centers benchmark", () => {
      assert.ok(FRSC_CAPTURE_CENTERS.length >= 4);
      assert.ok(FRSC_CAPTURE_CENTERS.some((c) => c.id === "DLC-LAG-01"));
      assert.ok(FRSC_CAPTURE_CENTERS.some((c) => c.id === "DLC-LAG-02"));
      assert.ok(FRSC_CAPTURE_CENTERS.some((c) => c.id === "DLC-ABJ-01"));
    });
  });

  describe("4. ActionOSPlanner for Driver's License Workflows", () => {
    const planner = new ActionOSPlanner();

    it("should generate ordered 4-step plan for renew_driver_license intent", () => {
      const planned = planner.createPlan({
        sessionId: "sess_plan_dl_01",
        understanding: {
          intent: "renew_driver_license",
          confidence: 0.99,
          entities: {
            dlNumber: "ABC12345678",
            detectedLanguage: "en-NG",
          },
          normalizedText: "Renew my driver license",
        },
        customerId: DEMO_CUSTOMER,
        organizationId: DEMO_ORG,
      });

      assert.equal(planned.plan.intent, "renew_driver_license");
      assert.equal(planned.steps.length, 4);
      assert.equal(planned.steps[0].tool_name, "get_customer");
      assert.equal(planned.steps[1].tool_name, "verify_driver_license");
      assert.equal(planned.steps[2].tool_name, "renew_driver_license");
      assert.equal(planned.steps[3].tool_name, "send_notification");
    });

    it("should generate ordered 2-step plan for verify_driver_license intent", () => {
      const planned = planner.createPlan({
        sessionId: "sess_plan_dl_02",
        understanding: {
          intent: "verify_driver_license",
          confidence: 0.98,
          entities: {
            dlNumber: "ABC12345678",
            detectedLanguage: "en-NG",
          },
          normalizedText: "Check driver license validity",
        },
        customerId: DEMO_CUSTOMER,
        organizationId: DEMO_ORG,
      });

      assert.equal(planned.plan.intent, "verify_driver_license");
      assert.equal(planned.steps.length, 2);
      assert.equal(planned.steps[0].tool_name, "get_customer");
      assert.equal(planned.steps[1].tool_name, "verify_driver_license");
    });
  });

  describe("5. ActionOSVerifier Independent Verification", () => {
    it("should independently verify Driver's License renewal and temporary permit issuance", async () => {
      // First execute renewal
      const tool = new RenewDriverLicenseTool();
      await tool.execute(
        {
          dlNumber: "ABC12345678",
          durationYears: 3,
          paymentReference: "PAY-DL-VERIF-001",
        },
        DEMO_CONTEXT
      );

      const nextYear = new Date().getFullYear() + 3;
      const vResult = await verifier.verifyDriverLicense("ABC12345678", nextYear);

      assert.equal(vResult.verified, true);
      assert.equal(vResult.passed, true);
      assert.ok(vResult.details.includes("independently verified"));
      assert.ok(vResult.details.includes("Temporary Permit:"));
    });

    it("should fail verification if no temporary permit document exists", async () => {
      const nextYear = new Date().getFullYear() + 3;
      const vResult = await verifier.verifyDriverLicense("UNRENEWED123", nextYear);

      assert.equal(vResult.verified, false);
      assert.equal(vResult.passed, false);
      assert.equal(vResult.error, "PERMIT_DOCUMENT_MISSING");
    });
  });
});

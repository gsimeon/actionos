import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetStore } from "@/lib/actionos/mock-store";
import { getRepositoryContainer, resetRepositoryContainer } from "@/lib/repositories";
import { createNAtlasProvider } from "@/lib/ai/n-atlas";
import { QueryHmoPlanTool } from "@/lib/actionos/tools/query-hmo-plan";
import { CheckHealthEligibilityTool } from "@/lib/actionos/tools/check-health-eligibility";
import { RenewHmoPolicyTool } from "@/lib/actionos/tools/renew-hmo-policy";
import { ActionOSPlanner } from "@/lib/actionos/planner";
import { ActionOSPermissions } from "@/lib/actionos/permissions";
import { toolRegistry } from "@/lib/actionos/tool-registry";
import { DEMO_CONTEXT as CANONICAL_DEMO_AUTH } from "@/lib/security/auth-context";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import { verifier } from "@/lib/actionos/verifier";

const DEMO_ORG = CANONICAL_DEMO_AUTH.organizationId;
const DEMO_CUSTOMER = CANONICAL_DEMO_AUTH.customerId!;

const DEMO_CONTEXT = createWorkflowExecutionContext(CANONICAL_DEMO_AUTH, {
  sessionId: "sess_hmo_test_001",
  planId: "plan_hmo_test_001",
  channel: "web",
  language: "en-NG",
  isSimulated: true,
});

describe("ActionOS Health: HMO Renewals Vertical Suite", () => {
  beforeEach(() => {
    resetStore();
    resetRepositoryContainer();
  });

  describe("1. N-ATLAS Multilingual Understanding for HMO & Health Insurance", () => {
    const natlas = createNAtlasProvider();

    it("should detect HMO policy renewal in English", async () => {
      const res = await natlas.understand({
        text: "Please renew my HMO health insurance plan for NHIA-2026-00812.",
        language: "en-NG",
      });

      assert.equal(res.intent, "renew_hmo_policy");
      assert.equal(res.entities.nhiaNumber, "NHIA-2026-00812");
      assert.ok(res.confidence >= 0.85);
    });

    it("should detect HMO policy renewal in Nigerian Pidgin", async () => {
      const res = await natlas.understand({
        text: "I wan renew my HMO health insurance card sharp sharp for NHIA-2026-00812.",
        language: "pcm",
      });

      assert.equal(res.intent, "renew_hmo_policy");
      assert.equal(res.entities.nhiaNumber, "NHIA-2026-00812");
      assert.equal(res.entities.detectedLanguage, "pcm");
    });

    it("should detect HMO policy renewal in Yorùbá", async () => {
      const res = await natlas.understand({
        text: "Sọ iṣeduro ilera HMO mi di ọtun pẹlu kaadi NHIA-2026-00812.",
        language: "yo",
      });

      assert.equal(res.intent, "renew_hmo_policy");
      assert.equal(res.entities.nhiaNumber, "NHIA-2026-00812");
      assert.equal(res.entities.detectedLanguage, "yo");
    });

    it("should detect HMO policy renewal in Hausa", async () => {
      const res = await natlas.understand({
        text: "Sabunta inshorar lafiya ta HMO tare da lambar NHIA-2026-00812.",
        language: "ha",
      });

      assert.equal(res.intent, "renew_hmo_policy");
      assert.equal(res.entities.nhiaNumber, "NHIA-2026-00812");
      assert.equal(res.entities.detectedLanguage, "ha");
    });

    it("should detect HMO policy renewal in Igbo", async () => {
      const res = await natlas.understand({
        text: "Megharia inshoorans ahuike HMO m maka NHIA-2026-00812.",
        language: "ig",
      });

      assert.equal(res.intent, "renew_hmo_policy");
      assert.equal(res.entities.nhiaNumber, "NHIA-2026-00812");
      assert.equal(res.entities.detectedLanguage, "ig");
    });

    it("should extract National Identification Number (NIN) if provided", async () => {
      const res = await natlas.understand({
        text: "Query my health insurance policy with NIN 12345678901.",
        language: "en-NG",
      });

      assert.equal(res.intent, "query_hmo_plan");
      assert.equal(res.entities.nin, "12345678901");
    });
  });

  describe("2. QueryHmoPlanTool (NHIA Enrollee & Plan Discovery)", () => {
    it("should be registered in ActionOSToolRegistry", () => {
      const tool = toolRegistry.getTool("query_hmo_plan");
      assert.ok(tool);
      assert.equal(tool.name, "query_hmo_plan");
    });

    it("should pass permissions check for customer role", () => {
      const perm = ActionOSPermissions.checkPermission({
        role: "customer",
        toolName: "query_hmo_plan",
      });
      assert.equal(perm.allowed, true);
    });

    it("should query active HMO plan and hospital directory", async () => {
      const tool = new QueryHmoPlanTool();
      const res = await tool.execute(
        { nhiaNumber: "NHIA-2026-00812" },
        DEMO_CONTEXT
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.enrollee.nhiaNumber, "NHIA-2026-00812");
      assert.equal(res.data.enrollee.tier, "silver");
      assert.ok(res.data.enrollee.primaryHcpName);
      assert.ok(Array.isArray(res.data.nearbyAccreditedHospitals));
      assert.ok(res.data.nearbyAccreditedHospitals.length > 0);
    });
  });

  describe("3. CheckHealthEligibilityTool (Statutory Renewal Window & Pricing)", () => {
    it("should be registered in ActionOSToolRegistry", () => {
      const tool = toolRegistry.getTool("check_health_eligibility");
      assert.ok(tool);
      assert.equal(tool.name, "check_health_eligibility");
    });

    it("should evaluate renewal window and calculate actuarial pricing with VAT", async () => {
      const tool = new CheckHealthEligibilityTool();
      const res = await tool.execute(
        {
          nhiaNumber: "NHIA-2026-00812",
          selectedTier: "silver",
          additionalDependents: 2, // 2 extra dependents * ₦15,000 = ₦30,000
        },
        DEMO_CONTEXT
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.equal(res.data.eligible, true);
      assert.equal(res.data.tier, "silver");
      assert.equal(res.data.basePremium, 95000);
      assert.equal(res.data.dependentsSurcharge, 30000);
      // subtotal = 95000 + 30000 = 125000
      // 7.5% VAT = 9375
      assert.equal(res.data.vatAmount, 9375);
      // total = 125000 + 9375 = 134375
      assert.equal(res.data.totalPremium, 134375);
    });

    it("should reject renewal eligibility when policy is suspended", async () => {
      const tool = new CheckHealthEligibilityTool();
      const res = await tool.execute({ nhiaNumber: "NHIA-2026-SUSPENDED" }, DEMO_CONTEXT);
      assert.equal(res.success, false);
      assert.ok(res.error?.message.includes("suspended"));
    });
  });

  describe("4. RenewHmoPolicyTool (Atomic Settlement & Digital Card Issuance)", () => {
    it("should be registered in ActionOSToolRegistry", () => {
      const tool = toolRegistry.getTool("renew_hmo_policy");
      assert.ok(tool);
      assert.equal(tool.name, "renew_hmo_policy");
    });

    it("should execute full HMO renewal, issue digital card, and store document", async () => {
      const tool = new RenewHmoPolicyTool();
      const res = await tool.execute(
        {
          nhiaNumber: "NHIA-2026-00812",
          tier: "silver",
          paymentReference: "PAY-HMO-TEST-001",
          expectedAmount: 102125,
          dependentsCount: 2,
        },
        DEMO_CONTEXT
      );

      assert.equal(res.success, true);
      assert.ok(res.data);
      assert.ok(res.data.digitalCard.digitalCardNumber);
      assert.ok(res.data.digitalCard.digitalCardNumber.startsWith("HMO-SILVER-"));
      assert.ok(res.data.digitalCard.nhiaVerificationUid);
      assert.ok(res.data.hmoDocument.id);
      assert.ok(res.data.transaction.id);

      // Verify document was recorded in repositories
      const repos = getRepositoryContainer();
      const docs = await repos.documents.findAll();
      const hmoDoc = docs.find((d) => d.id === res.data!.hmoDocument.id);
      assert.ok(hmoDoc);
      assert.equal(hmoDoc.document_type, "certificate");
      assert.ok(hmoDoc.file_name.includes("HMO_Card_"));

      // Verify transaction was recorded
      const txs = await repos.transactions.findAll();
      const hmoTx = txs.find((t) => t.id === res.data!.transaction.id);
      assert.ok(hmoTx);
      assert.equal(hmoTx.amount, 102125);
      assert.equal(hmoTx.status, "succeeded");
    });

    it("should enforce transaction limit checks for customer role", () => {
      const withinLimit = ActionOSPermissions.checkPermission({
        role: "customer",
        toolName: "renew_hmo_policy",
        amount: 350000, // Platinum plan
      });
      assert.equal(withinLimit.allowed, true);

      const exceedsLimit = ActionOSPermissions.checkPermission({
        role: "customer",
        toolName: "renew_hmo_policy",
        amount: 1_500_000, // Group HMO
      });
      assert.equal(exceedsLimit.allowed, false);
      assert.equal(exceedsLimit.requiresApproval, true);
    });
  });

  describe("5. ActionOSPlanner for HMO Renewal Workflows", () => {
    const planner = new ActionOSPlanner();

    it("should generate ordered 6-step plan for renew_hmo_policy intent", () => {
      const planned = planner.createPlan({
        sessionId: "sess_plan_hmo_01",
        understanding: {
          intent: "renew_hmo_policy",
          confidence: 0.99,
          entities: {
            nhiaNumber: "NHIA-2026-00812",
            detectedLanguage: "en-NG",
          },
          normalizedText: "Renew my HMO health insurance",
        },
        customerId: DEMO_CUSTOMER,
        organizationId: DEMO_ORG,
      });

      assert.equal(planned.plan.intent, "renew_hmo_policy");
      assert.equal(planned.steps.length, 6);
      assert.equal(planned.steps[0].tool_name, "get_customer");
      assert.equal(planned.steps[1].tool_name, "query_hmo_plan");
      assert.equal(planned.steps[2].tool_name, "check_health_eligibility");
      assert.equal(planned.steps[3].tool_name, "renew_hmo_policy");
      assert.equal(planned.steps[4].tool_name, "send_notification");
      assert.equal(planned.steps[5].tool_name, "schedule_reminder");
    });

    it("should generate ordered 2-step plan for query_hmo_plan intent", () => {
      const planned = planner.createPlan({
        sessionId: "sess_plan_hmo_02",
        understanding: {
          intent: "query_hmo_plan",
          confidence: 0.98,
          entities: {
            nhiaNumber: "NHIA-2026-00812",
            detectedLanguage: "en-NG",
          },
          normalizedText: "Query my health insurance plan",
        },
        customerId: DEMO_CUSTOMER,
        organizationId: DEMO_ORG,
      });

      assert.equal(planned.plan.intent, "query_hmo_plan");
      assert.equal(planned.steps.length, 2);
      assert.equal(planned.steps[0].tool_name, "get_customer");
      assert.equal(planned.steps[1].tool_name, "query_hmo_plan");
    });
  });

  describe("6. ActionOSVerifier Independent Verification", () => {
    it("should independently verify HMO renewal and digital card generation", async () => {
      // First execute renewal
      const tool = new RenewHmoPolicyTool();
      await tool.execute(
        {
          nhiaNumber: "NHIA-2026-00812",
          tier: "silver",
          paymentReference: "PAY-VERIF-001",
          expectedAmount: 95000,
        },
        DEMO_CONTEXT
      );

      const nextYear = new Date().getFullYear() + 1;
      const vResult = await verifier.verifyHmoPolicy("NHIA-2026-00812", nextYear);

      assert.equal(vResult.verified, true);
      assert.equal(vResult.passed, true);
      assert.ok(vResult.details.includes("independently verified"));
    });

    it("should fail verification if no HMO card document exists", async () => {
      const nextYear = new Date().getFullYear() + 1;
      const vResult = await verifier.verifyHmoPolicy("NHIA-2026-UNRENEWED", nextYear);

      assert.equal(vResult.verified, false);
      assert.equal(vResult.passed, false);
      assert.equal(vResult.error, "HMO_DOCUMENT_MISSING");
    });
  });
});

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetStore } from "@/lib/actionos/mock-store";
import { getRepositoryContainer, resetRepositoryContainer } from "@/lib/repositories";
import { ActionOSVerifier, verifier } from "@/lib/actionos/verifier";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { RenewVehicleLicenseTool } from "@/lib/actionos/tools/renew-vehicle-license";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import type { IPaymentProvider } from "@/lib/payments/provider";

const DEMO_ORG = DEMO_CONTEXT.organizationId;
const DEMO_CUSTOMER = DEMO_CONTEXT.customerId!;
const TENANT_A = { organizationId: DEMO_ORG, customerId: DEMO_CUSTOMER, role: "customer" as const };
const TENANT_B = { organizationId: "b0000000-0000-0000-0000-000000000002", customerId: "f0000000-0000-0000-0000-000000000002", role: "customer" as const };

const EXEC_CONTEXT = createWorkflowExecutionContext(DEMO_CONTEXT, {
  sessionId: "sess_verifier_test_001",
  planId: "plan_verifier_test_001",
  channel: "web",
  language: "en-NG",
  isSimulated: true,
});

describe("ActionOSVerifier Multi-Modal Verification Suite", () => {
  beforeEach(() => {
    resetStore();
    resetRepositoryContainer();
  });

  describe("1. verifyPayment", () => {
    it("should successfully verify settled payment with equal or greater amount", async () => {
      const mockProvider: IPaymentProvider = {
        name: "MockPaystack",
        async requestPayment(input) {
          return { status: "succeeded", reference: input.reference, providerReference: "prov_1" };
        },
        async verifyPayment(ref: string) {
          return {
            status: "succeeded",
            amount: 87500,
            currency: "NGN",
            reference: ref,
            providerReference: "pstk_settled_123",
          };
        },
        async refundPayment() {
          return { status: "refund_confirmed" as const, refundId: "rfd_1", reference: "ref_1", amount: 87500, currency: "NGN" };
        },
      };

      const customVerifier = new ActionOSVerifier(mockProvider);
      const res = await customVerifier.verifyPayment("ref_test_001", 87500);

      assert.equal(res.verified, true);
      assert.equal(res.passed, true);
      assert.equal(res.type, "payment");
      assert.match(res.details, /independently confirmed/i);
    });

    it("should fail verification when settled amount is less than expected (AMOUNT_MISMATCH)", async () => {
      const mockProvider: IPaymentProvider = {
        name: "MockPaystack",
        async requestPayment(input) { return { status: "succeeded", reference: input.reference, providerReference: "" }; },
        async verifyPayment(ref: string) {
          return { status: "succeeded", amount: 50000, currency: "NGN", reference: ref, providerReference: "pstk_partial" };
        },
        async refundPayment() { return { status: "refund_confirmed" as const, refundId: "", reference: "", amount: 0, currency: "NGN" }; },
      };

      const customVerifier = new ActionOSVerifier(mockProvider);
      const res = await customVerifier.verifyPayment("ref_test_underpaid", 87500);

      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "AMOUNT_MISMATCH");
    });

    it("should fail verification when payment status is not succeeded (PAYMENT_NOT_SETTLED)", async () => {
      const mockProvider: IPaymentProvider = {
        name: "MockPaystack",
        async requestPayment(input) { return { status: "succeeded", reference: input.reference, providerReference: "" }; },
        async verifyPayment(ref: string) {
          return { status: "pending", amount: 87500, currency: "NGN", reference: ref, providerReference: "" };
        },
        async refundPayment() { return { status: "refund_confirmed" as const, refundId: "", reference: "", amount: 0, currency: "NGN" }; },
      };

      const customVerifier = new ActionOSVerifier(mockProvider);
      const res = await customVerifier.verifyPayment("ref_test_pending", 87500);

      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "PAYMENT_NOT_SETTLED");
    });

    it("should catch and handle payment provider network error gracefully", async () => {
      const mockProvider: IPaymentProvider = {
        name: "MockPaystack",
        async requestPayment(input) { return { status: "succeeded", reference: input.reference, providerReference: "" }; },
        async verifyPayment() {
          throw new Error("Paystack Gateway Timeout 504");
        },
        async refundPayment() { return { status: "refund_confirmed" as const, refundId: "", reference: "", amount: 0, currency: "NGN" }; },
      };

      const customVerifier = new ActionOSVerifier(mockProvider);
      const res = await customVerifier.verifyPayment("ref_test_timeout", 87500);

      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "Paystack Gateway Timeout 504");
    });
  });

  describe("2. verifyRenewal", () => {
    it("should independently verify policy renewal roll-forward", async () => {
      const repos = getRepositoryContainer();
      // Seed an active renewed policy with 2027 expiry
      await repos.policies.create(
        {
          customer_id: DEMO_CUSTOMER,
          provider_id: "prov_leadway",
          policy_type_id: "poltype_comp",
          policy_number: "AUTO-2026-VERIFY-01",
          start_date: "2026-01-01T00:00:00Z",
          expiry_date: "2027-01-01T00:00:00Z",
          premium: 87500,
          currency: "NGN",
          status: "renewed",
        },
        TENANT_A
      );

      const res = await verifier.verifyRenewal("AUTO-2026-VERIFY-01", 2027, TENANT_A);
      assert.equal(res.verified, true);
      assert.equal(res.passed, true);
      assert.equal(res.type, "policy_renewal");
      assert.match(res.details, /independently verified/i);
    });

    it("should fail verification when policy does not exist (POLICY_NOT_FOUND)", async () => {
      const res = await verifier.verifyRenewal("NON-EXISTENT-POL-999", 2027, TENANT_A);
      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "POLICY_NOT_FOUND");
    });

    it("should fail verification when policy status is not renewed or active (INVALID_POLICY_STATUS)", async () => {
      const repos = getRepositoryContainer();
      await repos.policies.create(
        {
          customer_id: DEMO_CUSTOMER,
          provider_id: "prov_leadway",
          policy_type_id: "poltype_comp",
          policy_number: "AUTO-2026-CANCELLED-01",
          start_date: "2026-01-01T00:00:00Z",
          expiry_date: "2027-01-01T00:00:00Z",
          premium: 87500,
          currency: "NGN",
          status: "cancelled",
        },
        TENANT_A
      );

      const res = await verifier.verifyRenewal("AUTO-2026-CANCELLED-01", 2027, TENANT_A);
      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "INVALID_POLICY_STATUS");
    });

    it("should fail verification when expiry date is not rolled forward to expected year (EXPIRY_NOT_ROLLED_FORWARD)", async () => {
      const repos = getRepositoryContainer();
      await repos.policies.create(
        {
          customer_id: DEMO_CUSTOMER,
          provider_id: "prov_leadway",
          policy_type_id: "poltype_comp",
          policy_number: "AUTO-2026-EXPIRED-01",
          start_date: "2025-01-01T00:00:00Z",
          expiry_date: "2025-12-31T23:59:59Z",
          premium: 87500,
          currency: "NGN",
          status: "active",
        },
        TENANT_A
      );

      const res = await verifier.verifyRenewal("AUTO-2026-EXPIRED-01", 2027, TENANT_A);
      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "EXPIRY_NOT_ROLLED_FORWARD");
    });

    it("should enforce tenant isolation and block cross-tenant verification", async () => {
      const repos = getRepositoryContainer();
      await repos.policies.create(
        {
          customer_id: DEMO_CUSTOMER,
          provider_id: "prov_leadway",
          policy_type_id: "poltype_comp",
          policy_number: "AUTO-2026-TENANT-A-POL",
          start_date: "2026-01-01T00:00:00Z",
          expiry_date: "2027-01-01T00:00:00Z",
          premium: 87500,
          currency: "NGN",
          status: "renewed",
        },
        TENANT_A
      );

      // Attempt verification from Tenant B
      const res = await verifier.verifyRenewal("AUTO-2026-TENANT-A-POL", 2027, TENANT_B);
      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "POLICY_NOT_FOUND");
    });
  });

  describe("3. verifyCertificate", () => {
    it("should independently verify generated certificate document", async () => {
      const repos = getRepositoryContainer();
      await repos.documents.create(
        {
          customer_id: DEMO_CUSTOMER,
          document_type: "certificate",
          file_name: "Motor_Insurance_Certificate_AUTO-2026-00182.pdf",
          file_path: "/documents/certificates/CERT-ACT-000182.pdf",
          mime_type: "application/pdf",
          status: "generated",
        },
        TENANT_A
      );

      const res = await verifier.verifyCertificate(DEMO_CUSTOMER, "AUTO-2026-00182", TENANT_A);
      assert.equal(res.verified, true);
      assert.equal(res.passed, true);
      assert.equal(res.type, "certificate");
      assert.match(res.details, /verified/i);
    });

    it("should fail verification when no certificate exists for customer", async () => {
      const res = await verifier.verifyCertificate("cust_without_certs", "AUTO-9999", TENANT_A);
      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "CERTIFICATE_NOT_FOUND");
    });

    it("should block cross-tenant certificate verification", async () => {
      const repos = getRepositoryContainer();
      await repos.documents.create(
        {
          customer_id: DEMO_CUSTOMER,
          document_type: "certificate",
          file_name: "Motor_Insurance_Certificate_AUTO-2026-00182.pdf",
          file_path: "/documents/certificates/CERT-ACT-000182.pdf",
          mime_type: "application/pdf",
          status: "generated",
        },
        TENANT_A
      );

      const res = await verifier.verifyCertificate(DEMO_CUSTOMER, "AUTO-2026-00182", TENANT_B);
      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "CERTIFICATE_NOT_FOUND");
    });
  });

  describe("4. verifyVehicleLicense", () => {
    it("should independently verify vehicle license roll-forward and document issuance", async () => {
      const tool = new RenewVehicleLicenseTool();
      await tool.execute(
        {
          customerId: DEMO_CUSTOMER,
          vehiclePlate: "ABC-123-XY",
          includeRoadworthiness: true,
        },
        EXEC_CONTEXT
      );

      const res = await verifier.verifyVehicleLicense("ABC-123-XY", 2027, TENANT_A);
      assert.equal(res.verified, true);
      assert.equal(res.passed, true);
      assert.equal(res.type, "vehicle_license");
      assert.match(res.details, /independently verified/i);
    });

    it("should fail verification when vehicle plate does not exist", async () => {
      const res = await verifier.verifyVehicleLicense("XYZ-999-NOT-FOUND", 2027, TENANT_A);
      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "VEHICLE_NOT_FOUND");
    });

    it("should fail verification when vehicle has no recorded statutory license expiry", async () => {
      // Benchmark vehicle prior to renewal has no license_expiry set
      const res = await verifier.verifyVehicleLicense("ABC-123-XY", 2027, TENANT_A);
      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "NO_LICENSE_EXPIRY");
    });

    it("should fail verification when expiry year has not rolled forward", async () => {
      const tool = new RenewVehicleLicenseTool();
      await tool.execute(
        {
          customerId: DEMO_CUSTOMER,
          vehiclePlate: "ABC-123-XY",
          includeRoadworthiness: true,
        },
        EXEC_CONTEXT
      );

      // Verify against 2035 (renewal only rolled forward to 2027)
      const res = await verifier.verifyVehicleLicense("ABC-123-XY", 2035, TENANT_A);
      assert.equal(res.verified, false);
      assert.equal(res.passed, false);
      assert.equal(res.error, "LICENSE_NOT_ROLLED_FORWARD");
    });
  });
});

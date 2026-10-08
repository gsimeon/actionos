import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ActionOSGuardrails } from "@/lib/actionos/guardrails";
import type { Policy, Customer } from "@/types/database";

describe("ActionOSGuardrails", () => {
  const guardrails = new ActionOSGuardrails();

  const mockCustomer: Customer = {
    id: "cus_123",
    organization_id: "org_1",
    profile_id: null,
    customer_number: "CUS-001",
    full_name: "Demo Customer",
    phone: "+2348031234567",
    email: "demo@actionos.ng",
    address: "Lagos",
    state: "Lagos",
    country: "Nigeria",
    status: "active",
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockPolicy: Policy = {
    id: "pol_123",
    customer_id: "cus_123",
    asset_id: "ast_123",
    provider_id: "prov_1",
    policy_type_id: "pt_1",
    policy_number: "AUTO-2026-00182",
    start_date: "2025-10-14",
    expiry_date: "2026-10-14", // 7 days from 2026-10-07
    status: "expiring",
    premium: 87500,
    currency: "NGN",
    metadata: {},
    created_at: "2025-10-14T00:00:00Z",
    updated_at: new Date().toISOString(),
  };

  it("should validate customer ownership and active status", () => {
    const res = guardrails.validateCustomer(mockCustomer, "org_1");
    assert.equal(res.passed, true);

    const wrongOrg = guardrails.validateCustomer(mockCustomer, "org_other");
    assert.equal(wrongOrg.passed, false);
    assert.equal(wrongOrg.code, "ORGANIZATION_MISMATCH");
  });

  it("should enforce policy ownership and reject cancelled policies", () => {
    const ownershipPass = guardrails.validatePolicyOwnership(mockPolicy, "cus_123");
    assert.equal(ownershipPass.passed, true);

    const ownershipFail = guardrails.validatePolicyOwnership(mockPolicy, "other_customer");
    assert.equal(ownershipFail.passed, false);

    const cancelledPolicy = { ...mockPolicy, status: "cancelled" as const };
    const cancelledCheck = guardrails.validatePolicyOwnership(cancelledPolicy, "cus_123");
    assert.equal(cancelledCheck.passed, false);
    assert.equal(cancelledCheck.code, "POLICY_CANCELLED");
  });

  it("should validate renewal eligibility window within 30 days", () => {
    const eligible = guardrails.validateRenewalEligibility(
      mockPolicy,
      new Date("2026-10-07T00:00:00Z")
    );
    assert.equal(eligible.passed, true);

    // Too early: policy expires in 120 days
    const earlyPolicy = { ...mockPolicy, expiry_date: "2027-02-07" };
    const earlyCheck = guardrails.validateRenewalEligibility(
      earlyPolicy,
      new Date("2026-10-07T00:00:00Z")
    );
    assert.equal(earlyCheck.passed, false);
    assert.equal(earlyCheck.code, "RENEWAL_TOO_EARLY");
  });

  it("should enforce quote bounds and financial limits", () => {
    const validQuote = guardrails.validateQuote(87500, "NGN");
    assert.equal(validQuote.passed, true);

    const negativeQuote = guardrails.validateQuote(-500, "NGN");
    assert.equal(negativeQuote.passed, false);

    const excessQuote = guardrails.validateQuote(50_000_000, "NGN");
    assert.equal(excessQuote.passed, false);
    assert.equal(excessQuote.code, "EXCEEDS_TRANSACTION_LIMIT");
  });

  it("should require explicit authorization and verify amount match", () => {
    const noAuth = guardrails.validateAuthorization(false, 87500);
    assert.equal(noAuth.passed, false);

    const authMismatch = guardrails.validateAuthorization(true, 87500, 50000);
    assert.equal(authMismatch.passed, false);
    assert.equal(authMismatch.code, "QUOTE_AMOUNT_MISMATCH");

    const authPass = guardrails.validateAuthorization(true, 87500, 87500);
    assert.equal(authPass.passed, true);
  });

  it("should independently verify payment settlement before renewal", () => {
    const pendingSettlement = guardrails.validatePaymentSettlement("pending", 87500, 87500);
    assert.equal(pendingSettlement.passed, false);

    const settled = guardrails.validatePaymentSettlement("succeeded", 87500, 87500);
    assert.equal(settled.passed, true);
  });
});

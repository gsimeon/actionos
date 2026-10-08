import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ActionOSPermissions } from "@/lib/actionos/permissions";

describe("ActionOSPermissions", () => {
  it("should permit regular tools for customer within 500k limit", () => {
    const res = ActionOSPermissions.checkPermission({
      role: "customer",
      toolName: "get_policy",
    });
    assert.equal(res.allowed, true);

    const renewalRes = ActionOSPermissions.checkPermission({
      role: "customer",
      toolName: "request_payment",
      amount: 87500,
    });
    assert.equal(renewalRes.allowed, true);

    const niidRes = ActionOSPermissions.checkPermission({
      role: "customer",
      toolName: "verify_niid",
    });
    assert.equal(niidRes.allowed, true);
  });

  it("should require approval when customer exceeds 500k limit", () => {
    const excessRes = ActionOSPermissions.checkPermission({
      role: "customer",
      toolName: "request_payment",
      amount: 1_200_000,
    });
    assert.equal(excessRes.allowed, false);
    assert.equal(excessRes.requiresApproval, true);
  });

  it("should require manager role for privileged underwriting overrides", () => {
    const agentAttempt = ActionOSPermissions.checkPermission({
      role: "agent",
      toolName: "override_underwriting",
    });
    assert.equal(agentAttempt.allowed, false);

    const managerAttempt = ActionOSPermissions.checkPermission({
      role: "manager",
      toolName: "override_underwriting",
    });
    assert.equal(managerAttempt.allowed, true);
  });

  it("should enforce default-deny for unconfigured or unknown tools", () => {
    const unknownRes = ActionOSPermissions.checkPermission({
      role: "admin",
      toolName: "unregistered_arbitrary_tool",
    });
    assert.equal(unknownRes.allowed, false);
    assert.equal(unknownRes.requiresApproval, true);
    assert.match(unknownRes.reason || "", /default-deny/);
  });
});

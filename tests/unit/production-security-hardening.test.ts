import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { resolveExecutionContext, AuthContextError } from "@/lib/security/auth-context";
import { RefundPaymentTool } from "@/lib/actionos/tools/refund-payment";
import { getRepositoryContainer } from "@/lib/repositories";
import { createWorkflowExecutionContext } from "@/lib/runtime/execution-context";
import type { AuthenticatedExecutionContext } from "@/types/actionos";

describe("ActionOS Production Security Hardening & Zero Identity Fallback", () => {
  it("should strictly reject startWorkflow in production when executionContext is omitted", async () => {
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    process.env.ACTIONOS_RUNTIME_MODE = "production";

    try {
      await assert.rejects(
        async () => {
          await orchestrator.startWorkflow({
            inputText: "Renew my insurance policy now",
            channel: "web",
          } as unknown as Parameters<typeof orchestrator.startWorkflow>[0]);
        },
        /Security enforcement violation: executionContext is required to execute an ActionOS workflow/
      );
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
    }
  });

  it("should strictly reject customer role workflows in production if customerId is missing", async () => {
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    process.env.ACTIONOS_RUNTIME_MODE = "production";

    try {
      const incompleteAuth: AuthenticatedExecutionContext = {
        userId: "user_test_99",
        profileId: "prof_test_99",
        organizationId: "a0000000-0000-0000-0000-000000000001",
        role: "customer",
        // customerId intentionally missing
        isDemo: false,
      };

      await assert.rejects(
        async () => {
          await orchestrator.startWorkflow({
            inputText: "Renew my car insurance",
            channel: "web",
            executionContext: incompleteAuth,
          });
        },
        /Identity enforcement violation: customerId is required for customer role/
      );
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
    }
  });

  it("should strictly reject workflows in production if organizationId is missing", async () => {
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    process.env.ACTIONOS_RUNTIME_MODE = "production";

    try {
      const incompleteAuth = {
        userId: "user_test_99",
        profileId: "prof_test_99",
        role: "admin" as const,
        isDemo: false,
      } as AuthenticatedExecutionContext;

      await assert.rejects(
        async () => {
          await orchestrator.startWorkflow({
            inputText: "Check renewals",
            channel: "web",
            executionContext: incompleteAuth,
          });
        },
        /Tenant boundary violation: organizationId is required in executionContext/
      );
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
    }
  });

  it("should strictly reject workflows in production if role is missing", async () => {
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    process.env.ACTIONOS_RUNTIME_MODE = "production";

    try {
      const incompleteAuth = {
        userId: "user_test_99",
        profileId: "prof_test_99",
        organizationId: "a0000000-0000-0000-0000-000000000001",
        isDemo: false,
      } as unknown as AuthenticatedExecutionContext;

      await assert.rejects(
        async () => {
          await orchestrator.startWorkflow({
            inputText: "Check renewals",
            channel: "web",
            executionContext: incompleteAuth,
          });
        },
        /Role enforcement violation: role is required in executionContext/
      );
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
    }
  });

  it("should strictly reject authorizeAndExecute when authContext is omitted", async () => {
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    process.env.ACTIONOS_RUNTIME_MODE = "production";

    try {
      await assert.rejects(
        async () => {
          await orchestrator.authorizeAndExecute(
            "sess_arbitrary_123",
            true,
            undefined as unknown as AuthenticatedExecutionContext
          );
        },
        /Security enforcement violation: authContext is required/
      );
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
    }
  });

  it("should never manufacture DEMO_CONTEXT in resolveExecutionContext when in production", async () => {
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    process.env.ACTIONOS_RUNTIME_MODE = "production";

    try {
      await assert.rejects(
        async () => {
          await resolveExecutionContext();
        },
        (err: unknown) => err instanceof AuthContextError && err.code === "AUTH_ERROR"
      );
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
    }
  });

  it("should refuse refund execution in production when customerId is omitted", async () => {
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    process.env.ACTIONOS_RUNTIME_MODE = "production";

    try {
      const tool = new RefundPaymentTool();
      const emptyContext = createWorkflowExecutionContext(
        {
          userId: "user_anon",
          profileId: "prof_anon",
          organizationId: "org_test",
          role: "admin",
          isDemo: false,
        },
        { sessionId: "sess_test", channel: "web", isSimulated: false }
      );

      const res = await tool.execute(
        { reference: "ref_prev_100", amount: 50000, reason: "Saga rollback" },
        emptyContext
      );

      assert.equal(res.success, false);
      assert.equal(res.error?.code, "MISSING_CUSTOMER_ID");
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
    }
  });
});

describe("ActionOS Cross-Tenant Access Invariant Enforcement", () => {
  const repos = getRepositoryContainer();
  const legitimateOrg = "a0000000-0000-0000-0000-000000000001";
  const hostileOrg = "b9999999-9999-9999-9999-999999999999";
  const legitimateCustomer = "f0000000-0000-0000-0000-000000000001";
  const foreignCustomer = "f0000000-0000-0000-0000-000000000002";

  it("should block cross-tenant customer lookups", async () => {
    const denied = await repos.customers.findById(legitimateCustomer, {
      organizationId: hostileOrg,
    });
    assert.equal(denied, null, "Customer query must not traverse cross-tenant boundary");
  });

  it("should block cross-tenant policy lookups by number and ID", async () => {
    const deniedByNum = await repos.policies.findByNumber("AUTO-2026-00182", {
      organizationId: hostileOrg,
    });
    assert.equal(deniedByNum, null, "Policy query by number must not cross organization boundary");

    const deniedByCust = await repos.policies.findByCustomerId(legitimateCustomer, {
      organizationId: hostileOrg,
    });
    assert.equal(deniedByCust.length, 0, "Policy list by customer must return empty for foreign organization");
  });

  it("should block cross-tenant renewal lookups", async () => {
    const denied = await repos.renewals.findByPolicyId("20000000-0000-0000-0000-000000000001", {
      organizationId: hostileOrg,
    });
    assert.equal(denied, null, "Renewal lookup must not cross organization boundary");
  });

  it("should block cross-tenant transaction lookups", async () => {
    const denied = await repos.transactions.findByReference("act_1007_pay_9941", {
      organizationId: hostileOrg,
    });
    assert.equal(denied, null, "Transaction lookup must return null for wrong organization");
  });

  it("should reject creating resources with mismatched customer or organization tenant context", async () => {
    await assert.rejects(
      async () => {
        await repos.transactions.create(
          {
            customer_id: legitimateCustomer,
            amount: 50000,
            reference: `ref_hack_${Date.now()}`,
          },
          { customerId: foreignCustomer }
        );
      },
      /Tenant authorization violation: customer mismatch/
    );

    await assert.rejects(
      async () => {
        await repos.documents.create(
          {
            customer_id: legitimateCustomer,
            document_type: "certificate",
            file_path: "/docs/cert.pdf",
            file_name: "cert.pdf",
          },
          { customerId: foreignCustomer }
        );
      },
      /Tenant authorization violation: customer mismatch/
    );
  });

  it("should block Org B from authorizing an action session created by Org A", async () => {
    const legitimateAuth: AuthenticatedExecutionContext = {
      userId: "user_legit",
      profileId: "prof_legit",
      organizationId: legitimateOrg,
      role: "customer",
      customerId: legitimateCustomer,
      isDemo: true,
    };

    const hostileAuth: AuthenticatedExecutionContext = {
      userId: "user_hostile",
      profileId: "prof_hostile",
      organizationId: hostileOrg,
      role: "admin",
      isDemo: true,
    };

    const startRes = await orchestrator.startWorkflow({
      inputText: "Renew policy AUTO-2026-00182",
      channel: "web",
      executionContext: legitimateAuth,
    });

    assert.equal(startRes.authorizationRequired, true);

    await assert.rejects(
      async () => {
        await orchestrator.authorizeAndExecute(startRes.sessionId, true, hostileAuth);
      },
      /Tenant boundary violation: cannot authorize action belonging to another organization|Session '.*' not found/
    );
  });

  it("should strictly reject startWorkflow even in demo mode if executionContext is omitted", async () => {
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    process.env.ACTIONOS_RUNTIME_MODE = "demo";

    try {
      await assert.rejects(
        async () => {
          await orchestrator.startWorkflow({
            inputText: "Renew my insurance policy now",
            channel: "web",
          } as unknown as Parameters<typeof orchestrator.startWorkflow>[0]);
        },
        /Security enforcement violation: executionContext is required to execute an ActionOS workflow/
      );
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
    }
  });

  it("should execute successfully in demo mode when explicit DEMO_CONTEXT is provided", async () => {
    const { DEMO_CONTEXT } = await import("@/lib/security/auth-context");
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    process.env.ACTIONOS_RUNTIME_MODE = "demo";

    try {
      const result = await orchestrator.startWorkflow({
        inputText: "Renew my Toyota Camry insurance",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      assert.ok(result.sessionId);
      assert.equal(result.authorizationRequired, true);
      assert.ok(result.authorizationDetails);
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
    }
  });
});

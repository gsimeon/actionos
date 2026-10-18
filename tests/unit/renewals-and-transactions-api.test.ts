import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getRepositoryContainer } from "@/lib/repositories";
import { resetStore } from "@/lib/actionos/mock-store";
import { GET as getRenewals, POST as postRenewals } from "@/app/api/renewals/route";
import { GET as getTransactions } from "@/app/api/transactions/route";
import { GET as getDevReset, POST as postDevReset } from "@/app/api/dev/reset/route";

const CUSTOMER_TENANT = {
  organizationId: "a0000000-0000-0000-0000-000000000001",
  customerId: "f0000000-0000-0000-0000-000000000001",
  role: "customer" as const,
};

const OTHER_CUSTOMER_ID = "f0000000-0000-0000-0000-000000000002";

describe("Renewals & Multi-Rail Transactions REST API Suite", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("GET /api/renewals", () => {
    it("should return renewals for authorized tenant context", async () => {
      const req = new Request("http://localhost:3000/api/renewals", {
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
        },
      });

      const res = await getRenewals(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data));
      assert.ok(json.data.length >= 1, "Expected seeded renewals");
    });

    it("should filter renewals by status query parameter", async () => {
      const req = new Request("http://localhost:3000/api/renewals?status=awaiting_confirmation", {
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
        },
      });

      const res = await getRenewals(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      for (const item of json.data) {
        assert.equal(item.status, "awaiting_confirmation");
      }
    });

    it("should filter renewals by policyId query parameter", async () => {
      const policyId = "20000000-0000-0000-0000-000000000001";
      const req = new Request(`http://localhost:3000/api/renewals?policyId=${policyId}`, {
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
        },
      });

      const res = await getRenewals(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.length, 1);
      assert.equal(json.data[0].policy_id, policyId);
    });

    it("should permit query for matching authorized customerId", async () => {
      const req = new Request(`http://localhost:3000/api/renewals?customerId=${CUSTOMER_TENANT.customerId}`, {
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
        },
      });

      const res = await getRenewals(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      for (const item of json.data) {
        assert.equal(item.customer_id, CUSTOMER_TENANT.customerId);
      }
    });

    it("should strictly reject customer role attempting to query other customer renewals (403)", async () => {
      const req = new Request(`http://localhost:3000/api/renewals?customerId=${OTHER_CUSTOMER_ID}`, {
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
        },
      });

      const res = await getRenewals(req);
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, "FORBIDDEN");
    });
  });

  describe("POST /api/renewals", () => {
    it("should create renewal record for authorized customer", async () => {
      const req = new Request("http://localhost:3000/api/renewals", {
        method: "POST",
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          policy_id: "20000000-0000-0000-0000-000000000001",
          customer_id: CUSTOMER_TENANT.customerId,
          quote_amount: 87500,
          currency: "NGN",
        }),
      });

      const res = await postRenewals(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.policy_id, "20000000-0000-0000-0000-000000000001");
      assert.equal(json.data.customer_id, CUSTOMER_TENANT.customerId);
    });

    it("should strictly reject customer creating renewal for another customer ID", async () => {
      const req = new Request("http://localhost:3000/api/renewals", {
        method: "POST",
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          policy_id: "20000000-0000-0000-0000-000000000001",
          customer_id: OTHER_CUSTOMER_ID,
          quote_amount: 87500,
        }),
      });

      const res = await postRenewals(req);
      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, "FORBIDDEN");
    });

    it("should reject request with non-existent policy_id (404)", async () => {
      const req = new Request("http://localhost:3000/api/renewals", {
        method: "POST",
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          policy_id: "20000000-0000-0000-0000-999999999999",
          quote_amount: 87500,
        }),
      });

      const res = await postRenewals(req);
      assert.equal(res.status, 404);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, "POLICY_NOT_FOUND");
    });

    it("should reject request when customer attempts to renew another customer's policy (403)", async () => {
      // Policy 20000000-0000-0000-0000-000000000002 belongs to OTHER_CUSTOMER_ID
      const req = new Request("http://localhost:3000/api/renewals", {
        method: "POST",
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          policy_id: "20000000-0000-0000-0000-000000000002",
        }),
      });

      const res = await postRenewals(req);
      // Either 403 or 404 is returned because the tenant filter denies access to the other customer's policy
      assert.ok(res.status === 403 || res.status === 404);
      const json = await res.json();
      assert.equal(json.success, false);
    });

    it("should reject request with unallowed status or non-NGN currency (400 validation error)", async () => {
      const req = new Request("http://localhost:3000/api/renewals", {
        method: "POST",
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          policy_id: "20000000-0000-0000-0000-000000000001",
          status: "completed", // Illegal: client cannot inject completed status
          currency: "USD", // Illegal: only statutory NGN allowed
        }),
      });

      const res = await postRenewals(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, "VALIDATION_ERROR");
    });

    it("should reject request with malformed scheduled_for date format (400 validation error)", async () => {
      const req = new Request("http://localhost:3000/api/renewals", {
        method: "POST",
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          policy_id: "20000000-0000-0000-0000-000000000001",
          scheduled_for: "14/10/2026", // Invalid format (must be YYYY-MM-DD)
        }),
      });

      const res = await postRenewals(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, "VALIDATION_ERROR");
    });

    it("should strictly enforce server-determined status and payment_status on creation", async () => {
      const req = new Request("http://localhost:3000/api/renewals", {
        method: "POST",
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          policy_id: "20000000-0000-0000-0000-000000000001",
          days_before_expiry: 14,
        }),
      });

      const res = await postRenewals(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.data.status, "scheduled");
      assert.equal(json.data.payment_status, "pending");
      assert.equal(json.data.currency, "NGN");
      assert.equal(json.data.days_before_expiry, 14);
      assert.equal(json.data.customer_id, CUSTOMER_TENANT.customerId);
    });
  });

  describe("GET /api/transactions (Multi-Rail Settlement)", () => {
    it("should return settled transactions from both Paystack and MVAA statutory rails", async () => {
      const repos = getRepositoryContainer();

      // Seed a Paystack transaction
      await repos.transactions.create(
        {
          customer_id: CUSTOMER_TENANT.customerId,
          amount: 87500,
          currency: "NGN",
          provider: "mock_paystack",
          reference: "PAYSTACK-TEST-REF-001",
          status: "succeeded",
          transaction_type: "renewal_premium",
          metadata: { policy_number: "AUTO-2026-00182" },
        },
        CUSTOMER_TENANT
      );

      // Seed an MVAA statutory fee transaction
      await repos.transactions.create(
        {
          customer_id: CUSTOMER_TENANT.customerId,
          amount: 23500,
          currency: "NGN",
          provider: "mvaa_pay",
          reference: "MVAA-PAY-SETTLED-TEST001",
          status: "succeeded",
          transaction_type: "fee",
          metadata: {
            plate: "ABC-123-XY",
            vehicleName: "Toyota Camry",
            mvaaLicenseNumber: "MVAA-2026-TEST01",
            feeBreakdown: {
              vehicleLicenseFee: 15000,
              roadworthinessFee: 7000,
              adminProcessingFee: 1500,
            },
          },
        },
        CUSTOMER_TENANT
      );

      const req = new Request("http://localhost:3000/api/transactions", {
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
        },
      });

      const res = await getTransactions(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data));

      const paystackTx = json.data.find((t: { reference: string }) => t.reference === "PAYSTACK-TEST-REF-001");
      const mvaaTx = json.data.find((t: { reference: string }) => t.reference === "MVAA-PAY-SETTLED-TEST001");

      assert.ok(paystackTx, "Expected Paystack transaction to be returned");
      assert.equal(paystackTx.provider, "mock_paystack");
      assert.equal(paystackTx.transaction_type, "renewal_premium");

      assert.ok(mvaaTx, "Expected MVAA statutory transaction to be returned");
      assert.equal(mvaaTx.provider, "mvaa_pay");
      assert.equal(mvaaTx.transaction_type, "fee");
      assert.equal(mvaaTx.metadata.plate, "ABC-123-XY");
      assert.equal(mvaaTx.metadata.feeBreakdown.vehicleLicenseFee, 15000);
    });

    it("should return transactions filtered by authorized customer context", async () => {
      const repos = getRepositoryContainer();
      await repos.transactions.create(
        {
          customer_id: CUSTOMER_TENANT.customerId,
          amount: 15000,
          currency: "NGN",
          provider: "mock_paystack",
          reference: "PAYSTACK-OTHER-REF-002",
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        CUSTOMER_TENANT
      );

      const req = new Request(`http://localhost:3000/api/transactions?customerId=${CUSTOMER_TENANT.customerId}`, {
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
        },
      });

      const res = await getTransactions(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.length >= 1);
      for (const t of json.data) {
        assert.equal(t.customer_id, CUSTOMER_TENANT.customerId);
      }
    });

    it("should return transactions filtered by payment rail provider (flutterwave)", async () => {
      const repos = getRepositoryContainer();
      await repos.transactions.create(
        {
          customer_id: CUSTOMER_TENANT.customerId,
          amount: 87500,
          currency: "NGN",
          provider: "flutterwave",
          reference: "FLW-TEST-RAIL-001",
          status: "succeeded",
          transaction_type: "renewal_premium",
        },
        CUSTOMER_TENANT
      );

      const req = new Request("http://localhost:3000/api/transactions?provider=flutterwave", {
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
        },
      });

      const res = await getTransactions(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.length >= 1);
      const flwTx = json.data.find((t: { reference: string }) => t.reference === "FLW-TEST-RAIL-001");
      assert.ok(flwTx, "Flutterwave transaction must be present when filtered by provider=flutterwave");
      for (const t of json.data) {
        assert.ok(
          t.provider.toLowerCase().includes("flutterwave"),
          `Expected provider to match flutterwave, got ${t.provider}`
        );
      }
    });

    it("should return transactions filtered by transaction_type (fee and refund)", async () => {
      const repos = getRepositoryContainer();
      await repos.transactions.create(
        {
          customer_id: CUSTOMER_TENANT.customerId,
          amount: -15000,
          currency: "NGN",
          provider: "mock_paystack",
          reference: "PAYSTACK-REFUND-FILTER-001",
          status: "refunded",
          transaction_type: "refund",
        },
        CUSTOMER_TENANT
      );

      const req = new Request("http://localhost:3000/api/transactions?type=refund", {
        headers: {
          "x-organization-id": CUSTOMER_TENANT.organizationId,
          "x-customer-id": CUSTOMER_TENANT.customerId,
          "x-role": CUSTOMER_TENANT.role,
        },
      });

      const res = await getTransactions(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.data.length >= 1);
      for (const t of json.data) {
        assert.equal(t.transaction_type, "refund");
      }
    });
  });

  describe("GET & POST /api/dev/reset (State-Mutation Protection & Operator Authentication)", () => {
    const TEST_RESET_SECRET = "test_actionos_dev_secret_xyz789";

    it("should strictly reject state mutation on GET with 405 Method Not Allowed", async () => {
      const res = await getDevReset();
      assert.equal(res.status, 405);
      assert.equal(res.headers.get("Allow"), "POST");

      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error.code, "METHOD_NOT_ALLOWED");
      assert.match(json.error.message, /strictly prohibited via GET/i);
    });

    it("should strictly reject reset when ENABLE_DEMO_RESET feature flag is not enabled (403)", async () => {
      const previousFlag = process.env.ENABLE_DEMO_RESET;
      const previousAllow = process.env.ACTIONOS_ALLOW_DEV_RESET;
      delete process.env.ENABLE_DEMO_RESET;
      delete process.env.ACTIONOS_ALLOW_DEV_RESET;

      try {
        const req = new Request("http://localhost:3000/api/dev/reset", {
          method: "POST",
          headers: { "x-actionos-reset-key": TEST_RESET_SECRET },
        });
        const res = await postDevReset(req);
        assert.equal(res.status, 403);
        const json = await res.json();
        assert.equal(json.success, false);
        assert.equal(json.error.code, "FORBIDDEN");
        assert.match(json.error.message, /Dev reset endpoint is disabled/i);
      } finally {
        if (previousFlag !== undefined) process.env.ENABLE_DEMO_RESET = previousFlag;
        if (previousAllow !== undefined) process.env.ACTIONOS_ALLOW_DEV_RESET = previousAllow;
      }
    });

    it("should strictly reject reset in production environment mode (403)", async () => {
      const env = process.env as Record<string, string | undefined>;
      const prevNodeEnv = env.NODE_ENV;
      env.NODE_ENV = "production";
      env.ENABLE_DEMO_RESET = "true";

      try {
        const req = new Request("http://localhost:3000/api/dev/reset", {
          method: "POST",
          headers: { "x-actionos-reset-key": TEST_RESET_SECRET },
        });
        const res = await postDevReset(req);
        assert.equal(res.status, 403);
        const json = await res.json();
        assert.equal(json.success, false);
        assert.equal(json.error.code, "FORBIDDEN");
        assert.match(json.error.message, /strictly disabled in production/i);
      } finally {
        env.NODE_ENV = prevNodeEnv;
      }
    });

    it("SECURITY REGRESSION: strictly rejects spoofed 'x-role: admin' header without valid authentication (401)", async () => {
      const prevFlag = process.env.ENABLE_DEMO_RESET;
      const prevSecret = process.env.ACTIONOS_DEV_RESET_SECRET;
      process.env.ENABLE_DEMO_RESET = "true";
      process.env.ACTIONOS_DEV_RESET_SECRET = TEST_RESET_SECRET;

      try {
        // Attacker attempts to spoof admin privileges using client header 'x-role: admin'
        const req = new Request("http://localhost:3000/api/dev/reset", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-role": "admin",
          },
        });

        const res = await postDevReset(req);
        assert.equal(res.status, 401, "Spoofed x-role header must be rejected with 401 Unauthorized");

        const json = await res.json();
        assert.equal(json.success, false);
        assert.equal(json.error.code, "UNAUTHORIZED");
        assert.match(json.error.message, /valid operator secret key or verified administrator session is required/i);
        assert.match(json.error.message, /Client-supplied role headers are untrusted/i);
      } finally {
        if (prevFlag !== undefined) process.env.ENABLE_DEMO_RESET = prevFlag;
        if (prevSecret !== undefined) process.env.ACTIONOS_DEV_RESET_SECRET = prevSecret;
      }
    });

    it("should strictly reject invalid or incorrect operator secret key (401)", async () => {
      const prevFlag = process.env.ENABLE_DEMO_RESET;
      const prevSecret = process.env.ACTIONOS_DEV_RESET_SECRET;
      process.env.ENABLE_DEMO_RESET = "true";
      process.env.ACTIONOS_DEV_RESET_SECRET = TEST_RESET_SECRET;

      try {
        const req = new Request("http://localhost:3000/api/dev/reset", {
          method: "POST",
          headers: {
            "x-actionos-reset-key": "wrong_invalid_secret_key_999",
          },
        });

        const res = await postDevReset(req);
        assert.equal(res.status, 401);
        const json = await res.json();
        assert.equal(json.success, false);
        assert.equal(json.error.code, "UNAUTHORIZED");
      } finally {
        if (prevFlag !== undefined) process.env.ENABLE_DEMO_RESET = prevFlag;
        if (prevSecret !== undefined) process.env.ACTIONOS_DEV_RESET_SECRET = prevSecret;
      }
    });

    it("should permit clean state reset with verified operator secret key via x-actionos-reset-key (200)", async () => {
      const prevFlag = process.env.ENABLE_DEMO_RESET;
      const prevSecret = process.env.ACTIONOS_DEV_RESET_SECRET;
      process.env.ENABLE_DEMO_RESET = "true";
      process.env.ACTIONOS_DEV_RESET_SECRET = TEST_RESET_SECRET;

      try {
        const req = new Request("http://localhost:3000/api/dev/reset", {
          method: "POST",
          headers: {
            "x-actionos-reset-key": TEST_RESET_SECRET,
          },
        });

        const res = await postDevReset(req);
        assert.equal(res.status, 200);

        const json = await res.json();
        assert.equal(json.success, true);
        assert.match(json.message, /reset to clean benchmark state/i);
        assert.ok(json.operator);
        assert.equal(json.operator.role, "admin");
        assert.equal(json.operator.authMethod, "operator_secret");
        assert.ok(json.operator.resetAt);
      } finally {
        if (prevFlag !== undefined) process.env.ENABLE_DEMO_RESET = prevFlag;
        if (prevSecret !== undefined) process.env.ACTIONOS_DEV_RESET_SECRET = prevSecret;
      }
    });

    it("should permit clean state reset with verified operator secret key via Authorization Bearer (200)", async () => {
      const prevFlag = process.env.ENABLE_DEMO_RESET;
      const prevSecret = process.env.ACTIONOS_DEV_RESET_SECRET;
      process.env.ENABLE_DEMO_RESET = "true";
      process.env.ACTIONOS_DEV_RESET_SECRET = TEST_RESET_SECRET;

      try {
        const req = new Request("http://localhost:3000/api/dev/reset", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TEST_RESET_SECRET}`,
          },
        });

        const res = await postDevReset(req);
        assert.equal(res.status, 200);

        const json = await res.json();
        assert.equal(json.success, true);
        assert.equal(json.operator.authMethod, "operator_secret");
      } finally {
        if (prevFlag !== undefined) process.env.ENABLE_DEMO_RESET = prevFlag;
        if (prevSecret !== undefined) process.env.ACTIONOS_DEV_RESET_SECRET = prevSecret;
      }
    });

    it("SECURITY REGRESSION: strictly rejects reset when server has no operator secret configured (401)", async () => {
      const prevFlag = process.env.ENABLE_DEMO_RESET;
      const prevSecret = process.env.ACTIONOS_DEV_RESET_SECRET;
      const prevRootSecret = process.env.ACTIONOS_RESET_SECRET;
      process.env.ENABLE_DEMO_RESET = "true";
      delete process.env.ACTIONOS_DEV_RESET_SECRET;
      delete process.env.ACTIONOS_RESET_SECRET;

      try {
        const req = new Request("http://localhost:3000/api/dev/reset", {
          method: "POST",
          headers: {
            "x-actionos-reset-key": "any_client_supplied_key",
          },
        });

        const res = await postDevReset(req);
        assert.equal(res.status, 401, "Missing server-side secret configuration must fail secure with 401 Unauthorized");

        const json = await res.json();
        assert.equal(json.success, false);
        assert.equal(json.error.code, "UNAUTHORIZED");
        assert.match(json.error.message, /valid operator secret key or verified administrator session is required/i);
      } finally {
        if (prevFlag !== undefined) process.env.ENABLE_DEMO_RESET = prevFlag;
        if (prevSecret !== undefined) process.env.ACTIONOS_DEV_RESET_SECRET = prevSecret;
        if (prevRootSecret !== undefined) process.env.ACTIONOS_RESET_SECRET = prevRootSecret;
      }
    });

    it("SECURITY REGRESSION: strictly prevents non-admin caller or client context from resetting store without operator secret (401)", async () => {
      const prevFlag = process.env.ENABLE_DEMO_RESET;
      const prevSecret = process.env.ACTIONOS_DEV_RESET_SECRET;
      process.env.ENABLE_DEMO_RESET = "true";
      process.env.ACTIONOS_DEV_RESET_SECRET = TEST_RESET_SECRET;

      try {
        const req = new Request("http://localhost:3000/api/dev/reset", {
          method: "POST",
          headers: {
            "x-customer-id": CUSTOMER_TENANT.customerId,
            "x-role": "customer",
          },
        });

        const res = await postDevReset(req);
        assert.equal(res.status, 401, "Non-admin context without operator secret must be rejected with 401");

        const json = await res.json();
        assert.equal(json.success, false);
        assert.equal(json.error.code, "UNAUTHORIZED");
      } finally {
        if (prevFlag !== undefined) process.env.ENABLE_DEMO_RESET = prevFlag;
        if (prevSecret !== undefined) process.env.ACTIONOS_DEV_RESET_SECRET = prevSecret;
      }
    });
  });
});


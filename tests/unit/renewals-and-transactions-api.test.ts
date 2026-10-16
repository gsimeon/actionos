import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getRepositoryContainer } from "@/lib/repositories";
import { resetStore } from "@/lib/actionos/mock-store";
import { GET as getRenewals, POST as postRenewals } from "@/app/api/renewals/route";
import { GET as getTransactions } from "@/app/api/transactions/route";

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
  });
});

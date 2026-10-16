import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  FlutterwavePaymentProvider,
  verifyFlutterwaveWebhookSignature,
} from "@/lib/payments/flutterwave";
import { getPaymentProvider, setPaymentProvider } from "@/lib/payments";
import { POST as paymentWebhookHandler, resetProcessedWebhookMemoryCache } from "@/app/api/webhooks/payment/route";
import { resetStore } from "@/lib/actionos/mock-store";
import { getRepositoryContainer } from "@/lib/repositories";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";

describe("Flutterwave Payment Gateway Integration Suite", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetStore();
    resetProcessedWebhookMemoryCache();
    setPaymentProvider(null);
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    setPaymentProvider(null);
  });

  describe("1. Payment Initiation Validation", () => {
    it("should reject payment initiation when FLUTTERWAVE_SECRET_KEY is missing", async () => {
      delete process.env.FLUTTERWAVE_SECRET_KEY;
      const provider = new FlutterwavePaymentProvider("");

      await assert.rejects(
        provider.requestPayment({
          customerId: "cus_01",
          amount: 87500,
          currency: "NGN",
          reference: "ref_flw_001",
          email: "customer@gmail.com",
        }),
        /FLUTTERWAVE_SECRET_KEY is required/
      );
    });

    it("should reject initiation without customerId", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      await assert.rejects(
        provider.requestPayment({
          customerId: "",
          amount: 87500,
          currency: "NGN",
          reference: "ref_flw_001",
          email: "customer@gmail.com",
        }),
        /Customer identity \(customerId\) is required/
      );
    });

    it("should reject negative or zero payment amounts", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      await assert.rejects(
        provider.requestPayment({
          customerId: "cus_01",
          amount: -500,
          currency: "NGN",
          reference: "ref_flw_001",
          email: "customer@gmail.com",
        }),
        /Invalid payment amount/
      );

      await assert.rejects(
        provider.requestPayment({
          customerId: "cus_01",
          amount: 0,
          currency: "NGN",
          reference: "ref_flw_001",
          email: "customer@gmail.com",
        }),
        /Invalid payment amount/
      );
    });

    it("should reject fractional precision exceeding 2 decimal places", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      await assert.rejects(
        provider.requestPayment({
          customerId: "cus_01",
          amount: 87500.123,
          currency: "NGN",
          reference: "ref_flw_001",
          email: "customer@gmail.com",
        }),
        /Invalid amount precision.*exceed 2 decimal places/
      );
    });

    it("should reject invalid currency codes", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      await assert.rejects(
        provider.requestPayment({
          customerId: "cus_01",
          amount: 87500,
          currency: "NAIRA",
          reference: "ref_flw_001",
          email: "customer@gmail.com",
        }),
        /Invalid currency code/
      );
    });

    it("should reject missing or empty transaction reference", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      await assert.rejects(
        provider.requestPayment({
          customerId: "cus_01",
          amount: 87500,
          currency: "NGN",
          reference: "   ",
          email: "customer@gmail.com",
        }),
        /Transaction reference is required/
      );
    });

    it("should reject missing or invalid customer email address", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      await assert.rejects(
        provider.requestPayment({
          customerId: "cus_01",
          amount: 87500,
          currency: "NGN",
          reference: "ref_flw_001",
        }),
        /Customer email is strictly required/
      );

      await assert.rejects(
        provider.requestPayment({
          customerId: "cus_01",
          amount: 87500,
          currency: "NGN",
          reference: "ref_flw_001",
          email: "invalid-email-address",
        }),
        /Invalid customer email format/
      );

      await assert.rejects(
        provider.requestPayment({
          customerId: "cus_01",
          amount: 87500,
          currency: "NGN",
          reference: "ref_flw_001",
          email: "customer@actionos.ng",
        }),
        /Generic fallback email 'customer@actionos.ng' is prohibited/
      );
    });

    it("should successfully initialize transaction and return hosted link", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");
      let capturedUrl = "";
      let capturedBody: Record<string, unknown> = {};

      globalThis.fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(String(init?.body || "{}"));
        return new Response(
          JSON.stringify({
            status: "success",
            message: "Hosted Link",
            data: {
              link: "https://ravemodal-dev.herokuapp.com/v3/hosted/pay/flw_mock_link",
              id: 998877,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const result = await provider.requestPayment({
        customerId: "f0000000-0000-0000-0000-000000000001",
        amount: 87500,
        currency: "NGN",
        reference: "ref_flw_success_001",
        email: "verified.driver@actionos.ng",
        metadata: {
          customerName: "Babajide Adeleke",
          policyId: "AUTO-2026-00182",
        },
      });

      assert.equal(capturedUrl, "https://api.flutterwave.com/v3/payments");
      assert.equal(capturedBody.tx_ref, "ref_flw_success_001");
      assert.equal(capturedBody.amount, 87500);
      assert.equal(capturedBody.currency, "NGN");
      assert.equal((capturedBody.customer as Record<string, unknown>)?.email, "verified.driver@actionos.ng");
      assert.equal(result.status, "processing");
      assert.equal(result.gatewayUrl, "https://ravemodal-dev.herokuapp.com/v3/hosted/pay/flw_mock_link");
      assert.equal(result.reference, "ref_flw_success_001");
    });

    it("should recover idempotently if provider reports tx_ref already exists", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.includes("/payments")) {
          return new Response(
            JSON.stringify({
              status: "error",
              message: "Duplicate Transaction Reference: tx_ref already exists",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("/verify")) {
          return new Response(
            JSON.stringify({
              status: "success",
              data: {
                status: "successful",
                tx_ref: "ref_flw_dup_001",
                flw_ref: "FLW_MOCK_ALREADY_PAID",
                amount: 87500,
                currency: "NGN",
                id: 123456,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not Found", { status: 404 });
      };

      const result = await provider.requestPayment({
        customerId: "cus_01",
        amount: 87500,
        currency: "NGN",
        reference: "ref_flw_dup_001",
        email: "verified.driver@actionos.ng",
      });

      assert.equal(result.status, "succeeded");
      assert.equal(result.reference, "ref_flw_dup_001");
      assert.equal(result.providerReference, "FLW_MOCK_ALREADY_PAID");
    });
  });

  describe("2. Transaction Verification", () => {
    it("should query verify_by_reference for alphanumeric tx_ref", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");
      let calledUrl = "";

      globalThis.fetch = async (input) => {
        calledUrl = String(input);
        return new Response(
          JSON.stringify({
            status: "success",
            data: {
              status: "successful",
              tx_ref: "act:ses_100:payment",
              flw_ref: "FLW-VERIF-777",
              amount: 105000,
              currency: "NGN",
              id: 888123,
              created_at: "2026-10-16T21:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const res = await provider.verifyPayment("act:ses_100:payment");

      assert.ok(calledUrl.includes("/transactions/verify_by_reference?tx_ref=act%3Ases_100%3Apayment"));
      assert.equal(res.status, "succeeded");
      assert.equal(res.amount, 105000);
      assert.equal(res.currency, "NGN");
      assert.equal(res.providerTransactionId, "888123");
      assert.equal(res.providerReference, "FLW-VERIF-777");
      assert.equal(res.paidAt, "2026-10-16T21:00:00.000Z");
      assert.ok(res.verifiedAt);
    });

    it("should query /transactions/:id/verify directly for numeric transaction ID", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");
      let calledUrl = "";

      globalThis.fetch = async (input) => {
        calledUrl = String(input);
        return new Response(
          JSON.stringify({
            status: "success",
            data: {
              status: "successful",
              tx_ref: "act:ses_numeric:payment",
              flw_ref: "FLW-9988",
              amount: 50000,
              currency: "NGN",
              id: 9988,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const res = await provider.verifyPayment("9988");

      assert.ok(calledUrl.includes("/transactions/9988/verify"));
      assert.equal(res.status, "succeeded");
      assert.equal(res.amount, 50000);
    });

    it("should map failed status properly", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: "success",
            data: {
              status: "failed",
              tx_ref: "ref_declined",
              id: 1122,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const res = await provider.verifyPayment("ref_declined");
      assert.equal(res.status, "failed");
    });

    it("should throw on HTTP error during verification", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({ status: "error", message: "Transaction not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      };

      await assert.rejects(
        provider.verifyPayment("ref_not_found"),
        /Flutterwave verification failed.*Transaction not found/
      );
    });
  });

  describe("3. Authoritative Refund Lifecycle", () => {
    it("should accurately model refund_confirmed when gateway reports completed", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.includes("/refund")) {
          return new Response(
            JSON.stringify({
              status: "success",
              message: "Refund processed",
              data: {
                id: 4455,
                flw_ref: "FLW_REFUND_4455",
                status: "completed",
                amount_refunded: 87500,
                currency: "NGN",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("Not Found", { status: 404 });
      };

      const res = await provider.refundPayment("12345", 87500);

      assert.equal(res.status, "refund_confirmed");
      assert.equal(res.refundId, "4455");
      assert.equal(res.refundReference, "FLW_REFUND_4455");
      assert.equal(res.amount, 87500);
      assert.equal(res.currency, "NGN");
    });

    it("should accurately model refund_pending when request is queued", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: "success",
            message: "Refund queued for processing",
            data: {
              id: 7788,
              flw_ref: "FLW_QUEUED_7788",
              status: "pending",
              amount_refunded: 87500,
              currency: "NGN",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const res = await provider.refundPayment("12345", 87500);

      assert.equal(res.status, "refund_pending");
      assert.equal(res.refundId, "7788");
      assert.equal(res.refundReference, "FLW_QUEUED_7788");
    });

    it("should accurately model refund_failed when gateway declines", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            status: "error",
            message: "Transaction has already been fully refunded",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      };

      const res = await provider.refundPayment("12345", 87500);

      assert.equal(res.status, "refund_failed");
      assert.ok(res.error?.includes("already been fully refunded"));
    });

    it("should accurately model refund_unknown on HTTP 500 or timeout", async () => {
      const provider = new FlutterwavePaymentProvider("flw_sec_test_123");

      globalThis.fetch = async () => {
        return new Response("Internal Server Error", { status: 500 });
      };

      const res = await provider.refundPayment("12345", 87500);

      assert.equal(res.status, "refund_unknown");
      assert.ok(res.error?.includes("HTTP 500"));
    });
  });

  describe("4. Webhook Cryptographic Verification", () => {
    it("should verify valid verif-hash with timingSafeEqual", () => {
      const secretHash = "flw_super_secret_webhook_hash_2026";
      const valid = verifyFlutterwaveWebhookSignature(secretHash, secretHash);
      assert.equal(valid, true);
    });

    it("should reject mismatched signature", () => {
      const secretHash = "flw_super_secret_webhook_hash_2026";
      const valid = verifyFlutterwaveWebhookSignature("tampered_hash_value", secretHash);
      assert.equal(valid, false);
    });

    it("should reject missing or empty signature or secret", () => {
      assert.equal(verifyFlutterwaveWebhookSignature(null, "secret"), false);
      assert.equal(verifyFlutterwaveWebhookSignature("sig", ""), false);
      assert.equal(verifyFlutterwaveWebhookSignature(undefined, undefined), false);
    });
  });

  describe("5. End-to-End Webhook Endpoint Settlement with Flutterwave", () => {
    it("should settle transaction upon receiving Flutterwave charge.completed webhook", async () => {
      const repos = getRepositoryContainer();
      const ref = "ref_flw_e2e_001";
      const amount = 87500;

      // Seed pending transaction in repository
      const createdTx = await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount,
          currency: "NGN",
          reference: ref,
          status: "pending",
          provider: "flutterwave",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      const payload = {
        event: "charge.completed",
        data: {
          id: 556677,
          tx_ref: ref,
          flw_ref: "FLW-E2E-556677",
          amount: 87500,
          currency: "NGN",
          status: "successful",
          created_at: "2026-10-16T21:15:00.000Z",
        },
      };

      const req = new Request("http://localhost:3000/api/webhooks/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "verif-hash": "mock_flw_hash",
        },
        body: JSON.stringify(payload),
      });

      const response = await paymentWebhookHandler(req);
      const json = await response.json();

      assert.equal(response.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.data.reference, ref);
      assert.equal(json.data.status, "succeeded");

      // Verify transaction record was atomically settled in repository
      const updatedTx = await repos.transactions.findById(createdTx.id);
      assert.equal(updatedTx?.status, "succeeded");
    });

    it("should handle Flutterwave refund.completed webhook and update refund state", async () => {
      const repos = getRepositoryContainer();
      const ref = "ref_flw_refund_e2e";
      const amount = 87500;

      const createdTx = await repos.transactions.create(
        {
          customer_id: DEMO_CONTEXT.customerId!,
          amount,
          currency: "NGN",
          reference: ref,
          status: "succeeded",
          provider: "flutterwave",
          transaction_type: "renewal_premium",
        },
        DEMO_CONTEXT
      );

      const payload = {
        event: "refund.completed",
        data: {
          id: 990011,
          tx_ref: ref,
          flw_ref: "FLW-REFUND-990011",
          amount: 87500,
          amount_refunded: 87500,
          currency: "NGN",
          status: "completed",
        },
      };

      const req = new Request("http://localhost:3000/api/webhooks/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "verif-hash": "mock_flw_hash",
        },
        body: JSON.stringify(payload),
      });

      const response = await paymentWebhookHandler(req);
      const json = await response.json();

      assert.equal(response.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.data.status, "refunded");

      const updatedTx = await repos.transactions.findById(createdTx.id);
      assert.equal(updatedTx?.status, "refunded");
    });
  });

  describe("6. Provider Resolution Factory (getPaymentProvider)", () => {
    it("should return FlutterwavePaymentProvider when PAYMENT_PROVIDER=flutterwave", () => {
      process.env.PAYMENT_PROVIDER = "flutterwave";
      process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-mock123";

      const provider = getPaymentProvider();
      assert.ok(provider instanceof FlutterwavePaymentProvider);
      assert.equal(provider.name, "Flutterwave Gateway (Production)");
    });

    it("should throw in production mode if Flutterwave is selected but key is missing", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.PAYMENT_PROVIDER = "flutterwave";
      delete process.env.FLUTTERWAVE_SECRET_KEY;

      assert.throws(
        () => getPaymentProvider(),
        /Production runtime requires FLUTTERWAVE_SECRET_KEY/
      );
    });
  });
});

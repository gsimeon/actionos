import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactSensitiveInput, redactSensitiveObject } from "@/lib/security/redaction";

describe("ActionOS Data Privacy & Sensitive Information Redaction", () => {
  describe("redactSensitiveInput", () => {
    it("returns empty string when text is empty or undefined", () => {
      assert.equal(redactSensitiveInput(""), "");
      assert.equal(redactSensitiveInput(undefined), "");
    });

    it("redacts credit and debit card numbers (13-19 digits)", () => {
      const input = "Customer used Visa 4111 2222 3333 4444 to pay";
      const sanitized = redactSensitiveInput(input);
      assert.equal(sanitized, "Customer used Visa [REDACTED_CARD] to pay");
      assert.ok(!sanitized.includes("4111"));
    });

    it("redacts Nigerian telephone numbers with international prefix +234 or local 0", () => {
      const input = "Call customer on +2348031234567 or 08123456789 immediately";
      const sanitized = redactSensitiveInput(input);
      assert.equal(sanitized, "Call customer on [REDACTED_PHONE] or [REDACTED_PHONE] immediately");
      assert.ok(!sanitized.includes("08031234567"));
      assert.ok(!sanitized.includes("08123456789"));
    });

    it("redacts 11-digit national identity numbers (NIN / BVN)", () => {
      const input = "Verification against BVN 22233344455 and NIN 12345678901 completed";
      const sanitized = redactSensitiveInput(input);
      assert.equal(sanitized, "Verification against BVN [REDACTED_IDENTIFIER] and NIN [REDACTED_IDENTIFIER] completed");
      assert.ok(!sanitized.includes("22233344455"));
      assert.ok(!sanitized.includes("12345678901"));
    });

    it("redacts customer email addresses", () => {
      const input = "Receipt sent to customer.amina@gmail.com and coo@leadway.com";
      const sanitized = redactSensitiveInput(input);
      assert.equal(sanitized, "Receipt sent to [REDACTED_EMAIL] and [REDACTED_EMAIL]");
      assert.ok(!sanitized.includes("customer.amina@gmail.com"));
    });

    it("redacts policy numbers starting with standard prefixes (AUTO, POL, MOT, INS, REN)", () => {
      const input = "Renewing policy AUTO-2026-00182 and previous POL-2025-9921";
      const sanitized = redactSensitiveInput(input);
      assert.equal(sanitized, "Renewing policy [REDACTED_POLICY] and previous [REDACTED_POLICY]");
      assert.ok(!sanitized.includes("AUTO-2026-00182"));
      assert.ok(!sanitized.includes("POL-2025-9921"));
    });

    it("redacts Nigerian vehicle registration plates (2 or 3 letter state code)", () => {
      const input = "Vehicle with plate ABC-123-XY and KJA 882 AB inspected";
      const sanitized = redactSensitiveInput(input);
      assert.equal(sanitized, "Vehicle with plate [REDACTED_PLATE] and [REDACTED_PLATE] inspected");
      assert.ok(!sanitized.includes("ABC-123-XY"));
      assert.ok(!sanitized.includes("KJA 882 AB"));
    });
  });

  describe("redactSensitiveObject", () => {
    it("recursively sanitizes nested objects and arrays without mutating other types", () => {
      const payload = {
        sessionId: "sess_demo_123",
        amount: 87500,
        confirmed: true,
        customer: {
          name: "Musa Ibrahim",
          phone: "+2348039876543",
          email: "musa@example.com",
          bvn: "22334455667",
        },
        vehicles: [
          { plate: "APP-554-BC", vin: "DEMO-VIN-000001" },
        ],
        payment: {
          card: "5399 1234 5678 9012",
        },
      };

      const sanitized = redactSensitiveObject(payload);

      assert.equal(sanitized.sessionId, "sess_demo_123");
      assert.equal(sanitized.amount, 87500);
      assert.equal(sanitized.confirmed, true);
      assert.equal(sanitized.customer.phone, "[REDACTED_PHONE]");
      assert.equal(sanitized.customer.email, "[REDACTED_EMAIL]");
      assert.equal(sanitized.customer.bvn, "[REDACTED_IDENTIFIER]");
      assert.equal(sanitized.vehicles[0].plate, "[REDACTED_PLATE]");
      assert.equal(sanitized.payment.card, "[REDACTED_CARD]");
    });
  });
});

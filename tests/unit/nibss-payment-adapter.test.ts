import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NibssPaymentProvider,
  nibssPaymentProvider,
} from "@/lib/payments/nibss";
import { getPaymentProvider, setPaymentProvider } from "@/lib/payments";

describe("ActionOS NIBSS NIP Virtual Account Rail Adapter Test Suite", () => {
  it("should initialize with canonical provider name 'nibss'", () => {
    assert.equal(nibssPaymentProvider.name, "nibss");
  });

  it("should generate deterministic 10-digit NUBAN virtual account dedicated to reference", () => {
    const provider = new NibssPaymentProvider();
    const va1 = provider.generateVirtualAccount({
      customerId: "CUS-001",
      amount: 26000,
      currency: "NGN",
      reference: "ACT-REF-TEST-001",
    });

    assert.equal(va1.accountNumber.length, 10);
    assert.ok(va1.accountNumber.startsWith("992"));
    assert.equal(va1.bankCode, "035");
    assert.ok(va1.bankName.includes("Wema Bank"));
    assert.equal(va1.amount, 26000);
    assert.ok(va1.transferInstruction.includes(va1.accountNumber));
    assert.ok(va1.transferInstruction.includes("26,000"));

    // Deterministic idempotency for same reference
    const va2 = provider.generateVirtualAccount({
      customerId: "CUS-001",
      amount: 26000,
      currency: "NGN",
      reference: "ACT-REF-TEST-001",
    });
    assert.equal(va1.accountNumber, va2.accountNumber);
  });

  it("should request payment and return initiated status with virtual account metadata", async () => {
    const provider = new NibssPaymentProvider();
    const res = await provider.requestPayment({
      customerId: "CUS-002",
      amount: 15000,
      currency: "NGN",
      reference: "ACT-REF-TEST-002",
    });

    assert.equal(res.status, "initiated");
    assert.equal(res.reference, "ACT-REF-TEST-002");
    assert.ok(res.providerReference?.startsWith("NIP-VA-"));
    assert.ok(res.virtualAccount);
    assert.equal(res.virtualAccount.amount, 15000);
  });

  it("should verify payment and return confirmed settlement with NIP session identifier", async () => {
    const provider = new NibssPaymentProvider();
    const ref = "ACT-REF-TEST-003";

    await provider.requestPayment({
      customerId: "CUS-003",
      amount: 32000,
      currency: "NGN",
      reference: ref,
    });

    const verification = await provider.verifyPayment(ref);
    assert.equal(verification.status, "confirmed");
    assert.equal(verification.amount, 32000);
    assert.equal(verification.currency, "NGN");
    assert.ok(verification.providerReference.startsWith("NIP-"));
    assert.ok(verification.paidAt);
    assert.ok(verification.verifiedAt);
  });

  it("should process inbound NIP credit transfer from central switch", async () => {
    const provider = new NibssPaymentProvider();
    const ref = "ACT-REF-INBOUND-001";

    const inbound = await provider.processInboundTransfer({
      sessionId: "000035261019125500012345678901",
      sourceAccountNumber: "0123456789",
      sourceAccountName: "ALIKO DANGOTE TRANSPORT",
      sourceBankCode: "058",
      destinationAccountNumber: "9921234567",
      destinationBankCode: "035",
      amount: 55000,
      narration: "Fleet License Renewal Settlement",
      paymentReference: ref,
      transactionDate: new Date().toISOString(),
    });

    assert.equal(inbound.success, true);
    assert.ok(inbound.message.includes("55,000"));
    assert.ok(inbound.message.includes("ALIKO DANGOTE TRANSPORT"));

    // Verify subsequent lookup confirms with exact amount
    const verified = await provider.verifyPayment(ref);
    assert.equal(verified.status, "confirmed");
    assert.equal(verified.amount, 55000);
  });

  it("should execute NIP reversal refund", async () => {
    const provider = new NibssPaymentProvider();
    const refund = await provider.refundPayment("ACT-REF-REFUND-001", 12500);

    assert.equal(refund.status, "refund_confirmed");
    assert.equal(refund.amount, 12500);
    assert.ok(refund.refundReference?.startsWith("NIP-REV-"));
  });

  it("should integrate with payment provider factory via setPaymentProvider and PAYMENT_PROVIDER=nibss", () => {
    const origEnv = process.env.PAYMENT_PROVIDER;
    try {
      setPaymentProvider(null);
      process.env.PAYMENT_PROVIDER = "nibss";
      const resolved = getPaymentProvider();
      assert.equal(resolved.name, "nibss");
    } finally {
      process.env.PAYMENT_PROVIDER = origEnv;
      setPaymentProvider(null);
    }
  });
});

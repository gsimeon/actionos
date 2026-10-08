import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeEventHash,
  signEventHash,
  verifyLedgerIntegrity,
  GENESIS_LEDGER_HASH,
} from "@/lib/actionos/crypto-ledger";
import type { ActionLedgerEvent } from "@/types/actionos";

describe("ActionOS Cryptographic Action Ledger (Tamper-Evidence & Integrity)", () => {
  it("should compute deterministic SHA-256 hash for events", () => {
    const event: Partial<ActionLedgerEvent> = {
      sessionId: "session-123",
      timestamp: "2026-10-07T12:00:00.000Z",
      action: "payment_initiation",
      description: "Payment requested for ₦87,500",
      actor: "ActionOS Engine",
      status: "completed",
    };

    const hash1 = computeEventHash(event, GENESIS_LEDGER_HASH);
    const hash2 = computeEventHash(event, GENESIS_LEDGER_HASH);

    assert.equal(hash1, hash2, "Hashes must be strictly deterministic");
    assert.equal(hash1.length, 64, "SHA-256 hash must be 64 hexadecimal characters");
  });

  it("should generate and verify signature non-repudiation", () => {
    const hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const sig1 = signEventHash(hash);
    const sig2 = signEventHash(hash);

    assert.equal(sig1, sig2);
    assert.ok(sig1.length >= 32);
  });

  it("should verify valid hash-chained sequential ledger events", () => {
    const events: ActionLedgerEvent[] = [];
    let prev = GENESIS_LEDGER_HASH;

    const baseEvents = [
      { action: "intent_detection", description: "User requested renewal" },
      { action: "policy_lookup", description: "Policy AUTO-2026-00182 located" },
      { action: "payment_verification", description: "Payment verified on Paystack" },
      { action: "policy_renewal", description: "Policy expiry rolled to 2027" },
    ];

    for (let i = 0; i < baseEvents.length; i++) {
      const partial: Partial<ActionLedgerEvent> = {
        id: `ev_${i}`,
        sessionId: "test-sess",
        timestamp: new Date().toISOString(),
        action: baseEvents[i].action,
        description: baseEvents[i].description,
        actor: "ActionOS Engine",
        status: "verified",
      };
      const hash = computeEventHash(partial, prev);
      const ev: ActionLedgerEvent = {
        ...(partial as ActionLedgerEvent),
        previousHash: prev,
        hash,
        signature: signEventHash(hash),
      };
      events.push(ev);
      prev = hash;
    }

    const check = verifyLedgerIntegrity(events);
    assert.equal(check.valid, true, "Valid hash-chain must pass integrity audit");
    assert.equal(check.tamperedIndex, undefined);
  });

  it("should detect unauthorized payload tampering in the ledger", () => {
    const events: ActionLedgerEvent[] = [];
    let prev = GENESIS_LEDGER_HASH;

    for (let i = 0; i < 3; i++) {
      const partial: Partial<ActionLedgerEvent> = {
        id: `ev_${i}`,
        sessionId: "test-sess",
        timestamp: new Date().toISOString(),
        action: "action_" + i,
        description: "Standard description " + i,
        actor: "ActionOS Engine",
        status: "verified",
      };
      const hash = computeEventHash(partial, prev);
      events.push({
        ...(partial as ActionLedgerEvent),
        previousHash: prev,
        hash,
        signature: signEventHash(hash),
      });
      prev = hash;
    }

    // Maliciously tamper with event index 1 (simulate attacker altering audit log)
    events[1].description = "Tampered fraudulent description by adversary";

    const check = verifyLedgerIntegrity(events);
    assert.equal(check.valid, false, "Integrity verification must fail when payload is altered");
    assert.equal(check.tamperedIndex, 1);
    assert.ok(check.reason?.includes("Invalid event hash at index 1"));
  });
});

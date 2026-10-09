import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeEventHash,
  signEventHash,
  verifyEventSignature,
  verifyLedgerIntegrity,
  GENESIS_LEDGER_HASH,
} from "@/lib/actionos/crypto-ledger";
import type { ActionLedgerEvent } from "@/types/actionos";

describe("ActionOS Cryptographic Action Ledger (Tamper-Evidence & Integrity)", () => {
  it("should compute deterministic SHA-256 hash for events binding sequenceNumber, eventClass, and keyVersion", () => {
    const event: Partial<ActionLedgerEvent> = {
      sessionId: "session-123",
      sequenceNumber: 1,
      timestamp: "2026-10-07T12:00:00.000Z",
      action: "payment_initiation",
      description: "Payment requested for ₦87,500",
      actor: "ActionOS Engine",
      status: "completed",
      eventClass: "critical",
      signingKeyVersion: "v1-2026",
      isCompensating: false,
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
    assert.equal(sig1.length, 128, "Ed25519 signature in hex format must be 128 hex characters (64 bytes)");
    assert.equal(verifyEventSignature(hash, sig1), true, "Ed25519 signature must verify successfully");
  });

  it("should verify valid hash-chained sequential ledger events with signatures", () => {
    const events: ActionLedgerEvent[] = [];
    let prev = GENESIS_LEDGER_HASH;

    const baseEvents = [
      { action: "intent_detection", description: "User requested renewal", eventClass: "informational" as const },
      { action: "policy_lookup", description: "Policy AUTO-2026-00182 located", eventClass: "informational" as const },
      { action: "payment_verification", description: "Payment verified on Paystack", eventClass: "critical" as const },
      { action: "policy_renewal", description: "Policy expiry rolled to 2027", eventClass: "critical" as const },
    ];

    for (let i = 0; i < baseEvents.length; i++) {
      const partial: Partial<ActionLedgerEvent> = {
        id: `ev_${i}`,
        sessionId: "test-sess",
        sequenceNumber: i + 1,
        timestamp: new Date().toISOString(),
        action: baseEvents[i].action,
        description: baseEvents[i].description,
        actor: "ActionOS Engine",
        status: "verified",
        eventClass: baseEvents[i].eventClass,
        signingKeyVersion: "v1-2026",
        isCompensating: false,
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

    const check = verifyLedgerIntegrity(events, { verifySignatures: true, requireKeyVersion: "v1-2026" });
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
        sequenceNumber: i + 1,
        timestamp: new Date().toISOString(),
        action: "action_" + i,
        description: "Standard description " + i,
        actor: "ActionOS Engine",
        status: "verified",
        eventClass: "informational",
        signingKeyVersion: "v1-2026",
        isCompensating: false,
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

  it("should detect modified event classifications (eventClass alteration)", () => {
    const events: ActionLedgerEvent[] = [];
    let prev = GENESIS_LEDGER_HASH;

    for (let i = 0; i < 2; i++) {
      const partial: Partial<ActionLedgerEvent> = {
        id: `ev_${i}`,
        sessionId: "test-sess",
        sequenceNumber: i + 1,
        timestamp: new Date().toISOString(),
        action: "action_" + i,
        description: "Description " + i,
        actor: "ActionOS Engine",
        status: "verified",
        eventClass: "critical",
        signingKeyVersion: "v1-2026",
        isCompensating: false,
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

    // Attacker downgrades critical financial event to informational
    events[0].eventClass = "informational";

    const check = verifyLedgerIntegrity(events);
    assert.equal(check.valid, false, "Modified eventClass must fail verification");
    assert.equal(check.tamperedIndex, 0);
    assert.match(check.reason || "", /Invalid event hash at index 0/);
  });

  it("should detect modified signing key version", () => {
    const events: ActionLedgerEvent[] = [];
    let prev = GENESIS_LEDGER_HASH;

    for (let i = 0; i < 2; i++) {
      const partial: Partial<ActionLedgerEvent> = {
        id: `ev_${i}`,
        sessionId: "test-sess",
        sequenceNumber: i + 1,
        timestamp: new Date().toISOString(),
        action: "action_" + i,
        description: "Description " + i,
        actor: "ActionOS Engine",
        status: "verified",
        eventClass: "informational",
        signingKeyVersion: "v1-2026",
        isCompensating: false,
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

    // Attacker modifies signingKeyVersion
    events[1].signingKeyVersion = "v2-forged";

    const check = verifyLedgerIntegrity(events);
    assert.equal(check.valid, false, "Modified key version must fail verification");
    assert.equal(check.tamperedIndex, 1);
    assert.match(check.reason || "", /Invalid event hash at index 1/);
  });

  it("should detect modified isCompensating flag", () => {
    const events: ActionLedgerEvent[] = [];
    const prev = GENESIS_LEDGER_HASH;

    const partial: Partial<ActionLedgerEvent> = {
      id: "ev_0",
      sessionId: "test-sess",
      sequenceNumber: 1,
      timestamp: new Date().toISOString(),
      action: "saga_compensating_refund",
      description: "Compensated refund",
      actor: "Saga Compensator",
      status: "verified",
      eventClass: "critical",
      signingKeyVersion: "v1-2026",
      isCompensating: true,
    };
    const hash = computeEventHash(partial, prev);
    events.push({
      ...(partial as ActionLedgerEvent),
      previousHash: prev,
      hash,
      signature: signEventHash(hash),
    });

    // Attacker flips isCompensating to false
    events[0].isCompensating = false;

    const check = verifyLedgerIntegrity(events);
    assert.equal(check.valid, false, "Modified isCompensating flag must fail verification");
    assert.equal(check.tamperedIndex, 0);
  });

  it("should reject missing or malformed hashes and previous-hash links", () => {
    const evBase: Partial<ActionLedgerEvent> = {
      id: "ev_0",
      sessionId: "test-sess",
      sequenceNumber: 1,
      timestamp: new Date().toISOString(),
      action: "action_0",
      description: "Description",
      actor: "ActionOS Engine",
      status: "verified",
      eventClass: "informational",
      signingKeyVersion: "v1-2026",
      isCompensating: false,
    };

    // Case 1: Missing hash
    const checkNoHash = verifyLedgerIntegrity([
      {
        ...(evBase as ActionLedgerEvent),
        previousHash: GENESIS_LEDGER_HASH,
        hash: "",
      },
    ]);
    assert.equal(checkNoHash.valid, false);
    assert.match(checkNoHash.reason || "", /Missing or malformed event hash/);

    // Case 2: Malformed hash (too short)
    const checkMalformedHash = verifyLedgerIntegrity([
      {
        ...(evBase as ActionLedgerEvent),
        previousHash: GENESIS_LEDGER_HASH,
        hash: "abc1234",
      },
    ]);
    assert.equal(checkMalformedHash.valid, false);
    assert.match(checkMalformedHash.reason || "", /Missing or malformed event hash/);

    // Case 3: Missing previousHash
    const checkNoPrevHash = verifyLedgerIntegrity([
      {
        ...(evBase as ActionLedgerEvent),
        previousHash: "",
        hash: "a".repeat(64),
      },
    ]);
    assert.equal(checkNoPrevHash.valid, false);
    assert.match(checkNoPrevHash.reason || "", /Missing previousHash/);

    // Case 4: Broken sequence number on event 0 (e.g. sequenceNumber = 0 or missing)
    const checkBadSeq = verifyLedgerIntegrity([
      {
        ...(evBase as ActionLedgerEvent),
        sequenceNumber: undefined,
        previousHash: GENESIS_LEDGER_HASH,
        hash: "a".repeat(64),
      },
    ]);
    assert.equal(checkBadSeq.valid, false);
    assert.match(checkBadSeq.reason || "", /Broken sequence continuity/);
  });

  it("should reject invalid or forged digital signatures when verifySignatures is enabled", () => {
    const partial: Partial<ActionLedgerEvent> = {
      id: "ev_0",
      sessionId: "test-sess",
      sequenceNumber: 1,
      timestamp: new Date().toISOString(),
      action: "action_0",
      description: "Description",
      actor: "ActionOS Engine",
      status: "verified",
      eventClass: "informational",
      signingKeyVersion: "v1-2026",
      isCompensating: false,
    };
    const hash = computeEventHash(partial, GENESIS_LEDGER_HASH);
    const validSignature = signEventHash(hash);

    // Corrupted signature
    const corruptedSig = "f".repeat(128);

    const events: ActionLedgerEvent[] = [
      {
        ...(partial as ActionLedgerEvent),
        previousHash: GENESIS_LEDGER_HASH,
        hash,
        signature: corruptedSig,
      },
    ];

    const check = verifyLedgerIntegrity(events, { verifySignatures: true });
    assert.equal(check.valid, false);
    assert.match(check.reason || "", /Invalid Ed25519 signature/);

    // Fix signature and re-verify
    events[0].signature = validSignature;
    const checkValid = verifyLedgerIntegrity(events, { verifySignatures: true });
    assert.equal(checkValid.valid, true);
  });

  it("should strictly require ACTION_LEDGER_SIGNING_KEY in production mode", () => {
    const originalMode = process.env.ACTIONOS_RUNTIME_MODE;
    const originalKey = process.env.ACTION_LEDGER_SIGNING_KEY;
    try {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      delete process.env.ACTION_LEDGER_SIGNING_KEY;
      assert.throws(
        () => signEventHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
        /ACTION_LEDGER_SIGNING_KEY is required in production environment/
      );
    } finally {
      process.env.ACTIONOS_RUNTIME_MODE = originalMode;
      if (originalKey !== undefined) {
        process.env.ACTION_LEDGER_SIGNING_KEY = originalKey;
      } else {
        delete process.env.ACTION_LEDGER_SIGNING_KEY;
      }
    }
  });
});

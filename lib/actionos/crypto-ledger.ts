import crypto from "crypto";
import type { ActionLedgerEvent } from "@/types/actionos";

export const GENESIS_LEDGER_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Deterministically compute the SHA-256 hash of an Action Ledger event
 * incorporating previous event hash, timestamp, actor, action, and payload.
 */
export function computeEventHash(
  event: Partial<ActionLedgerEvent>,
  previousHash: string = GENESIS_LEDGER_HASH
): string {
  const content = JSON.stringify({
    previousHash,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    action: event.action,
    description: event.description,
    actor: event.actor,
    status: event.status,
    tool: event.tool,
    referenceId: event.referenceId,
    metadata: event.metadata || {},
  });

  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Generate a simulated Ed25519 / HMAC cryptographic signature for non-repudiation
 */
export function signEventHash(
  hash: string,
  privateKeySeed: string = "actionos-sovereign-audit-key-2026"
): string {
  return crypto
    .createHmac("sha256", privateKeySeed)
    .update(hash)
    .digest("hex")
    .substring(0, 32);
}

/**
 * Verify complete cryptographic hash chain integrity of the Action Ledger
 */
export function verifyLedgerIntegrity(events: ActionLedgerEvent[]): {
  valid: boolean;
  tamperedIndex?: number;
  reason?: string;
} {
  if (!events || events.length === 0) {
    return { valid: true };
  }

  let expectedPrevHash = GENESIS_LEDGER_HASH;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    // Verify previous hash link
    if (ev.previousHash && ev.previousHash !== expectedPrevHash) {
      return {
        valid: false,
        tamperedIndex: i,
        reason: `Broken chain link at index ${i}: expected prevHash ${expectedPrevHash.substring(0, 8)}... but got ${ev.previousHash?.substring(0, 8)}...`,
      };
    }

    // Verify current hash computation
    if (ev.hash) {
      const computed = computeEventHash(ev, expectedPrevHash);
      if (computed !== ev.hash) {
        return {
          valid: false,
          tamperedIndex: i,
          reason: `Invalid event hash at index ${i}: computed ${computed.substring(0, 8)}... but got ${ev.hash.substring(0, 8)}...`,
        };
      }
      expectedPrevHash = ev.hash;
    }
  }

  return { valid: true };
}

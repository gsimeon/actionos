import crypto from "crypto";
import type { ActionLedgerEvent } from "@/types/actionos";
import { isProductionMode } from "@/lib/runtime/mode";

export const GENESIS_LEDGER_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

// RFC 8410 PKCS#8 DER header prefix for Ed25519 private keys:
// 30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20 [32-byte-seed]
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export interface LedgerKeyInfo {
  keyId: string;
  algorithm: "Ed25519";
  publicKeyPem: string;
}

/**
 * Derives or imports genuine Ed25519 KeyObjects from PEM, environment secret, or test seed.
 * Production mode strictly enforces that ACTION_LEDGER_SIGNING_KEY is configured in the environment.
 */
function resolveEd25519KeyPair(explicitKey?: string): {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  keyId: string;
} {
  const isProduction = isProductionMode();
  const rawKey = explicitKey || process.env.ACTION_LEDGER_SIGNING_KEY;
  const keyId = process.env.ACTION_LEDGER_KEY_VERSION || "v1-2026";

  if (!rawKey) {
    if (isProduction) {
      throw new Error(
        "ACTION_LEDGER_SIGNING_KEY is required in production environment for non-repudiation and cryptographic signing."
      );
    }
    // Deterministic sandbox seed strictly for offline demo / unit testing
    const demoSeed = crypto.createHash("sha256").update("actionos-demo-sandbox-ed25519-seed").digest();
    const der = Buffer.concat([ED25519_PKCS8_PREFIX, demoSeed]);
    const privateKey = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    const publicKey = crypto.createPublicKey(privateKey);
    return { privateKey, publicKey, keyId: "demo-sandbox-v1" };
  }

  let privateKey: crypto.KeyObject;
  if (rawKey.includes("BEGIN PRIVATE KEY")) {
    privateKey = crypto.createPrivateKey(rawKey);
  } else {
    // Treat as secret string / seed and derive Ed25519 keypair via standard RFC 8410 DER
    const seed = crypto.createHash("sha256").update(rawKey).digest();
    const der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
    privateKey = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  }

  const publicKey = crypto.createPublicKey(privateKey);
  return { privateKey, publicKey, keyId };
}

/**
 * Returns public metadata about the active signing key for external verifiers and auditors.
 */
export function getLedgerKeyInfo(): LedgerKeyInfo {
  const { publicKey, keyId } = resolveEd25519KeyPair();
  return {
    keyId,
    algorithm: "Ed25519",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

/**
 * Deterministically compute the SHA-256 hash of an Action Ledger event
 * incorporating previous event hash, timestamp, actor, action, and payload.
 */
export function computeEventHash(
  event: Partial<ActionLedgerEvent>,
  previousHash: string = GENESIS_LEDGER_HASH
): string {
  // Sort metadata keys deterministically
  const sortedMetadata = Object.keys(event.metadata || {})
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = (event.metadata as Record<string, unknown>)[key];
      return acc;
    }, {});

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
    metadata: sortedMetadata,
  });

  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Generate genuine Ed25519 cryptographic digital signature for non-repudiation
 */
export function signEventHash(
  hash: string,
  privateKeySeed?: string
): string {
  const { privateKey } = resolveEd25519KeyPair(privateKeySeed);
  const signature = crypto.sign(null, Buffer.from(hash, "utf-8"), privateKey);
  return signature.toString("hex");
}

/**
 * Verify genuine Ed25519 cryptographic signature of an event hash
 */
export function verifyEventSignature(
  hash: string,
  signature: string,
  publicKeyOrSeed?: string
): boolean {
  try {
    const { publicKey } = resolveEd25519KeyPair(publicKeyOrSeed);
    const sigBuffer = Buffer.from(signature, "hex");
    return crypto.verify(null, Buffer.from(hash, "utf-8"), publicKey, sigBuffer);
  } catch {
    return false;
  }
}

/**
 * Verify complete cryptographic hash chain integrity of the Action Ledger
 */
export function verifyLedgerIntegrity(
  events: ActionLedgerEvent[],
  options?: { verifySignatures?: boolean }
): {
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

      // Optionally verify digital signature
      if (options?.verifySignatures && ev.signature) {
        const sigValid = verifyEventSignature(ev.hash, ev.signature);
        if (!sigValid) {
          return {
            valid: false,
            tamperedIndex: i,
            reason: `Invalid Ed25519 signature at index ${i}: signature does not match event hash`,
          };
        }
      }

      expectedPrevHash = ev.hash;
    }
  }

  return { valid: true };
}

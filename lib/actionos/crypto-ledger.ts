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
 * incorporating sequenceNumber, previous event hash, timestamp, actor, action,
 * eventClass, signingKeyVersion, isCompensating, and payload metadata.
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

  const canonicalPayload = {
    action: String(event.action || ""),
    actor: String(event.actor || ""),
    description: String(event.description || ""),
    eventClass: event.eventClass || null,
    isCompensating: Boolean(event.isCompensating),
    metadata: sortedMetadata,
    previousHash: String(previousHash || GENESIS_LEDGER_HASH),
    referenceId: event.referenceId || null,
    sequenceNumber: typeof event.sequenceNumber === "number" ? event.sequenceNumber : null,
    sessionId: String(event.sessionId || ""),
    signingKeyVersion: event.signingKeyVersion || null,
    status: String(event.status || ""),
    timestamp: String(event.timestamp || ""),
    tool: event.tool || null,
  };

  const content = JSON.stringify(canonicalPayload);
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

export interface VerifyLedgerIntegrityOptions {
  verifySignatures?: boolean;
  requireKeyVersion?: string;
}

/**
 * Verify complete cryptographic hash chain integrity of the Action Ledger.
 * Strictly verifies:
 * 1. 1-indexed sequence continuity (rejects skipped, missing, or negative sequence numbers)
 * 2. Unbroken previousHash linking (rejects missing or mismatched previousHash links)
 * 3. Valid 64-hex SHA-256 event hash (rejects missing or malformed hashes)
 * 4. Exact recomputed event hash match over canonical payload
 * 5. Signing key version alignment (if requested via requireKeyVersion)
 * 6. Authentic Ed25519 digital signatures (if requested via verifySignatures)
 */
export function verifyLedgerIntegrity(
  events: ActionLedgerEvent[],
  options?: VerifyLedgerIntegrityOptions
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

    // 1. Strictly require sequence number continuity (1-indexed)
    const expectedSeq = i + 1;
    if (typeof ev.sequenceNumber !== "number" || ev.sequenceNumber !== expectedSeq) {
      return {
        valid: false,
        tamperedIndex: i,
        reason: `Broken sequence continuity at index ${i}: expected sequence number ${expectedSeq} but got ${ev.sequenceNumber}`,
      };
    }

    // 2. Strictly require previousHash link
    if (!ev.previousHash || typeof ev.previousHash !== "string") {
      return {
        valid: false,
        tamperedIndex: i,
        reason: `Missing previousHash at index ${i}`,
      };
    }
    if (ev.previousHash !== expectedPrevHash) {
      return {
        valid: false,
        tamperedIndex: i,
        reason: `Broken chain link at index ${i}: expected prevHash ${expectedPrevHash.substring(0, 8)}... but got ${ev.previousHash.substring(0, 8)}...`,
      };
    }

    // 3. Strictly require valid 64-hex SHA-256 event hash
    if (!ev.hash || typeof ev.hash !== "string" || !/^[0-9a-fA-F]{64}$/.test(ev.hash)) {
      return {
        valid: false,
        tamperedIndex: i,
        reason: `Missing or malformed event hash at index ${i}`,
      };
    }

    // 4. Recompute event hash over canonical payload and verify exact match
    const computed = computeEventHash(ev, expectedPrevHash);
    if (computed !== ev.hash) {
      return {
        valid: false,
        tamperedIndex: i,
        reason: `Invalid event hash at index ${i}: computed ${computed.substring(0, 8)}... but got ${ev.hash.substring(0, 8)}...`,
      };
    }

    // 5. Require and verify key version if specified
    if (options?.requireKeyVersion && ev.signingKeyVersion !== options.requireKeyVersion) {
      return {
        valid: false,
        tamperedIndex: i,
        reason: `Invalid signing key version at index ${i}: expected ${options.requireKeyVersion} but got ${ev.signingKeyVersion}`,
      };
    }

    // 6. Verify digital signature if requested
    if (options?.verifySignatures) {
      if (!ev.signature || typeof ev.signature !== "string" || !/^[0-9a-fA-F]{128}$/.test(ev.signature)) {
        return {
          valid: false,
          tamperedIndex: i,
          reason: `Missing or malformed Ed25519 signature at index ${i}`,
        };
      }
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

  return { valid: true };
}

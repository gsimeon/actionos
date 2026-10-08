import crypto from "crypto";
import { isProductionMode } from "@/lib/runtime/mode";

export const QUOTE_SIGNATURE_VERSION = "v1";

/**
 * Resolves the server-managed quote signing secret.
 * In production mode, strictly requires ACTIONOS_QUOTE_SIGNING_KEY; fails closed immediately if missing.
 * Never silently reuses unrelated authentication secrets (such as NEXTAUTH_SECRET) in production.
 */
export function getQuoteSigningSecret(): string {
  const isProduction = isProductionMode();
  const dedicatedKey = process.env.ACTIONOS_QUOTE_SIGNING_KEY;

  if (isProduction) {
    if (!dedicatedKey || dedicatedKey.trim().length === 0) {
      throw new Error(
        "ACTIONOS_QUOTE_SIGNING_KEY is strictly required in production environment for HMAC quote signature verification."
      );
    }
    return dedicatedKey;
  }

  // Isolated sandbox signing key strictly for offline demo and unit testing
  return dedicatedKey || "actionos_sandbox_quote_signing_key_demo";
}

export interface QuoteSignaturePayload {
  sessionId: string;
  organizationId: string;
  customerId: string;
  policyId: string;
  providerName: string;
  amount: number;
  currency: string;
  expiresAt: string;
}

/**
 * Computes a keyed HMAC-SHA256 non-repudiation signature for an immutable quote.
 * Protects against database-level tampering by requiring the server's private signing key.
 */
export function computeQuoteSignature(payload: QuoteSignaturePayload): {
  quoteHash: string;
  signatureVersion: string;
} {
  const canonicalString = `${QUOTE_SIGNATURE_VERSION}:${payload.sessionId}:${payload.organizationId}:${payload.customerId}:${payload.policyId}:${payload.providerName}:${payload.amount}:${payload.currency}:${payload.expiresAt}`;
  const hmac = crypto.createHmac("sha256", getQuoteSigningSecret());
  const quoteHash = hmac.update(canonicalString).digest("hex");
  return {
    quoteHash,
    signatureVersion: QUOTE_SIGNATURE_VERSION,
  };
}

/**
 * Cryptographically verifies a persisted quote's signature using timing-safe comparison.
 * In production mode, demo hashes and legacy unkeyed hashes are strictly rejected.
 */
export function verifyQuoteSignature(quote: {
  session_id: string;
  organization_id: string;
  customer_id: string;
  policy_id: string;
  provider_name: string;
  amount: number;
  currency: string;
  expires_at: string;
  quote_hash: string;
}): boolean {
  if (!quote.quote_hash) return false;

  const isProduction = isProductionMode();

  // In production, strictly disallow any demo bypasses or fallback hashes
  if (quote.quote_hash === "demo_hash") {
    if (isProduction) {
      return false;
    }
    return true;
  }

  let expectedQuoteHash: string;
  try {
    const { quoteHash } = computeQuoteSignature({
      sessionId: quote.session_id,
      organizationId: quote.organization_id,
      customerId: quote.customer_id,
      policyId: quote.policy_id,
      providerName: quote.provider_name,
      amount: quote.amount,
      currency: quote.currency,
      expiresAt: quote.expires_at,
    });
    expectedQuoteHash = quoteHash;
  } catch {
    // If key is missing or invalid in production, fail closed immediately
    return false;
  }

  try {
    const actual = Buffer.from(quote.quote_hash, "hex");
    const expected = Buffer.from(expectedQuoteHash, "hex");

    if (actual.length !== expected.length) {
      return false;
    }

    if (crypto.timingSafeEqual(actual, expected)) {
      return true;
    }

    // In demo/test mode only: check legacy unkeyed SHA-256 for backward compatibility with mock fixtures
    if (!isProduction) {
      const legacyPayload = `${quote.session_id}:${quote.organization_id}:${quote.customer_id}:${quote.policy_id}:${quote.provider_name}:${quote.amount}:${quote.currency}:${quote.expires_at}`;
      const legacyHash = crypto.createHash("sha256").update(legacyPayload).digest("hex");
      const legacyBuffer = Buffer.from(legacyHash, "hex");
      if (actual.length === legacyBuffer.length && crypto.timingSafeEqual(actual, legacyBuffer)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

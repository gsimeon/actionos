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
  providerReference?: string | null;
  underwriterId?: string | null;
}

/**
 * Deterministically serializes an immutable quote payload into an unambiguous canonical JSON string.
 * Normalizes:
 * - amount: strictly finite positive number
 * - currency: trimmed uppercase ISO code (e.g., 'NGN', 'USD')
 * - expiresAt: strict ISO 8601 string representation via Date.toISOString()
 * - optional string fields (providerReference, underwriterId): trimmed string or null
 * - all keys sorted lexicographically
 * 
 * Prevents delimiter collision attacks that arise with colon-delimited or character-concatenated formats.
 */
export function serializeCanonicalQuotePayload(payload: QuoteSignaturePayload): string {
  const amountNum = Number(payload.amount);
  if (!Number.isFinite(amountNum) || amountNum < 0) {
    throw new Error(`Invalid quote amount for canonical serialization: ${payload.amount}`);
  }

  const currencyNorm = (payload.currency || "NGN").trim().toUpperCase();

  const expiryDate = new Date(payload.expiresAt);
  if (isNaN(expiryDate.getTime())) {
    throw new Error(`Invalid expiresAt timestamp for canonical serialization: ${payload.expiresAt}`);
  }
  const expiresAtNorm = expiryDate.toISOString();

  const providerRefNorm =
    payload.providerReference !== undefined &&
    payload.providerReference !== null &&
    String(payload.providerReference).trim().length > 0
      ? String(payload.providerReference).trim()
      : null;

  const underwriterIdNorm =
    payload.underwriterId !== undefined &&
    payload.underwriterId !== null &&
    String(payload.underwriterId).trim().length > 0
      ? String(payload.underwriterId).trim()
      : null;

  // Strict lexicographically sorted object for deterministic canonical JSON representation
  const canonicalObject = {
    amount: amountNum,
    currency: currencyNorm,
    customerId: String(payload.customerId || "").trim(),
    expiresAt: expiresAtNorm,
    organizationId: String(payload.organizationId || "").trim(),
    policyId: String(payload.policyId || "").trim(),
    providerName: String(payload.providerName || "").trim(),
    providerReference: providerRefNorm,
    sessionId: String(payload.sessionId || "").trim(),
    underwriterId: underwriterIdNorm,
    version: QUOTE_SIGNATURE_VERSION,
  };

  return JSON.stringify(canonicalObject);
}

/**
 * Computes a keyed quote-integrity signature using HMAC-SHA256 for an immutable quote.
 * Uses deterministic canonical JSON serialization to eliminate delimiter collisions.
 * Protects against database-level tampering by requiring the server's private signing key.
 * Binds provider_reference and underwriterId into canonical payload to protect settlement provider identity.
 */
export function computeQuoteSignature(payload: QuoteSignaturePayload): {
  quoteHash: string;
  signatureVersion: string;
} {
  const canonicalString = serializeCanonicalQuotePayload(payload);
  const hmac = crypto.createHmac("sha256", getQuoteSigningSecret());
  const quoteHash = hmac.update(canonicalString).digest("hex");
  return {
    quoteHash,
    signatureVersion: QUOTE_SIGNATURE_VERSION,
  };
}

/**
 * Trusted server-side migration helper to upgrade legacy or transitional quotes
 * to the canonical v1 signature format.
 * Legacy quotes must be explicitly re-signed through this trusted server-side process,
 * and are never dynamically tolerated inside runtime authorization verification.
 */
export function reSignLegacyQuote(quote: {
  session_id: string;
  organization_id: string;
  customer_id: string;
  policy_id: string;
  provider_name: string;
  amount: number;
  currency: string;
  expires_at: string;
  provider_reference?: string | null;
  underwriter_id?: string | null;
}): { quote_hash: string; signature_version: string } {
  const sig = computeQuoteSignature({
    sessionId: quote.session_id,
    organizationId: quote.organization_id,
    customerId: quote.customer_id,
    policyId: quote.policy_id,
    providerName: quote.provider_name,
    amount: quote.amount,
    currency: quote.currency,
    expiresAt: quote.expires_at,
    providerReference: quote.provider_reference,
    underwriterId: quote.underwriter_id,
  });
  return {
    quote_hash: sig.quoteHash,
    signature_version: sig.signatureVersion,
  };
}

/**
 * Cryptographically verifies a persisted quote's signature using timing-safe comparison.
 * Strictly accepts ONLY the canonical v1 signature that binds all immutable quote fields,
 * including providerReference and underwriterId.
 *
 * All legacy formats (v0, transitional v1, unversioned HMAC, unkeyed SHA-256) are strictly rejected.
 * If legacy quotes exist in storage, they must be migrated through reSignLegacyQuote().
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
  provider_reference?: string | null;
  underwriter_id?: string | null;
}): boolean {
  if (!quote.quote_hash || typeof quote.quote_hash !== "string") {
    return false;
  }

  // In non-production demo mode only: accept offline fixture token "demo_hash"
  if (quote.quote_hash === "demo_hash") {
    return !isProductionMode();
  }

  // Reject malformed signature hashes (must be exactly 64 hex characters for SHA-256)
  if (quote.quote_hash.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(quote.quote_hash)) {
    return false;
  }

  try {
    const canonical = computeQuoteSignature({
      sessionId: quote.session_id,
      organizationId: quote.organization_id,
      customerId: quote.customer_id,
      policyId: quote.policy_id,
      providerName: quote.provider_name,
      amount: quote.amount,
      currency: quote.currency,
      expiresAt: quote.expires_at,
      providerReference: quote.provider_reference,
      underwriterId: quote.underwriter_id,
    }).quoteHash;

    const actual = Buffer.from(quote.quote_hash, "hex");
    const expected = Buffer.from(canonical, "hex");

    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    // Fails closed if signing key is missing or cryptographic computation fails
    return false;
  }
}

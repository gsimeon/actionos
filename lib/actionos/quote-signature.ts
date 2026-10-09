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
 * Computes a keyed quote-integrity signature using HMAC-SHA256 for an immutable quote.
 * Protects against database-level tampering by requiring the server's private signing key.
 * Binds provider_reference and underwriterId into canonical payload to protect settlement provider identity.
 */
export function computeQuoteSignature(payload: QuoteSignaturePayload): {
  quoteHash: string;
  signatureVersion: string;
} {
  const providerRef = payload.providerReference || "";
  const underwriterId = payload.underwriterId || "";
  const canonicalString = `${QUOTE_SIGNATURE_VERSION}:${payload.sessionId}:${payload.organizationId}:${payload.customerId}:${payload.policyId}:${payload.providerName}:${payload.amount}:${payload.currency}:${payload.expiresAt}:${providerRef}:${underwriterId}`;
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
 * Provides a versioned migration plan to safely support existing v0 and transitional quotes.
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
  if (!quote.quote_hash) return false;

  const isProduction = isProductionMode();

  // In production, strictly disallow any demo bypasses or fallback hashes
  if (quote.quote_hash === "demo_hash") {
    if (isProduction) {
      return false;
    }
    return true;
  }

  const candidates: string[] = [];
  try {
    const secret = getQuoteSigningSecret();

    // 1. Primary v1 canonical signature with fixed positional fields (covers all immutable fields including provider_reference and underwriter_id)
    const v1Canonical = computeQuoteSignature({
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
    candidates.push(v1Canonical);

    // 2. Transitional v1 format (with optional suffix delimiters from early v1 rollout)
    const providerRefPart = quote.provider_reference ? `:${quote.provider_reference}` : "";
    const underwriterPart = quote.underwriter_id ? `:${quote.underwriter_id}` : "";
    const transitionalV1 = crypto
      .createHmac("sha256", secret)
      .update(
        `v1:${quote.session_id}:${quote.organization_id}:${quote.customer_id}:${quote.policy_id}:${quote.provider_name}:${quote.amount}:${quote.currency}:${quote.expires_at}${providerRefPart}${underwriterPart}`
      )
      .digest("hex");
    candidates.push(transitionalV1);

    // 3. Legacy v0 format migration (for existing quotes signed prior to provider_reference and underwriter_id binding)
    const v0Hmac = crypto
      .createHmac("sha256", secret)
      .update(
        `v0:${quote.session_id}:${quote.organization_id}:${quote.customer_id}:${quote.policy_id}:${quote.provider_name}:${quote.amount}:${quote.currency}:${quote.expires_at}`
      )
      .digest("hex");
    candidates.push(v0Hmac);

    const legacyUnversionedHmac = crypto
      .createHmac("sha256", secret)
      .update(
        `${quote.session_id}:${quote.organization_id}:${quote.customer_id}:${quote.policy_id}:${quote.provider_name}:${quote.amount}:${quote.currency}:${quote.expires_at}`
      )
      .digest("hex");
    candidates.push(legacyUnversionedHmac);
  } catch {
    // If key is missing or invalid in production, fail closed immediately
    return false;
  }

  try {
    const actual = Buffer.from(quote.quote_hash, "hex");
    for (const expectedHash of candidates) {
      const expected = Buffer.from(expectedHash, "hex");
      if (actual.length === expected.length && crypto.timingSafeEqual(actual, expected)) {
        return true;
      }
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

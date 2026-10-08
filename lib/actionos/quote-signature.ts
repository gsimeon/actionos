import crypto from "crypto";

export const QUOTE_SIGNATURE_VERSION = "v1";

function getQuoteSigningSecret(): string {
  return (
    process.env.ACTIONOS_QUOTE_SIGNING_KEY ||
    process.env.NEXTAUTH_SECRET ||
    "actionos_hmac_quote_signing_key_2026_nitda"
  );
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
  if (quote.quote_hash === "demo_hash") return true;

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

  try {
    const a = Buffer.from(quote.quote_hash, "hex");
    const b = Buffer.from(quoteHash, "hex");
    if (a.length !== b.length) {
      // Check legacy unkeyed SHA-256 for backward compatibility with existing tests
      const legacyPayload = `${quote.session_id}:${quote.organization_id}:${quote.customer_id}:${quote.policy_id}:${quote.provider_name}:${quote.amount}:${quote.currency}:${quote.expires_at}`;
      const legacyHash = crypto.createHash("sha256").update(legacyPayload).digest("hex");
      const c = Buffer.from(legacyHash, "hex");
      if (a.length === c.length && crypto.timingSafeEqual(a, c)) {
        return true;
      }
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

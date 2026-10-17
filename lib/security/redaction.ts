/**
 * ActionOS Data Privacy & Sanitization Subsystem
 * 
 * Strict Invariant:
 * PII, payment card numbers, vehicle registration plates, policy numbers, phone numbers,
 * and national identity tokens (NIN/BVN) must NEVER be retained in audit trails,
 * diagnostic telemetry, or AI evidence logs in raw plaintext form.
 */

/**
 * Redacts sensitive customer details (cards, phone numbers, BVN, NIN, emails, policies, vehicle plates)
 * from logged audit events, evidence records, and telemetry payloads.
 */
export function redactSensitiveInput(text?: string): string {
  if (!text) return "";
  return text
    // 1. Email addresses
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
    // 2. Nigerian phone numbers (+234 or local 0 prefix)
    .replace(/(?:\+234|\b0)[789][01]\d{8}\b/g, "[REDACTED_PHONE]")
    // 3. Payment card numbers (13-19 digits, with optional spaces or dashes)
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_CARD]")
    // 4. 11-digit national identity numbers (NIN / BVN)
    .replace(/\b\d{11}\b/g, "[REDACTED_IDENTIFIER]")
    // 5. Policy identifiers (must contain at least one digit to avoid matching words like 'Renewing' or 'inspected')
    .replace(/\b(?:POL|AUTO|MOT|INS|REN)[-_]?[A-Z0-9]*\d[A-Z0-9-]*\b/gi, "[REDACTED_POLICY]")
    // 6. Nigerian vehicle registration plates (e.g. ABC-123-XY, KJA 882 AB)
    .replace(/\b[A-Z]{2,3}[-\s]?\d{3}[-\s]?[A-Z]{2}\b/gi, "[REDACTED_PLATE]");
}

/**
 * Recursively redacts sensitive values (cards, phones, identifiers, emails, policies, plates)
 * from arbitrary metadata objects before audit trail persistence or telemetry export.
 */
export function redactSensitiveObject<T>(obj: T): T {
  if (typeof obj === "string") {
    return redactSensitiveInput(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveObject) as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = redactSensitiveObject(v);
    }
    return res as unknown as T;
  }
  return obj;
}

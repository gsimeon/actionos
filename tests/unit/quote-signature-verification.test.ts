import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  computeQuoteSignature,
  verifyQuoteSignature,
  getQuoteSigningSecret,
  serializeCanonicalQuotePayload,
} from "@/lib/actionos/quote-signature";
import { orchestrator } from "@/lib/actionos/orchestrator";
import { resetStore } from "@/lib/actionos/mock-store";
import { DEMO_CONTEXT } from "@/lib/security/auth-context";
import { getRepositoryContainer } from "@/lib/repositories";

describe("Quote Signature Production Hardening & Regression Suite", () => {
  const originalEnv = { ...process.env };
  const prodSecretKey = "prod-test-quote-signing-key-777888999";

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Production Mode: Canonical v1 Verification & Immutable Field Binding", () => {
    const validQuote = {
      sessionId: "ses_prod_001",
      organizationId: "org_prod_001",
      customerId: "cust_prod_001",
      policyId: "pol_prod_001",
      providerName: "Leadway Assurance",
      amount: 85000,
      currency: "NGN",
      expiresAt: "2026-12-31T23:59:59.000Z",
      providerReference: "leadway_pol_ref_999",
      underwriterId: "leadway_underwriting_tier1",
    };

    it("should accept valid canonical v1 signature with bound providerReference and underwriterId in production", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.ACTIONOS_QUOTE_SIGNING_KEY = prodSecretKey;

      const { quoteHash, signatureVersion } = computeQuoteSignature(validQuote);
      assert.equal(signatureVersion, "v1");

      const isValid = verifyQuoteSignature({
        session_id: validQuote.sessionId,
        organization_id: validQuote.organizationId,
        customer_id: validQuote.customerId,
        policy_id: validQuote.policyId,
        provider_name: validQuote.providerName,
        amount: validQuote.amount,
        currency: validQuote.currency,
        expires_at: validQuote.expiresAt,
        provider_reference: validQuote.providerReference,
        underwriter_id: validQuote.underwriterId,
        quote_hash: quoteHash,
      });

      assert.equal(isValid, true, "Valid canonical v1 quote must be verified successfully in production");
    });

    it("should reject verification in production if providerReference is tampered with", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.ACTIONOS_QUOTE_SIGNING_KEY = prodSecretKey;

      const { quoteHash } = computeQuoteSignature(validQuote);

      const isValid = verifyQuoteSignature({
        session_id: validQuote.sessionId,
        organization_id: validQuote.organizationId,
        customer_id: validQuote.customerId,
        policy_id: validQuote.policyId,
        provider_name: validQuote.providerName,
        amount: validQuote.amount,
        currency: validQuote.currency,
        expires_at: validQuote.expiresAt,
        provider_reference: "tampered_provider_reference_injected",
        underwriter_id: validQuote.underwriterId,
        quote_hash: quoteHash,
      });

      assert.equal(isValid, false, "Tampering with providerReference must invalidate signature");
    });

    it("should reject verification in production if underwriterId is tampered with", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.ACTIONOS_QUOTE_SIGNING_KEY = prodSecretKey;

      const { quoteHash } = computeQuoteSignature(validQuote);

      const isValid = verifyQuoteSignature({
        session_id: validQuote.sessionId,
        organization_id: validQuote.organizationId,
        customer_id: validQuote.customerId,
        policy_id: validQuote.policyId,
        provider_name: validQuote.providerName,
        amount: validQuote.amount,
        currency: validQuote.currency,
        expires_at: validQuote.expiresAt,
        provider_reference: validQuote.providerReference,
        underwriter_id: "fake_underwriter_tier_x",
        quote_hash: quoteHash,
      });

      assert.equal(isValid, false, "Tampering with underwriterId must invalidate signature");
    });

    it("should reject verification in production if amount is modified", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.ACTIONOS_QUOTE_SIGNING_KEY = prodSecretKey;

      const { quoteHash } = computeQuoteSignature(validQuote);

      const isValid = verifyQuoteSignature({
        session_id: validQuote.sessionId,
        organization_id: validQuote.organizationId,
        customer_id: validQuote.customerId,
        policy_id: validQuote.policyId,
        provider_name: validQuote.providerName,
        amount: 84999, // Tampered amount
        currency: validQuote.currency,
        expires_at: validQuote.expiresAt,
        provider_reference: validQuote.providerReference,
        underwriter_id: validQuote.underwriterId,
        quote_hash: quoteHash,
      });

      assert.equal(isValid, false, "Altered amount must invalidate signature");
    });

    it("should reject verification in production if currency is modified", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.ACTIONOS_QUOTE_SIGNING_KEY = prodSecretKey;

      const { quoteHash } = computeQuoteSignature(validQuote);

      const isValid = verifyQuoteSignature({
        session_id: validQuote.sessionId,
        organization_id: validQuote.organizationId,
        customer_id: validQuote.customerId,
        policy_id: validQuote.policyId,
        provider_name: validQuote.providerName,
        amount: validQuote.amount,
        currency: "USD", // Tampered currency
        expires_at: validQuote.expiresAt,
        provider_reference: validQuote.providerReference,
        underwriter_id: validQuote.underwriterId,
        quote_hash: quoteHash,
      });

      assert.equal(isValid, false, "Altered currency must invalidate signature");
    });

    it("should fail closed in production if ACTIONOS_QUOTE_SIGNING_KEY is missing", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      delete process.env.ACTIONOS_QUOTE_SIGNING_KEY;

      assert.throws(
        () => getQuoteSigningSecret(),
        /ACTIONOS_QUOTE_SIGNING_KEY is strictly required in production environment/
      );

      const isValid = verifyQuoteSignature({
        session_id: validQuote.sessionId,
        organization_id: validQuote.organizationId,
        customer_id: validQuote.customerId,
        policy_id: validQuote.policyId,
        provider_name: validQuote.providerName,
        amount: validQuote.amount,
        currency: validQuote.currency,
        expires_at: validQuote.expiresAt,
        provider_reference: validQuote.providerReference,
        underwriter_id: validQuote.underwriterId,
        quote_hash: "a".repeat(64),
      });

      assert.equal(isValid, false, "Verification must fail closed if signing secret is missing");
    });
  });

  describe("Production Mode: Strict Rejection of Legacy Signatures", () => {
    const baseQuote = {
      sessionId: "ses_legacy_001",
      organizationId: "org_legacy_001",
      customerId: "cust_legacy_001",
      policyId: "pol_legacy_001",
      providerName: "Leadway Assurance",
      amount: 85000,
      currency: "NGN",
      expiresAt: "2026-12-31T23:59:59.000Z",
      providerReference: "leadway_ref_001",
      underwriterId: "leadway_general",
    };

    it("should strictly reject transitional v1 signature (omitting underwriterId) in production mode", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.ACTIONOS_QUOTE_SIGNING_KEY = prodSecretKey;

      // In early transitional v1, underwriterId was not bound into the canonical positional string
      const transitionalQuote = {
        ...baseQuote,
        underwriterId: undefined,
      };
      const transitionalPayload = `v1:${transitionalQuote.sessionId}:${transitionalQuote.organizationId}:${transitionalQuote.customerId}:${transitionalQuote.policyId}:${transitionalQuote.providerName}:${transitionalQuote.amount}:${transitionalQuote.currency}:${transitionalQuote.expiresAt}:${transitionalQuote.providerReference}`;
      const transitionalHash = crypto.createHmac("sha256", prodSecretKey).update(transitionalPayload).digest("hex");

      const isValid = verifyQuoteSignature({
        session_id: transitionalQuote.sessionId,
        organization_id: transitionalQuote.organizationId,
        customer_id: transitionalQuote.customerId,
        policy_id: transitionalQuote.policyId,
        provider_name: transitionalQuote.providerName,
        amount: transitionalQuote.amount,
        currency: transitionalQuote.currency,
        expires_at: transitionalQuote.expiresAt,
        provider_reference: transitionalQuote.providerReference,
        underwriter_id: undefined,
        quote_hash: transitionalHash,
      });

      assert.equal(isValid, false, "Transitional v1 format without underwriterId must be rejected in production mode");
    });

    it("should strictly reject legacy v0 HMAC signature in production mode", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.ACTIONOS_QUOTE_SIGNING_KEY = prodSecretKey;

      const v0Payload = `v0:${baseQuote.sessionId}:${baseQuote.organizationId}:${baseQuote.customerId}:${baseQuote.policyId}:${baseQuote.providerName}:${baseQuote.amount}:${baseQuote.currency}:${baseQuote.expiresAt}`;
      const v0Hash = crypto.createHmac("sha256", prodSecretKey).update(v0Payload).digest("hex");

      const isValid = verifyQuoteSignature({
        session_id: baseQuote.sessionId,
        organization_id: baseQuote.organizationId,
        customer_id: baseQuote.customerId,
        policy_id: baseQuote.policyId,
        provider_name: baseQuote.providerName,
        amount: baseQuote.amount,
        currency: baseQuote.currency,
        expires_at: baseQuote.expiresAt,
        provider_reference: baseQuote.providerReference,
        underwriter_id: baseQuote.underwriterId,
        quote_hash: v0Hash,
      });

      assert.equal(isValid, false, "Legacy v0 signature must be rejected in production mode");
    });

    it("should strictly reject legacy unversioned HMAC signature in production mode", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.ACTIONOS_QUOTE_SIGNING_KEY = prodSecretKey;

      const unversionedPayload = `${baseQuote.sessionId}:${baseQuote.organizationId}:${baseQuote.customerId}:${baseQuote.policyId}:${baseQuote.providerName}:${baseQuote.amount}:${baseQuote.currency}:${baseQuote.expiresAt}`;
      const unversionedHash = crypto.createHmac("sha256", prodSecretKey).update(unversionedPayload).digest("hex");

      const isValid = verifyQuoteSignature({
        session_id: baseQuote.sessionId,
        organization_id: baseQuote.organizationId,
        customer_id: baseQuote.customerId,
        policy_id: baseQuote.policyId,
        provider_name: baseQuote.providerName,
        amount: baseQuote.amount,
        currency: baseQuote.currency,
        expires_at: baseQuote.expiresAt,
        quote_hash: unversionedHash,
      });

      assert.equal(isValid, false, "Unversioned HMAC signature must be rejected in production mode");
    });

    it("should strictly reject legacy unkeyed SHA-256 hash in production mode", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.ACTIONOS_QUOTE_SIGNING_KEY = prodSecretKey;

      const unkeyedPayload = `${baseQuote.sessionId}:${baseQuote.organizationId}:${baseQuote.customerId}:${baseQuote.policyId}:${baseQuote.providerName}:${baseQuote.amount}:${baseQuote.currency}:${baseQuote.expiresAt}`;
      const unkeyedHash = crypto.createHash("sha256").update(unkeyedPayload).digest("hex");

      const isValid = verifyQuoteSignature({
        session_id: baseQuote.sessionId,
        organization_id: baseQuote.organizationId,
        customer_id: baseQuote.customerId,
        policy_id: baseQuote.policyId,
        provider_name: baseQuote.providerName,
        amount: baseQuote.amount,
        currency: baseQuote.currency,
        expires_at: baseQuote.expiresAt,
        quote_hash: unkeyedHash,
      });

      assert.equal(isValid, false, "Unkeyed SHA-256 hash must be rejected in production mode");
    });

    it("should strictly reject demo_hash in production mode", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "production";
      process.env.ACTIONOS_QUOTE_SIGNING_KEY = prodSecretKey;

      const isValid = verifyQuoteSignature({
        session_id: baseQuote.sessionId,
        organization_id: baseQuote.organizationId,
        customer_id: baseQuote.customerId,
        policy_id: baseQuote.policyId,
        provider_name: baseQuote.providerName,
        amount: baseQuote.amount,
        currency: baseQuote.currency,
        expires_at: baseQuote.expiresAt,
        quote_hash: "demo_hash",
      });

      assert.equal(isValid, false, "demo_hash bypass must be strictly rejected in production mode");
    });
  });

  describe("Demo/Test Mode: Backward Compatibility Preservation", () => {
    const demoQuote = {
      sessionId: "ses_demo_001",
      organizationId: "org_demo_001",
      customerId: "cust_demo_001",
      policyId: "pol_demo_001",
      providerName: "Leadway Assurance",
      amount: 85000,
      currency: "NGN",
      expiresAt: "2026-12-31T23:59:59.000Z",
      providerReference: "demo_ref_001",
      underwriterId: "demo_underwriter_001",
    };

    it("should accept demo_hash in demo mode", () => {
      process.env.ACTIONOS_RUNTIME_MODE = "demo";

      const isValid = verifyQuoteSignature({
        session_id: demoQuote.sessionId,
        organization_id: demoQuote.organizationId,
        customer_id: demoQuote.customerId,
        policy_id: demoQuote.policyId,
        provider_name: demoQuote.providerName,
        amount: demoQuote.amount,
        currency: demoQuote.currency,
        expires_at: demoQuote.expiresAt,
        quote_hash: "demo_hash",
      });

      assert.equal(isValid, true, "demo_hash must be accepted in demo mode");
    });

    it("should reject transitional v1 signature and require reSignLegacyQuote migration", async () => {
      process.env.ACTIONOS_RUNTIME_MODE = "demo";
      const secret = "actionos_sandbox_quote_signing_key_demo";

      const transitionalQuote = {
        ...demoQuote,
        underwriterId: undefined,
      };
      const transitionalPayload = `v1:${transitionalQuote.sessionId}:${transitionalQuote.organizationId}:${transitionalQuote.customerId}:${transitionalQuote.policyId}:${transitionalQuote.providerName}:${transitionalQuote.amount}:${transitionalQuote.currency}:${transitionalQuote.expiresAt}:${transitionalQuote.providerReference}`;
      const transitionalHash = crypto.createHmac("sha256", secret).update(transitionalPayload).digest("hex");

      const quoteInput = {
        session_id: transitionalQuote.sessionId,
        organization_id: transitionalQuote.organizationId,
        customer_id: transitionalQuote.customerId,
        policy_id: transitionalQuote.policyId,
        provider_name: transitionalQuote.providerName,
        amount: transitionalQuote.amount,
        currency: transitionalQuote.currency,
        expires_at: transitionalQuote.expiresAt,
        provider_reference: transitionalQuote.providerReference,
        underwriter_id: undefined,
      };

      // 1. Direct verification must reject legacy transitional format
      const isValid = verifyQuoteSignature({
        ...quoteInput,
        quote_hash: transitionalHash,
      });
      assert.equal(isValid, false, "Transitional v1 signature must be rejected by verifyQuoteSignature");

      // 2. Trusted server-side migration generates canonical v1 signature
      const { reSignLegacyQuote } = await import("@/lib/actionos/quote-signature");
      const migrated = reSignLegacyQuote(quoteInput);
      const isMigratedValid = verifyQuoteSignature({
        ...quoteInput,
        quote_hash: migrated.quote_hash,
      });
      assert.equal(isMigratedValid, true, "Migrated quote must verify cleanly with canonical signature");
    });

    it("should reject legacy v0 signature and require reSignLegacyQuote migration", async () => {
      process.env.ACTIONOS_RUNTIME_MODE = "demo";
      const secret = "actionos_sandbox_quote_signing_key_demo";

      const quoteInput = {
        session_id: demoQuote.sessionId,
        organization_id: demoQuote.organizationId,
        customer_id: demoQuote.customerId,
        policy_id: demoQuote.policyId,
        provider_name: demoQuote.providerName,
        amount: demoQuote.amount,
        currency: demoQuote.currency,
        expires_at: demoQuote.expiresAt,
        provider_reference: demoQuote.providerReference,
        underwriter_id: demoQuote.underwriterId,
      };

      const v0Payload = `v0:${demoQuote.sessionId}:${demoQuote.organizationId}:${demoQuote.customerId}:${demoQuote.policyId}:${demoQuote.providerName}:${demoQuote.amount}:${demoQuote.currency}:${demoQuote.expiresAt}`;
      const v0Hash = crypto.createHmac("sha256", secret).update(v0Payload).digest("hex");

      const isValid = verifyQuoteSignature({
        ...quoteInput,
        quote_hash: v0Hash,
      });
      assert.equal(isValid, false, "v0 signature must be rejected by verifyQuoteSignature");

      const { reSignLegacyQuote } = await import("@/lib/actionos/quote-signature");
      const migrated = reSignLegacyQuote(quoteInput);
      const isMigratedValid = verifyQuoteSignature({
        ...quoteInput,
        quote_hash: migrated.quote_hash,
      });
      assert.equal(isMigratedValid, true, "Migrated v0 quote must verify cleanly");
    });

    it("should reject malformed or invalid-length signatures", () => {
      const quoteInput = {
        session_id: demoQuote.sessionId,
        organization_id: demoQuote.organizationId,
        customer_id: demoQuote.customerId,
        policy_id: demoQuote.policyId,
        provider_name: demoQuote.providerName,
        amount: demoQuote.amount,
        currency: demoQuote.currency,
        expires_at: demoQuote.expiresAt,
      };

      // 1. Truncated hash (not 64 chars)
      assert.equal(verifyQuoteSignature({ ...quoteInput, quote_hash: "abc123" }), false);

      // 2. Non-hex characters
      assert.equal(verifyQuoteSignature({ ...quoteInput, quote_hash: "z".repeat(64) }), false);

      // 3. Empty string
      assert.equal(verifyQuoteSignature({ ...quoteInput, quote_hash: "" }), false);
    });
  });

  describe("Orchestrator Authorization & Quote-ID Invariant Preservation", () => {
    it("should strictly enforce that authorization binds to a verified persisted quote", async () => {
      resetStore();
      const repos = getRepositoryContainer();

      const startRes = await orchestrator.startWorkflow({
        inputText: "Renew my Toyota Camry insurance AUTO-2026-00182",
        channel: "web",
        executionContext: DEMO_CONTEXT,
      });

      assert.ok(startRes.authorizationDetails?.quoteId);
      const quoteId = startRes.authorizationDetails.quoteId;

      const quote = await repos.quotes.findById(quoteId);
      assert.ok(quote);
      assert.equal(quote.status, "issued");
      assert.ok(quote.quote_hash);

      // Verify that the issued quote has a valid signature
      const isVerified = verifyQuoteSignature({
        session_id: quote.session_id,
        organization_id: quote.organization_id,
        customer_id: quote.customer_id,
        policy_id: quote.policy_id,
        provider_name: quote.provider_name,
        amount: quote.amount,
        currency: quote.currency,
        expires_at: quote.expires_at,
        provider_reference: quote.provider_reference,
        underwriter_id: quote.underwriter_id,
        quote_hash: quote.quote_hash,
      });
      assert.equal(isVerified, true);

      // Successfully authorize and execute
      const execRes = await orchestrator.authorizeAndExecute(
        startRes.sessionId,
        true,
        DEMO_CONTEXT,
        { authorizedQuoteId: quoteId }
      );

      assert.equal(execRes.status, "completed");
    });
  });

  describe("Unambiguous Canonical JSON Serialization & Delimiter Collision Hardening", () => {
    const basePayload = {
      sessionId: "ses_col_001",
      organizationId: "org_col_001",
      customerId: "cust_col_001",
      policyId: "pol_col_001",
      providerName: "Leadway Assurance",
      amount: 85000,
      currency: "NGN",
      expiresAt: "2026-12-31T23:59:59.000Z",
    };

    it("should prevent delimiter collision when fields contain colons", () => {
      // Scenario that causes delimiter ambiguity in colon-separated format:
      // In `${version}:${sess}:${org}:${cust}:${pol}:${prov}:${amount}:${curr}:${exp}:${providerRef}:${underwriterId}`
      // Payload A: providerReference: "ref:part1", underwriterId: "part2" -> "...:ref:part1:part2"
      // Payload B: providerReference: "ref", underwriterId: "part1:part2" -> "...:ref:part1:part2"
      // In colon concatenation, both would produce identical strings!
      const payloadA = {
        ...basePayload,
        providerReference: "leadway:ref_branch_01",
        underwriterId: "tier_gold",
      };
      const payloadB = {
        ...basePayload,
        providerReference: "leadway",
        underwriterId: "ref_branch_01:tier_gold",
      };

      const serialA = serializeCanonicalQuotePayload(payloadA);
      const serialB = serializeCanonicalQuotePayload(payloadB);

      assert.notEqual(serialA, serialB, "Canonical JSON must not collide on colon characters across fields");

      const sigA = computeQuoteSignature(payloadA);
      const sigB = computeQuoteSignature(payloadB);
      assert.notEqual(sigA.quoteHash, sigB.quoteHash, "Signatures for distinct field combinations must never collide");
    });

    it("should normalize currency case deterministically (ngn vs NGN)", () => {
      const payloadLower = { ...basePayload, currency: "ngn" };
      const payloadUpper = { ...basePayload, currency: "NGN" };

      const serialLower = serializeCanonicalQuotePayload(payloadLower);
      const serialUpper = serializeCanonicalQuotePayload(payloadUpper);

      assert.equal(serialLower, serialUpper, "Currency must be normalized to uppercase");
      assert.equal(
        computeQuoteSignature(payloadLower).quoteHash,
        computeQuoteSignature(payloadUpper).quoteHash,
        "Case variation in currency must produce identical canonical signatures"
      );
    });

    it("should normalize equivalent ISO date timestamps", () => {
      const payloadWithZ = { ...basePayload, expiresAt: "2026-12-31T23:59:59Z" };
      const payloadWithMs = { ...basePayload, expiresAt: "2026-12-31T23:59:59.000Z" };

      const serial1 = serializeCanonicalQuotePayload(payloadWithZ);
      const serial2 = serializeCanonicalQuotePayload(payloadWithMs);

      assert.equal(serial1, serial2, "Date strings must normalize to equivalent ISO representation");
      assert.equal(
        computeQuoteSignature(payloadWithZ).quoteHash,
        computeQuoteSignature(payloadWithMs).quoteHash
      );
    });

    it("should normalize optional fields (undefined vs null vs empty string) deterministically", () => {
      const payloadUndef = {
        ...basePayload,
        providerReference: undefined,
        underwriterId: undefined,
      };
      const payloadNull = {
        ...basePayload,
        providerReference: null,
        underwriterId: null,
      };
      const payloadEmpty = {
        ...basePayload,
        providerReference: "   ",
        underwriterId: "",
      };

      const serialUndef = serializeCanonicalQuotePayload(payloadUndef);
      const serialNull = serializeCanonicalQuotePayload(payloadNull);
      const serialEmpty = serializeCanonicalQuotePayload(payloadEmpty);

      assert.equal(serialUndef, serialNull);
      assert.equal(serialNull, serialEmpty);
    });

    it("should throw on invalid quote amounts or invalid timestamps during canonical serialization", () => {
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, amount: -500 }),
        /Invalid quote amount/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, amount: NaN }),
        /Invalid quote amount/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, expiresAt: "not-a-valid-date" }),
        /Invalid expiresAt timestamp/
      );
    });

    it("should strictly reject zero or negative quote amounts for insurance renewals", () => {
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, amount: 0 }),
        /Quote amount must be greater than zero/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, amount: -0.01 }),
        /Quote amount must be greater than zero/
      );
    });

    it("should strictly require a valid, explicitly supplied 3-letter currency code", () => {
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, currency: "" }),
        /Invalid or missing quote currency/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, currency: "   " }),
        /Invalid or missing quote currency/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, currency: "NAIRA" }),
        /Invalid or missing quote currency/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, currency: "NG" }),
        /Invalid or missing quote currency/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, currency: "123" }),
        /Invalid or missing quote currency/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, currency: (undefined as unknown as string) }),
        /Invalid or missing quote currency/
      );
    });

    it("should strictly reject blank required identifiers and provider names", () => {
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, sessionId: "  " }),
        /Required quote field 'sessionId' must be a non-empty string/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, organizationId: "" }),
        /Required quote field 'organizationId' must be a non-empty string/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, customerId: "   " }),
        /Required quote field 'customerId' must be a non-empty string/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, policyId: "" }),
        /Required quote field 'policyId' must be a non-empty string/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, providerName: " \t " }),
        /Required quote field 'providerName' must be a non-empty string/
      );
    });

    it("should strictly reject missing or malformed expiry timestamps", () => {
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, expiresAt: "" }),
        /Missing or blank expiresAt timestamp/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, expiresAt: "   " }),
        /Missing or blank expiresAt timestamp/
      );
      assert.throws(
        () => serializeCanonicalQuotePayload({ ...basePayload, expiresAt: "2026-99-99T99:99:99Z" }),
        /Invalid expiresAt timestamp/
      );
    });

    it("should return false from verifyQuoteSignature when quotes contain invalid or zero amounts, invalid currencies, or blank identifiers", () => {
      const validQuote = {
        session_id: basePayload.sessionId,
        organization_id: basePayload.organizationId,
        customer_id: basePayload.customerId,
        policy_id: basePayload.policyId,
        provider_name: basePayload.providerName,
        amount: basePayload.amount,
        currency: basePayload.currency,
        expires_at: basePayload.expiresAt,
        quote_hash: computeQuoteSignature(basePayload).quoteHash,
      };

      // Valid quote verifies
      assert.equal(verifyQuoteSignature(validQuote), true);

      // Quote with amount = 0 fails closed
      assert.equal(verifyQuoteSignature({ ...validQuote, amount: 0 }), false);

      // Quote with invalid currency fails closed
      assert.equal(verifyQuoteSignature({ ...validQuote, currency: "INVALID" }), false);

      // Quote with blank sessionId fails closed
      assert.equal(verifyQuoteSignature({ ...validQuote, session_id: "" }), false);

      // Quote with blank providerName fails closed
      assert.equal(verifyQuoteSignature({ ...validQuote, provider_name: "  " }), false);

      // Quote with malformed expires_at fails closed
      assert.equal(verifyQuoteSignature({ ...validQuote, expires_at: "invalid-date" }), false);
    });
  });
});

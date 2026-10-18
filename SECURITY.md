# ActionOS Security Architecture & Safeguards

This document defines the security boundaries, cryptographic controls, and financial safeguards implemented in ActionOS for the 2026 NITDA National AI Innovation Challenge.

---

## 1. Zero Trust AI Tool Boundaries

Large Language Models (LLMs) and voice models must never have direct write access to persistent data stores or financial gateways.

- **No Raw SQL Execution:** N-ATLAS and other language adapters only emit structured intent strings and extracted entity dictionaries.
- **Strict Tool Whitelisting:** The ActionOS Executor only invokes tools that exist in the pre-compiled `ToolRegistry`. Unregistered tools trigger an immediate fatal security block.
- **Input Validation via Zod:** All external inputs are validated against strict Zod runtime schemas before dispatching.

---

## 2. Row Level Security (RLS) & Tenant Isolation

Every table in Supabase PostgreSQL has RLS enabled with `SECURITY DEFINER` helper functions:

- `private.current_profile_id()`: Derives the verified profile ID from `auth.uid()`.
- `private.is_org_member(target_org UUID)`: Verifies active membership in the organization tenant.
- `private.has_org_role(target_org UUID, allowed_roles member_role[])`: Enforces RBAC permissions.

### Restricted Write Operations
Direct browser writes from the anon key are strictly prohibited for sensitive tables:
- `tool_executions`
- `transactions`
- `documents`
- `notifications`
- `human_escalations`
- `audit_logs`

These records may only be inserted or mutated by trusted server-side code or Supabase Edge Functions with service role credentials.

---

## 3. Financial Safeguards & Authorization Gates

- **Uncompromising Authorization Gates:** Renewal and payment steps always require `requires_confirmation = true`. Vague responses or assumed consent are rejected.
- **Transaction Limits by Role:**
  - `customer`: ₦500,000 maximum per transaction
  - `agent`: ₦2,000,000 maximum
  - `manager`: ₦10,000,000 maximum
  - `admin`: Unlimited
- **Independent Settlement Verification:** A policy is never renewed based on client claims. The verifier queries the payment gateway out-of-band to confirm actual settlement.
- **Quote Invariant Verification:** Trusted renewal orchestration strictly validates settled amount (within 0.01 tolerance), settled currency (`NGN`), and transaction reference against the authorized quote before committing renewals. Reversing refund transactions are rejected.

---

## 4. Multi-Rail Payment Hardening & Authoritative Refund Lifecycle

ActionOS implements multi-rail payment adapters for domestic policy settlement:
- **Paystack (`lib/payments/paystack.ts`)**: Activated by `PAYSTACK_SECRET_KEY`, verifying webhook deliveries via HMAC-SHA512 (`x-paystack-signature`).
- **Flutterwave (`lib/payments/flutterwave.ts`)**: Activated by `FLUTTERWAVE_SECRET_KEY`, verifying webhook deliveries via constant-time `verif-hash` header comparison (`crypto.timingSafeEqual`).

Both adapters are categorized as **Implemented Adapters (Awaiting Production Credentials)**. In demo/test modes, transactions run against mock and sandbox fixtures. When live credentials are provided, both adapters enforce identical security controls:

- **Strict Live Payment Initiation Validation:**
  - Mandatory customer identity (`customerId`) and verified customer email format matching `EMAIL_REGEX`. Silent fallback to generic email (`customer@actionos.ng`) is strictly prohibited.
  - Positive finite amount with minor-unit (kobo) precision validation (rejects fractional kobo exceeding 2 decimal places).
  - Explicit currency validation restricted to `NGN` for domestic policy settlements.
  - Non-empty unique transaction reference required before contacting the payment rail.
- **Timestamp Integrity:**
  - Preserves provider payment timestamp (`paid_at`) as optional rather than fabricating current system time.
  - Separately records authoritative local verification timestamp (`verifiedAt`).
- **Authoritative 4-State Refund Lifecycle:**
  - Initial `POST /refund` acceptance maps strictly to `refund_pending` (as domestic payment rails queue requests asynchronously). Never prematurely marked as complete.
  - Settlement reversal is only marked `refund_confirmed` once authoritative provider proof (`processed` / `success`) is confirmed via `GET /refund/:id` or webhook.
  - Terminal declinations map to `refund_failed`.
  - Gateway timeouts, HTTP 500+, and malformed or ambiguous responses map to `refund_unknown`.
  - **Zero Synthetic Fallbacks:** When provider identifiers (`data.id`) are omitted or network errors occur, adapters never invent dummy references (e.g. `ref_${Date.now()}`); `refundReference` is left `undefined` and flagged for supervisor reconciliation.


---

## 5. Idempotency & Replay Protection

Payment and renewal actions generate deterministic idempotency keys:
- `action:{session_id}:payment`
- `action:{session_id}:renewal`

Duplicate network requests or retries reuse existing transaction references, preventing duplicate debiting or duplicate certificate issuance. Replayed webhooks are acknowledged idempotently (`{ duplicate: true }`) without triggering duplicate state transitions.

---

## 5. Human Escalation Triggers

ActionOS automatically halts autonomous execution and escalates to human staff if:
1. AI confidence is below 75%.
2. Multiple vehicle policies match ambiguously.
3. Payment verification fails repeatedly.
4. Transaction amount exceeds automated role limits.
5. Underwriting guardrails detect a policy suspension.

Reference tickets (e.g., `ACT-20261007-00123`) are issued and logged in `human_escalations`.

---

## 7. Reliability Gate & Staging Verification Invariants

ActionOS enforces an automated Reliability Gate (`scripts/verify-supabase-staging.mjs`) to verify database security, RLS enforcement, and RPC isolation.

### Strict Error & Denial Classifications
Historical false-positive classifications (such as treating missing schema relations as RLS denials) are strictly eliminated:
- **`relation_missing` (Fails Gate):** PostgREST `PGRST205`, PostgreSQL `42P01`, and HTTP `404` indicate that a table or view is missing from the database or PostgREST schema cache. These are classified as unmigrated schema errors, **never** as security passes.
- **`server_error` & `network_failure` (Fails Gate):** HTTP `5xx` responses, socket timeouts, and connection aborts indicate infrastructure failure and fail the gate immediately.
- **`unexpected_error` (Fails Gate):** HTTP `400` malformed syntax or unhandled errors fail the gate.
- **`permission_denied` (Security Pass):** Only explicit PostgreSQL `42501` (insufficient privilege) or PostgREST `PGRST301` are accepted as proof that RLS or database grants actively denied anon/unprivileged access.
- **`rls_empty_filter` (Security Pass):** An empty result array (`[]`) on authenticated RLS-filtered tables confirms row filtering is functioning without leaking unauthorized records.

### Offline vs. Staging Mode Separation
To prevent green CI runs from creating false impressions of database verification:
1. **Offline Mode (`npm run db:verify:offline`):** Designed for local PRs where external staging credentials are not present. Invariant schemas and migrations are validated locally, while all live database checks are recorded as `skipped` (`liveVerified: false`) in `reliability-gate-report.json`.
2. **Staging Required Mode (`npm run db:verify:staging`):** Executed in dedicated staging pipelines. Requires valid `SUPABASE_STAGING_URL` and `SUPABASE_STAGING_ANON_KEY`.
3. **Privileged Verification & Service-Role Hardening (`--require-service-role`):** When `--require-service-role` or `REQUIRE_SERVICE_ROLE=true` is enabled, the gate strictly requires `SUPABASE_STAGING_SERVICE_ROLE_KEY`. If the service-role key is omitted or placeholder, the gate fails immediately with exit code 1. Privileged tests verify that:
   - The service role authenticates and queries admin catalog entities.
   - All 5 sensitive RPCs (`settle_payment_webhook`, `reserve_refund_balance`, `release_refund_reservation`, `finalize_atomic_refund_settlement`, `claim_and_accept_quote`) exist in the PostgREST schema cache and grant execution to `service_role`.
   - The same 5 sensitive RPCs strictly deny execution to `anon` callers (PostgreSQL code `42501`).

---

## 8. N-ATLAS AI Engine & Audit Transparency

- **Distinction Between Simulated Benchmark & Live AI:**
  - **Simulated Benchmark:** The test suite in `tests/unit/nigerian-languages-and-vehicle-query.test.ts` is an offline deterministic benchmark fixture demonstrating language parsing capabilities across English, Pidgin, Yorùbá, Hausa, and Igbo. It is explicitly labeled as **simulated**.
  - **Official Integration (Awaiting Credentials):** The live adapter in `lib/ai/n-atlas.ts` connects to `https://api.n-atlas.ng/v1` targeting model `n-atlas-multilingual`. It is labeled as **awaiting institutional credentials (`N_ATLAS_API_KEY`)** from NITDA/NCAIR.
  - **Real Integration Harness:** `tests/integration/n-atlas-live-integration.test.ts` provides a live verification test harness that automatically exercises the remote sovereign endpoint, validates JSON schemas, and records validation outcomes without exposing secrets whenever authorized credentials are supplied.
- **Zero Silent Substitution in Strict Mode:** Setting `N_ATLAS_STRICT_MODE=true` forces the N-ATLAS adapter to fail fast with `NAtlasConnectionError` if credentials or API connections fail, preventing fallback engines from masking connectivity outages during audit evaluations.
- **Transparent Attribution:** When operating without credentials in sandbox, responses are explicitly stamped `_aiProvider: "N-ATLAS Fallback (Deterministic Benchmark Engine)"`, `_liveVerified: false`, with explicit `_fallbackReason`.

---

## 9. Secrets Management & Staging Configuration

- `SUPABASE_STAGING_SERVICE_ROLE_KEY` is a sensitive backend credential. It is configured exclusively in GitHub Actions Repository Secrets (`Settings -> Secrets and variables -> Actions`) and server-side environment variables. It is **never** prefixed with `NEXT_PUBLIC_` and is **never** bundled into client code.
- Staging verification jobs run exclusively on trusted repository branches (e.g., `main` or repository owner workflows) to protect repository secrets from untrusted fork pull requests.
- Environment variables must be loaded via `.env.local` and never committed to source control.

---

## 10. Dependency Security Triage & Supply Chain Integrity

### Authoritative Audit Findings Analysis (GHSA-vfj7-8cjw-p6xm)
A granular security audit of dependencies via `npm audit --json` identified five reported high-severity vulnerability counts. Technical investigation confirms:

1. **Single Transitive Origin & Graph Impact:**  
   All five reported counts stem from a single upstream advisory: `GHSA-vfj7-8cjw-p6xm` (`braces` vulnerable to stack-exhaustion denial of service through deeply nested patterns, advisory ID `1240992`).
   The dependency effect graph is:  
   `braces` $\rightarrow$ `micromatch` $\rightarrow$ `fast-glob` $\rightarrow$ `@next/eslint-plugin-next` $\rightarrow$ `eslint-config-next`.  
   Because each package in the path transitively depends on `braces`, `npm audit` tallies 1 count for each layer, reporting 5 total counts.

2. **Npm Advisory Registry Range Limitation (`<=3.0.3`) & Upstream Status:**  
   The npm advisory database records the affected range as `"range": "<=3.0.3"`. Inspection of the official npm registry (`npm view braces versions --json`) confirms that `3.0.3` is the latest published release of `braces` (no `3.0.4` or `4.x` has been published by upstream maintainers). Consequently, **version 3.0.3 is NOT patched against GHSA-vfj7-8cjw-p6xm**, and no patched version currently exists anywhere in the npm ecosystem.

3. **Enforced Root Overrides as Dependency Pin (Not a Claimed Fix):**  
   `package.json` enforces root `"overrides": { "braces": "^3.0.3", "micromatch": "^4.0.8" }`.  
   *Accurate Scope:* This override pins `braces` to the latest published release (`3.0.3`) and `micromatch` to `4.0.8` (which resolves the companion ReDoS advisory in older micromatch releases). It avoids resolution of older, more severely vulnerable versions (such as ReDoS in `braces <3.0.3`). **It is not an upstream fix for GHSA-vfj7-8cjw-p6xm, and ActionOS does not claim it is patched.**

4. **Assessment of Developer Tooling (Isolation vs. Replacement):**  
   - **Can `eslint-config-next` be replaced?**  
     Replacing `eslint-config-next` would require writing standalone ESLint configurations and removing the official Next.js ESLint plugin. This would eliminate official Next.js App Router static analysis rules (e.g., React Server Component boundary rules, image optimization checks, and hydration warnings), which are essential for application correctness.
   - **Tooling Isolation Strategy:**  
     The entire vulnerable package graph is confined strictly to `devDependencies`. It is invoked exclusively during offline developer linting (`npm run lint`) and CI static analysis. It is never included in the Next.js production build, serverless edge functions, API routes, or client browser bundles.
   - **Residual Risk:**  
     Zero in production. The stack-exhaustion denial of service requires processing untrusted user-supplied string patterns. Because linting runs only on static repository file paths during local development and CI, there is no vector for untrusted input injection.

5. **Automated Supply Chain Verification Gate (`npm run deps:verify`):**  
   ActionOS enforces an automated dependency verification script (`scripts/verify-dependency-integrity.mjs`) in CI to:
   - Validate that `braces` is pinned to `^3.0.3` and `micromatch` to `^4.0.8`.
   - Assert that `package-lock.json` resolves `braces` strictly to `3.0.3` and `micromatch` to `>=4.0.8`.
   - Strictly guarantee that `braces`, `micromatch`, and `fast-glob` are completely absent from production runtime `dependencies`.
   - Fail CI if any vulnerable package leaks into production runtime dependencies.




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

## 4. Payment Rail Hardening & Authoritative Refund Lifecycle

- **Strict Live Payment Initiation Validation:**
  - Mandatory customer identity (`customerId`) and verified customer email format matching `EMAIL_REGEX`. Silent fallback to generic email (`customer@actionos.ng`) is strictly prohibited.
  - Positive finite amount with minor-unit (kobo) precision validation (rejects fractional kobo exceeding 2 decimal places).
  - Explicit currency validation restricted to `NGN` for domestic policy settlements.
  - Non-empty unique transaction reference required before contacting the payment rail.
- **Timestamp Integrity:**
  - Preserves provider payment timestamp (`paid_at`) as optional rather than fabricating current system time.
  - Separately records authoritative local verification timestamp (`verifiedAt`).
- **Authoritative 4-State Refund Lifecycle:**
  - Initial `POST /refund` acceptance maps strictly to `refund_pending` (as Paystack queues requests for processing). Never prematurely marked as complete.
  - Settlement reversal is only marked `refund_confirmed` once authoritative provider proof (`processed` / `success`) is confirmed via `GET /refund/:id` or webhook.
  - Terminal declinations map to `refund_failed`.
  - Gateway timeouts, HTTP 500+, and malformed or ambiguous responses map to `refund_unknown`.
  - **Zero Synthetic Fallbacks:** When provider identifiers (`data.id`) are omitted or network errors occur, the adapter never invents dummy references (e.g. `ref_${Date.now()}`); `refundReference` is left `undefined` and flagged for supervisor reconciliation.

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
1. **Offline Mode (`npm run db:verify:offline`):** Designed for local PRs where external staging credentials are not present. Invariant schemas and migrations are validated locally, while all 23 live database checks (15 tables, 2 RLS probes, 5 RPC revocations, 1 service query) are recorded as `skipped` (`liveVerified: false`) in `reliability-gate-report.json`.
2. **Staging Required Mode (`npm run db:verify:staging`):** Executed in dedicated staging pipelines. Requires valid `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Missing credentials, missing tables, unapplied migrations, or unexpected RPC permissions trigger an immediate hard exit (`process.exit(1)`).

---

## 8. N-ATLAS AI Engine & Audit Transparency

- **Transparent Attribution:** Every intent analysis returns explicit provider metadata (`_aiProvider`, `_liveVerified`, and `_evidence`).
- **Zero Silent Substitution in Strict Mode:** Setting `N_ATLAS_STRICT_MODE=true` forces the N-ATLAS adapter to fail fast with `NAtlasConnectionError` if credentials or API connections fail, preventing fallback engines from masking connectivity outages during audit evaluations.
- **Deterministic Benchmark Engine:** When running in sandbox or unconfigured environments, responses are clearly stamped `_aiProvider: "N-ATLAS Fallback (Deterministic Benchmark Engine)"`, `_liveVerified: false`, with explicit `_fallbackReason`.

---

## 9. Secrets Management

- `SUPABASE_SERVICE_ROLE_KEY` is never bundled into client-side code.
- Demo mode operates securely without requiring production API keys.
- Environment variables must be loaded via `.env.local` and never committed to source control.

---

## 10. Dependency Security Triage & Supply Chain Integrity

### Audit Findings Analysis (GHSA-vfj7-8cjw-p6xm)
A granular security audit of dependencies via `npm audit --json` identified five reported high-severity vulnerability counts. Technical investigation confirms:

1. **Single Transitive Origin & Graph Impact:**  
   All five reported counts stem from a single upstream advisory: `GHSA-vfj7-8cjw-p6xm` (`braces` vulnerable to stack-exhaustion denial of service through deeply nested patterns, advisory ID `1240992`).
   The dependency effect graph is:  
   `braces` $\rightarrow$ `micromatch` $\rightarrow$ `fast-glob` $\rightarrow$ `@next/eslint-plugin-next` $\rightarrow$ `eslint-config-next`.  
   Because each package in the path transitively depends on `braces`, `npm audit` tallies 1 count for each layer, reporting 5 total counts.

2. **Npm Advisory Registry Range Limitation (`<=3.0.3`):**  
   The npm advisory database records the affected range as `"range": "<=3.0.3"`. Inspection of the official npm registry (`npm view braces versions`) confirms that `3.0.3` is the latest published release of `braces` (no `3.0.4` or `4.x` exists on npm). Consequently, any package in the entire JavaScript ecosystem depending transitively on `braces` triggers this advisory notice.

3. **Strictly Isolated to Developer Tooling (`devDependencies`):**  
   The entire chain resides exclusively within `devDependencies` (specifically `eslint-config-next@16.4.0`). It is executed solely during local developer linting and CI static analysis (`npm run lint`), and is **never** bundled into or exposed by runtime Next.js server endpoints, serverless handlers, or client browser distributions.

4. **Rejection of Incompatible Automated Downgrade (`npm audit fix --force`):**  
   Automated remediation suggests:
   ```json
   "fixAvailable": {
     "name": "eslint-config-next",
     "version": "14.2.35",
     "isSemVerMajor": true
   }
   ```
   Blindly executing `npm audit fix --force` downgrades `eslint-config-next` to `14.2.35`, introducing breaking semver conflicts with Next.js 16.4 and React 19.

5. **Enforced Root Overrides:**  
   `package.json` enforces root `"overrides": { "braces": "^3.0.3", "micromatch": "^4.0.8" }` to guarantee that all downstream package managers and CI environments resolve to patched, safe versions.




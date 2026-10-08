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

---

## 4. Idempotency & Replay Protection

Payment and renewal actions generate deterministic idempotency keys:
- `action:{session_id}:payment`
- `action:{session_id}:renewal`

Duplicate network requests or retries reuse existing transaction references, preventing duplicate debiting or duplicate certificate issuance.

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

## 6. Secrets Management

- `SUPABASE_SERVICE_ROLE_KEY` is never bundled into client-side code.
- Demo mode operates securely without requiring production API keys.
- Environment variables must be loaded via `.env.local` and never committed to source control.

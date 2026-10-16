# ActionOS System Architecture

```
User Voice / Text
       ↓
  [Frontend UI] (Next.js App Router, Tailwind CSS, Web Speech API)
       ↓
  [API Routes] (/api/actions, /api/actions/[id]/authorize) (Zod Validated)
       ↓
[ActionOS Orchestrator] (State Machine: RECEIVED → COMPLETED)
       ↓
  [N-ATLAS Adapter] (Multilingual Intent & Entity Extraction)
       ↓
  [Action Planner] (Deterministic 10-Step Workflow DAG)
       ↓
  [Guardrails & Policy Engine] (Eligibility, Expiry, Financial Caps)
       ↓
[Authorization Gate] (Cryptographic Customer Consent)
       ↓
  [Tool Registry & RBAC] (Sandboxed, Audited Tool Invocation)
       ↓
  [Tool Execution] (Payment Request, Policy Renewal, Certificate Gen)
       ↓
[Independent Verifier] (Direct Gateway Settlement & DB Verification)
       ↓
[Action Ledger™] (Immutable Audit Logs in Supabase PostgreSQL)
```

---

## 1. Core Architectural Tenet: The Separation of Intelligence and Execution

**AI NEVER directly manipulates the database.**  
AI models excel at fuzzy natural language understanding and entity extraction, but cannot be trusted with uncontrolled SQL execution, arbitrary API invocations, or unsupervised financial movement.

In ActionOS:
1. **N-ATLAS proposes an intent.**
2. **ActionOS Planner creates a structured workflow.**
3. **Guardrails validate whether business rules allow the action.**
4. **The user must explicitly click authorization for money movement.**
5. **Only sandboxed internal tools registered in `ToolRegistry` are executed.**
6. **An independent verifier confirms the state change before completing the workflow.**

---

## 2. Action State Machine Lifecycle

ActionOS enforces an invariant deterministic state machine. No arbitrary state transitions are permitted.

```
       [RECEIVED]
           ↓
    [UNDERSTANDING]
           ↓
       [PLANNING]
           ↓
      [VALIDATING]
           ↓
[AWAITING_AUTHORIZATION] ──(declined)──→ [CANCELLED]
           ↓ (confirmed)
      [EXECUTING]
           ↓
      [VERIFYING]
           ↓
      [COMPLETED]
```

*Fault states:*
- `FAILED` &rarr; Transition to `ESCALATED`
- `ESCALATED` &rarr; Awaits staff human-in-the-loop review

---

## 3. The 10-Step Renewal Pipeline

For the `renew_policy` intent, ActionOS executes the following pipeline:

1. `get_customer`: Look up customer profile and verify tenant identity.
2. `get_policy`: Match active vehicle policy via registration plate or policy ID.
3. `check_renewal_eligibility`: Verify policy status is not suspended/cancelled and is within the 30-day renewal window.
4. `get_quote`: Calculate actuarial premium including VAT and no-claims discounts.
5. **[Authorization Gate]**: Pause workflow and present the confirmation card with exact quote (`₦87,500`).
6. `request_payment`: Trigger simulated payment initiation on payment gateway rail.
7. `verify_payment`: Independently query rail to confirm transaction settlement.
8. `renew_policy`: Atomically roll forward policy expiry by 1 year.
9. `generate_certificate`: Generate a verifiable digital NAICOM certificate document.
10. `send_notification`: Dispatch multi-channel receipt (in-app, SMS, email).
11. `schedule_reminder`: Cascade automated reminder sequence for 30, 14, 7, and 1 day before new expiry.

---

## 4. Idempotency Architecture

To prevent duplicate charges or double policy renewals, ActionOS enforces deterministic idempotency keys:
- Payment: `act:{session_id}:payment`
- Renewal: `act:{session_id}:renewal`
- Certificate: `act:{session_id}:certificate`

If a request is retried, the system safely returns previously settled records without re-executing transactions.

---

## 5. Payment Hardening, Webhook Safety & Multi-Rail Gateway Architecture

ActionOS implements strict, production-hardened defenses for multi-rail payment movement, webhook settlement, and distributed saga compensation across both Paystack and Flutterwave:

### A. Authoritative Refund State Modeling
Payment gateway refund endpoints (Paystack `POST /refund` and Flutterwave `POST /v3/transactions/:id/refund`) return an immediate acceptance response which only indicates the refund request has been queued. ActionOS accurately models four canonical refund lifecycle states:
- `refund_pending`: Request accepted by payment rail; awaiting bank settlement confirmation.
- `refund_confirmed`: Authoritative settlement confirmed by Paystack `refund.processed` / Flutterwave `refund.completed` webhook or provider polling (`verifyRefund`).
- `refund_failed`: Explicitly rejected by gateway or banking rail.
- `refund_unknown`: Network timeout, HTTP 500+, or ambiguous provider response. Escalated for human-in-the-loop review.
- **Zero Synthetic Fallbacks**: When initiating or verifying refunds, synthetic fallback identifiers are strictly rejected (`SYNTHETIC_REFUND_REFERENCE_REJECTED`); provider numeric IDs or authoritative references are resolved out-of-band.

### B. Multi-Rail Gateway Support (Paystack & Flutterwave)
The system abstracts payment operations via `IPaymentProvider` (`lib/payments/provider.ts`):
- **Paystack (`lib/payments/paystack.ts`)**: Amounts in minor units (kobo, `amount / 100`), HMAC-SHA512 `x-paystack-signature` verification.
- **Flutterwave (`lib/payments/flutterwave.ts`)**: Amounts in major units (Naira, `amount`), constant-time `verif-hash` signature verification via `crypto.timingSafeEqual`, transaction verification by alphanumeric `tx_ref` or numeric ID (`/v3/transactions/:id/verify`), and automated numeric transaction ID lookup prior to refund submission.
- **Resolution**: `getPaymentProvider()` resolves the active provider via `PAYMENT_PROVIDER` environment variable, falling back gracefully to Paystack or throwing fail-closed in production if credentials are absent.

### C. Trusted Server-Side Payment Verification
A policy renewal (`renew_policy`) will **never** commit unless the payment is independently verified:
- Settled transaction amount must match the persisted quote amount within 0.01 tolerance.
- Settled currency must match the quote currency (e.g., `NGN`).
- Reversing transactions (`transaction_type: "refund"`) are strictly rejected.
- Tenant isolation is enforced: the transaction must belong to the active customer and organization.

### D. Multi-Rail Webhook Deduplication & Out-of-Order Safety
- Webhooks are cryptographically validated using HMAC-SHA512 (Paystack) or constant-time secret hash matching (Flutterwave).
- Provider-scoped deduplication (`uq_payment_webhook_events_provider_event` on `(provider, event_id)`) guarantees idempotent delivery (`{ duplicate: true }`) without repeated side-effects.
- Terminal `refunded` transactions can **never** be overwritten by delayed `charge.success` or `charge.completed` webhooks.
- Already `succeeded` transactions can **never** regress to `failed` or `pending` due to out-of-order delivery.

### E. Post-Payment Database Failure Recovery
If payment succeeds but a downstream database operation fails:
- The orchestrator records the unresolved state (`unresolvedDbFailure: true`, `paymentSettled: true`, `reconciliation_required: true`, `reconciliationState: "database_failure_post_payment"`).
- The recovery worker reconciles the session by completing the renewal safely using the existing settled payment reference, or falls back to compensating refund.
- Customers are **never** blindly double-debited on retry.

### F. Production vs. Demo Isolation
- Production mode strictly requires `PAYSTACK_SECRET_KEY` (when using Paystack) or `FLUTTERWAVE_SECRET_KEY` (when using Flutterwave) and prohibits simulated mock provider execution.
- Sensitive information (cards, BVN, NIN, authorization headers, Bearer tokens) is redacted from logs and error responses.

---

## 6. Statutory Regulatory Gateway Architecture (FRSC & LACVIS)

ActionOS interfaces directly with Nigerian statutory registries to verify vehicular integrity, driver authenticity, and computerized roadworthiness:

### A. Federal Road Safety Corps (FRSC NVIS & Driver's License Registry)
- **Adapter**: `lib/integrations/frsc.ts` (`FrscGatewayClient`)
- **Plate Normalization & Strict Validation**: Normalizes various Nigerian plate string permutations (e.g., `abc 123 xy` &rarr; `ABC-123-XY`) using state-aware regex (`/^[A-Z]{2,3}-\d{2,3}-[A-Z]{2}$/`). Rejects malformed plates with `FRSC_INVALID_PLATE_FORMAT`.
- **Driver's License Format Validation**: Validates Nigerian Driver's License format (`NIGERIAN_DL_REGEX`, `/^[A-Z]{2,3}-?\d{4,8}-?[A-Z0-9]{2,4}$/i`) while preserving user-formatted string representations.
- **Fail-Closed Production Security**: In production mode (`isProductionMode()`), missing `FRSC_API_KEY` immediately throws `FRSC_CONFIGURATION_ERROR`. Upstream HTTP 5xx, timeouts, or network errors throw `FRSC_UPSTREAM_ERROR`, strictly prohibiting silent benchmark fallbacks.
- **Theft Detection & Fraud Prevention**: Cross-verifies vehicle status against FRSC theft registry records. `VerifyNiidTool` checks `frscResult.theftFlag`; if active, policy underwriting and verification fail immediately.
- **Sandbox Test Fixtures**: Deterministic sandbox fixtures for development and testing (`ABC-123-XY` passing benchmark, `STOLEN-999-XX` stolen vehicle flag, `NOT-404-NF` unregistered plate).

### B. Lagos Computerised Vehicle Inspection Service (LACVIS Roadworthiness)
- **Adapter**: `lib/integrations/lacvis.ts` (`LacvisGatewayClient`)
- **Computerized Inspection Standards**: Evaluates test parameters against statutory thresholds (Brake efficiency: 84% passing vs. 70% statutory minimum; emissions standards; suspension; steering; lighting).
- **Statutory Clearance & Certificate Generation**: Computes computerized clearance status, recording test center ID, certificate number, test date, and expiry date.
- **Fail-Closed Security**: In production mode, missing `LACVIS_API_KEY` throws `LACVIS_CONFIGURATION_ERROR`. Live API errors are typed and classified via `LacvisGatewayError`.
- **Tool Integration**: `VerifyVehicleInspectionTool` invokes `lacvisGateway.verifyInspection` to confirm inspection compliance before statutory vehicle license renewal.

### C. Nigerian Insurance Industry Database (NIID & NAICOM Central Portal)
- **Adapter**: `lib/integrations/niid.ts` (`NiidGatewayClient`)
- **Active Policy Registry Verification**: Looks up existing insurance coverage across licensed underwriters. Blocks duplicate insurance renewals when active coverage exceeds the 30-day renewal threshold (`NIID_ACTIVE_POLICY_CONFLICT`).
- **Statutory E-Sticker Issuance**: Generates official NAICOM e-stickers (`NAICOM-STK-${year}-${hex}`) and unique NAICOM policy UIDs with QR verification endpoints (`https://niid.nigeriainsurers.org/verify`).
- **Cryptographic Hash Stamping**: Stamps digital certificates with SHA-256 verification hashes binding policy number, plate, chassis number, and premium paid.
- **Fail-Closed Production Security**: In production mode, missing `NIID_API_KEY` throws `NIID_CONFIGURATION_ERROR`. Network failures throw `NIID_NETWORK_ERROR`, prohibiting synthetic fallbacks in production.
- **Tool Integrations**: `VerifyNiidTool` queries `niidGateway.verifyPolicy` alongside FRSC theft checks; `GenerateCertificateTool` registers certificates on NIID and returns e-sticker credentials.

---

## 7. Extensibility to Future Verticals

ActionOS was architected as an extensible engine. Adding new verticals (e.g., `ActionOS Health`, `ActionOS Civic`, `ActionOS Business`) requires:
1. Defining new domain tools in `lib/actionos/tools/`
2. Registering tools in `ToolRegistry`
3. Adding the intent workflow in `ActionOSPlanner`
No modifications to the core orchestrator, state machine, or audit ledger are required.



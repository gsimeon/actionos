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

## 5. Payment Hardening, Webhook Safety & Reconciliation

ActionOS implements strict defenses for payment and renewal orchestration:

### A. Authoritative Refund State Modeling
Paystack refund requests return an immediate acceptance response (`POST /refund`), which only indicates the request is queued. ActionOS accurately models four canonical refund lifecycle states:
- `refund_pending`: Request accepted by payment rail; awaiting bank settlement confirmation.
- `refund_confirmed`: Authoritative settlement confirmed by Paystack `refund.processed` webhook or `verifyRefund` polling.
- `refund_failed`: Explicitly rejected by gateway or banking rail.
- `refund_unknown`: Network timeout, HTTP 500+, or ambiguous provider response. Escalated for human-in-the-loop review.

### B. Trusted Server-Side Payment Verification
A policy renewal (`renew_policy`) will **never** commit unless the payment is verified:
- Settled transaction amount must match the persisted quote amount within 0.01 tolerance.
- Settled currency must match the quote currency (e.g., `NGN`).
- Reversing transactions (`transaction_type: "refund"`) are strictly rejected.
- Tenant isolation is enforced: the transaction must belong to the active customer and organization.

### C. Webhook Deduplication & Out-of-Order Safety
- Webhooks are cryptographically validated using HMAC-SHA512 with timing-safe comparison.
- Duplicate deliveries are acknowledged idempotently (`{ duplicate: true }`) without repeated side-effects.
- Terminal `refunded` transactions can **never** be overwritten by delayed `charge.success` or `charge.failed` webhooks.
- Already `succeeded` transactions can **never** regress to `failed` or `pending` due to out-of-order delivery.

### D. Post-Payment Database Failure Recovery
If payment succeeds but a downstream database operation fails:
- The orchestrator records the unresolved state (`unresolvedDbFailure: true`, `paymentSettled: true`, `reconciliation_required: true`, `reconciliationState: "database_failure_post_payment"`).
- The recovery worker reconciles the session by completing the renewal safely using the existing settled payment reference, or falls back to compensating refund.
- Customers are **never** blindly double-debited on retry.

### E. Production vs. Demo Isolation
- Production mode strictly requires `PAYSTACK_SECRET_KEY` and prohibits simulated mock provider execution.
- Sensitive information (cards, BVN, NIN, authorization headers, Bearer tokens) is redacted from logs and error responses.

---

## 6. Extensibility to Future Verticals

ActionOS was architected as an extensible engine. Adding new verticals (e.g., `ActionOS Health`, `ActionOS Civic`, `ActionOS Business`) requires:
1. Defining new domain tools in `lib/actionos/tools/`
2. Registering tools in `ToolRegistry`
3. Adding the intent workflow in `ActionOSPlanner`
No modifications to the core orchestrator, state machine, or audit ledger are required.


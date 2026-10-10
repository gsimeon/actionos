# ActionOS — AI Action & Workflow Orchestration Layer

> **Tagline:** *“N-ATLAS gives AI a Nigerian voice. ActionOS gives that voice the ability to act.”*  
> **Entry for:** 2026 NITDA National AI Innovation Challenge for Nigerians  
> **Initial Vertical:** ActionOS Renew (Vehicle Insurance, Vehicle Licenses, Health HMO)

[![CI](https://github.com/gsimeon/actionos/actions/workflows/ci.yml/badge.svg)](https://github.com/gsimeon/actionos/actions/workflows/ci.yml)

---

## 1. Product Overview

Most artificial intelligence assistants stop at generating text or answering questions. **ActionOS** understands what users want, verifies eligibility against deterministic underwriting guardrails, requires explicit human authorization, and safely gets real-world business actions executed and verified.

### The First Vertical: ActionOS Renew
In Nigeria, vehicle owners face statutory deadlines for insurance, roadworthiness certificates, and vehicle licenses. ActionOS allows a driver to say:
> *“My car insurance expires next week. Check it and renew it for me.”*

ActionOS autonomously:
1. Understands the intent using the **N-ATLAS** adapter (supporting English, Nigerian Pidgin, Yorùbá, Hausa, and Igbo).
2. Verifies the customer identity and retrieves the vehicle policy (`AUTO-2026-00182` for Toyota Camry `ABC-123-XY`).
3. Checks expiry dates and validates underwriting eligibility.
4. Generates an actuarial renewal quote (`₦87,500`).
5. Halts at an uncompromising **Authorization Gate** for explicit customer confirmation.
6. Initiates settlement through a payment rail adapter (simulated via mock rail in sandbox; external provider credentials required in production).
7. Independently verifies settlement out-of-band (simulated verification in sandbox; external provider verification in production).
8. Executes policy renewal in the database, rolling forward coverage to 2027.
9. Produces a verifiable digital certificate record (explicitly labeled as simulated non-statutory document in sandbox mode).
10. Dispatches customer notices across in-app, SMS, and email.
11. Cascades future reminders at 30, 14, 7, and 1 days before new expiry.
12. Records every millisecond, actor, tool, and cryptographic token in the **Action Ledger™**.

---

## 2. Key Differentiator

| Traditional AI Assistant | ActionOS Orchestration Layer |
| :--- | :--- |
| **User &rarr; Question &rarr; Text Answer** | **User &rarr; AI Understanding &rarr; Action Plan &rarr; Guardrails &rarr; Authorization Gate &rarr; Sandboxed Tool Execution &rarr; Independent Verification &rarr; Real-World Outcome &rarr; Action Ledger** |
| Passive information retrieval | Active, state-changing business execution |
| Unaudited hallucination risk | Deterministic business rules & cryptographic audit trails |
| Cannot interact with financial rails | Sandboxed, idempotent payment orchestration |

---

## 3. Technology Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, Lucide Icons
- **Backend & Database:** Supabase PostgreSQL with `pgcrypto`, Row Level Security (RLS) on all tables, Supabase Edge Functions
- **AI Engine:** N-ATLAS Provider Adapter with deterministic fallback and multilingual normalization
- **Payment Gateway:** Provider adapter architecture (`lib/payments`) selecting production Paystack (`PAYSTACK_SECRET_KEY`) with fail-closed security, out-of-band settlement verification, and HMAC-SHA512 webhook verification; Flutterwave gateway adapter is scheduled on the integration roadmap
- **Testing:** Node.js native test runner (`tsx --test`) with automated unit, integration, and security regression suites (validated via continuous verification)

---

## 4. Quick Start & Demo Mode

The application includes an offline-ready **Demo Mode** (`ACTIONOS_RUNTIME_MODE=demo`) requiring no external credentials.

### Installation & Clean Dependency Setup

ActionOS enforces reproducible dependency installation across local workstations and GitHub Actions CI pipelines:

```bash
# Clone and enter directory
cd actionos

# 1. Clean, reproducible installation matching CI pipeline (Recommended)
npm ci

# Note on npm install:
# In clean checkouts, 'npm ci' installs exact locked versions from package-lock.json deterministically.
# If executing an incremental 'npm install' in dev environments where peer-dependency 
# version conflicts arise across Next.js / React 19 plugins, use:
# npm install --legacy-peer-deps

# 2. Run verification pipeline
npm run typecheck
npm run lint
npm test
npm run build

# 3. Launch development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the landing page and interactive sandbox.
Visit [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the enterprise operations center.
Visit [http://localhost:3000/actions](http://localhost:3000/actions) for the Action Console.

---

## 5. Integration Status Matrix (Live Guarantees vs. Sandbox Simulation vs. Planned)

To maintain absolute credibility and transparency for NITDA competition judges and enterprise security auditors, ActionOS explicitly labels the operational status of every subsystem across three tiers:

- **LIVE:** Core application domain logic, cryptographic integrity, and database-level invariants fully implemented, enforced, and continuously validated against test suites.
- **SANDBOX:** Realistic end-to-end simulation environment operating without external production network access for reproducible, verifiable demonstration.
- **PLANNED:** Live production credentials, external regulatory gateways, and live bank integrations scheduled for deployment once institutional API keys are provisioned.

| Subsystem / Capability | Status | Implementation Details & Proof of Validation |
| :--- | :--- | :--- |
| **Action State Machine** | 🟢 **LIVE (Domain Logic)** | Deterministic transition graph validated across legal and illegal states in automated test suites (`tests/unit/state-machine.test.ts`). |
| **Underwriting Guardrails** | 🟢 **LIVE (Deterministic Rules)** | Pure function validations for customer ownership, 30-day renewal windows, quote bounds, and financial ceilings (`tests/unit/guardrails.test.ts`). |
| **Cryptographic Action Ledger™** | 🟢 **LIVE (Cryptographic Audit Trail)** | Sequence continuity, genesis linking, Ed25519 digital signatures with key-version aware verification across rotations (`registerLedgerPublicKey`), external checkpoint anchoring (`createLedgerCheckpoint` / `verifyLedgerCheckpoint` detecting database-wide rewrites), and canonical SHA-256 hash chaining covering sequence number, event class, key version, compensating flags, and metadata verified for tamper detection upon persistence and reload (`tests/unit/crypto-ledger.test.ts`, `tests/integration/ledger-persistence-and-privacy.test.ts`). |
| **First-Class Quote Persistence & Canonical Binding** | 🟢 **LIVE (Hardened Quote Integrity)** | Dedicated `quotes` table, unambiguous canonical JSON HMAC-SHA256 signatures binding `provider_reference` and `underwriter_id` with delimiter-collision protection, strict positive amount enforcement, explicit 3-letter currency normalization, non-empty identifiers, atomic authorization claims via single-transaction PostgreSQL RPC with `FOR UPDATE` locks, and immutable `quoteId` binding (`tests/unit/quote-signature-verification.test.ts`, `tests/unit/quote-binding-and-simulation-evidence.test.ts`). |
| **Multi-Tenancy & Tenant-Scoped Access Control** | 🟢 **LIVE (Database Invariant)** | Database-level tenant ownership enforced in update mutations across transactions, sessions, quotes, and steps with Supabase RLS policies (`tests/unit/repositories.test.ts`). |
| **Security Context & Zero Fallback** | 🟢 **LIVE (Security Boundary)** | Server-verified `AuthenticatedExecutionContext` and `WorkflowExecutionContext`. Production configuration fails closed on missing Supabase credentials or demo URLs (`tests/unit/production-security-hardening.test.ts`). |
| **Distributed Saga & Reversal Orchestration** | 🟢 **LIVE ORCHESTRATION / HYBRID ADAPTER** | Truthful compensation state machine persisting explicit canonical states (`refund_confirmed`, `refund_pending`, `refund_failed`, `refund_unknown`) with quote amount and currency validation. Saga rollback verifies exact settlement reversal; queued gateway refunds remain pending until authoritative confirmation via webhook or polling (`tests/unit/atomic-authorization-and-recoverable-execution.test.ts`, `tests/unit/payment-provider-adapters.test.ts`). |
| **Payment Rail (Paystack Gateway)** | 🟢 **LIVE / HYBRID (Hardened Production Adapter & Sandboxed Mock)** | Production mode enforces hardened Paystack adapter (`lib/payments/paystack.ts`) with mandatory `PAYSTACK_SECRET_KEY`, strict initiation validation (verified email format, no generic fallbacks, 2-decimal kobo precision, strict `NGN` currency, non-empty reference), timestamp preservation (`paid_at` optional, local `verifiedAt` recorded separately), authoritative refund lifecycle modeling (`refund_pending` on queue acceptance, `refund_confirmed` on settlement, zero synthetic fallback references), and HMAC-SHA512 webhook signature verification. Payment webhooks enforce fail-closed quote binding (rejecting missing, expired, or inconsistent quotes), mandatory authoritative direct provider verification (matching reference, kobo amount, and currency), atomic PostgreSQL RPC settlement (`settle_payment_webhook`) with distributed row locking (`FOR UPDATE`) preventing concurrent race conditions across separate server instances, and decoupled refund lifecycle state management (`tests/unit/payment-provider-adapters.test.ts`, `tests/integration/supabase-security-and-webhooks.test.ts`). |
| **Payment Rail (Flutterwave Gateway)** | ⚪ **PLANNED (Roadmap)** | Flutterwave payment adapter and webhook verification path are scheduled on the roadmap. Production runtime strictly fails closed if selected before adapter implementation. |
| **Multi-Underwriter Marketplace** | 🟡 **SANDBOX (Actuarial Simulation)** | Actuarial comparison across Leadway, AIICO, AXA Mansard, and Custodian with deterministic quote entities. *(Live underwriter API connectors: PLANNED)* |
| **NIID / Statutory Verification** | 🟡 **SANDBOX (Simulated Regulatory Registry)** | Structured adapter simulating Nigerian Insurance Industry Database (NIID) and FRSC plate validation with realistic regulatory schemas. *(Official NAICOM portal gateway: PLANNED)* |
| **Digital NAICOM Certificate Issuance** | 🟡 **SANDBOX (Simulated Non-Statutory Records)** | Generates digital certificate records with simulated NAICOM registration numbers and cryptographic hash stamping, explicitly watermarked as non-statutory in demo mode (`tests/unit/quote-binding-and-simulation-evidence.test.ts`). *(Official regulator PKI: PLANNED)* |
| **N-ATLAS Multilingual Engine** | 🟡 **SANDBOX / ADAPTER** | Model-agnostic adapter supporting English, Nigerian Pidgin (`pcm`), Yorùbá (`yo`), Hausa (`ha`), and Igbo (`ig`) with deterministic reproducible sandbox. *(Official N-ATLAS Cloud API model slot: PLANNED)* |

---

## 6. Automated Test Suite & Verification Execution

Run the complete verification pipeline from the repository root:
```bash
# 1. Typecheck TypeScript declarations and strict types
npm run typecheck

# 2. Lint code style and ESLint best practices
npm run lint

# 3. Execute unit, integration, and security regression test suites
npm test

# 4. Compile and validate production Next.js build bundle
npm run build
```

The test suites validate:
- The Action State Machine transitions and illegal transition rejections
- Deterministic underwriting guardrails (customAmount validation, renewal windows, pricing ceilings)
- RBAC role permissions & financial caps
- Complete renewal workflow from natural language utterance to certificate issuance and Action Ledger generation
- Security regression suite (zero-fallback, cross-tenant isolation, demo isolation, fail-closed atomic authorization)

---

## 7. Architecture & Security
See detailed specifications in:
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SECURITY.md](./SECURITY.md)

---

## 8. NITDA 2026 Evaluation Notes
- **Benchmark Customer:** Demo Customer (`CUS-000001`)
- **Benchmark Vehicle:** Toyota Camry (`ABC-123-XY`)
- **Benchmark Policy:** `AUTO-2026-00182` (expiring in 7 days, quote: `₦87,500`)
- **Demo Mode Badge:** Displayed clearly across all dashboard headers and simulation cards

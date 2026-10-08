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
6. Initiates settlement through an audited payment rail (Paystack/Flutterwave).
7. Independently verifies settlement out-of-band with the issuing provider.
8. Executes policy renewal in the database, rolling forward coverage to 2027.
9. Produces a verifiable digital NAICOM certificate.
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
- **Payment Gateway:** Sandboxed mock payment provider ready for Paystack & Flutterwave webhooks
- **Testing:** Node.js native test runner (`tsx --test`) with automated unit, integration, and security regression suites (validated via continuous verification)

---

## 4. Quick Start & Demo Mode

The application includes an offline-ready **Demo Mode** (`ACTIONOS_RUNTIME_MODE=demo`) requiring no external credentials.

### Installation
```bash
# Clone and enter directory
cd actionos

# Install dependencies
npm install --legacy-peer-deps

# Run test suite
npm test

# Launch development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the landing page and interactive sandbox.
Visit [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the enterprise operations center.
Visit [http://localhost:3000/actions](http://localhost:3000/actions) for the Action Console.

---

## 5. Verification & Capability Status Matrix

To provide complete transparency for NITDA competition judges and enterprise security reviewers, ActionOS categorizes each capability into four architectural readiness tiers:

| Subsystem / Capability | Readiness Tier | Implementation & Verification Status |
| :--- | :--- | :--- |
| **Action State Machine** | 🟢 **Implemented & Tested** | Deterministic transition graph validated across legal and illegal states in automated test suites (`tests/unit/state-machine.test.ts`). |
| **Underwriting Guardrails** | 🟢 **Implemented & Tested** | Pure function validations for customer ownership, 30-day renewal windows, quote bounds, and financial ceilings (`tests/unit/guardrails.test.ts`). |
| **Cryptographic Action Ledger™** | 🟢 **Implemented & Tested** | SHA-256 hash chaining, genesis linking, and HMAC token signing verified for tamper detection (`tests/unit/crypto-ledger.test.ts`). |
| **First-Class Quote Persistence & Binding** | 🟢 **Implemented & Tested** | Dedicated `quotes` table, SHA-256 tamper-evident payload verification, and immutable `quoteId` authorization binding (`tests/unit/quote-binding-and-simulation-evidence.test.ts`). |
| **Security Context & Zero Fallback** | 🟢 **Implemented & Tested** | Server-verified `AuthenticatedExecutionContext` and `WorkflowExecutionContext`. Zero production identity fallback (`tests/unit/production-security-hardening.test.ts`). |
| **Repository Layer & Multi-Tenancy** | 🟢 **Implemented & Tested** | Dual Supabase/Demo container abstraction with hierarchical tenant verification (`tests/unit/repositories.test.ts`). |
| **Multi-Insurer Quotation Marketplace** | 🟢 **Implemented & Tested** | Actuarial comparison across Leadway, AIICO, AXA Mansard, and Custodian (`tests/integration/marketplace-and-niid.test.ts`). |
| **Distributed Saga & Auto-Refund** | 🟢 **Implemented & Tested** | Automated compensating transaction triggered upon downstream document failure (`tests/integration/renewal-workflow.test.ts`). |
| **Supabase PostgreSQL & RLS Policies** | 🟡 **Implemented (Syntax & Schema Verified)** | 15 tables and RLS policies verified in automated schema test suite (`tests/integration/schema-migration.test.ts`). Live deployment requires cloud Supabase project link. |
| **NIID / Statutory Verification** | 🟠 **Simulated in Demo Sandbox** | Structured adapter simulating Nigerian Insurance Industry Database (NIID) and FRSC plate validation with realistic regulatory schemas. |
| **Payment Rail (Paystack / Flutterwave)** | 🟠 **Simulated in Demo Sandbox** | Sandboxed provider simulating initialization, webhook callbacks, and independent verification. Live settlement requires production gateway keys. |
| **Digital NAICOM Certificate Issuance** | 🟠 **Simulated in Demo Sandbox** | Generates verifiable digital certificate records with simulated NAICOM registration numbers and cryptographic hash stamping. |
| **N-ATLAS Multilingual Adapter** | 🟢 **Adapter Implemented with Reproducible Engine** | ActionOS is model-agnostic. N-ATLAS is the intended Nigerian-language intelligence provider (supporting English, Nigerian Pidgin, Yorùbá, Hausa, and Igbo), while the deterministic provider allows the complete action-execution system to operate 100% reproducibly in competition environments. |

---

## 6. Automated Test Suite Execution

Run the automated test harness from the repository root:
```bash
npm test
```
The test suite validates:
- The Action State Machine transitions
- Deterministic underwriting guardrails
- RBAC role permissions & financial caps
- Complete renewal workflow from natural language utterance to certificate issuance and Action Ledger generation
- Security regression suite (zero-fallback, cross-tenant isolation, demo isolation)

---

## 7. Architecture & Security
See detailed specifications in:
- [ARCHITECTURE.md](file:///C:/Users/PC/.gemini/antigravity-ide/scratch/actionos/ARCHITECTURE.md)
- [SECURITY.md](file:///C:/Users/PC/.gemini/antigravity-ide/scratch/actionos/SECURITY.md)

---

## 8. NITDA 2026 Evaluation Notes
- **Benchmark Customer:** Demo Customer (`CUS-000001`)
- **Benchmark Vehicle:** Toyota Camry (`ABC-123-XY`)
- **Benchmark Policy:** `AUTO-2026-00182` (expiring in 7 days, quote: `₦87,500`)
- **Demo Mode Badge:** Displayed clearly across all dashboard headers and simulation cards

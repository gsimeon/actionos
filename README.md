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

## 5. Acceptance Test Verification

To run the automated end-to-end acceptance test:
```bash
npm test
```
The test suite validates:
- The Action State Machine transitions
- Deterministic underwriting guardrails
- RBAC role permissions & financial caps
- Complete renewal workflow from natural language utterance to certificate issuance and Action Ledger generation

---

## 6. Architecture & Security
See detailed specifications in:
- [ARCHITECTURE.md](file:///C:/Users/PC/.gemini/antigravity-ide/scratch/actionos/ARCHITECTURE.md)
- [SECURITY.md](file:///C:/Users/PC/.gemini/antigravity-ide/scratch/actionos/SECURITY.md)

---

## 7. NITDA 2026 Evaluation Notes
- **Benchmark Customer:** Demo Customer (`CUS-000001`)
- **Benchmark Vehicle:** Toyota Camry (`ABC-123-XY`)
- **Benchmark Policy:** `AUTO-2026-00182` (expiring in 7 days, quote: `₦87,500`)
- **Demo Mode Badge:** Displayed clearly across all dashboard headers and simulation cards

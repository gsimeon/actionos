# ActionOS — AI Action & Workflow Orchestration Layer

> **Tagline:** *“N-ATLAS gives AI a Nigerian voice. ActionOS gives that voice the ability to act.”*  
> **Entry for:** 2026 NITDA National AI Innovation Challenge for Nigerians  
> **Initial Verticals:** ActionOS Renew (Motor Insurance, Vehicle Licenses, Health HMO, Driver's Licenses)

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
- **Payment Gateway:** Multi-rail provider adapter architecture (`lib/payments`) supporting Paystack (`PAYSTACK_SECRET_KEY`, HMAC-SHA512 webhook signatures) and Flutterwave (`FLUTTERWAVE_SECRET_KEY`, constant-time `verif-hash` header verification). Both adapters are fully implemented with fail-closed security, out-of-band settlement verification, and authoritative 4-state refund lifecycle modeling; currently validated against sandbox and test suites, awaiting verified live production merchant credentials.
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

## 5. Integration Status Matrix (Verified Live vs. Implemented Adapters vs. Sandbox Simulation)

To maintain absolute credibility and transparent distinction between verified real-world infrastructure, implemented client adapters awaiting production credentials, and reproducible sandbox simulations, ActionOS classifies every subsystem into four precise categories:

1. 🟢 **VERIFIED LIVE INFRASTRUCTURE / ENGINE:** Core application domain logic, cryptographic integrity, and database-level invariants fully implemented, enforced, and continuously certified against live cloud staging environments (e.g. 27/27 Supabase database invariants verified live in CI).
2. 🔵 **IMPLEMENTED ADAPTER (Awaiting Production Credentials):** Production-grade HTTP client adapters implemented with full schema validation, HMAC signature checks, strict type normalization, and fail-closed error handling (`*GatewayError`), currently operating against sandbox fixtures in test/demo mode while awaiting institutional production API keys.
3. 🟡 **SANDBOX BENCHMARK & SIMULATION ENVIRONMENT:** Deterministic, reproducible local simulation engines and interactive UI consoles for end-to-end workflow validation, statutory cross-check testing, and payment failure-path demonstrations without external network dependencies.
4. ⚪ **PLANNED:** Institutional connectors scheduled for post-competition production rollout.

| Subsystem / Capability | Operational Status | Implementation Details & Proof of Validation |
| :--- | :--- | :--- |
| **Supabase Security & RLS Invariants** | 🟢 **VERIFIED LIVE INFRASTRUCTURE** | Certified against live Supabase staging database: 15/15 core tables verified, unauthenticated reads denied (0 rows returned), and 5/5 privileged RPC execution privileges revoked from anonymous/public roles (`scripts/verify-supabase-staging.mjs`, GitHub Actions Run #39082494342). |
| **Action State Machine** | 🟢 **VERIFIED LIVE ENGINE** | Deterministic transition graph validated across legal and illegal states in automated test suites (`tests/unit/state-machine.test.ts`). |
| **Underwriting Guardrails** | 🟢 **VERIFIED LIVE ENGINE** | Pure function validations for customer ownership, 30-day renewal windows, quote bounds, and financial ceilings (`tests/unit/guardrails.test.ts`). |
| **Cryptographic Action Ledger™** | 🟢 **VERIFIED LIVE ENGINE** | Sequence continuity, genesis linking, Ed25519 digital signatures with key-version aware verification across rotations (`registerLedgerPublicKey`), external checkpoint anchoring (`createLedgerCheckpoint` / `verifyLedgerCheckpoint` detecting database-wide rewrites), and canonical SHA-256 hash chaining covering sequence number, event class, key version, compensating flags, and metadata verified for tamper detection upon persistence and reload (`tests/unit/crypto-ledger.test.ts`, `tests/integration/ledger-persistence-and-privacy.test.ts`). |
| **First-Class Quote Persistence & Binding** | 🟢 **VERIFIED LIVE ENGINE** | Dedicated `quotes` table, unambiguous canonical JSON HMAC-SHA256 signatures binding `provider_reference` and `underwriter_id` with delimiter-collision protection, strict positive amount enforcement, explicit 3-letter currency normalization, non-empty identifiers, atomic authorization claims via single-transaction PostgreSQL RPC with `FOR UPDATE` locks, and immutable `quoteId` binding (`tests/unit/quote-signature-verification.test.ts`, `tests/unit/quote-binding-and-simulation-evidence.test.ts`). |
| **Multi-Tenancy & Tenant-Scoped Access Control** | 🟢 **VERIFIED LIVE ENGINE** | Database-level tenant ownership enforced in update mutations across transactions, sessions, quotes, and steps with Supabase RLS policies (`tests/unit/repositories.test.ts`). |
| **Distributed Saga & Reversal Orchestration** | 🟢 **VERIFIED LIVE ENGINE** | Truthful compensation state machine persisting explicit canonical states (`refund_confirmed`, `refund_pending`, `refund_failed`, `refund_unknown`) with quote amount and currency validation. Saga rollback verifies exact settlement reversal; queued gateway refunds remain pending until authoritative confirmation via webhook or polling (`tests/unit/atomic-authorization-and-recoverable-execution.test.ts`, `tests/unit/payment-provider-adapters.test.ts`). |
| **N-ATLAS Multilingual Engine** | 🔵 **IMPLEMENTED ADAPTER (Awaiting Production Credentials)** / 🟡 **BENCHMARK SANDBOX** | Model-agnostic adapter (`lib/ai/n-atlas.ts`) supporting English, Nigerian Pidgin (`pcm`), Yorùbá (`yo`), Hausa (`ha`), and Igbo (`ig`). Configured for official N-ATLAS Cloud API endpoints (`N_ATLAS_API_ENDPOINT`, `N_ATLAS_API_KEY`, model: `n-atlas-multilingual`). Enforces strict verification mode (`N_ATLAS_STRICT_MODE=true` fails fast via `NAtlasConnectionError` to prevent silent fallback masking on missing keys or network errors), transparent telemetry stamping (`_aiProvider`, `_isLiveAI`, `_officialServiceVerified`, and `_fallbackReason`), and reproducible offline benchmark sandbox (`tests/unit/frsc-and-live-handshakes.test.ts`). |
| **Payment Rail (Paystack Gateway)** | 🔵 **IMPLEMENTED ADAPTER (Awaiting Production Credentials)** / 🟡 **SANDBOX** | Production mode enforces hardened Paystack adapter (`lib/payments/paystack.ts`) with mandatory `PAYSTACK_SECRET_KEY`, strict initiation validation (verified email format, 2-decimal kobo precision, strict `NGN` currency, non-empty reference), timestamp preservation, authoritative refund lifecycle modeling (`refund_pending` on queue acceptance, `refund_confirmed` on settlement), and HMAC-SHA512 webhook signature verification. Payment webhooks enforce fail-closed quote binding, direct provider verification (matching reference, kobo amount, and currency), reversing records (`transaction_type: "refund"`) with negative amounts, partial-refund accounting with cumulative refund caps (`CUMULATIVE_REFUND_LIMIT_EXCEEDED`), and atomic PostgreSQL RPC settlement (`settle_payment_webhook`) with distributed row locking (`FOR UPDATE`) preventing double-settlement (`tests/unit/payment-provider-adapters.test.ts`, `tests/integration/supabase-security-and-webhooks.test.ts`). |
| **Payment Rail (Flutterwave Gateway)** | 🔵 **IMPLEMENTED ADAPTER (Awaiting Production Credentials)** / 🟡 **SANDBOX** | Production mode enforces hardened Flutterwave adapter (`lib/payments/flutterwave.ts`) with mandatory `FLUTTERWAVE_SECRET_KEY`, strict initiation validation (RFC-compliant verified email, positive amount with 2-decimal Naira precision, `NGN` currency enforcement), out-of-band transaction verification by `tx_ref` or numeric ID, authoritative 4-state refund lifecycle mapping with out-of-band numeric ID resolution, and constant-time secret hash validation (`crypto.timingSafeEqual` over `verif-hash` header). Multi-rail webhook handler (`app/api/webhooks/payment/route.ts`) handles `charge.completed` and `refund.completed` events (`tests/unit/flutterwave-payment-adapter.test.ts`). |
| **Vehicle License & LACVIS Roadworthiness Gateway** | 🔵 **IMPLEMENTED ADAPTER (Awaiting Production Credentials)** / 🟡 **SANDBOX** | Production mode enforces hardened LACVIS gateway adapter (`lib/integrations/lacvis.ts`) with mandatory `LACVIS_API_KEY`, statutory brake efficiency thresholds (84% passing vs. 70% statutory minimum), computerized emissions testing, test center validation, fail-closed live API error handling (`LacvisGatewayError`), and sandbox fixtures (`tests/unit/frsc-and-lacvis-regulatory-adapters.test.ts`, `tests/unit/vehicle-license-and-roadworthiness.test.ts`). |
| **FRSC NVIS Statutory Vehicle Registry Gateway** | 🔵 **IMPLEMENTED ADAPTER (Awaiting Production Credentials)** / 🟡 **SANDBOX** | Production mode enforces hardened FRSC NVIS gateway adapter (`lib/integrations/frsc.ts`) with mandatory `FRSC_API_KEY`, strict Nigerian plate format normalization (`validatePlateNumber`), National Driver's License verification (`validateDriverLicense`), active theft flag cross-verification in `VerifyNiidTool` preventing stolen vehicle underwriting, fail-closed live API error classification (`FrscGatewayError`), and reproducible sandbox fixtures (`tests/unit/frsc-and-lacvis-regulatory-adapters.test.ts`, `tests/unit/frsc-and-live-handshakes.test.ts`). |
| **NIID & NAICOM Statutory Portal Gateway** | 🔵 **IMPLEMENTED ADAPTER (Awaiting Production Credentials)** / 🟡 **SANDBOX** | Production mode enforces hardened NIID gateway adapter (`lib/integrations/niid.ts`) with mandatory `NIID_API_KEY`, live policy registry verification preventing duplicate active insurance (`NIID_ACTIVE_POLICY_CONFLICT`), statutory NAICOM e-sticker generation (`NAICOM-STK-${year}`), digital certificate verification hash stamping (`GenerateCertificateTool`), fail-closed API error classification (`NiidGatewayError`), and test fixtures (`tests/unit/niid-statutory-adapter.test.ts`, `tests/integration/marketplace-and-niid.test.ts`). |
| **Health HMO Policy Renewal (NHIA Gateway)** | 🔵 **IMPLEMENTED ADAPTER (Awaiting Production Credentials)** / 🟡 **SANDBOX** | Production mode enforces hardened NHIA gateway adapter (`lib/integrations/nhia.ts`) with mandatory `NHIA_API_KEY`, biometric NIN cross-validation, 4-tier health benefit management, primary healthcare provider (HCP) assignment, digital HMO ID card issuance with cryptographic verification hashes, and dedicated API endpoint `POST /api/health/renew-hmo` (`tests/unit/hmo-and-drivers-license-endpoints.test.ts`). |
| **FRSC National Driver's License Renewal** | 🔵 **IMPLEMENTED ADAPTER (Awaiting Production Credentials)** / 🟡 **SANDBOX** | Production mode enforces hardened FRSC gateway adapter (`lib/integrations/frsc.ts`) for Driver's License renewals (`RenewDriverLicenseTool`, `POST /api/licensing/renew-driver-license`), statutory 3-year and 5-year duration validity rules, physical biometric capture appointment scheduling across 36 state commands, and downloadable temporary driving permits with vector QR verification (`tests/unit/hmo-and-drivers-license-endpoints.test.ts`). |
| **Interactive Regulatory & Webhook Simulator** | 🟡 **SANDBOX BENCHMARK & SIMULATION ENVIRONMENT** | Real-time simulator console embedded in the enterprise dashboard (`POST /api/simulator`, `components/dashboard/regulatory-webhook-simulator.tsx`) enabling 1-click statutory trifecta probing (FRSC/LACVIS/NIID), multi-rail payment webhook dispatch with cryptographic HMAC-SHA512 / secret hash generation and signature tampering tests, and 1-click NITDA 2026 competition scenarios (`tests/unit/interactive-simulator-api.test.ts`). |
| **WhatsApp Omnichannel Interactive Simulator UI** | 🟡 **SANDBOX BENCHMARK & SIMULATION ENVIRONMENT** | Interactive mobile-styled WhatsApp bot simulator (`components/actionos/whatsapp-simulator-modal.tsx`) providing realistic conversational prompts across Nigerian Pidgin, Yorùbá, Hausa, and Igbo, 1-click [Authorize Renewal] action buttons, out-of-band payment webhooks, and simulated statutory notification dispatches. |
| **Statutory Certificate PDF Generator & Download API** | 🟢 **VERIFIED LIVE ENGINE** | Zero-dependency pure TypeScript PDF-1.4 binary engine (`lib/documents/pdf-generator.ts`) generating certified vector certificates with official authority seals, SHA-256 Merkle proofs, and scannable verification QR codes across all 4 verticals. Direct streaming binary download API route at `GET /api/documents/[id]/download` (`tests/unit/documents-pdf-download.test.ts`). |
| **Public Statutory Verification Portal & Offline PWA** | 🟢 **VERIFIED LIVE ENGINE** | Unauthenticated field verification portal at `/verify` for enforcement officers (FRSC, VIO) and hospital desks. Parses query parameters (`?cert=`, `?plate=`, `?id=`) embedded in QR codes. Backed by Progressive Web App manifest (`manifest.json`) and service worker (`sw.js`) for offline verification on remote highways (`tests/unit/public-verifier-portal.test.ts`). |
| **Sovereign Multilingual Voice Synthesis & Dictation** | 🟢 **VERIFIED LIVE ENGINE** | Dual-mode speech interaction (`components/voice/voice-action-button.tsx`) supporting Web Speech API recognition and native `SpeechSynthesis` audio playback across Nigerian Pidgin, Yorùbá, Hausa, Igbo, and English with instant transcription into the Action Console. |
| **Verifiable Vector QR Statutory Document Generator** | 🟢 **VERIFIED LIVE ENGINE** | High-fidelity printable statutory document generator (`components/actionos/statutory-document-viewer.tsx`) with zero-dependency native SVG vector QR code synthesis, cryptographic SHA-256 verification stamps, statutory authority seals (NAICOM, Lagos State MVAA, NHIA, FRSC), and full print-ready layouts. |
| **Multi-Underwriter Marketplace** | 🟡 **SANDBOX (Actuarial Simulation)** / ⚪ **PLANNED** | Actuarial comparison across Leadway, AIICO, AXA Mansard, and Custodian with deterministic quote entities. *(Direct underwriter B2B API integrations: PLANNED)* |

---

## 6. Automated Test Suite & Verification Execution

Run the complete verification pipeline from the repository root:
```bash
# 0. ALL-IN-ONE EVALUATOR BENCHMARK (Recommended for NITDA Challenge Judges)
# Runs dependency checks, Supabase security invariants, all 730 unit/integration tests, and 16-step Merkle demo in 36s:
npm run benchmark

# 1. Typecheck TypeScript declarations and strict types
npm run typecheck

# 2. Lint code style and ESLint best practices (0 warnings, 0 errors)
npm run lint

# 3. Execute unit, integration, and security regression test suites (730 tests across 194 suites)
npm test

# 4. Run Supabase Database Reliability Gate
# Offline mode (local PRs / development without live credentials):
npm run db:verify:offline

# Staging-required mode (fails fast if staging database/RLS/RPCs are unavailable):
npm run db:verify:staging

# 5. Compile and validate production Next.js build bundle (36 routes via Turbopack)
npm run build
```

The test suites validate:
- The Action State Machine transitions and illegal transition rejections
- Deterministic underwriting guardrails (customAmount validation, renewal windows, pricing ceilings)
- RBAC role permissions & financial caps
- Complete renewal workflow from natural language utterance to certificate issuance and Action Ledger generation
- Security regression suite (zero-fallback, cross-tenant isolation, demo isolation, fail-closed atomic authorization)
- Statutory 5-agency gateways: FRSC NVIS plate/DL normalization, theft flags, LACVIS computerized roadworthiness, NIID policy verification, NHIA health enrollees
- Multi-rail payment gateways (Paystack kobo conversion + HMAC-SHA512, Flutterwave Naira + verif-hash)
- Interactive Simulator API (`POST /api/simulator`) probe dispatch, webhook simulation, and 9 competition scenarios
- Public Verification Portal (`/verify`) parameter parsing, stolen vehicle red alert, and Merkle hash validation
- Pure TypeScript PDF-1.4 binary certificate generator and streaming download route

---

## 7. Architecture & Security
See detailed specifications in:
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SECURITY.md](./SECURITY.md)

---

## 8. NITDA 2026 Evaluation Notes & Interactive Demonstration
- **Interactive Simulator Panel:** Navigate to `/dashboard` to launch the **Regulatory & Webhook Simulator** directly above the Readiness Matrix.
- **Action Console Multilingual Presets:** Navigate to `/actions` to run interactive prompt presets across English, Nigerian Pidgin, Yorùbá, Hausa, and Igbo spanning Motor Insurance, Vehicle Licensing, NHIA Health HMO, and FRSC Driver's Licenses.
- **WhatsApp Omnichannel Simulator:** Click the WhatsApp button in the Operations Center or header to open the realistic mobile simulator with 1-click action triggers and out-of-band message feeds.
- **Verifiable Vector QR Certificates:** View and print high-resolution statutory documents (NAICOM Insurance Certificate, Lagos MVAA Vehicle License, NHIA Digital HMO Card, FRSC Temporary Driver's Permit) with native vector QR codes and cryptographic verification hashes.
- **1-Click Competition Scenarios:**
  - *Stolen Vehicle Prevention:* Trigger `STOLEN-999-XX` to observe immediate underwriting halt by FRSC theft detection at `VerifyNiidTool`.
  - *Brake Efficiency Denial:* Trigger `FAIL-123-XX` to observe computerized vehicle inspection failure (52% brake efficiency vs. 70% statutory minimum).
  - *Active Policy Conflict:* Trigger `ACTIVE-999-OK` to observe duplicate policy prevention on the NIID central registry.
  - *Health HMO Autonomous Renewal:* Trigger `NHIA-00829104` via Action Console or `/api/health/renew-hmo` to generate a verifiable digital HMO card and assign an accredited HCP.
  - *FRSC Driver's License Renewal:* Trigger `FRSC-LA-2024-009182` via Action Console or `/api/licensing/renew-driver-license` to generate a temporary permit and schedule physical biometric capture.
- **Multi-Rail Webhook Demonstrations:** Inject simulated Paystack (`charge.success`, `refund.processed`) or Flutterwave (`charge.completed`, `refund.completed`) events, verify HMAC-SHA512 / secret hash verification, and test fail-closed signature tampering rejection.
- **Benchmark Customer:** Demo Customer (`CUS-000001`)
- **Benchmark Vehicle:** Toyota Camry (`ABC-123-XY`)
- **Benchmark Policy:** `AUTO-2026-00182` (expiring in 7 days, quote: `₦87,500`)
- **Demo Mode Badge:** Displayed clearly across all dashboard headers and simulation cards


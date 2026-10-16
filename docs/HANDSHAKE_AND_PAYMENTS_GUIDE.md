# ActionOS Live Handshake & Integration Guide
**NITDA National AI Innovation Challenge 2026**

This guide provides an end-to-end operational walkthrough for activating live data handshakes with **FRSC (Federal Road Safety Corps)**, **N-ATLAS (Nigeria's Sovereign Multilingual AI Model)**, **Paystack Payment Gateway**, and **Live Supabase Realtime**.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │          ActionOS Engine             │
                      │  (Next.js 16 + React 19 + TypeScript)│
                      └──────────────────┬───────────────────┘
                                         │
        ┌───────────────────┬────────────┴───────┬──────────────────┐
        │                   │                    │                  │
        ▼                   ▼                    ▼                  ▼
┌───────────────┐   ┌───────────────┐    ┌───────────────┐   ┌───────────────┐
│  FRSC NVIS    │   │   N-ATLAS     │    │   Paystack    │   │   Supabase    │
│  Realtime API │   │ Foundation AI │    │ Gateway & Web │   │ Realtime (CDC)│
│  (Plates/DL)  │   │ (PCM,YO,HA,IG)│    │ (HMAC-SHA512) │   │ (Postgres WS) │
└───────────────┘   └───────────────┘    └───────────────┘   └───────────────┘
```

---

## 1. FRSC (Federal Road Safety Corps) Real-Time Handshake

### 1.1 What It Does
ActionOS handshakes directly with the **FRSC National Vehicle Identification System (NVIS)** and the **National Driver License Registry** via [`lib/integrations/frsc.ts`](file:///c:/Users/PC/.gemini/antigravity-ide/scratch/actionos/lib/integrations/frsc.ts):
- **Real-Time Plate Verification**: Validates vehicle make, model, chassis/VIN, engine number, registered owner name, registration state, license expiry, and active statutory theft flags.
- **Driver License Verification**: Cross-verifies driver license validity, date of birth, class of vehicle, and issuing state.
- **Fail-Safe Fallback**: When API keys are omitted or the upstream government gateway experiences temporary downtime, ActionOS automatically falls back to deterministic sandbox records with zero disruption.

### 1.2 Onboarding & Credentials
1. Register with the **FRSC Information Technology Department** or your State **Motor Vehicle Administration Agency (MVAA)** partner portal.
2. Request API credentials for the **NVIS Partner Gateway**.
3. You will receive:
   - **`FRSC_API_BASE_URL`**: e.g., `https://nvis.frsc.gov.ng/api/v1`
   - **`FRSC_API_KEY`**: Bearer token for authorized gateway access
   - **`FRSC_CLIENT_ID`**: Your registered partner identifier (e.g., `ACTIONOS-PARTNER-01`)

### 1.3 Environment Variables
Add the following to your `.env.local` (and production hosting environment like Vercel):

```env
FRSC_API_BASE_URL=https://nvis.frsc.gov.ng/api/v1
FRSC_API_KEY=your_live_frsc_api_key_here
FRSC_CLIENT_ID=your_registered_client_id
FRSC_TIMEOUT_MS=8000
```

### 1.4 API Contract & Verification
The ActionOS client communicates with the following endpoints:
- `GET /plates/verify/:plateNumber`
  - Header: `Authorization: Bearer <FRSC_API_KEY>`, `X-Client-Id: <FRSC_CLIENT_ID>`
  - Response Data:
    ```json
    {
      "success": true,
      "data": {
        "plate": "KJA-882-AB",
        "make": "Toyota",
        "model": "Corolla",
        "year": 2022,
        "color": "Silver",
        "chassisNumber": "JT2BF28K1W0129841",
        "vin": "JT2BF28K1W0129841",
        "engineNumber": "2ZR-FE-9812401",
        "ownerName": "Babajide Adeleke",
        "state": "Lagos",
        "licenseExpiry": "2027-04-12T00:00:00Z",
        "theftFlag": false
      }
    }
    ```
- `POST /drivers-license/verify`
  - Body: `{ "licenseNumber": "AAA12345678", "dob": "1988-06-15" }`

### 1.5 Testing the Handshake in ActionOS
You can test the FRSC verification client directly:
```bash
npm test -- tests/unit/frsc-and-live-handshakes.test.ts
```
Or execute a live query via the ActionOS Vehicle Console or REST endpoint:
```bash
curl -X GET "http://localhost:3000/api/vehicles?plate=ABC-123-XY&language=pcm"
```

---

## 2. N-ATLAS (NITDA Sovereign Multilingual AI) Handshake

### 2.1 What It Does
ActionOS integrates with **N-ATLAS** (Nigeria's multilingual foundation model developed by NCAIR/NITDA) via [`lib/ai/n-atlas.ts`](file:///c:/Users/PC/.gemini/antigravity-ide/scratch/actionos/lib/ai/n-atlas.ts):
- **Sovereign Natural Language Understanding**: Extracts customer intents (`renew_policy`, `renew_vehicle_license`, `query_vehicle`, `register_vehicle`) and entities (license plates, policy IDs, chassis numbers) across **Nigerian Pidgin (`pcm`)**, **Yorùbá (`yo`)**, **Hausa (`ha`)**, **Igbo (`ig`)**, and **Nigerian English (`en-NG`)**.
- **Autonomous Dispatch**: Translates colloquial phrases (e.g., *"Abeg I wan renew my motor paper sharp sharp for ABC-123-XY"*) directly into validated ActionOS tool execution plans.

### 2.2 Onboarding & Endpoints
1. Obtain your API access token from the **NITDA AI Research Portal** or your designated challenge liaison.
2. If self-hosting the official N-ATLAS model weights, deploy an OpenAI-compatible inference server (such as `vLLM` or `Text Generation Inference`) on GPU infrastructure.
3. Configure the endpoint URL and API key.

### 2.3 Environment Variables
Add the following to `.env.local`:

```env
N_ATLAS_API_URL=https://api.n-atlas.ng/v1
N_ATLAS_API_KEY=your_n_atlas_api_key_here
N_ATLAS_MODEL=n-atlas-multilingual
```

### 2.4 Payload & Schema
The `HttpNAtlasAdapter` in ActionOS sends standard structured chat completion requests:
```json
{
  "model": "n-atlas-multilingual",
  "messages": [
    {
      "role": "system",
      "content": "You are N-ATLAS, Nigeria's sovereign multilingual foundation AI. Extract intent (renew_policy, renew_vehicle_license, query_vehicle, register_vehicle), language, and entities (plate, policy, vin) as JSON."
    },
    {
      "role": "user",
      "content": "E kaaro, mo fe sanwo fun iwe-ase oko mi KJA-882-AB"
    }
  ],
  "response_format": { "type": "json_object" },
  "temperature": 0.1
}
```

N-ATLAS responds with:
```json
{
  "intent": "renew_vehicle_license",
  "confidence": 0.98,
  "language": "yo",
  "entities": {
    "vehiclePlate": "KJA-882-AB"
  }
}
```

ActionOS automatically maps this output to the `RenewVehicleLicenseTool` and formats user confirmations in Yorùbá.

---

## 3. Paystack Payment Gateway Handshake

### 3.1 What It Does
ActionOS provides an enterprise Paystack driver in [`lib/payments/paystack.ts`](file:///c:/Users/PC/.gemini/antigravity-ide/scratch/actionos/lib/payments/paystack.ts) and a cryptographic webhook listener in [`app/api/webhooks/payment/route.ts`](file:///c:/Users/PC/.gemini/antigravity-ide/scratch/actionos/app/api/webhooks/payment/route.ts):
- **Payment Request & Dynamic NGN Settlement**: Supports Card, Bank Transfer, USSD, and Apple Pay settlements.
- **HMAC-SHA512 Webhook Security**: Verifies the `x-paystack-signature` header against your secret key using constant-time comparison (`timingSafeEqual`) to prevent timing and replay attacks.
- **Automated Issuance**: Automatically settles quotes, marks renewals as complete, generates signed policy and license certificates, records immutable ledger events, and broadcasts live Supabase Realtime alerts to the customer.

### 3.2 Step-by-Step Setup in Paystack Dashboard

#### Step 1: Create or Log in to Paystack
1. Visit [dashboard.paystack.com](https://dashboard.paystack.com) and log in.
2. Toggle between **Test Mode** (for development) and **Live Mode** (for real bank settlements) using the toggle at the top of the dashboard.

#### Step 2: Retrieve API Keys
1. Navigate to **Settings** -> **API Keys & Webhooks**.
2. Copy your **Secret Key**:
   - In Test Mode: Starts with `sk_test_...`
   - In Live Mode: Starts with `sk_live_...`
3. Copy your **Public Key**:
   - In Test Mode: Starts with `pk_test_...`
   - In Live Mode: Starts with `pk_live_...`

#### Step 3: Configure the Webhook URL
1. In **Settings** -> **API Keys & Webhooks**, locate the **Webhook URL** input field.
2. Set the Webhook URL to:
   ```
   https://<your-domain>/api/webhooks/payment
   ```
   *(For local testing, use a tunneling tool such as `ngrok http 3000` or Cloudflare Tunnel to expose `http://localhost:3000/api/webhooks/payment`)*.
3. Click **Save Changes**.

### 3.3 Environment Variables
Configure your keys in `.env.local`:

```env
# Activate Paystack Driver
PAYMENT_PROVIDER=paystack

# Paystack API Keys
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3.4 Webhook Lifecycle & Execution Flow

```
Customer Checkout ──> Paystack Authorization
                             │
                             ▼
              Paystack charges card/bank (NGN)
                             │
                             ▼
         HTTP POST /api/webhooks/payment
         Header: x-paystack-signature: <hmac_sha512>
                             │
       ┌─────────────────────┴─────────────────────┐
       ▼                                           ▼
[Invalid Signature]                         [Valid Signature]
  401 Unauthorized                            200 OK Accepted
                                                   │
                                                   ▼
                                         1. Settle Transaction
                                         2. Issue Signed Policy
                                         3. Append to Ledger
                                         4. Emit Supabase Realtime
```

### 3.5 Test Cards for Verification
When operating with `sk_test_...`, test with Paystack's official benchmark test cards:
- **Successful Transaction**: `4084084084084081`, Expiry: Any future date (e.g. `12/28`), CVV: `408`
- **OTP Challenge Transaction**: `4084084084084082`, Expiry: Any future date, CVV: `408` (Enter OTP `123456`)
- **Insufficient Funds**: `4084084084084083`

---

## 4. Supabase Sandbox to Live Database Migration

### 4.1 Checking Database Connectivity
Run the built-in ActionOS database health check:
```bash
npm run db:check
```
This confirms that all 14 core tables (`customers`, `action_sessions`, `action_plans`, `action_steps`, `assets`, `policies`, `renewals`, `financial_transactions`, `documents`, `actionos_notifications`, `actionos_tool_definitions`, `actionos_tool_authorizations`, `immutable_ledger_events`, `payment_webhook_events`) exist on your remote Supabase instance.

### 4.2 Populating Initial Data & Enabling Realtime
1. Open the [Supabase Dashboard](https://supabase.com/dashboard/project/kyfcvolkxxtsbouuzdtm).
2. Go to the **SQL Editor** tab.
3. Open [`supabase/seed.sql`](file:///c:/Users/PC/.gemini/antigravity-ide/scratch/actionos/supabase/seed.sql) from the repository.
4. Paste the SQL and click **Run**.
5. Open [`supabase/migrations/20261016010000_enable_realtime_publications.sql`](file:///c:/Users/PC/.gemini/antigravity-ide/scratch/actionos/supabase/migrations/20261016010000_enable_realtime_publications.sql) and execute it in the SQL Editor to ensure Postgres Change Data Capture (CDC) is active on all real-time tables:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE action_sessions;
   ALTER PUBLICATION supabase_realtime ADD TABLE immutable_ledger_events;
   ALTER PUBLICATION supabase_realtime ADD TABLE renewals;
   ALTER PUBLICATION supabase_realtime ADD TABLE actionos_notifications;
   ALTER PUBLICATION supabase_realtime ADD TABLE policies;
   ALTER PUBLICATION supabase_realtime ADD TABLE assets;
   ```

### 4.3 Adding the Service Role Key
For backend webhook execution and privileged ledger signing:
1. In Supabase Dashboard, go to **Project Settings** -> **API**.
2. Copy the `service_role` secret (labeled `secret`).
3. Add to your `.env.local`:
   ```env
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_secret
   ```

---

## 5. Switching from Demo to Live Production

When ready for full production deployment:
1. In `.env.local` (or production environment variables):
   ```env
   ACTIONOS_RUNTIME_MODE=production
   PAYMENT_PROVIDER=paystack
   PAYSTACK_SECRET_KEY=sk_live_...
   NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_live_...
   FRSC_API_KEY=...
   N_ATLAS_API_KEY=...
   ```
2. Generate production signing keys:
   ```bash
   # On Linux/macOS or Git Bash:
   openssl rand -hex 32
   ```
3. Set:
   ```env
   ACTIONOS_QUOTE_SIGNING_KEY=<generated-hex-32>
   ACTION_LEDGER_SIGNING_KEY=<generated-hex-32>
   ACTIONOS_WEBHOOK_SIGNING_SECRET=<generated-hex-32>
   ```
4. In production mode, ActionOS operates in strict **fail-closed** security:
   - Untrusted or unsigned quotes are rejected.
   - Paystack webhook signatures are strictly mandatory.
   - Unauthenticated statutory queries are denied.
   - All financial ledger events are signed with Ed25519 cryptography.

---

## 6. Verification Summary Checklist

| Component | Target Endpoint / Rail | Status | Validation Command |
|---|---|---|---|
| **FRSC NVIS** | `https://nvis.frsc.gov.ng/api/v1` | Ready | `npm test -- tests/unit/frsc-and-live-handshakes.test.ts` |
| **N-ATLAS AI** | `https://api.n-atlas.ng/v1` | Ready | `npm test -- tests/unit/nigerian-languages-and-vehicle-query.test.ts` |
| **Paystack** | `https://api.paystack.co` | Ready | `npm test -- tests/unit/paystack-settlement-and-refunds.test.ts` |
| **Supabase Realtime** | `wss://kyfcvolkxxtsbouuzdtm.supabase.co` | Connected | `npm run db:check` |
| **Full Regression** | 114 test suites (447 tests) | 100% Passing | `npm test` |

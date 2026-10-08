import React from "react";
import { ActionLedger } from "@/components/actionos/action-ledger";
import {
  ShieldCheck,
  Hash,
  Lock,
} from "lucide-react";
import type { ActionLedgerEvent } from "@/types/actionos";

const BENCHMARK_EVENTS: ActionLedgerEvent[] = [
  {
    id: "ev_001_intent",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.120Z",
    action: "intent_detection",
    description: "Input received via web: 'My car insurance expires next week. Check it and renew it for me.'",
    status: "verified",
    actor: "User",
    tool: "n_atlas_multilingual_parser",
    hash: "a1c7f4281352e8d99c43831885994f1c1f5139049a463ad258416d231b48901a",
    previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
    signature: "hmac_sha256_sig_genesis_001_valid",
  },
  {
    id: "ev_002_customer",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.350Z",
    action: "customer_lookup",
    description: "Retrieved customer Demo Customer (CUS-000001) in tenant a0000000-0000-0000-0000-000000000001",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "get_customer",
    hash: "b2d8e5392463f9e00d54942996005e2d2e6240150b574be369527e342c59012b",
    previousHash: "a1c7f4281352e8d99c43831885994f1c1f5139049a463ad258416d231b48901a",
    signature: "hmac_sha256_sig_cust_002_valid",
  },
  {
    id: "ev_003_policy",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.580Z",
    action: "policy_lookup",
    description: "Retrieved policy AUTO-2026-00182 for Toyota Camry (ABC-123-XY). Expiration: 2026-10-14",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "get_policy",
    hash: "c3e9f64035740af11e65053007116f3e3f7351261c685cf470638f453d60123c",
    previousHash: "b2d8e5392463f9e00d54942996005e2d2e6240150b574be369527e342c59012b",
    signature: "hmac_sha256_sig_pol_003_valid",
  },
  {
    id: "ev_004_niid",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:01.810Z",
    action: "regulatory_verification",
    description: "Statutory FRSC & NIID database query verified plate ABC-123-XY legitimacy with Leadway Assurance",
    status: "verified",
    actor: "Policy Guardrail",
    tool: "verify_niid_statutory",
    hash: "d4fa075146851ba22f7616411822704f408462372d796da5817490564e71234d",
    previousHash: "c3e9f64035740af11e65053007116f3e3f7351261c685cf470638f453d60123c",
    signature: "hmac_sha256_sig_niid_004_valid",
  },
  {
    id: "ev_005_quote",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:02.040Z",
    action: "quote_generation",
    description: "Generated and persisted quote quo_leadway_001 for ₦87,500 across 4 underwriters",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "generate_quote",
    hash: "e50b186257962cb33087275229338150519573483e8a7eb6928501675f82345e",
    previousHash: "d4fa075146851ba22f7616411822704f408462372d796da5817490564e71234d",
    signature: "hmac_sha256_sig_quote_005_valid",
  },
  {
    id: "ev_006_auth_gate",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:02.270Z",
    action: "authorization_requested",
    description: "Halted at Authorization Gate: Explicit human consent required for ₦87,500 debit",
    status: "verified",
    actor: "Policy Guardrail",
    hash: "f61c297368073dc44198386330449261620684594f9b8fc7039612786093456f",
    previousHash: "e50b186257962cb33087275229338150519573483e8a7eb6928501675f82345e",
    signature: "hmac_sha256_sig_authreq_006_valid",
  },
  {
    id: "ev_007_auth_confirmed",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:04.500Z",
    action: "authorization_confirmed",
    description: "Customer authorized renewal: ₦87,500 via biometric passkey bound to quote quo_leadway_001",
    status: "verified",
    actor: "User",
    hash: "072d3a8479184ed552094974415503727317956050ac90d81407238971045670",
    previousHash: "f61c297368073dc44198386330449261620684594f9b8fc7039612786093456f",
    signature: "hmac_sha256_sig_authconf_007_valid",
  },
  {
    id: "ev_008_payment_init",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:04.730Z",
    action: "payment_initiation",
    description: "Initiated settlement for ₦87,500 to Leadway Assurance via Paystack Sandbox Gateway",
    status: "verified",
    actor: "Payment Gateway",
    tool: "initiate_payment",
    hash: "183e4b9580295fe663105085526614838428067161bd01e92518349082156781",
    previousHash: "072d3a8479184ed552094974415503727317956050ac90d81407238971045670",
    signature: "hmac_sha256_sig_payinit_008_valid",
  },
  {
    id: "ev_009_payment_verify",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:05.100Z",
    action: "payment_verification",
    description: "Out-of-band verification confirmed ₦87,500 settled with ref pay_ref_2026_00182",
    status: "verified",
    actor: "Payment Gateway",
    tool: "verify_payment",
    hash: "294f5ca6913060f774216196637725949539178272ce12fa3629450193267892",
    previousHash: "183e4b9580295fe663105085526614838428067161bd01e92518349082156781",
    signature: "hmac_sha256_sig_payver_009_valid",
  },
  {
    id: "ev_010_renew",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:05.340Z",
    action: "policy_renewal",
    description: "Executed database renewal for AUTO-2026-00182: new expiry date 2027-10-14",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "renew_policy",
    hash: "3a506db70241710885327207748836050640289383df230b47305612043789a3",
    previousHash: "294f5ca6913060f774216196637725949539178272ce12fa3629450193267892",
    signature: "hmac_sha256_sig_ren_010_valid",
  },
  {
    id: "ev_011_cert",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:05.600Z",
    action: "document_issuance",
    description: "Issued digital NAICOM certificate NAICOM-CERT-2026-00182 with SHA-256 seal",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "generate_certificate",
    hash: "4b617ec81352821996438318859947161751390494e0341c5841672315489ab4",
    previousHash: "3a506db70241710885327207748836050640289383df230b47305612043789a3",
    signature: "hmac_sha256_sig_cert_011_valid",
  },
  {
    id: "ev_012_notify",
    sessionId: "act_benchmark_camry_001",
    timestamp: "2026-10-08T20:00:05.820Z",
    action: "notification_dispatch",
    description: "Dispatched multi-channel notifications across SMS (+2348011111111), Email, and In-App",
    status: "verified",
    actor: "ActionOS Engine",
    tool: "send_notification",
    hash: "5c728fd92463932007549429960058272862401505f1452d6952783426590bc5",
    previousHash: "4b617ec81352821996438318859947161751390494e0341c5841672315489ab4",
    signature: "hmac_sha256_sig_notif_012_valid",
  },
];

export default function ActionLedgerPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Cryptographic Action Ledger™ Inspector
          </h1>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 border border-emerald-200">
            MERKLE HASH CHAINING
          </span>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Every autonomous AI action, guardrail validation, financial settlement, and statutory certificate issuance is cryptographically linked with SHA-256 and HMAC digital signatures.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase mb-1">
            <Lock className="w-4 h-4" />
            <span>Non-Repudiation</span>
          </div>
          <div className="text-lg font-black text-slate-900">100% Signed Blocks</div>
          <p className="text-xs text-slate-500 mt-1">
            HMAC digital signatures bind every event to the authorized orchestrator key.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase mb-1">
            <Hash className="w-4 h-4" />
            <span>Genesis Hash Chain</span>
          </div>
          <div className="text-lg font-black text-slate-900">Sequential SHA-256</div>
          <p className="text-xs text-slate-500 mt-1">
            Each event embeds the cryptographic hash of its predecessor, creating a tamper-evident audit trail.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Zero Tamper Guarantee</span>
          </div>
          <div className="text-lg font-black text-slate-900">Instant Detection</div>
          <p className="text-xs text-slate-500 mt-1">
            Any modification of historical amounts or dates invalidates the entire downstream chain.
          </p>
        </div>
      </div>

      <ActionLedger
        events={BENCHMARK_EVENTS}
        sessionId="act_benchmark_camry_001"
        workflowTitle="Complete 12-Stage Benchmark Vehicle Insurance Renewal Ledger"
      />
    </div>
  );
}

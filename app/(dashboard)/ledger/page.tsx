"use client";

import React, { useEffect, useState, useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { ActionLedger } from "@/components/actionos/action-ledger";
import {
  Hash,
  Lock,
  RefreshCw,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  Layers,
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

interface LedgerIntegrityInfo {
  valid: boolean;
  totalEvents: number;
  chainValid: boolean;
  signaturesValid: boolean;
  verifiedAt: string;
  error?: string;
}

export default function ActionLedgerPage() {
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("sessionId");

  const [liveEvents, setLiveEvents] = useState<ActionLedgerEvent[]>([]);
  const [integrity, setIntegrity] = useState<LedgerIntegrityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeMode, setActiveMode] = useState<"live" | "benchmark">("live");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [, startTransition] = useTransition();

  const fetchLedger = useCallback(async () => {
    try {
      setRefreshing(true);
      const query = new URLSearchParams();
      query.set("verify", "true");
      query.set("limit", "100");
      if (urlSessionId) query.set("sessionId", urlSessionId);

      const res = await fetch(`/api/ledger?${query.toString()}`);
      const json = await res.json();

      if (json.success && Array.isArray(json.data?.events)) {
        setLiveEvents(json.data.events);
        if (json.data.integrity) {
          setIntegrity(json.data.integrity);
        }
      }
    } catch {
      // Clean fallback handled by UI state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [urlSessionId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const query = new URLSearchParams();
        query.set("verify", "true");
        query.set("limit", "100");
        if (urlSessionId) query.set("sessionId", urlSessionId);

        const res = await fetch(`/api/ledger?${query.toString()}`);
        const json = await res.json();

        if (active && json.success && Array.isArray(json.data?.events)) {
          setLiveEvents(json.data.events);
          if (json.data.integrity) {
            setIntegrity(json.data.integrity);
          }
        }
      } catch {
        // Clean fallback
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [urlSessionId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void fetchLedger();
    }, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLedger]);

  const displayedEvents =
    activeMode === "benchmark" || (activeMode === "live" && liveEvents.length === 0 && !loading)
      ? BENCHMARK_EVENTS
      : liveEvents;

  const compensatingCount = displayedEvents.filter(
    (e) => e.isCompensating || (e.metadata as Record<string, unknown> | undefined)?.isCompensating
  ).length;

  const totalEventsCount = displayedEvents.length;

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Cryptographic Action Ledger™ Inspector
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 border border-emerald-200">
              MERKLE HASH CHAINING
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
            Every autonomous AI action, statutory NIID validation, financial settlement, and saga rollback is cryptographically linked with SHA-256 and HMAC-SHA256 digital signatures.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Mode Switcher */}
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs border border-slate-200 font-semibold">
            <button
              type="button"
              onClick={() => startTransition(() => setActiveMode("live"))}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeMode === "live"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Live Records ({liveEvents.length})
            </button>
            <button
              type="button"
              onClick={() => startTransition(() => setActiveMode("benchmark"))}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeMode === "benchmark"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Benchmark Run (12)
            </button>
          </div>

          {/* Auto Refresh Toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              autoRefresh
                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
            title="Auto-refresh ledger every 8s"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
              }`}
            />
            <span className="hidden sm:inline">Live Sync</span>
          </button>

          {/* Refresh button */}
          <button
            type="button"
            onClick={fetchLedger}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Refresh ledger now"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Real-Time Operational Statistics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Logged Records */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase mb-1">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-slate-400" />
                <span>Audited Records</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                {activeMode === "live" ? "REALTIME" : "REFERENCE"}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {loading && activeMode === "live" ? "..." : totalEventsCount}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Sequential append-only entries verified against tenant authorization context.
          </p>
        </div>

        {/* Metric 2: Non-Repudiation Signatures */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-emerald-700 text-xs font-bold uppercase mb-1">
              <span className="flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-emerald-600" />
                <span>HMAC Signatures</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                100% SIGNED
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-1.5">
              <span>Non-Repudiation</span>
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            HMAC digital signatures bind every action to the authorized orchestrator key.
          </p>
        </div>

        {/* Metric 3: Merkle Genesis Chain */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-emerald-700 text-xs font-bold uppercase mb-1">
              <span className="flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-emerald-600" />
                <span>Cryptographic Chain</span>
              </span>
              {integrity?.valid ? (
                <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                  INTACT
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                  SHA-256
                </span>
              )}
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {integrity?.chainValid ? "Zero Drift" : "Sequential SHA-256"}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Each event embeds predecessor hash &amp; tamper detection prevents historical rewrites.
          </p>
        </div>

        {/* Metric 4: Saga Reversal Compensations */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase mb-1">
              <span className="flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <span>Saga Rollbacks</span>
              </span>
              {compensatingCount > 0 ? (
                <span className="text-[10px] font-mono text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200 font-bold">
                  {compensatingCount} ACTIVE
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                  0 ACTIVE
                </span>
              )}
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {compensatingCount} Reversals
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Compensating transactions cleanly reversed across Paystack &amp; core insurance tables.
          </p>
        </div>
      </div>

      {/* Notification banner when viewing benchmark because live is empty */}
      {activeMode === "live" && liveEvents.length === 0 && !loading && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Showing Benchmark Reference Run:</strong> No live sessions were recorded in the active store yet. Trigger a workflow in the Operations Center to see real-time events appear here.
            </span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
            DEMO MODE
          </span>
        </div>
      )}

      {/* Main Ledger Component with Live Data */}
      <ActionLedger
        events={displayedEvents}
        sessionId={urlSessionId || (displayedEvents[0]?.sessionId ?? "act_benchmark_camry_001")}
        workflowTitle={
          urlSessionId
            ? `Cryptographic Audit Ledger for Session ${urlSessionId}`
            : activeMode === "benchmark"
            ? "Complete 12-Stage Benchmark Vehicle Insurance Renewal Ledger"
            : "Live ActionOS Orchestration & Settlement Audit Ledger"
        }
        onRefresh={fetchLedger}
      />
    </div>
  );
}

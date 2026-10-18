"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Lock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Radio,
  FileCheck2,
  CreditCard,
  Database,
  Building,
  Key,
} from "lucide-react";

interface IntegrationItem {
  id: string;
  name: string;
  category: string;
  tier: "live_verified" | "sandbox_adapter" | "pending_credentials";
  statusText: string;
  operatingMode: string;
  contractStatus: string;
  notes: string;
  testEvidence: string;
  details?: Record<string, string>;
}

const INTEGRATIONS: IntegrationItem[] = [
  // Tier 1: Live & Production Verified
  {
    id: "supabase_realtime_cdc",
    name: "Supabase PostgreSQL & Realtime CDC",
    category: "Data Layer & Persistence",
    tier: "live_verified",
    statusText: "Live Staging Certified",
    operatingMode: "Live WebSockets + PostgreSQL RLS",
    contractStatus: "Active Staging Project Verified",
    notes: "15 core tables verified in PostgREST catalog. Anonymous access restricted via 42501 RLS policies. Sensitive RPC functions execution explicitly revoked.",
    testEvidence: "scripts/verify-supabase-staging.mjs (--require-service-role)",
    details: {
      "Target Host": "kyfcvolkxxtsbouuzdtm.supabase.co",
      "Table Catalog": "15 tables protected by RLS",
      "Privileged RPCs": "settle_payment_webhook, reserve_refund_balance, admin_reset_tenant_data",
      "WebSocket Protocol": "PostgreSQL replication CDC stream",
    },
  },
  {
    id: "crypto_merkle_ledger",
    name: "Cryptographic Action Ledger",
    category: "Non-Repudiation Audit",
    tier: "live_verified",
    statusText: "Cryptographically Verified",
    operatingMode: "Mathematical Invariant (SHA-256 Chaining)",
    contractStatus: "Active Non-Repudiation Protocol",
    notes: "Chronologically chained Merkle hash tree. Every event links to predecessor via previousHash. Zero tolerance for retroactive audit tampering.",
    testEvidence: "tests/unit/complete-renewal-sandbox-proof.test.ts (verifyLedgerIntegrity)",
    details: {
      "Hash Algorithm": "SHA-256 with hex encoding",
      "Genesis Block": "0000000000000000000000000000000000000000000000000000000000000000",
      "Verification Mode": "Full chain mathematical validation with timingSafeEqual",
    },
  },
  {
    id: "server_auth_context",
    name: "Server-Side Execution Context & Identity",
    category: "Security & Authorization",
    tier: "live_verified",
    statusText: "Zero-Trust Server Verified",
    operatingMode: "Supabase Auth SSR / Verified Operator Secret",
    contractStatus: "Enforced at API Gateway Boundary",
    notes: "Never trusts client-supplied identity headers (e.g. x-role: admin is rejected with 401). Derives tenant, customer, and role strictly on server.",
    testEvidence: "tests/unit/production-security-hardening.test.ts",
    details: {
      "Session Authority": "createServerClient (@supabase/ssr) with secure cookies",
      "Role Spoofing Guard": "Client-supplied x-role rejected (HTTP 401)",
      "Multi-Tenant Isolation": "Org A vs Org B row-level tenant context isolation",
    },
  },

  // Tier 2: Implemented & Tested Sandbox Adapters
  {
    id: "paystack_sandbox_rail",
    name: "Paystack Gateway Rail",
    category: "Payment & Settlement",
    tier: "sandbox_adapter",
    statusText: "Sandbox Certified (Test Keys)",
    operatingMode: "HMAC-SHA512 Webhook + Out-of-Band Settlement",
    contractStatus: "Implemented API Adapter (Paystack v1)",
    notes: "Timing-safe constant-time HMAC signature verification, kobo-to-naira precision conversion, in-memory & database deduplication cache.",
    testEvidence: "tests/unit/paystack-hardening-regression.test.ts",
    details: {
      "Signature Header": "x-paystack-signature (HMAC-SHA512)",
      "Supported Channels": "Card, Bank Transfer, USSD, Apple Pay",
      "Deduplication Invariant": "Duplicate deliveries return HTTP 200 with duplicate: true",
    },
  },
  {
    id: "flutterwave_sandbox_rail",
    name: "Flutterwave Gateway Rail",
    category: "Payment & Settlement",
    tier: "sandbox_adapter",
    statusText: "Sandbox Certified (verif-hash)",
    operatingMode: "Secret Hash Header + Transaction Verification",
    contractStatus: "Implemented API Adapter (Flutterwave v3)",
    notes: "Constant-time verif-hash validation, multi-currency Pan-African support, 4-state refund lifecycle (pending, processed, failed, unknown).",
    testEvidence: "tests/unit/flutterwave-payment-adapter.test.ts",
    details: {
      "Verification Header": "verif-hash secret header",
      "Verification Endpoint": "GET /v3/transactions/verify_by_reference",
      "Refund State Machine": "succeeded, refund_failed, refund_unknown, refund_pending",
    },
  },
  {
    id: "frsc_nvis_adapter",
    name: "FRSC National Vehicle Identification (NVIS)",
    category: "Statutory Regulatory Rail",
    tier: "sandbox_adapter",
    statusText: "Sandbox Adapter (Tested Fixtures)",
    operatingMode: "Deterministic Government Sandbox + NVIS API Contract",
    contractStatus: "Partner API Specification Implemented",
    notes: "Validates vehicle plates (make, model, VIN, registered owner) and active theft flags. Fails safe to deterministic sandbox fixtures if gateway is unreachable.",
    testEvidence: "tests/unit/frsc-and-live-handshakes.test.ts",
    details: {
      "Endpoints Implemented": "GET /plates/verify/:plate, GET /license/verify/:dl",
      "Benchmark Plates": "ABC-123-XY (Passing), STOLEN-999-XX (Theft Flagged)",
      "Fail-Safe Fallback": "Zero downtime deterministic sandbox fallback",
    },
  },
  {
    id: "lacvis_inspection_adapter",
    name: "LACVIS Computerized Vehicle Inspection",
    category: "Roadworthiness Regulatory Rail",
    tier: "sandbox_adapter",
    statusText: "Sandbox Adapter (Tested Fixtures)",
    operatingMode: "Computerized 4-Point Inspection Benchmark",
    contractStatus: "Implemented LACVIS Verification Contract",
    notes: "Validates brake efficiency (70% threshold), suspension, computerized alignment, and emissions. Enforces re-test requirements before vehicle license renewal.",
    testEvidence: "tests/unit/frsc-and-lacvis-regulatory-adapters.test.ts",
    details: {
      "Statutory Authority": "Lagos State MVAA & LACVIS",
      "Benchmark Thresholds": "Brakes >= 70%, Suspension >= 60%, Emissions Compliant",
      "Inspection Benchmark": "FAIL-123-XX (42% brakes) triggers STATUTORY_DENIAL",
    },
  },
  {
    id: "niid_statutory_adapter",
    name: "NIID / NAICOM Motor Insurance Registry",
    category: "Statutory Insurance Registry",
    tier: "sandbox_adapter",
    statusText: "Sandbox Adapter (Tested Fixtures)",
    operatingMode: "E-Sticker Pre-Clearance & Certificate Verification",
    contractStatus: "Implemented NIID Protocol Contract",
    notes: "Validates active policy conflicts (240-day active coverage rule), issues cryptographic NIID certificates, generates QR verification URLs.",
    testEvidence: "tests/unit/niid-statutory-adapter.test.ts",
    details: {
      "Statutory Authority": "National Insurance Commission (NAICOM) / NIA",
      "E-Sticker Token": "Cryptographic pre-clearance token issued per renewal",
      "Conflict Invariant": "ACTIVE-999-OK prevents illegal duplicate coverage purchase",
    },
  },
  {
    id: "n_atlas_multilingual_ai",
    name: "N-ATLAS Sovereign Foundation AI",
    category: "Indigenous Multilingual AI",
    tier: "sandbox_adapter",
    statusText: "Hybrid (Local Adapter + Remote Endpoint)",
    operatingMode: "Multilingual Zero-Shot Intent & Entity Extraction",
    contractStatus: "Implemented Sovereign Model Contract",
    notes: "Understands Nigerian Pidgin, Yorùbá, Hausa, Igbo, and Nigerian English with high fidelity. Deterministic local adapter fallback ensures zero downtime in offline mode.",
    testEvidence: "tests/unit/nigerian-languages-and-vehicle-query.test.ts",
    details: {
      "Languages Certified": "Nigerian Pidgin (pcm), Yorùbá (yo), Hausa (ha), Igbo (ig), English (en-NG)",
      "Supported Verticals": "Motor Insurance, Vehicle License, LACVIS Inspection, NHIA HMO, Driver's License",
    },
  },

  // Tier 3: Pending Production Commercial Credentials
  {
    id: "paystack_live_credentials",
    name: "Paystack Commercial Production Account",
    category: "Production Merchant Rail",
    tier: "pending_credentials",
    statusText: "Awaiting Live Merchant Secret",
    operatingMode: "sk_live_... (Live Settlement)",
    contractStatus: "Commercial Onboarding Underway",
    notes: "Codebase is 100% production-ready. Once live Paystack merchant keys are injected into environment, ActionOS settles real NGN debits through live banks.",
    testEvidence: "Architecture and webhook verification certified via sandbox test keys.",
    details: {
      "Required Environment Variable": "PAYSTACK_SECRET_KEY=sk_live_...",
      "Status": "Awaiting live production merchant account clearance",
    },
  },
  {
    id: "flutterwave_live_credentials",
    name: "Flutterwave Commercial Production Account",
    category: "Production Merchant Rail",
    tier: "pending_credentials",
    statusText: "Awaiting Live Secret Hash",
    operatingMode: "FLWSECK_LIVE-... (Live Settlement)",
    contractStatus: "Merchant Compliance Verification",
    notes: "Implemented adapter with out-of-band verification and refund coordinator. Awaiting live merchant compliance approval.",
    testEvidence: "Architecture and webhook verification certified via sandbox test keys.",
    details: {
      "Required Environment Variable": "FLUTTERWAVE_SECRET_HASH=flw_live_...",
      "Status": "Compliance documentation submitted",
    },
  },
  {
    id: "frsc_vpn_government_gateway",
    name: "FRSC Direct Government VPN Gateway",
    category: "Government Enterprise Gateway",
    tier: "pending_credentials",
    statusText: "MOU In Progress / Dedicated IP Pending",
    operatingMode: "Direct HTTPS over Dedicated Government VPN",
    contractStatus: "Government Partner Engagement",
    notes: "Official institutional partnership engagement initiated. Sandbox adapter fully simulates identical API contract with zero disruption.",
    testEvidence: "Deterministic sandbox validated in tests/unit/frsc-and-live-handshakes.test.ts",
    details: {
      "Integration Phase": "Partner API Agreement & Static IP Whitelisting",
      "Gateway Target": "https://nvis.frsc.gov.ng/api/v1 (Direct Partner Portal)",
    },
  },
];

export function IntegrationStatusMatrix() {
  const [filterTier, setFilterTier] = useState<"all" | "live_verified" | "sandbox_adapter" | "pending_credentials">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredIntegrations = INTEGRATIONS.filter((item) => {
    if (filterTier === "all") return true;
    return item.tier === filterTier;
  });

  const liveCount = INTEGRATIONS.filter((i) => i.tier === "live_verified").length;
  const sandboxCount = INTEGRATIONS.filter((i) => i.tier === "sandbox_adapter").length;
  const pendingCount = INTEGRATIONS.filter((i) => i.tier === "pending_credentials").length;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              ActionOS Integration Reality &amp; Service Status Matrix
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Honest architectural classification: clearly distinguishing verified live services, implemented sandbox adapters, and integrations awaiting production credentials.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200 shrink-0 text-xs font-bold">
          <button
            type="button"
            onClick={() => setFilterTier("all")}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
              filterTier === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All Systems ({INTEGRATIONS.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTier("live_verified")}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              filterTier === "live_verified" ? "bg-emerald-600 text-white shadow-xs" : "text-emerald-800 hover:text-emerald-950"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-300" />
            <span>Live Verified ({liveCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTier("sandbox_adapter")}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              filterTier === "sandbox_adapter" ? "bg-amber-600 text-white shadow-xs" : "text-amber-800 hover:text-amber-950"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-300" />
            <span>Tested Sandbox ({sandboxCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTier("pending_credentials")}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              filterTier === "pending_credentials" ? "bg-slate-700 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>Awaiting Live Keys ({pendingCount})</span>
          </button>
        </div>
      </div>

      {/* Grid of integration cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredIntegrations.map((item) => {
          const isExpanded = expandedId === item.id;
          const isLive = item.tier === "live_verified";
          const isSandbox = item.tier === "sandbox_adapter";

          return (
            <div
              key={item.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                isLive
                  ? "border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/60"
                  : isSandbox
                  ? "border-amber-200 bg-amber-50/20 hover:bg-amber-50/50"
                  : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono tracking-wide ${
                      isLive
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : isSandbox
                        ? "bg-amber-100 text-amber-900 border border-amber-300"
                        : "bg-slate-200 text-slate-800 border border-slate-300"
                    }`}
                  >
                    {isLive ? "🟢 LIVE VERIFIED" : isSandbox ? "🟡 TESTED SANDBOX" : "⚪ PENDING PROD KEYS"}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">{item.category}</span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
                  <div className="text-xs font-semibold text-slate-700 mt-0.5">{item.statusText}</div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{item.notes}</p>

                <div className="pt-2 border-t border-slate-200/60 text-[11px] space-y-1">
                  <div className="text-slate-500">
                    Mode: <strong className="text-slate-800">{item.operatingMode}</strong>
                  </div>
                  <div className="text-slate-500">
                    Evidence: <code className="text-emerald-800 font-bold font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200">{item.testEvidence}</code>
                  </div>
                </div>

                {isExpanded && item.details && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono space-y-1 animate-in fade-in duration-150">
                    {Object.entries(item.details).map(([k, v]) => (
                      <div key={k} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-0.5 border-b border-slate-800 last:border-none">
                        <span className="text-slate-400 font-sans text-[10px]">{k}:</span>
                        <span className="text-emerald-400 text-right truncate max-w-xs">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 mt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-400 font-mono">{item.contractStatus}</span>
                {item.details && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="text-[11px] font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  >
                    <span>{isExpanded ? "Hide Details" : "Inspect Specs"}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

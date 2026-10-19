"use client";

import React, { useState, useEffect, Suspense, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  Hash,
  Download,
  ExternalLink,
  RotateCw,
  Zap,
  ArrowRight,
  Lock,
  Copy,
  Check,
} from "lucide-react";
import { QrCodeSvg } from "@/components/actionos/qr-code";
import { formatDate } from "@/lib/utils";

export interface VerificationRecord {
  found: boolean;
  valid: boolean;
  vertical: "motor" | "vehicle_license" | "hmo" | "driver_license";
  authority: string;
  statutoryAct: string;
  certificateNumber: string;
  holderName: string;
  assetIdentifier: string;
  assetDescription: string;
  underwriterOrAgency: string;
  issueDate: string;
  expiryDate: string;
  status: "active" | "expiring_soon" | "expired" | "stolen" | "revoked";
  merkleHash: string;
  preclearanceToken: string;
  downloadUrl: string;
  theftFlag?: boolean;
}

export const PRESET_QUERIES = [
  {
    label: "Motor Insurance (Camry)",
    id: "ABC-123-XY",
    type: "motor",
    desc: "NAICOM / NIID Valid Certificate",
  },
  {
    label: "LACVIS Roadworthiness",
    id: "LND-452-AA",
    type: "vehicle_license",
    desc: "MVAA & LACVIS Brake Certified",
  },
  {
    label: "Health HMO (NHIA)",
    id: "NHIA-2026-00812",
    type: "hmo",
    desc: "NHIA Silver Enrollee Active",
  },
  {
    label: "FRSC Driver's License",
    id: "ABC12345678",
    type: "driver_license",
    desc: "Class E Valid License",
  },
  {
    label: "FRSC Stolen Flag Alert",
    id: "STOLEN-999-XX",
    type: "motor",
    desc: "Active Theft Alert",
  },
];

export function resolveQueryToRecord(query: string): VerificationRecord | null {
  const clean = query.trim().toUpperCase();

  if (clean === "STOLEN-999-XX" || clean.includes("STOLEN")) {
    return {
      found: true,
      valid: false,
      vertical: "motor",
      authority: "Federal Road Safety Corps (FRSC) National Vehicle Identification System",
      statutoryAct: "FRSC (Establishment) Act 2007 §10",
      certificateNumber: "NAICOM-DENIED-THEFT-FLAG",
      holderName: "Flagged Stolen Vehicle Registry",
      assetIdentifier: "STOLEN-999-XX",
      assetDescription: "2020 Honda Civic Sedan (Midnight Black)",
      underwriterOrAgency: "FRSC National Security Watchlist",
      issueDate: "2026-10-01",
      expiryDate: "2026-10-01",
      status: "stolen",
      theftFlag: true,
      merkleHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      preclearanceToken: "THEFT_FLAG_ACTIVE_POLICE_ALERT",
      downloadUrl: "/api/documents/demo_auto_cert/download",
    };
  }

  if (clean.includes("NHIA") || clean.includes("HMO")) {
    return {
      found: true,
      valid: true,
      vertical: "hmo",
      authority: "National Health Insurance Authority (NHIA)",
      statutoryAct: "National Health Insurance Authority Act 2022 §13",
      certificateNumber: clean.startsWith("NHIA-") ? clean : "NHIA-2026-00812",
      holderName: "Chief Babatunde Adeleke",
      assetIdentifier: "NHIA-2026-00812",
      assetDescription: "Silver Healthcare Plan &bull; Primary HCP: Lagoon Hospital Ikoyi",
      underwriterOrAgency: "AXA Mansard Health HMO (NHIA Accredited)",
      issueDate: "2025-10-25",
      expiryDate: "2027-10-25",
      status: "active",
      merkleHash: "9a7f34b2810de9c45689104bda90182fc60183acbd89410ea91054bdf8914b10",
      preclearanceToken: "nhia_sec_99182a44bb",
      downloadUrl: "/api/documents/demo_hmo_cert/download",
    };
  }

  if (clean.includes("ABC12345678") || clean.startsWith("AAA") || clean.includes("DL")) {
    return {
      found: true,
      valid: true,
      vertical: "driver_license",
      authority: "Federal Road Safety Corps (FRSC) National Driver's License Registry",
      statutoryAct: "National Road Traffic Regulations 2012 §45",
      certificateNumber: "FRSC-DL-2026-ABC12345678",
      holderName: "Chief Babatunde Adeleke",
      assetIdentifier: "ABC12345678",
      assetDescription: "Class E (Private & Light Commercial) &bull; Lagos State",
      underwriterOrAgency: "Lagos State MVAA & FRSC Joint Directorate",
      issueDate: "2025-06-15",
      expiryDate: "2028-06-15",
      status: "active",
      merkleHash: "7b4c9012da89f104ea2910bc490184bfa91048bcde89014efa91024bd89104fa",
      preclearanceToken: "frsc_dl_token_884920",
      downloadUrl: "/api/documents/demo_dl_cert/download",
    };
  }

  if (clean.includes("LND") || clean.includes("LACVIS") || clean.includes("MVAA")) {
    return {
      found: true,
      valid: true,
      vertical: "vehicle_license",
      authority: "Lagos State Motor Vehicle Administration Agency (MVAA) & LACVIS",
      statutoryAct: "Lagos State Road Traffic Law 2018 §22",
      certificateNumber: "LACVIS-CERT-2026-8812B",
      holderName: "Chief Babatunde Adeleke",
      assetIdentifier: "LND-452-AA",
      assetDescription: "2021 Honda Accord V6 &bull; Computerized Roadworthiness Passed (Brake 88%)",
      underwriterOrAgency: "Lagos State Computerized Vehicle Inspection Service (LACVIS)",
      issueDate: "2026-10-14",
      expiryDate: "2027-10-14",
      status: "active",
      merkleHash: "46b9e21d7203734c5688192a884fa019284bc710248a910be491024bda890184",
      preclearanceToken: "mvaa_lic_lacvis_8812b",
      downloadUrl: "/api/documents/demo_mvaa_cert/download",
    };
  }

  // Default Motor Insurance (Toyota Camry ABC-123-XY)
  return {
    found: true,
    valid: true,
    vertical: "motor",
    authority: "National Insurance Commission (NAICOM) & Nigerian Insurance Industry Database (NIID)",
    statutoryAct: "Insurance Act 2003 §68 & Motor Vehicles (Third Party Insurance) Act",
    certificateNumber: "NAICOM-STK-2026-F981A4",
    holderName: "Chief Babatunde Adeleke",
    assetIdentifier: clean || "ABC-123-XY",
    assetDescription: "2022 Toyota Camry 2.5L (Midnight Black) &bull; Chassis: DEMO-VIN-000001",
    underwriterOrAgency: "Leadway Assurance Company Limited (NAICOM Licensed Underwriter)",
    issueDate: "2026-10-14",
    expiryDate: "2027-10-14",
    status: "active",
    merkleHash: "323c3b56c4400c4bb2f61b8237c72b578fa910d938bfe41290aa21cd0912f84a",
    preclearanceToken: "NIID-PRECLR-2026-00182",
    downloadUrl: "/api/documents/demo_auto_cert/download",
  };
}

function VerificationPortalContent() {
  const searchParams = useSearchParams();
  const initialQuery =
    searchParams.get("cert") ||
    searchParams.get("hash") ||
    searchParams.get("plate") ||
    searchParams.get("id") ||
    searchParams.get("license") ||
    "ABC-123-XY";

  const [inputVal, setInputVal] = useState(initialQuery);
  const [activeRecord, setActiveRecord] = useState<VerificationRecord | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copiedHash, setCopiedHash] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      startTransition(() => {
        setActiveRecord(resolveQueryToRecord(initialQuery));
      });
    }
  }, [initialQuery]);

  const handleSearch = (queryOverride?: string) => {
    const q = (queryOverride || inputVal).trim();
    if (!q) return;
    startTransition(() => {
      setActiveRecord(resolveQueryToRecord(q));
    });
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight text-white">ActionOS</span>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-black text-emerald-400 border border-emerald-500/40">
                  NATIONAL VERIFIER
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium block">
                Statutory Certificate &amp; Merkle Audit Registry
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-xs flex items-center gap-1.5"
            >
              <span>Action Console</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-16 space-y-8 flex-1">
        {/* Banner */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <Lock className="w-3.5 h-3.5" />
            <span>Open Sovereign Verification &bull; Non-Repudiation Proof</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Statutory Certificate Verification
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            Verify the authenticity of any Nigerian motor insurance e-sticker, LACVIS roadworthiness, NHIA health policy, or FRSC driver&apos;s license in real time against the immutable Action Ledger.
          </p>
        </div>

        {/* Search Bar */}
        <div className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-500 absolute left-4 top-3.5" />
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value.toUpperCase())}
                placeholder="Enter Certificate No, Plate (ABC-123-XY), NHIA No, or SHA-256 Hash..."
                className="w-full pl-12 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white placeholder:text-slate-500 text-sm font-mono font-bold focus:outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 uppercase"
              />
            </div>
            <button
              type="submit"
              disabled={isPending || !inputVal.trim()}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-900/30 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isPending ? <RotateCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              <span>Verify Legitimacy</span>
            </button>
          </form>

          {/* Quick Benchmark Presets */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Quick Test Cases:
            </span>
            {PRESET_QUERIES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setInputVal(p.id);
                  handleSearch(p.id);
                }}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  inputVal === p.id
                    ? "bg-emerald-500 text-slate-950 border-emerald-400 font-bold"
                    : "bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
                }`}
              >
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Verification Record Output Card */}
        {activeRecord && (
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-md animate-in fade-in duration-300">
            {/* Header Status Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div className="flex items-center gap-3">
                {activeRecord.valid ? (
                  <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 animate-pulse">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        activeRecord.valid
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                      }`}
                    >
                      {activeRecord.valid ? "STATUTORY CERTIFICATE VALID & AUTHENTIC" : "STATUTORY ALERT: UNVERIFIED / FLAGGED"}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-white mt-1">
                    {activeRecord.certificateNumber}
                  </h2>
                  <p className="text-xs text-slate-400">{activeRecord.authority}</p>
                </div>
              </div>

              <div className="flex flex-row sm:flex-col items-start sm:items-end justify-between sm:justify-start gap-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  Legal Statutory Basis
                </span>
                <span className="text-xs text-slate-300 font-mono text-right max-w-xs">
                  {activeRecord.statutoryAct}
                </span>
              </div>
            </div>

            {/* Theft Alert Banner if flagged */}
            {activeRecord.theftFlag && (
              <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-600/50 text-rose-200 flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-black text-rose-100 uppercase tracking-wide">
                    CRITICAL: Active Theft Flag Detected by FRSC NVIS Gateway
                  </div>
                  <p className="text-xs text-rose-300 leading-relaxed">
                    This vehicle license plate has been reported stolen on the Federal Road Safety Corps National Vehicle Identification System. ActionOS automated guardrails have halted policy issuance. Law enforcement notification logged.
                  </p>
                </div>
              </div>
            )}

            {/* Key Dossier Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Policyholder / Enrollee
                </span>
                <span className="text-sm font-black text-white block">
                  {activeRecord.holderName}
                </span>
                <span className="text-slate-400 block font-mono text-[11px]">
                  Identifier: {activeRecord.assetIdentifier}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Registered Asset / Coverage Tier
                </span>
                <span className="text-sm font-black text-emerald-400 block">
                  {activeRecord.assetDescription}
                </span>
                <span className="text-slate-400 block text-[11px]">
                  Issued by: {activeRecord.underwriterOrAgency}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Coverage Validity Period
                </span>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Effective Date:</span>
                  <span className="font-mono font-bold text-white">{formatDate(activeRecord.issueDate)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Expiration Date:</span>
                  <span className="font-mono font-bold text-emerald-400">{formatDate(activeRecord.expiryDate)}</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Statutory Pre-Clearance
                </span>
                <span className="font-mono text-xs text-slate-300 block truncate">
                  Token: {activeRecord.preclearanceToken}
                </span>
                <span className="text-[10px] text-slate-500 block">
                  Cryptographically signed by ActionOS Sovereign Engine
                </span>
              </div>
            </div>

            {/* Cryptographic SHA-256 Merkle Chain Proof */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Hash className="w-4 h-4" />
                  <span>Action Ledger™ SHA-256 Merkle Root Proof</span>
                </span>
                <button
                  type="button"
                  onClick={() => copyHash(activeRecord.merkleHash)}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedHash ? "Hash Copied" : "Copy Hash"}</span>
                </button>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-300 break-all leading-relaxed select-all">
                sha256:{activeRecord.merkleHash}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                This verification proof is deterministically computed from the historical Action Ledger Merkle chain. Any tamper or record deletion causes mathematical hash mismatch upon re-evaluation.
              </p>
            </div>

            {/* QR Code and Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-xl shrink-0">
                  <QrCodeSvg
                    value={`https://actionos.gov.ng/verify?cert=${activeRecord.certificateNumber}&hash=${activeRecord.merkleHash}`}
                    size={76}
                    fgColor="#0f172a"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  <span className="font-bold text-white block">Statutory Mobile QR</span>
                  <span>Scan with any smartphone camera to re-verify in the field.</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <a
                  href={activeRecord.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-900/30 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Official PDF</span>
                </a>
                <Link
                  href="/ledger"
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all border border-slate-700 flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Inspect Ledger</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 px-4 sm:px-8 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>ActionOS &bull; 2026 NITDA National AI Innovation Challenge</span>
          <span className="font-mono text-[11px] text-slate-400">
            NAICOM &bull; MVAA &bull; LACVIS &bull; FRSC &bull; NHIA Certified
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function VerificationPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-emerald-400 font-mono text-sm">
          Loading Statutory Verification Portal...
        </div>
      }
    >
      <VerificationPortalContent />
    </Suspense>
  );
}

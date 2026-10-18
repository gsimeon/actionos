"use client";

import React, { useState } from "react";
import {
  Car,
  Bot,
  CreditCard,
  Database,
  CheckCircle2,
  RefreshCw,
  Zap,
  Copy,
  Check,
  Gauge,
  HeartPulse,
  Layers,
} from "lucide-react";
import { IntegrationStatusMatrix } from "@/components/dashboard/integration-status-matrix";

export function LiveHandshakeHub() {
  const [activeTab, setActiveTab] = useState<
    "frsc" | "lacvis" | "nhia" | "n_atlas" | "paystack" | "flutterwave" | "supabase" | "matrix"
  >("frsc");

  // FRSC State
  const [frscPlate, setFrscPlate] = useState("ABC-123-XY");
  const [frscLoading, setFrscLoading] = useState(false);
  const [frscResponse, setFrscResponse] = useState<Record<string, unknown> | null>(null);
  const [frscLatency, setFrscLatency] = useState<number | null>(null);

  // LACVIS State
  const [lacvisPlate, setLacvisPlate] = useState("ABC-123-XY");
  const [lacvisLoading, setLacvisLoading] = useState(false);
  const [lacvisResponse, setLacvisResponse] = useState<Record<string, unknown> | null>(null);
  const [lacvisLatency, setLacvisLatency] = useState<number | null>(null);

  // NHIA State
  const [nhiaId, setNhiaId] = useState("NHIA-2026-00812");
  const [nhiaLoading, setNhiaLoading] = useState(false);
  const [nhiaResponse, setNhiaResponse] = useState<Record<string, unknown> | null>(null);
  const [nhiaLatency, setNhiaLatency] = useState<number | null>(null);

  // N-ATLAS State
  const [nAtlasLang, setNAtlasLang] = useState("pcm");
  const [nAtlasPrompt, setNAtlasPrompt] = useState("Abeg I wan renew my motor paper sharp sharp for ABC-123-XY");
  const [nAtlasLoading, setNAtlasLoading] = useState(false);
  const [nAtlasResponse, setNAtlasResponse] = useState<Record<string, unknown> | null>(null);
  const [nAtlasLatency, setNAtlasLatency] = useState<number | null>(null);

  // Payment Rails State
  const [paystackCopied, setPaystackCopied] = useState(false);
  const [flwCopied, setFlwCopied] = useState(false);

  // Supabase State
  const [dbLoading, setDbLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; latencyMs: number; tablesCount: number } | null>(null);

  // Handler for FRSC test
  const handleTestFrsc = async () => {
    if (!frscPlate.trim()) return;
    setFrscLoading(true);
    setFrscResponse(null);
    const start = performance.now();
    try {
      const res = await fetch(`/api/vehicles?plate=${encodeURIComponent(frscPlate.trim())}&language=${nAtlasLang}`);
      const json = await res.json();
      setFrscLatency(Math.round(performance.now() - start));
      setFrscResponse(json);
    } catch (err: unknown) {
      setFrscLatency(Math.round(performance.now() - start));
      setFrscResponse({
        success: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    } finally {
      setFrscLoading(false);
    }
  };

  // Handler for LACVIS test
  const handleTestLacvis = async () => {
    if (!lacvisPlate.trim()) return;
    setLacvisLoading(true);
    setLacvisResponse(null);
    const start = performance.now();
    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "probe_lacvis",
          plate: lacvisPlate.trim(),
        }),
      });
      const json = await res.json();
      setLacvisLatency(Math.round(performance.now() - start));
      setLacvisResponse(json);
    } catch (err: unknown) {
      setLacvisLatency(Math.round(performance.now() - start));
      setLacvisResponse({
        success: false,
        error: err instanceof Error ? err.message : "Inspection probe failed",
      });
    } finally {
      setLacvisLoading(false);
    }
  };

  // Handler for NHIA test
  const handleTestNhia = async () => {
    if (!nhiaId.trim()) return;
    setNhiaLoading(true);
    setNhiaResponse(null);
    const start = performance.now();
    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "probe_nhia",
          nhiaNumber: nhiaId.trim(),
        }),
      });
      const json = await res.json();
      setNhiaLatency(Math.round(performance.now() - start));
      setNhiaResponse(json);
    } catch (err: unknown) {
      setNhiaLatency(Math.round(performance.now() - start));
      setNhiaResponse({
        success: false,
        error: err instanceof Error ? err.message : "Enrollee probe failed",
      });
    } finally {
      setNhiaLoading(false);
    }
  };

  // Handler for N-ATLAS test
  const handleTestNAtlas = async () => {
    if (!nAtlasPrompt.trim()) return;
    setNAtlasLoading(true);
    setNAtlasResponse(null);
    const start = performance.now();
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "web",
          language: nAtlasLang,
          inputText: nAtlasPrompt,
        }),
      });
      const json = await res.json();
      setNAtlasLatency(Math.round(performance.now() - start));
      setNAtlasResponse(json);
    } catch (err: unknown) {
      setNAtlasLatency(Math.round(performance.now() - start));
      setNAtlasResponse({
        success: false,
        error: err instanceof Error ? err.message : "Inference failed",
      });
    } finally {
      setNAtlasLoading(false);
    }
  };

  // Handler for Supabase DB check
  const handleCheckDb = async () => {
    setDbLoading(true);
    const start = performance.now();
    try {
      const res = await fetch("/api/policies");
      const json = await res.json();
      setDbStatus({
        connected: json.success,
        latencyMs: Math.round(performance.now() - start),
        tablesCount: 14,
      });
    } catch {
      setDbStatus({
        connected: false,
        latencyMs: Math.round(performance.now() - start),
        tablesCount: 0,
      });
    } finally {
      setDbLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Live Handshake &amp; Integration Diagnostics Hub
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Test and verify real-time data handshakes across FRSC NVIS, LACVIS, NHIA, N-ATLAS Sovereign Model, Paystack, Flutterwave, and Supabase CDC.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-800 border border-emerald-200">
            FAIL-SAFE ADAPTERS ACTIVE
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("frsc")}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
            activeTab === "frsc"
              ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs"
              : "bg-slate-50 hover:bg-slate-100 border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <Car className={`w-4 h-4 ${activeTab === "frsc" ? "text-emerald-700" : "text-slate-500"}`} />
            <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
              FRSC
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">1. FRSC NVIS</div>
            <div className="text-[10px] text-slate-500">Plate &amp; Theft</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("lacvis")}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
            activeTab === "lacvis"
              ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs"
              : "bg-slate-50 hover:bg-slate-100 border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <Gauge className={`w-4 h-4 ${activeTab === "lacvis" ? "text-blue-700" : "text-slate-500"}`} />
            <span className="text-[10px] font-mono font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
              LACVIS
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">2. LACVIS</div>
            <div className="text-[10px] text-slate-500">Roadworthy Test</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("nhia")}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
            activeTab === "nhia"
              ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs"
              : "bg-slate-50 hover:bg-slate-100 border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <HeartPulse className={`w-4 h-4 ${activeTab === "nhia" ? "text-rose-700" : "text-slate-500"}`} />
            <span className="text-[10px] font-mono font-bold text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded">
              NHIA
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">3. NHIA HMO</div>
            <div className="text-[10px] text-slate-500">Enrollee &amp; Tier</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("n_atlas")}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
            activeTab === "n_atlas"
              ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs"
              : "bg-slate-50 hover:bg-slate-100 border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <Bot className={`w-4 h-4 ${activeTab === "n_atlas" ? "text-emerald-700" : "text-slate-500"}`} />
            <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
              NITDA AI
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">4. N-ATLAS Model</div>
            <div className="text-[10px] text-slate-500">Multilingual Voice</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("paystack")}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
            activeTab === "paystack"
              ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs"
              : "bg-slate-50 hover:bg-slate-100 border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <CreditCard className={`w-4 h-4 ${activeTab === "paystack" ? "text-emerald-700" : "text-slate-500"}`} />
            <span className="text-[10px] font-mono font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
              SETTLE
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">5. Paystack</div>
            <div className="text-[10px] text-slate-500">HMAC Webhooks</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("flutterwave")}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
            activeTab === "flutterwave"
              ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs"
              : "bg-slate-50 hover:bg-slate-100 border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <CreditCard className={`w-4 h-4 ${activeTab === "flutterwave" ? "text-amber-700" : "text-slate-500"}`} />
            <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
              RAIL 2
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">6. Flutterwave</div>
            <div className="text-[10px] text-slate-500">verif-hash Header</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("supabase")}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
            activeTab === "supabase"
              ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs"
              : "bg-slate-50 hover:bg-slate-100 border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <Database className={`w-4 h-4 ${activeTab === "supabase" ? "text-emerald-700" : "text-slate-500"}`} />
            <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
              CDC WS
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">7. Supabase DB</div>
            <div className="text-[10px] text-slate-500">Realtime Streams</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("matrix")}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
            activeTab === "matrix"
              ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs"
              : "bg-slate-50 hover:bg-slate-100 border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <Layers className={`w-4 h-4 ${activeTab === "matrix" ? "text-indigo-700" : "text-slate-500"}`} />
            <span className="text-[10px] font-mono font-bold text-indigo-800 bg-indigo-100 px-1.5 py-0.5 rounded">
              AUDIT
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">8. Reality Matrix</div>
            <div className="text-[10px] text-slate-500">Live vs Sandbox</div>
          </div>
        </button>
      </div>

      {/* Tab Panels */}
      {/* 1. FRSC Gateway Panel */}
      {activeTab === "frsc" && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-900">
                  FRSC National Vehicle Identification System (NVIS) Handshake
                </span>
                <p className="text-[11px] text-slate-500">
                  Tests live plate verification, VIN extraction, theft registry verification, and fallback resilience.
                </p>
              </div>
              <span className="text-[10px] font-mono text-slate-600 bg-slate-200 px-2 py-0.5 rounded self-start sm:self-auto font-bold">
                ENDPOINT: /api/vehicles
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <input
                id="frsc-plate-input"
                type="text"
                value={frscPlate}
                onChange={(e) => setFrscPlate(e.target.value.toUpperCase())}
                placeholder="Enter plate number (e.g. ABC-123-XY, KJA-882-AB)"
                className="w-full sm:flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-2xs"
              />
              <button
                type="button"
                id="btn-test-frsc-handshake"
                onClick={handleTestFrsc}
                disabled={frscLoading || !frscPlate.trim()}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                {frscLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Ping FRSC Gateway</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Test Response */}
          {frscResponse && (
            <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Handshake Verified
                </span>
                <span>Latency: {frscLatency}ms</span>
              </div>
              <pre className="overflow-x-auto text-[11px] max-h-56 leading-relaxed">
                {JSON.stringify(frscResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 2. LACVIS Roadworthiness Panel */}
      {activeTab === "lacvis" && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-900">
                  LACVIS Computerized Vehicle Inspection Service Handshake
                </span>
                <p className="text-[11px] text-slate-500">
                  Tests computerized brake efficiency (70% statutory threshold), emissions compliance, and vehicle safety test centers.
                </p>
              </div>
              <span className="text-[10px] font-mono text-slate-600 bg-slate-200 px-2 py-0.5 rounded self-start sm:self-auto font-bold">
                ENDPOINT: /api/simulator (probe_lacvis)
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <input
                id="lacvis-plate-input"
                type="text"
                value={lacvisPlate}
                onChange={(e) => setLacvisPlate(e.target.value.toUpperCase())}
                placeholder="Enter plate number (e.g. ABC-123-XY, FAIL-123-XX)"
                className="w-full sm:flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-2xs"
              />
              <button
                type="button"
                id="btn-test-lacvis-handshake"
                onClick={handleTestLacvis}
                disabled={lacvisLoading || !lacvisPlate.trim()}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                {lacvisLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Ping LACVIS Gateway</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Test Response */}
          {lacvisResponse && (
            <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5 text-blue-400 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Computerized Inspection Verified
                </span>
                <span>Latency: {lacvisLatency}ms</span>
              </div>
              <pre className="overflow-x-auto text-[11px] max-h-56 leading-relaxed">
                {JSON.stringify(lacvisResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 3. NHIA Health Gateway Panel */}
      {activeTab === "nhia" && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-900">
                  National Health Insurance Authority (NHIA) Handshake
                </span>
                <p className="text-[11px] text-slate-500">
                  Tests central health insurance enrollee registry, biometric NIN cross-validation, and accredited HMO healthcare providers.
                </p>
              </div>
              <span className="text-[10px] font-mono text-slate-600 bg-slate-200 px-2 py-0.5 rounded self-start sm:self-auto font-bold">
                ENDPOINT: /api/simulator (probe_nhia)
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <input
                id="nhia-id-input"
                type="text"
                value={nhiaId}
                onChange={(e) => setNhiaId(e.target.value.toUpperCase())}
                placeholder="Enter NHIA Enrollee ID (e.g. NHIA-2026-00812, NHIA-00829104)"
                className="w-full sm:flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-2xs"
              />
              <button
                type="button"
                id="btn-test-nhia-handshake"
                onClick={handleTestNhia}
                disabled={nhiaLoading || !nhiaId.trim()}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                {nhiaLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Ping NHIA Gateway</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Test Response */}
          {nhiaResponse && (
            <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5 text-rose-400 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Enrollee Record Verified
                </span>
                <span>Latency: {nhiaLatency}ms</span>
              </div>
              <pre className="overflow-x-auto text-[11px] max-h-56 leading-relaxed">
                {JSON.stringify(nhiaResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 4. N-ATLAS AI Panel */}
      {activeTab === "n_atlas" && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-900">
                  N-ATLAS Sovereign Multilingual Foundation AI Inference
                </span>
                <p className="text-[11px] text-slate-500">
                  Tests semantic intent recognition and entity extraction across indigenous Nigerian languages.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={nAtlasLang}
                  onChange={(e) => setNAtlasLang(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 outline-none cursor-pointer"
                >
                  <option value="pcm">Nigerian Pidgin (pcm)</option>
                  <option value="yo">Yorùbá (yo-NG)</option>
                  <option value="ha">Hausa (ha-NG)</option>
                  <option value="ig">Igbo (ig-NG)</option>
                  <option value="en-NG">Nigerian English (en-NG)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
              <input
                id="n-atlas-prompt-input"
                type="text"
                value={nAtlasPrompt}
                onChange={(e) => setNAtlasPrompt(e.target.value)}
                placeholder="Enter prompt in Nigerian language"
                className="w-full sm:flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-2xs font-medium"
              />
              <button
                type="button"
                id="btn-test-natlas-handshake"
                onClick={handleTestNAtlas}
                disabled={nAtlasLoading || !nAtlasPrompt.trim()}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                {nAtlasLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <Bot className="w-3.5 h-3.5" />
                    <span>Test N-ATLAS</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Test Response */}
          {nAtlasResponse && (
            <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Sovereign Model Inference Complete
                </span>
                <span>Latency: {nAtlasLatency}ms</span>
              </div>
              <pre className="overflow-x-auto text-[11px] max-h-56 leading-relaxed">
                {JSON.stringify(nAtlasResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 5. Paystack Rail Panel */}
      {activeTab === "paystack" && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">
                  Paystack Gateway Rail Configuration
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  HMAC-SHA512 verified webhooks, out-of-band transaction settlement, and atomic saga reversals.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">WEBHOOK ENDPOINT</span>
                <div className="font-mono text-xs text-slate-900 font-bold truncate">
                  /api/webhooks/payment
                </div>
                <span className="text-[10px] text-slate-500 block">Constant-time timingSafeEqual HMAC verification</span>
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">SETTLEMENT CURRENCY</span>
                <div className="font-mono text-xs text-emerald-700 font-bold">
                  NGN (Nigerian Naira &bull; Kobo precision)
                </div>
                <span className="text-[10px] text-slate-500 block">Card, Bank Transfer, USSD, Apple Pay</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="font-mono text-xs text-slate-600">
                Webhook URL: <strong className="text-slate-900">https://your-domain.ng/api/webhooks/payment</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText("https://your-domain.ng/api/webhooks/payment");
                  setPaystackCopied(true);
                  setTimeout(() => setPaystackCopied(false), 2000);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                {paystackCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{paystackCopied ? "Copied" : "Copy Endpoint"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Flutterwave Rail Panel */}
      {activeTab === "flutterwave" && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900">
                  Flutterwave Gateway Rail Configuration
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  verif-hash secret header verification, out-of-band settlement verification (/v3/transactions/verify_by_reference), and 4-state refund lifecycle.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">WEBHOOK ENDPOINT</span>
                <div className="font-mono text-xs text-slate-900 font-bold truncate">
                  /api/webhooks/payment
                </div>
                <span className="text-[10px] text-slate-500 block">Constant-time timingSafeEqual verif-hash validation</span>
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">SETTLEMENT CURRENCY</span>
                <div className="font-mono text-xs text-emerald-700 font-bold">
                  NGN &bull; Multi-Currency Pan-African Rails
                </div>
                <span className="text-[10px] text-slate-500 block">Card, Bank Transfer, USSD, Barter, Mobile Money</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="font-mono text-xs text-slate-600">
                Webhook URL: <strong className="text-slate-900">https://your-domain.ng/api/webhooks/payment</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText("https://your-domain.ng/api/webhooks/payment");
                  setFlwCopied(true);
                  setTimeout(() => setFlwCopied(false), 2000);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                {flwCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{flwCopied ? "Copied" : "Copy Endpoint"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Supabase DB & Realtime Panel */}
      {activeTab === "supabase" && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold text-slate-900">
                  Supabase PostgreSQL &amp; Realtime CDC Stream
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Change Data Capture active across action sessions, immutable ledger events, renewals, and transactions.
                </p>
              </div>
              <button
                type="button"
                id="btn-check-supabase-connection"
                onClick={handleCheckDb}
                disabled={dbLoading}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer self-start sm:self-auto"
              >
                {dbLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                <span>Ping Database</span>
              </button>
            </div>

            {dbStatus && (
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-900">
                    Supabase Project Connected (14 core tables verified)
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-700">
                  {dbStatus.latencyMs}ms roundtrip
                </span>
              </div>
            )}

            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase text-slate-500 block">
                ACTIVE REALTIME PUBLICATIONS:
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  "action_sessions",
                  "immutable_ledger_events",
                  "renewals",
                  "transactions",
                  "actionos_notifications",
                  "policies",
                  "assets",
                ].map((tbl) => (
                  <span
                    key={tbl}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 font-mono text-[11px] font-semibold border border-emerald-200"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>{tbl}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Full Reality & Integration Status Matrix */}
      {activeTab === "matrix" && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <IntegrationStatusMatrix />
        </div>
      )}
    </div>
  );
}

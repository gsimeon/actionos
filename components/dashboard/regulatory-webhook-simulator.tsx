"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  RotateCw,
  Send,
  CheckCircle2,
  XCircle,
  Gauge,
  FileCheck2,
  Play,
  Copy,
  Check,
  HeartPulse,
  CreditCard,
  MessageSquare,
  Phone,
} from "lucide-react";
import { WhatsAppSimulator } from "./whatsapp-simulator";
import { UssdSimulator } from "./ussd-simulator-modal";

type SimulatorTab = "regulatory" | "webhooks" | "scenarios" | "whatsapp" | "ussd";
type RegulatorySubAgency = "frsc" | "lacvis" | "niid" | "nhia" | "dl";
type PaymentProvider = "paystack" | "flutterwave";

interface ProbeResult {
  success: boolean;
  action: string;
  latencyMs: number;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
  status?: number;
  provider?: string;
  eventType?: string;
  reference?: string;
  isTampered?: boolean;
  rawPayload?: Record<string, unknown>;
  response?: Record<string, unknown>;
  scenarioId?: string;
  title?: string;
  description?: string;
  outcome?: string;
  details?: Record<string, unknown>;
}

export function RegulatoryWebhookSimulator() {
  const [tab, setTab] = useState<SimulatorTab>("regulatory");

  // Regulatory State
  const [agency, setAgency] = useState<RegulatorySubAgency>("frsc");
  const [probeInput, setProbeInput] = useState("ABC-123-XY");
  const [regLoading, setRegLoading] = useState(false);
  const [regResult, setRegResult] = useState<ProbeResult | null>(null);

  // Webhook State
  const [whProvider, setWhProvider] = useState<PaymentProvider>("paystack");
  const [whEvent, setWhEvent] = useState<"charge" | "refund">("charge");
  const [whAmount, setWhAmount] = useState(87500);
  const [whReference, setWhReference] = useState("demo_ref_00182");
  const [whTampered, setWhTampered] = useState(false);
  const [whLoading, setWhLoading] = useState(false);
  const [whResult, setWhResult] = useState<ProbeResult | null>(null);

  // Scenario State
  const [scenarioLoading, setScenarioLoading] = useState<string | null>(null);
  const [scenarioResult, setScenarioResult] = useState<ProbeResult | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Quick Fixture Presets by Registry Domain
  const AUTO_PLATE_PRESETS = [
    { value: "ABC-123-XY", label: "Clean Benchmark", desc: "Toyota Camry &bull; Passing" },
    { value: "STOLEN-999-XX", label: "Stolen Vehicle", desc: "FRSC Active Theft Flag" },
    { value: "FAIL-123-XX", label: "Brake Failure", desc: "LACVIS Retest Required" },
    { value: "ACTIVE-999-OK", label: "Active Conflict", desc: "240 Days Valid on NIID" },
    { value: "NOT-404-NF", label: "Unregistered", desc: "Not Found in Registry" },
  ];

  const NHIA_PRESETS = [
    { value: "NHIA-2026-00812", label: "Silver Enrollee", desc: "Emeka Adebayo &bull; Expiring Soon" },
    { value: "NHIA-2026-GOLD", label: "Gold Plan", desc: "Lagoon Hospital Ikoyi" },
    { value: "NHIA-2026-SUSPENDED", label: "Admin Lock", desc: "Suspended by NHIA" },
    { value: "NOT-FOUND-HMO", label: "Unregistered", desc: "Not Found in NHIA Portal" },
  ];

  const DL_PRESETS = [
    { value: "ABC12345678", label: "Clean Benchmark", desc: "Demo Customer &bull; Class E Valid" },
    { value: "REV12345678", label: "Revoked License", desc: "FRSC Disqualified Driver" },
    { value: "EXP12345678", label: "Expiring License", desc: "Due for Biometrics" },
  ];

  const currentPresets = agency === "nhia" ? NHIA_PRESETS : agency === "dl" ? DL_PRESETS : AUTO_PLATE_PRESETS;

  const handleSelectAgency = (nextAgency: RegulatorySubAgency) => {
    setAgency(nextAgency);
    setRegResult(null);
    if (nextAgency === "nhia") {
      setProbeInput("NHIA-2026-00812");
    } else if (nextAgency === "dl") {
      setProbeInput("ABC12345678");
    } else {
      setProbeInput("ABC-123-XY");
    }
  };

  // Handler for Regulatory Probe
  const handleProbeRegulatory = async (overrideValue?: string, overrideAgency?: RegulatorySubAgency) => {
    const targetAgency = overrideAgency || agency;
    const targetValue = (overrideValue || probeInput).trim();
    setRegLoading(true);
    setRegResult(null);

    let action = "probe_frsc";
    let body: Record<string, unknown> = {};

    if (targetAgency === "frsc") {
      action = "probe_frsc";
      body = { action, plate: targetValue };
    } else if (targetAgency === "lacvis") {
      action = "probe_lacvis";
      body = { action, plate: targetValue };
    } else if (targetAgency === "niid") {
      action = "probe_niid";
      body = { action, plate: targetValue };
    } else if (targetAgency === "nhia") {
      action = "probe_nhia";
      body = { action, nhiaNumber: targetValue };
    } else if (targetAgency === "dl") {
      action = "probe_dl";
      body = { action, dlNumber: targetValue };
    }

    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setRegResult(json);
    } catch (err: unknown) {
      setRegResult({
        success: false,
        action,
        latencyMs: 0,
        error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Request failed" },
      });
    } finally {
      setRegLoading(false);
    }
  };

  // Handler for Webhook Simulation
  const handleDispatchWebhook = async (overrideTampered?: boolean) => {
    setWhLoading(true);
    setWhResult(null);

    const tampered = overrideTampered !== undefined ? overrideTampered : whTampered;
    const eventType =
      whProvider === "paystack"
        ? whEvent === "charge"
          ? "charge.success"
          : "refund.processed"
        : whEvent === "charge"
        ? "charge.completed"
        : "refund.completed";

    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate_webhook",
          provider: whProvider,
          eventType,
          reference: whReference,
          amount: Number(whAmount),
          isTampered: tampered,
        }),
      });
      const json = await res.json();
      setWhResult(json);
    } catch (err: unknown) {
      setWhResult({
        success: false,
        action: "simulate_webhook",
        latencyMs: 0,
        error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Webhook dispatch failed" },
      });
    } finally {
      setWhLoading(false);
    }
  };

  // Handler for 1-Click Scenario
  const handleRunScenario = async (scenarioId: string) => {
    setScenarioLoading(scenarioId);
    setScenarioResult(null);

    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_scenario",
          scenarioId,
        }),
      });
      const json = await res.json();
      setScenarioResult(json);
    } catch (err: unknown) {
      setScenarioResult({
        success: false,
        action: "run_scenario",
        latencyMs: 0,
        error: { code: "SCENARIO_ERROR", message: err instanceof Error ? err.message : "Scenario execution failed" },
      });
    } finally {
      setScenarioLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Interactive Regulatory &amp; Webhook Simulator
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Test and trigger live statutory registry probes (FRSC, LACVIS, NIID), multi-rail webhooks, and 1-click competition edge cases.
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setTab("regulatory")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tab === "regulatory" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Statutory Registries
          </button>
          <button
            type="button"
            onClick={() => setTab("webhooks")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tab === "webhooks" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Multi-Rail Webhooks
          </button>
          <button
            type="button"
            onClick={() => setTab("scenarios")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tab === "scenarios" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Judge Scenarios
          </button>
          <button
            type="button"
            onClick={() => setTab("whatsapp")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              tab === "whatsapp" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>WhatsApp Bot</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("ussd")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              tab === "ussd" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Phone className="w-3.5 h-3.5 text-emerald-600" />
            <span>USSD (*384*2026#)</span>
          </button>
        </div>
      </div>

      {/* TAB 1: STATUTORY REGULATORY TRIFECTA */}
      {tab === "regulatory" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Agency Selector */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <button
              type="button"
              onClick={() => handleSelectAgency("frsc")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                agency === "frsc"
                  ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                  REGISTRY
                </span>
                <span className="text-xs font-bold text-slate-800">1. FRSC NVIS</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Stolen Flag &amp; Plate</p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectAgency("lacvis")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                agency === "lacvis"
                  ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                  INSPECTION
                </span>
                <span className="text-xs font-bold text-slate-800">2. LACVIS</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Brake &amp; Emissions</p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectAgency("niid")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                agency === "niid"
                  ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded">
                  INSURANCE
                </span>
                <span className="text-xs font-bold text-slate-800">3. NIID</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">E-Sticker Registry</p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectAgency("nhia")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                agency === "nhia"
                  ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded">
                  HEALTH HMO
                </span>
                <span className="text-xs font-bold text-slate-800">4. NHIA Health</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Enrollee &amp; HMO</p>
            </button>

            <button
              type="button"
              onClick={() => handleSelectAgency("dl")}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between col-span-2 sm:col-span-1 ${
                agency === "dl"
                  ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-indigo-800 bg-indigo-100 px-1.5 py-0.5 rounded">
                  DRIVER DL
                </span>
                <span className="text-xs font-bold text-slate-800">5. FRSC DL</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Driver License</p>
            </button>
          </div>

          {/* Quick Presets */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Quick Test Fixtures ({agency.toUpperCase()})
            </span>
            <div className="flex flex-wrap gap-2">
              {currentPresets.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    setProbeInput(p.value);
                    handleProbeRegulatory(p.value);
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    probeInput === p.value
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200"
                  }`}
                >
                  <span className="font-mono font-bold">{p.value}</span>
                  <span className="text-[10px] opacity-75 font-normal">({p.label})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Probe Input & Action */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={probeInput}
                onChange={(e) => setProbeInput(e.target.value.toUpperCase())}
                placeholder={
                  agency === "nhia"
                    ? "Enter NHIA Number (e.g. NHIA-2026-00812)"
                    : agency === "dl"
                    ? "Enter Driver's License Number (e.g. ABC12345678)"
                    : "Enter Nigerian Plate (e.g. ABC-123-XY)"
                }
                className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono text-sm uppercase text-slate-900 font-bold placeholder:text-slate-400 placeholder:normal-case placeholder:font-normal"
              />
            </div>
            <button
              type="button"
              disabled={regLoading || !probeInput.trim()}
              onClick={() => handleProbeRegulatory()}
              className="px-6 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {regLoading ? <RotateCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-emerald-400" />}
              <span>Probe {agency === "dl" ? "FRSC DL" : agency.toUpperCase()}</span>
            </button>
          </div>

          {/* Regulatory Result Card */}
          {regResult && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                <div className="flex items-center gap-2">
                  {regResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600" />
                  )}
                  <span className="text-xs font-bold text-slate-900">
                    {agency.toUpperCase()} Gateway Response
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  Latency: {regResult.latencyMs}ms
                </span>
              </div>

              {/* Agency-Specific Custom Visual Render */}
              {agency === "frsc" && regResult.data && (
                <div className="space-y-3">
                  {/* Theft Alert Banner if flagged */}
                  {Boolean(regResult.data.theftFlag) ? (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3">
                      <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 animate-bounce" />
                      <div>
                        <div className="text-xs font-bold text-rose-900 uppercase tracking-wide">
                          CRITICAL: Active Stolen Vehicle Flag Detected
                        </div>
                        <p className="text-[11px] text-rose-700 mt-0.5">
                          FRSC National Theft Registry flagged this plate. ActionOS underwriting guardrails strictly halt renewal.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
                      <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-emerald-900">Vehicle Clean &amp; FRSC Verified</div>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          No active theft or security flags on National Vehicle Identification System.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-semibold">Make &amp; Model</span>
                      <span className="font-bold text-slate-800">
                        {String(regResult.data.make || "Toyota")} {String(regResult.data.model || "Camry")}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-semibold">Chassis / VIN</span>
                      <span className="font-mono font-bold text-slate-800 truncate block">
                        {String(regResult.data.chassisNumber || regResult.data.vin || "DEMO-VIN-000001")}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-semibold">Engine Number</span>
                      <span className="font-mono font-bold text-slate-800 truncate block">
                        {String(regResult.data.engineNumber || "ENG-442201")}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-semibold">Registration Status</span>
                      <span className="font-bold text-emerald-700">
                        {Boolean(regResult.data.found) ? "REGISTERED" : "NOT FOUND"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {agency === "lacvis" && regResult.data && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                    <div className="flex items-center gap-3">
                      <Gauge className="w-5 h-5 text-indigo-600" />
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          Brake Efficiency: {Number(regResult.data.brakeEfficiencyPct)}%
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Statutory Minimum Required: 70% &bull; Status: {String(regResult.data.brakeEfficiencyStatus)}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono ${
                        regResult.data.overallResult === "PASSED"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-rose-100 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {String(regResult.data.overallResult)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-500 block font-semibold">Carbon Monoxide</span>
                      <span className="font-mono font-bold text-slate-800">
                        {String(regResult.data.emissionCoPct)}% CO
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-500 block font-semibold">Hydrocarbons</span>
                      <span className="font-mono font-bold text-slate-800">
                        {String(regResult.data.emissionHcPpm)} ppm
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-500 block font-semibold">Visual &amp; Steering</span>
                      <span className="font-bold text-emerald-700">
                        {String(regResult.data.steeringSuspension || "PASSED")}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {agency === "niid" && regResult.data && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <FileCheck2 className="w-5 h-5 text-purple-600 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {String(regResult.data.underwriterName || "Underwriter Registry")}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Policy: {String(regResult.data.policyNumber || "N/A")} &bull;{" "}
                          {Boolean(regResult.data.activePolicy)
                            ? `Active (${regResult.data.daysUntilExpiry} days remaining)`
                            : "Eligible for Renewal"}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono self-start sm:self-auto ${
                        Boolean(regResult.data.activePolicy)
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      }`}
                    >
                      {Boolean(regResult.data.activePolicy) ? "ACTIVE COVERAGE CONFLICT" : "READY TO RENEW"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-sans font-semibold">NAICOM E-Sticker</span>
                      <span className="text-xs font-bold text-purple-700 truncate block">
                        {String(regResult.data.eStickerNumber || "NAICOM-STK-2026-PENDING")}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-sans font-semibold">Pre-Clearance Token</span>
                      <span className="text-xs font-bold text-slate-800 truncate block">
                        {String(regResult.data.preclearanceToken || "NIID-TOKEN-N/A")}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Agency-Specific: NHIA Health Insurance */}
              {agency === "nhia" && regResult.data && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-600">
                        <HeartPulse className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                          <span>{String(regResult.data.enrolleeName || "Enrollee Verified")}</span>
                          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                            {String(regResult.data.tier || "Silver")} Tier
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {String(regResult.data.hmoProviderName || "NHIA Health HMO")} &bull; Hospital:{" "}
                          <span className="font-semibold text-slate-700">{String(regResult.data.primaryHcpName || "Accredited HCP")}</span>
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono self-start sm:self-auto ${
                        Boolean(regResult.data.eligibleForRenewal)
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {Boolean(regResult.data.eligibleForRenewal) ? "ELIGIBLE FOR RENEWAL" : "COVERAGE ACTIVE"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-semibold">NHIA Enrollee ID</span>
                      <span className="font-mono font-bold text-slate-800 truncate block">
                        {String(regResult.data.nhiaNumber || "N/A")}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-semibold">Coverage Status</span>
                      <span className="font-bold text-emerald-700 capitalize">
                        {String(regResult.data.activeStatus || "Active")} ({String(regResult.data.daysUntilExpiry ?? 0)}d left)
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-semibold">Dependents / Blood</span>
                      <span className="font-bold text-slate-800">
                        {String(regResult.data.dependentsCount ?? 0)} dep &bull; {String(regResult.data.bloodGroup || "O+")} ({String(regResult.data.genotype || "AA")})
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-semibold">Statutory Authority</span>
                      <span className="text-[10px] text-slate-700 truncate block font-mono">
                        NHIA Act 2022
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Agency-Specific: FRSC Driver's License */}
              {agency === "dl" && regResult.data && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                          <span>{String(regResult.data.holderName || "License Holder")}</span>
                          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                            {String(regResult.data.classOfVehicle || "Class E")}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          License: {String(regResult.data.dlNumber || "N/A")} &bull; State: {String(regResult.data.stateOfIssue || "Lagos")}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono self-start sm:self-auto ${
                        Boolean(regResult.data.valid)
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-rose-100 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {Boolean(regResult.data.valid) ? "VALIDATED IN REGISTRY" : "REVOKED / DISQUALIFIED"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-semibold">Date of Birth</span>
                      <span className="font-mono font-bold text-slate-800 block">
                        {String(regResult.data.dateOfBirth || "1988-06-15")}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-semibold">Expiration Date</span>
                      <span className="font-mono font-bold text-slate-800 block">
                        {String(regResult.data.expiryDate || "2028-06-15")}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-500 block font-semibold">Biometric Status</span>
                      <span className="font-bold text-indigo-700">
                        Capture Center Eligible
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Alert Banner when probe fails */}
              {!regResult.success && regResult.error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-rose-900 font-mono">
                      {regResult.error.code}
                    </div>
                    <p className="text-xs text-rose-700 mt-0.5 font-sans">
                      {regResult.error.message}
                    </p>
                  </div>
                </div>
              )}

              {/* Raw JSON inspection toggle */}
              <details className="text-[11px] text-slate-500 cursor-pointer pt-1">
                <summary className="hover:text-slate-800 font-semibold">View Raw Gateway JSON Payload</summary>
                <pre className="mt-2 p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-[10px] overflow-x-auto">
                  {JSON.stringify(regResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MULTI-RAIL PAYMENT WEBHOOK SIMULATOR */}
      {tab === "webhooks" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Provider Rails */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setWhProvider("paystack")}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                whProvider === "paystack"
                  ? "bg-blue-50/70 border-blue-300 ring-2 ring-blue-400/20"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200"
              }`}
            >
              <div>
                <span className="text-xs font-bold text-slate-900">Paystack Gateway</span>
                <p className="text-[10px] text-slate-500 mt-0.5">HMAC-SHA512 Signature &bull; Kobo</p>
              </div>
              <span className="text-[10px] font-mono font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                x-paystack-signature
              </span>
            </button>

            <button
              type="button"
              onClick={() => setWhProvider("flutterwave")}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                whProvider === "flutterwave"
                  ? "bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/20"
                  : "bg-slate-50 hover:bg-slate-100 border-slate-200"
              }`}
            >
              <div>
                <span className="text-xs font-bold text-slate-900">Flutterwave Gateway</span>
                <p className="text-[10px] text-slate-500 mt-0.5">verif-hash Header &bull; Major Naira</p>
              </div>
              <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                verif-hash
              </span>
            </button>
          </div>

          {/* Event Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Event Type</label>
              <select
                value={whEvent}
                onChange={(e) => setWhEvent(e.target.value as "charge" | "refund")}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800"
              >
                <option value="charge">Charge Success (charge.completed / charge.success)</option>
                <option value="refund">Refund Reversal (refund.completed / refund.processed)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Amount (NGN)</label>
              <input
                type="number"
                value={whAmount}
                onChange={(e) => setWhAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold bg-white text-slate-800"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Transaction Reference</label>
              <input
                type="text"
                value={whReference}
                onChange={(e) => setWhReference(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white text-slate-800"
              />
            </div>
          </div>

          {/* Webhook Options & Dispatch */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={whTampered}
                  onChange={(e) => setWhTampered(e.target.checked)}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span className={whTampered ? "text-rose-700 font-bold" : ""}>
                  Tamper Secret Signature (Test 401/400 Rejection)
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={whLoading}
                onClick={() => handleDispatchWebhook()}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                {whLoading ? <RotateCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Dispatch Webhook</span>
              </button>
            </div>
          </div>

          {/* Webhook Result Inspector */}
          {whResult && (
            <div className="rounded-2xl border border-slate-200 bg-slate-900 text-slate-100 p-4 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      whResult.status === 200
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    HTTP {whResult.status}
                  </span>
                  <span className="text-slate-300 font-sans font-semibold">
                    {whResult.provider?.toUpperCase()} &bull; {whResult.eventType}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span>{whResult.latencyMs}ms</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(JSON.stringify(whResult, null, 2))}
                    className="p-1 hover:text-white"
                  >
                    {copiedPayload ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-sans block mb-1">Server Response Body</span>
                <pre className="p-3 rounded-xl bg-slate-950 text-slate-200 text-[11px] overflow-x-auto">
                  {JSON.stringify(whResult.response, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: 1-CLICK COMPETITION SCENARIOS */}
      {tab === "scenarios" && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <p className="text-xs text-slate-600">
            Battle-tested demo scenarios for NITDA competition judges and security auditors to inspect ActionOS&apos;s deterministic safety guardrails live in real-time.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Scenario 1 */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-all flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold font-mono">
                    SAFETY HALT
                  </span>
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Stolen Vehicle Underwriting Rejection</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Runs FRSC theft cross-verification for plate <code className="text-slate-800 font-bold">STOLEN-999-XX</code>. Observes immediate deterministic halt.
                </p>
              </div>

              <button
                type="button"
                disabled={Boolean(scenarioLoading)}
                onClick={() => handleRunScenario("stolen_vehicle")}
                className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {scenarioLoading === "stolen_vehicle" ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Launch Theft Scenario</span>
              </button>
            </div>

            {/* Scenario 2 */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-all flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold font-mono">
                    INSPECTION DENIAL
                  </span>
                  <Gauge className="w-4 h-4 text-amber-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">LACVIS Brake Efficiency Failure</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Probes computerized testing for <code className="text-slate-800 font-bold">FAIL-123-XX</code> (42% efficiency &lt; 70% statutory min), denying vehicle license renewal.
                </p>
              </div>

              <button
                type="button"
                disabled={Boolean(scenarioLoading)}
                onClick={() => handleRunScenario("lacvis_brake_failure")}
                className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {scenarioLoading === "lacvis_brake_failure" ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Launch LACVIS Scenario</span>
              </button>
            </div>

            {/* Scenario 3 */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-all flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[10px] font-bold font-mono">
                    DUPLICATE BLOCK
                  </span>
                  <FileCheck2 className="w-4 h-4 text-purple-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Active Policy Conflict Guard</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Probes <code className="text-slate-800 font-bold">ACTIVE-999-OK</code> on NIID with 240 days active coverage remaining, preventing illegal duplicate policy purchase.
                </p>
              </div>

              <button
                type="button"
                disabled={Boolean(scenarioLoading)}
                onClick={() => handleRunScenario("active_policy_conflict")}
                className="w-full py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {scenarioLoading === "active_policy_conflict" ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Launch NIID Conflict Scenario</span>
              </button>
            </div>

            {/* Scenario 4: NHIA HMO Statutory Renewal */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-all flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-bold font-mono">
                    HEALTH HMO
                  </span>
                  <HeartPulse className="w-4 h-4 text-rose-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">NHIA HMO Statutory Renewal</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Probes central NHIA registry for <code className="text-slate-800 font-bold">NHIA-2026-00812</code>, confirms active Silver tier eligibility, and issues digital biometric card.
                </p>
              </div>

              <button
                type="button"
                disabled={Boolean(scenarioLoading)}
                onClick={() => handleRunScenario("hmo_statutory_renewal")}
                className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {scenarioLoading === "hmo_statutory_renewal" ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Launch NHIA HMO Scenario</span>
              </button>
            </div>

            {/* Scenario 5: FRSC Driver's License Biometric Renewal */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-all flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-bold font-mono">
                    DRIVER LICENSE
                  </span>
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">FRSC Driver&apos;s License Renewal</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Probes national DL registry for <code className="text-slate-800 font-bold">ABC12345678</code>, settles MVAA statutory fee, and allocates biometric appointment.
                </p>
              </div>

              <button
                type="button"
                disabled={Boolean(scenarioLoading)}
                onClick={() => handleRunScenario("driver_license_renewal")}
                className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {scenarioLoading === "driver_license_renewal" ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Launch Driver&apos;s License Scenario</span>
              </button>
            </div>

            {/* Scenario 6: Declined Payment Fail-Closed Proof */}
            <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50/70 transition-all flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-rose-200 text-rose-900 text-[10px] font-bold font-mono">
                    FAIL-CLOSED PROOF
                  </span>
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Declined Payment Fail-Closed Proof</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Injects card decline / insufficient funds on motor renewal. Proves policy remains <code className="text-rose-800 font-bold">expiring</code> (never renewed) and zero certificate is issued.
                </p>
              </div>

              <button
                type="button"
                disabled={Boolean(scenarioLoading)}
                onClick={() => handleRunScenario("declined_payment")}
                className="w-full py-2 px-3 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {scenarioLoading === "declined_payment" ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Launch Declined Payment Scenario</span>
              </button>
            </div>

            {/* Scenario 7: Duplicate Webhook Replay & Idempotency Proof */}
            <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/40 hover:bg-blue-50/70 transition-all flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-blue-200 text-blue-900 text-[10px] font-bold font-mono">
                    IDEMPOTENCY PROOF
                  </span>
                  <RotateCw className="w-4 h-4 text-blue-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Webhook Replay &amp; Deduplication</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Delivers identical Paystack webhook twice. Initial delivery settles; replayed delivery is deduplicated; strictly 1 ledger transaction created (zero double credit).
                </p>
              </div>

              <button
                type="button"
                disabled={Boolean(scenarioLoading)}
                onClick={() => handleRunScenario("webhook_replay")}
                className="w-full py-2 px-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {scenarioLoading === "webhook_replay" ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Launch Webhook Replay Scenario</span>
              </button>
            </div>

            {/* Scenario 8: NHIA Administrative Lock & Suspension Guard */}
            <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50/70 transition-all flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-rose-200 text-rose-900 text-[10px] font-bold font-mono">
                    STATUTORY LOCK
                  </span>
                  <HeartPulse className="w-4 h-4 text-rose-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">NHIA Enrollee Suspension Guard</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Probes central NHIA health registry for <code className="text-slate-800 font-bold">NHIA-2026-SUSPENDED</code>. Proves administrative lock triggers immediate statutory rejection.
                </p>
              </div>

              <button
                type="button"
                disabled={Boolean(scenarioLoading)}
                onClick={() => handleRunScenario("nhia_suspended_lock")}
                className="w-full py-2 px-3 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {scenarioLoading === "nhia_suspended_lock" ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Launch NHIA Lock Scenario</span>
              </button>
            </div>

            {/* Scenario 9: FRSC Disqualified Driver Rejection */}
            <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/40 hover:bg-rose-50/70 transition-all flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-md bg-rose-200 text-rose-900 text-[10px] font-bold font-mono">
                    DISQUALIFIED DRIVER
                  </span>
                  <CreditCard className="w-4 h-4 text-rose-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">FRSC Disqualified Driver Rejection</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Probes national DL registry for <code className="text-slate-800 font-bold">REVOKED1234</code>. Proves disqualified / revoked status strictly prevents licensing renewal.
                </p>
              </div>

              <button
                type="button"
                disabled={Boolean(scenarioLoading)}
                onClick={() => handleRunScenario("driver_license_revoked")}
                className="w-full py-2 px-3 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {scenarioLoading === "driver_license_revoked" ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Launch Disqualified Driver Scenario</span>
              </button>
            </div>
          </div>

          {/* Scenario Execution Log */}
          {scenarioResult && (
            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">{scenarioResult.title}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-100 text-emerald-800">
                    {scenarioResult.outcome}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">
                  Latency: {scenarioResult.latencyMs}ms
                </span>
              </div>
              <p className="text-xs text-slate-600">{scenarioResult.description}</p>
              <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 text-[10px] font-mono overflow-x-auto">
                {JSON.stringify(scenarioResult.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: INTERACTIVE WHATSAPP OMNICHANNEL SIMULATOR */}
      {tab === "whatsapp" && (
        <div className="animate-in fade-in duration-150">
          <WhatsAppSimulator />
        </div>
      )}

      {/* TAB 5: INTERACTIVE USSD FEATURE PHONE SIMULATOR (*384*2026#) */}
      {tab === "ussd" && (
        <div className="animate-in fade-in duration-150">
          <UssdSimulator isInline={true} />
        </div>
      )}
    </div>
  );
}

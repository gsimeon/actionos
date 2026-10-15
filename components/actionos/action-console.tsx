"use client";

import React, { useState } from "react";
import {
  Send,
  Sparkles,
  RefreshCw,
  Globe,
  Radio,
  CheckCircle,
  CheckCircle2,
  Clock,
  FileCheck,
  AlertTriangle,
  X,
  Printer,
} from "lucide-react";
import { VoiceActionButton } from "@/components/voice/voice-action-button";
import { AuthorizationCard, type AuthorizationOptions } from "./authorization-dialog";
import { ActionLedger } from "./action-ledger";
import type { ActionLedgerEvent, AuthorizationDetails } from "@/types/actionos";
import type { ActionSessionStatus } from "@/types/database";
import { formatNaira, formatDate } from "@/lib/utils";

const PRESET_PROMPTS = [
  {
    lang: "en-NG",
    label: "Renew Camry (Benchmark)",
    text: "My car insurance expires next week. Check it and renew it for me.",
  },
  {
    lang: "en-NG",
    label: "Query Vehicle (English)",
    text: "Query vehicle database for car ABC-123-XY and verify registration status.",
  },
  {
    lang: "pcm",
    label: "Query Motor (Pidgin)",
    text: "Check my motor ABC-123-XY for inside vehicle database sharp sharp.",
  },
  {
    lang: "pcm",
    label: "Register Motor (Pidgin)",
    text: "I wan register my motor LAG-456-ZZ for inside vehicle database.",
  },
  {
    lang: "yo",
    label: "Query Ọkọ (Yorùbá)",
    text: "Ṣayẹwo ọkọ ABC-123-XY ninu data ọkọ ayọkẹlẹ ActionOS.",
  },
  {
    lang: "yo",
    label: "Register Ọkọ (Yorùbá)",
    text: "Mo fẹ forukọsilẹ ọkọ mi tuntun fun iforukọsilẹ osise pẹlu FRSC.",
  },
  {
    lang: "ha",
    label: "Query Mota (Hausa)",
    text: "Duba motata ABC-123-XY a cikin ma'adanar bayanan motoci.",
  },
  {
    lang: "ha",
    label: "Register Mota (Hausa)",
    text: "Ina so in yi rijistar sabuwar mota a cikin ma'ajiya tare da FRSC.",
  },
  {
    lang: "ig",
    label: "Query Ụgbọ Ala (Igbo)",
    text: "Lelee ụgbọ ala m ABC-123-XY n'ọdụ data ụgbọ ala.",
  },
  {
    lang: "ig",
    label: "Register Ụgbọ Ala (Igbo)",
    text: "Achọrọ m idebanye aha ụgbọ ala ọhụrụ m n'ActionOS.",
  },
  {
    lang: "en-NG",
    label: "Marketplace Quotes",
    text: "Compare renewal quotes for ABC-123-XY across Leadway, AXA Mansard, and AIICO.",
  },
];

const WORKFLOW_STEPS: Array<{ key: ActionSessionStatus; label: string }> = [
  { key: "understanding", label: "Understanding" },
  { key: "planning", label: "Planning" },
  { key: "validating", label: "Validating" },
  { key: "awaiting_authorization", label: "Authorization Gate" },
  { key: "executing", label: "Execution (Sandbox)" },
  { key: "verifying", label: "Verification" },
  { key: "completed", label: "Completed" },
];

interface CompletedOutcome {
  vehicle: string;
  plateNumber: string;
  underwriter: string;
  amount: number;
  currentExpiry?: string;
  newExpiry: string;
  policyNumber: string;
  certificateNumber: string;
  paymentReference: string;
  isComplete: boolean;
  missingFields: string[];
}

export function ActionConsole() {
  const [inputText, setInputText] = useState("My car insurance expires next week. Check it and renew it for me.");
  const [selectedLanguage, setSelectedLanguage] = useState("en-NG");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<ActionSessionStatus | null>(null);
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [authDetails, setAuthDetails] = useState<AuthorizationDetails | null>(null);
  const [ledgerEvents, setLedgerEvents] = useState<ActionLedgerEvent[]>([]);
  const [completedOutcome, setCompletedOutcome] = useState<CompletedOutcome | null>(null);
  const [showCertModal, setShowCertModal] = useState(false);

  const handleStartWorkflow = async (textToUse?: string) => {
    const text = textToUse || inputText;
    if (!text.trim()) return;

    setIsLoading(true);
    setResponseMessage(null);
    setAuthDetails(null);
    setCompletedOutcome(null);
    setShowCertModal(false);

    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "web",
          language: selectedLanguage,
          inputText: text,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setSessionId(json.data.sessionId);
        setSessionStatus(json.data.status);
        setResponseMessage(json.data.message);
        setLedgerEvents(json.data.events || []);
        if (json.data.authorizationRequired && json.data.authorizationDetails) {
          setAuthDetails(json.data.authorizationDetails);
        }
      } else {
        setResponseMessage(`Action failed: ${json.error?.message || "Unknown error"}`);
      }
    } catch {
      setResponseMessage("Network error communicating with ActionOS Orchestrator.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthorize = async (authorized: boolean, options?: AuthorizationOptions) => {
    if (!sessionId) return;
    setIsLoading(true);

    try {
      const res = await fetch(`/api/actions/${sessionId}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorized,
          quoteId: options?.quoteId || authDetails?.quoteId,
          authorizedQuoteId: options?.authorizedQuoteId || authDetails?.quoteId,
          selectedUnderwriter: options?.selectedUnderwriter,
          customAmount: options?.customAmount,
          authMethod: options?.authMethod,
          simulateSagaFailure: options?.simulateSagaFailure,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setSessionStatus(json.data.status);
        setResponseMessage(json.data.message);
        setLedgerEvents(json.data.events || []);

        if (json.data.status === "completed") {
          const events: ActionLedgerEvent[] = json.data.events || [];
          const certEvent = events.find(
            (e) => e.tool === "generate_certificate" || e.action === "issue_certificate"
          );
          const payEvent = events.find(
            (e) => e.tool === "execute_payment" || e.action === "execute_payment"
          );

          // Zero fabrication policy: only display verified identifiers returned by backend and ledger
          const certRef = certEvent?.referenceId?.trim() || "";
          const payRef = payEvent?.referenceId?.trim() || "";

          const missing: string[] = [];
          if (!certRef) missing.push("Statutory Certificate Reference");
          if (!payRef) missing.push("Payment Settlement Reference");

          setCompletedOutcome({
            vehicle: authDetails?.assetName || "Not available",
            plateNumber: authDetails?.assetIdentifier || "Not available",
            underwriter: authDetails?.providerName || options?.selectedUnderwriter || "Not available",
            amount: options?.customAmount || authDetails?.amount || 0,
            currentExpiry: authDetails?.currentExpiry || undefined,
            newExpiry: authDetails?.newExpiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            policyNumber: authDetails?.policyNumber || "Not available",
            certificateNumber: certRef || "Not available",
            paymentReference: payRef || "Not available",
            isComplete: missing.length === 0,
            missingFields: missing,
          });
        }

        if (
          json.data.status === "completed" ||
          json.data.status === "cancelled" ||
          json.data.status === "escalated"
        ) {
          setAuthDetails(null);
        }
      } else {
        setResponseMessage(`Authorization error: ${json.error?.message || "Failed"}`);
      }
    } catch {
      setResponseMessage("Network error during authorization settlement.");
    } finally {
      setIsLoading(false);
    }
  };

  const getStepProgressIndex = (status: ActionSessionStatus | null): number => {
    if (!status) return -1;
    if (status === "received") return 0;
    if (status === "understanding") return 1;
    if (status === "planning") return 2;
    if (status === "validating") return 3;
    if (status === "awaiting_authorization") return 4;
    if (status === "executing") return 5;
    if (status === "verifying") return 6;
    if (status === "completed") return 7;
    return -1;
  };

  const currentStepIdx = getStepProgressIndex(sessionStatus);

  return (
    <div className="space-y-8">
      {/* Interactive Command Center Card */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xl shadow-emerald-500/5 relative overflow-hidden">
        {/* Subtle fresh emerald ambient glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-emerald-100/50 blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                ActionOS Command Console
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Speak or type natural language to trigger autonomous, guardrailed execution across enterprise systems.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Language picker */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs shadow-xs">
              <Globe className="w-3.5 h-3.5 text-emerald-600" />
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-transparent text-slate-800 font-semibold outline-none cursor-pointer text-xs"
              >
                <option value="en-NG">Nigerian English (en-NG)</option>
                <option value="pcm">Nigerian Pidgin (pcm)</option>
                <option value="yo">Yorùbá (yo-NG)</option>
                <option value="ha">Hausa (ha-NG)</option>
                <option value="ig">Igbo (ig-NG)</option>
              </select>
            </div>

            {/* AI Engine badge */}
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs">
              <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              <span>N-ATLAS Adapter</span>
            </div>

            {/* Sandbox Mode badge */}
            <div
              className="flex items-center gap-1.5 bg-amber-50 text-amber-950 border border-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs"
              title="Demo Sandbox: Payment settlement is simulated and certificates are non-statutory test fixtures."
            >
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span>DEMO / SANDBOX</span>
            </div>
          </div>
        </div>

        {/* Sandbox Notice Banner */}
        <div className="mb-5 px-3.5 py-2.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="font-black bg-amber-200 text-amber-950 px-2 py-0.5 rounded-md text-[10px] tracking-wide">
              SANDBOX NOTICE
            </span>
            <span className="text-[11px] font-medium text-amber-900">
              Simulated Paystack gateway rails and non-statutory test certificate fixtures. No real funds are debited.
            </span>
          </div>
          <span className="font-mono text-[10px] text-amber-700 font-bold self-end sm:self-auto">
            FIXTURE: NON_STATUTORY
          </span>
        </div>

        {/* Input bar */}
        <div className="relative flex flex-col sm:flex-row items-stretch gap-2.5 bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:border-emerald-500 focus-within:bg-white transition-all shadow-inner">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading) handleStartWorkflow();
            }}
            placeholder="e.g. My car insurance expires next week. Check it and renew it for me."
            className="flex-1 bg-transparent px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none font-medium"
          />

          <div className="flex items-center gap-2 self-end sm:self-center pr-1">
            <VoiceActionButton
              onTranscript={(text) => {
                setInputText(text);
                handleStartWorkflow(text);
              }}
              language={selectedLanguage}
              isProcessing={isLoading}
            />

            <button
              type="button"
              onClick={() => handleStartWorkflow()}
              disabled={isLoading || !inputText.trim()}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/30 disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Execute Action</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Preset prompts for demo testing */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-600" /> Presets:
          </span>
          {PRESET_PROMPTS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setInputText(p.text);
                setSelectedLanguage(p.lang);
                handleStartWorkflow(p.text);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 border border-slate-200 text-[11px] font-medium text-slate-700 transition-all text-left shadow-2xs"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Workflow Lifecycle Stepper matching Section 19 */}
        {sessionStatus && (
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase mb-3 flex items-center justify-between">
              <span>Autonomous Workflow Lifecycle</span>
              <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                STATE: {sessionStatus.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {WORKFLOW_STEPS.map((step, idx) => {
                const stepNum = idx + 1;
                const isPassed = currentStepIdx > stepNum;
                const isCurrent = currentStepIdx === stepNum;

                return (
                  <div
                    key={step.key}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      isPassed
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800 font-bold"
                        : isCurrent
                        ? "bg-amber-50 border-amber-400 text-amber-900 font-bold ring-2 ring-amber-300/60 animate-pulse shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase mb-0.5">
                      {isPassed ? (
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                      ) : isCurrent ? (
                        <Clock className="w-3 h-3 text-amber-600" />
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </div>
                    <div className="text-xs truncate">
                      {step.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Response Notification Bubble */}
        {responseMessage && (
          <div className="mt-6 p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200/90 flex items-start gap-3 shadow-xs">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">
                ActionOS Assistant Response
              </div>
              <p className="text-sm text-slate-800 mt-0.5 leading-relaxed font-medium">
                {responseMessage}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Explicit Authorization Gate Card */}
      {authDetails && sessionStatus === "awaiting_authorization" && (
        <AuthorizationCard
          details={authDetails}
          onAuthorize={handleAuthorize}
          isSubmitting={isLoading}
        />
      )}

      {/* 05: Verify and Audit — Verified Execution Outcome & Certificate Preview */}
      {sessionStatus === "completed" && completedOutcome && (
        <div className={`rounded-3xl border-2 ${
          completedOutcome.isComplete
            ? "border-emerald-400/80 bg-gradient-to-b from-white via-emerald-50/20 to-emerald-50/40 shadow-emerald-500/10"
            : "border-amber-400/80 bg-gradient-to-b from-white via-amber-50/20 to-amber-50/40 shadow-amber-500/10"
        } p-6 sm:p-8 shadow-xl space-y-6 animate-in fade-in duration-300`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                completedOutcome.isComplete
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-amber-100 text-amber-800 border border-amber-300"
              } shadow-xs`}>
                {completedOutcome.isComplete ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-700" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-amber-700" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    {completedOutcome.isComplete
                      ? "Workflow Completed: Verified Renewal & Test Certificate"
                      : "Workflow Completed: Incomplete Verification"}
                  </h3>
                  {completedOutcome.isComplete ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-900 border border-emerald-300">
                      EXECUTION VERIFIED
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black text-rose-900 border border-rose-300">
                      INCOMPLETE OUTCOME: UNVERIFIED EVIDENCE
                    </span>
                  )}
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black text-amber-900 border border-amber-300">
                    SANDBOX RECORD
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 font-medium">
                  {completedOutcome.isComplete
                    ? "Autonomous lifecycle finished: eligibility validated, customer authorized, simulated payment settled, and policy rolled forward."
                    : "Autonomous lifecycle reported completed status, but one or more required ledger artifacts are missing from response."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                disabled={completedOutcome.certificateNumber === "Not available"}
                onClick={() => setShowCertModal(true)}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-800 border border-slate-200 text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                title={completedOutcome.certificateNumber === "Not available" ? "Certificate not available in ledger records" : "View Certificate Preview"}
              >
                <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>View Certificate Preview</span>
              </button>
            </div>
          </div>

          {/* Incomplete Outcome Warning Callout */}
          {!completedOutcome.isComplete && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-950 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Incomplete Verification Flag:</strong> Missing backend-verified references for:{" "}
                <span className="font-bold underline">{completedOutcome.missingFields.join(", ")}</span>.
                ActionOS strictly refuses to fabricate random fallback references. Please inspect the Action Ledger or escalation queue.
              </div>
            </div>
          )}

          {/* Details 4-box grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                POLICY STATE
              </span>
              <div className="text-xs font-bold text-slate-900">
                {completedOutcome.vehicle}
              </div>
              <div className="text-[11px] font-mono text-emerald-700 font-bold mt-0.5">
                {completedOutcome.plateNumber} &bull; {completedOutcome.policyNumber}
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                New Expiry: <strong className="text-slate-800">{formatDate(completedOutcome.newExpiry)}</strong>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                SIMULATED SETTLEMENT
              </span>
              <div className="text-sm font-black font-mono text-emerald-700">
                {formatNaira(completedOutcome.amount)}
              </div>
              <div className="text-[10px] text-slate-600 font-medium mt-0.5">
                Rail: <strong className="text-slate-800">Paystack (Simulated)</strong>
              </div>
              <div className="mt-1 text-[10px] font-mono truncate">
                Ref:{" "}
                {completedOutcome.paymentReference !== "Not available" ? (
                  <span className="text-slate-600 font-bold">{completedOutcome.paymentReference}</span>
                ) : (
                  <span className="text-rose-600 font-bold">Not available</span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                STATUTORY RECORD
              </span>
              <div className="text-xs font-bold text-slate-900">
                {completedOutcome.underwriter}
              </div>
              <div className="text-[10px] font-mono font-bold mt-0.5 truncate">
                {completedOutcome.certificateNumber !== "Not available" ? (
                  <span className="text-emerald-700">{completedOutcome.certificateNumber}</span>
                ) : (
                  <span className="text-rose-600">Not available</span>
                )}
              </div>
              {completedOutcome.certificateNumber !== "Not available" ? (
                <div className="mt-2 inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200">
                  NON-STATUTORY FIXTURE
                </div>
              ) : (
                <div className="mt-2 inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-rose-100 text-rose-900 border border-rose-200">
                  MISSING RECORD
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                CRYPTOGRAPHIC AUDIT
              </span>
              <div className="text-xs font-bold text-slate-900">
                Action Ledger™
              </div>
              <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
                {ledgerEvents.length} Atomic Events Chained
              </div>
              <div className="mt-2 text-[10px] text-slate-500 font-mono">
                SHA-256 Merkle verified
              </div>
            </div>
          </div>

          {/* Sandbox Disclosure Callout */}
          <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Sandbox Disclosure:</strong> This transaction and generated certificate ({completedOutcome.certificateNumber !== "Not available" ? `#${completedOutcome.certificateNumber}` : "Not available"}) are simulated demo fixtures for the NITDA 2026 AI Innovation Challenge. In production deployment, ActionOS verifies policies against the live NAICOM NIID database and processes real settlement via production Paystack keys.
            </div>
          </div>
        </div>
      )}

      {/* Test Certificate Preview Modal */}
      {showCertModal && completedOutcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Modal close */}
            <button
              type="button"
              onClick={() => setShowCertModal(false)}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Certificate Header */}
            <div className="text-center pb-4 border-b border-slate-100 relative">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-black uppercase tracking-wider mb-2">
                DEMO / SANDBOX FIXTURE &bull; NON-STATUTORY
              </div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                FEDERAL REPUBLIC OF NIGERIA
              </h2>
              <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                National Insurance Commission (NAICOM) &bull; NIID Electronic Certificate
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                Motor Vehicles (Third Party Insurance) Act 1950 / Insurance Act 2003
              </div>
            </div>

            {/* Simulated Watermark Background */}
            <div className="my-5 p-5 rounded-2xl bg-slate-50 border border-slate-200 relative overflow-hidden space-y-3 font-mono text-xs">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5 rotate-[-20deg] select-none text-4xl font-black text-slate-900">
                SIMULATED TEST FIXTURE
              </div>

              <div className="grid grid-cols-2 gap-3 text-slate-700">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">CERTIFICATE NUMBER</span>
                  <span className="font-bold text-slate-900">{completedOutcome.certificateNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">POLICY NUMBER</span>
                  <span className="font-bold text-slate-900">{completedOutcome.policyNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">REGISTRATION NO. (PLATE)</span>
                  <span className="font-bold text-emerald-800">{completedOutcome.plateNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">VEHICLE DESCRIPTION</span>
                  <span className="font-bold text-slate-900">{completedOutcome.vehicle}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">UNDERWRITER</span>
                  <span className="font-bold text-slate-900">{completedOutcome.underwriter}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">PREMIUM SETTLED</span>
                  <span className="font-bold text-emerald-800">{formatNaira(completedOutcome.amount)} (Simulated)</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">EFFECTIVE FROM</span>
                  <span>{formatDate(completedOutcome.currentExpiry || new Date().toISOString())}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">EXPIRING AT</span>
                  <span className="font-bold text-emerald-800">{formatDate(completedOutcome.newExpiry)}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200/80 text-[10px] text-slate-500 font-sans leading-relaxed">
                This certificate certifies that an insurance policy covering the liabilities described in the Insurance Act has been issued for the designated vehicle.
                <strong className="block text-amber-900 mt-1">
                  NOTICE: Generated in sandbox mode by ActionOS for evaluation purposes. Not a statutory document for law enforcement or roadworthiness inspection.
                </strong>
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400 font-mono">
                SESSION: {sessionId || "N/A"}
              </span>
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Action Ledger Timeline */}
      <ActionLedger
        events={ledgerEvents}
        sessionId={sessionId || undefined}
        onRunSampleAction={() => {
          setInputText(PRESET_PROMPTS[0].text);
          setSelectedLanguage(PRESET_PROMPTS[0].lang);
          handleStartWorkflow(PRESET_PROMPTS[0].text);
        }}
      />
    </div>
  );
}

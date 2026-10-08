"use client";

import React, { useState } from "react";
import {
  Send,
  Sparkles,
  RefreshCw,
  Globe,
  Radio,
  CheckCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { VoiceActionButton } from "@/components/voice/voice-action-button";
import { AuthorizationCard, type AuthorizationOptions } from "./authorization-dialog";
import { ActionLedger } from "./action-ledger";
import type { ActionLedgerEvent, AuthorizationDetails } from "@/types/actionos";
import type { ActionSessionStatus } from "@/types/database";

const PRESET_PROMPTS = [
  {
    lang: "en-NG",
    label: "Renew Camry (Benchmark)",
    text: "My car insurance expires next week. Check it and renew it for me.",
  },
  {
    lang: "en-NG",
    label: "Marketplace Quotes",
    text: "Compare renewal quotes for ABC-123-XY across Leadway, AXA Mansard, and AIICO.",
  },
  {
    lang: "en-NG",
    label: "NIID & FRSC Verification",
    text: "Verify ABC-123-XY on NIID and FRSC database before renewing.",
  },
  {
    lang: "pcm",
    label: "Nigerian Pidgin",
    text: "My motor insurance wan expire next week o. Help me check am and renew am sharply.",
  },
  {
    lang: "yo",
    label: "Yorùbá",
    text: "Inshoranisi moto mi fe pare lose to n bo. Ba mi se atunto re.",
  },
  {
    lang: "ha",
    label: "Hausa",
    text: "Inshorar mota ta zata kare mako mai zuwa. Da fatan za a duba a sabunta min.",
  },
  {
    lang: "ig",
    label: "Igbo",
    text: "Inshorans ugbo ala m ga-agwụ n'izu na-abịa. Biko lelee ma mee ka ọ dị ọhụrụ.",
  },
];

const WORKFLOW_STEPS: Array<{ key: ActionSessionStatus; label: string }> = [
  { key: "understanding", label: "Understanding" },
  { key: "planning", label: "Planning" },
  { key: "validating", label: "Validating" },
  { key: "awaiting_authorization", label: "Authorization Gate" },
  { key: "executing", label: "Execution" },
  { key: "verifying", label: "Verification" },
  { key: "completed", label: "Completed" },
];

export function ActionConsole() {
  const [inputText, setInputText] = useState("My car insurance expires next week. Check it and renew it for me.");
  const [selectedLanguage, setSelectedLanguage] = useState("en-NG");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<ActionSessionStatus | null>(null);
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [authDetails, setAuthDetails] = useState<AuthorizationDetails | null>(null);
  const [ledgerEvents, setLedgerEvents] = useState<ActionLedgerEvent[]>([]);

  const handleStartWorkflow = async (textToUse?: string) => {
    const text = textToUse || inputText;
    if (!text.trim()) return;

    setIsLoading(true);
    setResponseMessage(null);
    setAuthDetails(null);

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
          </div>
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

      {/* Signature Action Ledger Timeline */}
      <ActionLedger
        events={ledgerEvents}
        sessionId={sessionId || undefined}
      />
    </div>
  );
}

"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Shield,
  CreditCard,
  Bot,
  User,
  Cpu,
  FileCheck,
  ChevronDown,
  Hash,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { ActionLedgerEvent } from "@/types/actionos";
import { formatDateTime } from "@/lib/utils";
import { verifyLedgerIntegrity } from "@/lib/actionos/crypto-ledger";

interface ActionLedgerProps {
  events: ActionLedgerEvent[];
  sessionId?: string;
  workflowTitle?: string;
  className?: string;
}

export function ActionLedger({
  events,
  sessionId,
  workflowTitle = "Vehicle Insurance Renewal Orchestration",
  className,
}: ActionLedgerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tamperedEvents, setTamperedEvents] = useState<ActionLedgerEvent[] | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<{ checked: boolean; valid: boolean; reason?: string } | null>(null);

  const activeEvents = tamperedEvents ?? events;
  const isSimulatedTamper = tamperedEvents !== null;

  const handleVerifyChain = () => {
    const res = verifyLedgerIntegrity(activeEvents, { verifySignatures: true });
    setVerifyStatus({ checked: true, valid: res.valid, reason: res.reason });
  };

  const handleSimulateTamper = () => {
    if (events.length < 2) return;
    const tampered = events.map((e, idx) => {
      if (idx === 1) {
        return {
          ...e,
          description: "[UNAUTHORIZED TAMPER] Policy renewed for ₦20,000 without underwriter consent",
          // Intentionally do not recompute hash to prove hash-chaining verification
        };
      }
      return e;
    });
    setTamperedEvents(tampered);
    const res = verifyLedgerIntegrity(tampered);
    setVerifyStatus({ checked: true, valid: res.valid, reason: res.reason });
  };

  const handleRestoreChain = () => {
    setTamperedEvents(null);
    const res = verifyLedgerIntegrity(events);
    setVerifyStatus({ checked: true, valid: res.valid, reason: res.reason });
  };

  const getActorIcon = (actor: ActionLedgerEvent["actor"]) => {
    switch (actor) {
      case "User":
        return <User className="w-3.5 h-3.5 text-blue-600" />;
      case "N-ATLAS AI":
        return <Bot className="w-3.5 h-3.5 text-emerald-600" />;
      case "Payment Gateway":
        return <CreditCard className="w-3.5 h-3.5 text-amber-600" />;
      case "Policy Guardrail":
        return <Shield className="w-3.5 h-3.5 text-purple-600" />;
      case "Saga Compensator":
        return <RotateCcw className="w-3.5 h-3.5 text-rose-600" />;
      default:
        return <Cpu className="w-3.5 h-3.5 text-teal-600" />;
    }
  };

  const getStatusBadge = (status: ActionLedgerEvent["status"], isCompensating?: boolean) => {
    if (isCompensating) {
      return (
        <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full shadow-2xs">
          <RotateCcw className="w-3 h-3 text-rose-600" />
          Saga Reversal
        </span>
      );
    }

    switch (status) {
      case "verified":
      case "completed":
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shadow-2xs">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Verified
          </span>
        );
      case "pending":
      case "processing":
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full shadow-2xs">
            <Clock className="w-3 h-3 text-amber-600 animate-spin" />
            Processing
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full shadow-2xs">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 backdrop-blur-xl shadow-xl shadow-emerald-500/5 ${className || ""}`}>
      {/* Ledger Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
              <FileCheck className="h-4 w-4" />
            </div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              Action Ledger™
            </h2>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
              IMMUTABLE AUDIT TRAIL
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {workflowTitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sessionId && (
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-slate-400 font-bold">SESSION:</span>
              <span className="text-emerald-700 font-bold">{sessionId}</span>
            </div>
          )}

          {activeEvents.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleVerifyChain}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verify Chain</span>
              </button>

              {!isSimulatedTamper ? (
                <button
                  type="button"
                  onClick={handleSimulateTamper}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold transition-all shadow-xs cursor-pointer"
                  title="Simulate modifying a historical block to test cryptographic tamper detection"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Simulate Tamper</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRestoreChain}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                  <span>Restore Integrity</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Cryptographic Verification Banner */}
      {verifyStatus && (
        <div className={`p-3 rounded-2xl mb-4 text-xs flex items-center justify-between border ${
          verifyStatus.valid
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-rose-50 border-rose-300 text-rose-900 ring-2 ring-rose-400/20"
        }`}>
          <div className="flex items-center gap-2 font-semibold">
            {verifyStatus.valid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>
              {verifyStatus.valid
                ? `Cryptographic Audit Proof: All ${activeEvents.length} events are SHA-256 linked with valid Merkle hash integrity.`
                : `Tamper Evidence Alert: ${verifyStatus.reason}. ActionOS has rejected the unverified ledger chain.`}
            </span>
          </div>
          <span className={`font-mono text-[10px] px-2 py-0.5 rounded border font-bold ${
            verifyStatus.valid
              ? "bg-white border-emerald-200 text-emerald-800"
              : "bg-rose-100 border-rose-300 text-rose-800"
          }`}>
            {verifyStatus.valid ? "ZERO_TAMPER_DETECTED" : "INTEGRITY_VIOLATION"}
          </span>
        </div>
      )}

      {/* Events Timeline */}
      {activeEvents.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-xs font-medium">
          No ledger events recorded yet. Initiate an action to view the atomic execution stream.
        </div>
      ) : (
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-emerald-500 before:via-teal-400 before:to-slate-200">
          {activeEvents.map((event, idx) => {
            const isExpanded = expandedId === event.id;
            const isCompromised = isSimulatedTamper && idx === 1;

            return (
              <div
                key={event.id || idx}
                className="relative group transition-all"
              >
                {/* Node indicator */}
                <div className={`absolute -left-[27px] top-2 flex h-4 w-4 items-center justify-center rounded-full bg-white border-2 ${
                  event.isCompensating ? "border-rose-500" : "border-emerald-500"
                } shadow-xs group-hover:scale-125 transition-transform`}>
                  <div className={`h-1.5 w-1.5 rounded-full ${event.isCompensating ? "bg-rose-600" : "bg-emerald-600"}`} />
                </div>

                {/* Event card */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                  className={`rounded-2xl border p-3.5 transition-all cursor-pointer shadow-xs hover:shadow-md ${
                    isCompromised
                      ? "border-rose-400 bg-rose-50/90 ring-2 ring-rose-500/30"
                      : event.isCompensating
                      ? "border-rose-200 bg-rose-50/40 hover:bg-rose-50"
                      : "border-slate-200/80 bg-slate-50/80 hover:bg-white hover:border-emerald-300"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 border border-slate-200 text-[11px] font-bold text-slate-700 shadow-2xs">
                        {getActorIcon(event.actor)}
                        <span>{event.actor}</span>
                      </div>

                      <span className={`text-xs font-bold tracking-wide ${isCompromised ? "text-rose-950 font-black" : "text-slate-900"}`}>
                        {event.description}
                      </span>

                      {isCompromised && (
                        <span className="rounded-full bg-rose-600 text-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider animate-pulse">
                          TAMPER DETECTED
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 self-end sm:self-auto">
                      {event.durationMs !== undefined && (
                        <span className="font-mono text-[10px] text-slate-500 font-semibold">
                          {event.durationMs}ms
                        </span>
                      )}
                      {getStatusBadge(event.status, event.isCompensating)}
                      <span className="font-mono text-[10px] text-slate-400">
                        {formatDateTime(event.timestamp)}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </div>

                  {/* Expanded metadata drawer */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 bg-white p-3 rounded-xl border border-slate-200/70 shadow-2xs text-[11px] font-mono">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600">
                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold">ACTION TYPE</span>
                          <span className="text-slate-800 font-bold">{event.action}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold">EXECUTED TOOL</span>
                          <span className="text-emerald-700 font-bold">{event.tool || "n/a"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold">REFERENCE ID</span>
                          <span className="text-amber-700 font-bold">{event.referenceId || "—"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold">EVENT ID</span>
                          <span className="text-slate-500 truncate">{event.id}</span>
                        </div>
                      </div>

                      {/* Cryptographic Hash Chain Inspector */}
                      {event.hash && (
                        <div className="pt-2 border-t border-slate-100 space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span className="font-bold flex items-center gap-1 text-emerald-800">
                              <Hash className="w-3 h-3 text-emerald-600" />
                              SHA-256 EVENT HASH:
                            </span>
                            <span className="text-slate-700 font-mono select-all truncate max-w-[280px]">
                              {event.hash}
                            </span>
                          </div>

                          {event.previousHash && (
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span className="font-bold">PREVIOUS HASH:</span>
                              <span className="font-mono select-all truncate max-w-[280px]">
                                {event.previousHash}
                              </span>
                            </div>
                          )}

                          {event.signature && (
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span className="font-bold">DIGITAL SIGNATURE:</span>
                              <span className="font-mono text-emerald-700 select-all truncate max-w-[280px]">
                                {event.signature}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

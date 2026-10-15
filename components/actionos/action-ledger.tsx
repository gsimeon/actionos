"use client";

import React, { useState, useMemo } from "react";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Shield,
  CreditCard,
  Bot,
  User,
  Cpu,
  ChevronDown,
  Hash,
  RotateCcw,
  ShieldCheck,
  Zap,
  Search,
  Filter,
  Download,
  Copy,
  Check,
  Code,
  X,
  FileSpreadsheet,
} from "lucide-react";
import type { ActionLedgerEvent } from "@/types/actionos";
import { formatDateTime } from "@/lib/utils";
import { verifyLedgerIntegrity } from "@/lib/actionos/crypto-ledger";

interface ActionLedgerProps {
  events: ActionLedgerEvent[];
  sessionId?: string;
  workflowTitle?: string;
  className?: string;
  onRunSampleAction?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function ActionLedger({
  events,
  sessionId,
  workflowTitle = "Vehicle Insurance Renewal Orchestration",
  className,
  onRunSampleAction,
  onRefresh,
  isRefreshing,
}: ActionLedgerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inspectEvent, setInspectEvent] = useState<ActionLedgerEvent | null>(null);
  const [tamperedEvents, setTamperedEvents] = useState<ActionLedgerEvent[] | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<{ checked: boolean; valid: boolean; reason?: string } | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [compensatingOnly, setCompensatingOnly] = useState(false);

  const activeEvents = tamperedEvents ?? events;
  const isSimulatedTamper = tamperedEvents !== null;

  // Filtered events
  const filteredEvents = useMemo(() => {
    return activeEvents.filter((ev) => {
      if (actorFilter !== "all" && ev.actor.toLowerCase() !== actorFilter.toLowerCase()) {
        return false;
      }
      if (statusFilter !== "all" && ev.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      if (compensatingOnly && !ev.isCompensating) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesDesc = ev.description.toLowerCase().includes(q);
        const matchesAction = ev.action.toLowerCase().includes(q);
        const matchesTool = ev.tool?.toLowerCase().includes(q);
        const matchesRef = ev.referenceId?.toLowerCase().includes(q);
        const matchesSession = ev.sessionId?.toLowerCase().includes(q);
        const matchesId = ev.id.toLowerCase().includes(q);
        if (!matchesDesc && !matchesAction && !matchesTool && !matchesRef && !matchesSession && !matchesId) {
          return false;
        }
      }
      return true;
    });
  }, [activeEvents, actorFilter, statusFilter, compensatingOnly, searchQuery]);

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

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(filteredEvents, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `actionos_ledger_${sessionId || "export"}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const headers = ["ID", "Session ID", "Timestamp", "Actor", "Action", "Status", "Tool", "Reference ID", "Compensating", "Description", "Hash"];
    const rows = filteredEvents.map((e) => [
      `"${e.id}"`,
      `"${e.sessionId}"`,
      `"${e.timestamp}"`,
      `"${e.actor}"`,
      `"${e.action}"`,
      `"${e.status}"`,
      `"${e.tool || ""}"`,
      `"${e.referenceId || ""}"`,
      `"${Boolean(e.isCompensating)}"`,
      `"${(e.description || "").replace(/"/g, '""')}"`,
      `"${e.hash || ""}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `actionos_ledger_${sessionId || "export"}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shadow-2xs">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Verified
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full shadow-2xs">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            Halted
          </span>
        );
      case "pending":
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shadow-2xs">
            <Clock className="w-3 h-3 text-amber-600" />
            Pending
          </span>
        );
      default:
        return (
          <span className="text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
            {status}
          </span>
        );
    }
  };

  return (
    <div className={`space-y-6 ${className || ""}`}>
      {/* Top Banner / Verification Header */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-slate-900 tracking-tight text-base sm:text-lg">
                  {workflowTitle}
                </h3>
                <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2 py-0.5 border border-emerald-300">
                  APPEND-ONLY
                </span>
                <span className="rounded-full bg-slate-100 text-slate-700 text-[10px] font-mono font-bold px-2 py-0.5 border border-slate-300">
                  HMAC-SHA256
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cryptographically chained and signed immutable audit ledger. Total recorded events:{" "}
                <span className="font-bold text-slate-900">{activeEvents.length}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300/80 rounded-xl transition-colors cursor-pointer disabled:opacity-60"
              >
                <Clock className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-600" : ""}`} />
                <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleVerifyChain}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              <Hash className="w-3.5 h-3.5 text-emerald-600" />
              <span>Verify Chain Integrity</span>
            </button>

            {!isSimulatedTamper ? (
              <button
                type="button"
                onClick={handleSimulateTamper}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>Simulate Tamper</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRestoreChain}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                <span>Restore Chain</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
              title="Export complete ledger as JSON"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>JSON</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors cursor-pointer shadow-2xs"
              title="Export complete ledger as CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Verification Status Feedback Callout */}
        {verifyStatus && (
          <div
            className={`mt-4 rounded-xl p-3.5 border flex items-center justify-between text-xs transition-all ${
              verifyStatus.valid
                ? "bg-emerald-50/90 border-emerald-300 text-emerald-900"
                : "bg-rose-50/95 border-rose-300 text-rose-950 font-medium animate-pulse"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {verifyStatus.valid ? (
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
              )}
              <div>
                <span className="font-black">
                  {verifyStatus.valid
                    ? "CRYPTOGRAPHIC CHAIN INTEGRITY: 100% VERIFIED"
                    : "TAMPER DETECTED: HASH CHAIN BROKEN"}
                </span>
                <span className="block text-[11px] mt-0.5 opacity-90">
                  {verifyStatus.reason ||
                    "All sequential event hashes match their linked parents and HMAC signatures are authentic."}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold bg-white/70 px-2 py-0.5 rounded border border-current">
              {activeEvents.length} BLOCKS VERIFIED
            </span>
          </div>
        )}
      </div>

      {/* Filter & Search Toolbar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm shadow-slate-200/30 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search description, action, tool, reference, or session..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Actor:</span>
              <select
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:outline-hidden focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">All Actors</option>
                <option value="User">User</option>
                <option value="N-ATLAS AI">N-ATLAS AI</option>
                <option value="ActionOS Engine">ActionOS Engine</option>
                <option value="Payment Gateway">Payment Gateway</option>
                <option value="Policy Guardrail">Policy Guardrail</option>
                <option value="Saga Compensator">Saga Compensator</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:outline-hidden focus:border-emerald-500 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="verified">Verified</option>
                <option value="pending">Pending</option>
                <option value="failed">Halted</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setCompensatingOnly(!compensatingOnly)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                compensatingOnly
                  ? "bg-rose-100 border-rose-300 text-rose-800"
                  : "bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <RotateCcw className="w-3 h-3 text-rose-600" />
              <span>Saga Reversals Only</span>
            </button>
          </div>
        </div>

        {(searchQuery || actorFilter !== "all" || statusFilter !== "all" || compensatingOnly) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <span>
              Showing <strong className="text-slate-800">{filteredEvents.length}</strong> of{" "}
              <strong>{activeEvents.length}</strong> recorded events
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActorFilter("all");
                setStatusFilter("all");
                setCompensatingOnly(false);
              }}
              className="text-emerald-700 hover:underline font-bold"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Events Timeline / List */}
      {filteredEvents.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Filter className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-slate-800 text-sm">No ledger events match your filters</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search query, actor selection, or clearing status filters to view historical records.
          </p>
          {onRunSampleAction && (
            <button
              type="button"
              onClick={onRunSampleAction}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Run Sample Renewal Action</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-slate-200/80 before:z-0">
          {filteredEvents.map((event, idx) => {
            const isExpanded = expandedId === event.id;
            const isCompromised =
              isSimulatedTamper &&
              idx === 1 &&
              event.description.includes("[UNAUTHORIZED TAMPER]");

            return (
              <div key={event.id} className="relative pl-10 z-10 group">
                {/* Timeline Node Icon */}
                <div
                  className={`absolute left-3 top-3.5 -ml-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-transform group-hover:scale-110 shadow-xs ${
                    isCompromised
                      ? "bg-rose-600 border-rose-300 text-white"
                      : event.status === "verified"
                      ? "bg-emerald-600 border-white text-white"
                      : event.status === "failed"
                      ? "bg-rose-500 border-white text-white"
                      : "bg-amber-500 border-white text-white"
                  }`}
                >
                  {isCompromised ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : event.status === "verified" ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : event.status === "failed" ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : (
                    <Clock className="w-3 h-3" />
                  )}
                </div>

                {/* Event Card */}
                <div
                  className={`rounded-2xl border p-4 transition-all duration-200 cursor-pointer ${
                    isCompromised
                      ? "border-rose-400 bg-rose-50/70 shadow-md shadow-rose-200/50"
                      : isExpanded
                      ? "border-emerald-500/80 bg-white shadow-md shadow-emerald-500/5 ring-2 ring-emerald-500/10"
                      : "border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-xs"
                  }`}
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 border border-slate-200/80 text-[11px] font-bold text-slate-700 shadow-2xs">
                        {getActorIcon(event.actor)}
                        <span>{event.actor}</span>
                      </div>

                      <span
                        className={`text-xs font-bold tracking-tight ${
                          isCompromised ? "text-rose-950 font-black" : "text-slate-900"
                        }`}
                      >
                        {event.description}
                      </span>

                      {isCompromised && (
                        <span className="rounded-full bg-rose-600 text-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider animate-pulse">
                          TAMPER DETECTED
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      {event.durationMs !== undefined && (
                        <span className="font-mono text-[10px] text-slate-500 font-semibold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
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

                  {/* Expanded metadata preview */}
                  {isExpanded && (
                    <div
                      className="mt-3 pt-3 border-t border-slate-100 space-y-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 text-[11px] font-mono"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600">
                        <div>
                          <span className="text-slate-400 block text-[9px] font-black tracking-wider uppercase">
                            ACTION TYPE
                          </span>
                          <span className="text-slate-800 font-bold">{event.action}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] font-black tracking-wider uppercase">
                            EXECUTED TOOL
                          </span>
                          <span className="text-emerald-700 font-bold">{event.tool || "n/a"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] font-black tracking-wider uppercase">
                            REFERENCE ID
                          </span>
                          <span className="text-amber-700 font-bold truncate block">{event.referenceId || "—"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] font-black tracking-wider uppercase">
                            EVENT SEQUENCE
                          </span>
                          <span className="text-slate-700 font-bold">
                            #{event.sequenceNumber ?? idx + 1}
                          </span>
                        </div>
                      </div>

                      {/* Cryptographic Hash Chain Inspector */}
                      {event.hash && (
                        <div className="pt-2 border-t border-slate-200/70 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span className="font-bold flex items-center gap-1 text-emerald-800">
                              <Hash className="w-3 h-3 text-emerald-600" />
                              SHA-256 EVENT HASH:
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-slate-700 font-mono select-all truncate max-w-[240px] sm:max-w-md">
                                {event.hash}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(event.hash!, `h_${event.id}`)}
                                className="text-slate-400 hover:text-slate-600"
                                title="Copy hash"
                              >
                                {copiedText === `h_${event.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>

                          {event.previousHash && (
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span className="font-bold">PREVIOUS HASH:</span>
                              <span className="font-mono select-all truncate max-w-[240px] sm:max-w-md">
                                {event.previousHash}
                              </span>
                            </div>
                          )}

                          {event.signature && (
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span className="font-bold">HMAC SIGNATURE:</span>
                              <span className="font-mono text-emerald-700 select-all truncate max-w-[240px] sm:max-w-md">
                                {event.signature}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-end pt-2 border-t border-slate-200/70">
                        <button
                          type="button"
                          onClick={() => setInspectEvent(event)}
                          className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                        >
                          <Code className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Inspect Full Event Payload</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Deep Dive Raw Event Payload Modal */}
      {inspectEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-xs">
                  <Code className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">Action Ledger Event Inspector</h4>
                  <p className="text-[11px] font-mono text-slate-500">ID: {inspectEvent.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectEvent(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">SESSION ID</span>
                  <span className="font-bold text-slate-800 select-all">{inspectEvent.sessionId}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">ACTION NAME</span>
                  <span className="font-bold text-emerald-800">{inspectEvent.action}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">ACTOR</span>
                  <span className="font-bold text-slate-800">{inspectEvent.actor}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">STATUS</span>
                  <span className="font-bold text-slate-800">{inspectEvent.status}</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    RAW JSON PAYLOAD & SIGNATURE METADATA
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(JSON.stringify(inspectEvent, null, 2), "raw_json")}
                    className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  >
                    {copiedText === "raw_json" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedText === "raw_json" ? "Copied!" : "Copy JSON"}</span>
                  </button>
                </div>
                <pre className="bg-slate-900 text-emerald-400 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-72 border border-slate-800 select-all">
                  {JSON.stringify(inspectEvent, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setInspectEvent(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

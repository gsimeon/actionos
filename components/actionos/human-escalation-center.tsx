"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  UserCheck,
  Lock,
  Clock,
  Info,
  RotateCcw,
  RefreshCw,
  Layers,
  Play,
  Activity,
  History,
} from "lucide-react";
import { formatNaira } from "@/lib/utils";

export interface EscalationCase {
  id: string;
  policyNumber: string;
  customerName: string;
  vehicleName: string;
  plateNumber: string;
  guardrailTriggered: string;
  reason: string;
  severity: "critical" | "warning" | "high";
  attemptedAmount?: number;
  expectedThreshold?: number;
  expiryDate?: string;
  timestamp: string;
  status: "open" | "resolved" | "overridden";
  sessionId?: string;
}

export interface ReconciliationQueueItem {
  sessionId: string;
  status: string;
  attempts?: number;
  reason?: string;
  deadLetteredAt?: string;
  nextRetryAt?: string;
  amount?: number;
  policyNumber?: string;
  customerName?: string;
}

export interface ReconciliationReport {
  totalPending: number;
  deadLetteredCount: number;
  retryableCount: number;
  deadLetterQueue: ReconciliationQueueItem[];
  retryQueue: ReconciliationQueueItem[];
}

const BENCHMARK_ESCALATIONS: EscalationCase[] = [
  {
    id: "esc_2026_001",
    policyNumber: "AUTO-2026-99214",
    customerName: "Alhaji Ibrahim Danladi",
    vehicleName: "Mercedes-Benz C300",
    plateNumber: "ABJ-452-LK",
    guardrailTriggered: "STATUTORY_ELIGIBILITY_WINDOW",
    reason: "Renewal requested 184 days prior to expiration (Expires Nov 2026). ActionOS requires renewal window within 30 days of expiry.",
    severity: "warning",
    expiryDate: "2026-11-20",
    timestamp: "12 mins ago",
    status: "open",
    sessionId: "act_esc_window_001",
  },
  {
    id: "esc_2026_002",
    policyNumber: "AUTO-2026-88129",
    customerName: "Folake Adebayo",
    vehicleName: "Lexus RX350",
    plateNumber: "KJA-889-ZZ",
    guardrailTriggered: "ACTUARIAL_PRICE_SPIKE",
    reason: "Requested premium ₦320,000 exceeds maximum allowable actuarial threshold (₦125,000). Potential price gouging or system mismatch.",
    severity: "critical",
    attemptedAmount: 320000,
    expectedThreshold: 125000,
    timestamp: "34 mins ago",
    status: "open",
    sessionId: "act_esc_price_002",
  },
  {
    id: "esc_2026_003",
    policyNumber: "AUTO-2026-10492",
    customerName: "Emeka Okafor",
    vehicleName: "Toyota Corolla",
    plateNumber: "EN-001-FAKE",
    guardrailTriggered: "STATUTORY_NIID_MISMATCH",
    reason: "Chassis and registration plate failed verification on FRSC/NIID national insurance database. Potential counterfeit or unmapped asset.",
    severity: "critical",
    timestamp: "1 hr ago",
    status: "open",
    sessionId: "act_esc_niid_003",
  },
  {
    id: "esc_2026_004",
    policyNumber: "AUTO-2026-00182",
    customerName: "Demo Customer",
    vehicleName: "Toyota Camry",
    plateNumber: "ABC-123-XY",
    guardrailTriggered: "SAGA_COMPENSATING_HOLD",
    reason: "Downstream document registry connection timed out during certificate stamping. Automated compensating refund of ₦87,500 executed. Requires supervisor review before re-attempt.",
    severity: "high",
    attemptedAmount: 87500,
    timestamp: "2 hrs ago",
    status: "resolved",
    sessionId: "act_benchmark_camry_001",
  },
  {
    id: "esc_2026_005",
    policyNumber: "AUTO-2026-00182",
    customerName: "Demo Customer",
    vehicleName: "Toyota Camry",
    plateNumber: "ABC-123-XY",
    guardrailTriggered: "GATEWAY_RECONCILIATION_REQUIRED",
    reason: "Payment provider timeout during settlement verification. Stored idempotency reference flagged for background reconciliation; duplicate charges prevented.",
    severity: "high",
    attemptedAmount: 87500,
    timestamp: "18 mins ago",
    status: "open",
    sessionId: "act_recon_gateway_001",
  },
  {
    id: "esc_2026_006",
    policyNumber: "AUTO-2026-33918",
    customerName: "Babajide Williams",
    vehicleName: "Honda Accord",
    plateNumber: "APP-512-AB",
    guardrailTriggered: "REFUND_EXECUTION_UNCONFIRMED",
    reason: "Downstream renewal failed; automated refund was dispatched but provider confirmation is unverified. Session escalated with refund_pending status.",
    severity: "critical",
    attemptedAmount: 65000,
    timestamp: "4 mins ago",
    status: "open",
    sessionId: "act_recon_refund_002",
  },
  {
    id: "esc_2026_007",
    policyNumber: "HMO-PLAT-2026-00812",
    customerName: "Dr. Amina Bello",
    vehicleName: "Hygeia HMO (Platinum)",
    plateNumber: "NHIA-HMO-LAG",
    guardrailTriggered: "NHIA_PRIMARY_FACILITY_CAPACITY",
    reason: "Assigned healthcare provider Lagoon Hospitals Victoria Island has reached NHIA quarterly capitation ceiling (5,000 enrollees). Requires supervisor rerouting to Reddington or St. Nicholas.",
    severity: "warning",
    attemptedAmount: 145000,
    timestamp: "8 mins ago",
    status: "open",
    sessionId: "act_esc_nhia_007",
  },
  {
    id: "esc_2026_008",
    policyNumber: "FRSC-LA-2024-009182",
    customerName: "Chinedu Eze",
    vehicleName: "National Driver's License",
    plateNumber: "FRSC-CLASS-E",
    guardrailTriggered: "FRSC_MEDICAL_FITNESS_MANDATE",
    reason: "Commercial Class E heavy articulated renewal requires mandatory FRSC accredited optical & cardiovascular fitness certificate. Physical biometric capture paused.",
    severity: "critical",
    attemptedAmount: 15000,
    timestamp: "15 mins ago",
    status: "open",
    sessionId: "act_esc_frsc_008",
  },
  {
    id: "esc_2026_009",
    policyNumber: "MVAA-LIC-2026-00182",
    customerName: "Tunde Bakare",
    vehicleName: "Ford Transit Van",
    plateNumber: "KRD-990-XA",
    guardrailTriggered: "LACVIS_BRAKE_SAFETY_FAILURE",
    reason: "Computerized vehicle inspection at LACVIS Ojodu Center recorded 52% brake efficiency (minimum statutory threshold 70%). Commercial roadworthiness renewal halted.",
    severity: "critical",
    attemptedAmount: 25000,
    timestamp: "22 mins ago",
    status: "open",
    sessionId: "act_esc_lacvis_009",
  },
];

const BENCHMARK_RECON_ITEMS: ReconciliationQueueItem[] = [
  {
    sessionId: "act_recon_gateway_001",
    status: "executing",
    attempts: 1,
    reason: "Paystack gateway timeout during webhook verification. Idempotency key stored.",
    nextRetryAt: new Date(Date.now() + 180000).toISOString(),
    amount: 87500,
    policyNumber: "AUTO-2026-00182",
    customerName: "Demo Customer (Toyota Camry)",
  },
  {
    sessionId: "act_recon_refund_002",
    status: "escalated",
    attempts: 2,
    reason: "Automated refund dispatched after document failure; awaiting gateway confirmation.",
    nextRetryAt: new Date(Date.now() + 360000).toISOString(),
    amount: 65000,
    policyNumber: "AUTO-2026-33918",
    customerName: "Babajide Williams (Honda Accord)",
  },
  {
    sessionId: "act_recon_nhia_003",
    status: "retrying",
    attempts: 1,
    reason: "NHIA Health Gateway capitation ledger verification pending downstream batch clearance.",
    nextRetryAt: new Date(Date.now() + 240000).toISOString(),
    amount: 145000,
    policyNumber: "HMO-PLAT-2026-00812",
    customerName: "Dr. Amina Bello (Hygeia HMO Platinum)",
  },
];

export function HumanEscalationCenter() {
  const [activeTab, setActiveTab] = useState<"guardrails" | "reconciliation">("guardrails");
  const [cases, setCases] = useState<EscalationCase[]>(BENCHMARK_ESCALATIONS);
  const [selectedCase, setSelectedCase] = useState<EscalationCase | null>(BENCHMARK_ESCALATIONS[0]);
  const [activeFilter, setActiveFilter] = useState<"all" | "open" | "resolved">("all");
  const [sandboxResult, setSandboxResult] = useState<{
    haltName: string;
    guardrail: string;
    reason: string;
    action: string;
  } | null>(null);
  const [supervisorPin, setSupervisorPin] = useState("");
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideNotice, setOverrideNotice] = useState<string | null>(null);

  // Reconciliation Worker Live State
  const [reconReport, setReconReport] = useState<ReconciliationReport | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [reconMessage, setReconMessage] = useState<{
    type: "success" | "info" | "warning";
    text: string;
  } | null>(null);

  const loadReconciliationQueue = useCallback(async () => {
    try {
      setReconLoading(true);
      const res = await fetch("/api/recovery/reconcile");
      const json = await res.json();
      if (json.success && json.data) {
        setReconReport(json.data);
      }
    } catch {
      // Fallback to initial state
    } finally {
      setReconLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/recovery/reconcile");
        const json = await res.json();
        if (active && json.success && json.data) {
          setReconReport(json.data);
        }
      } catch {
        // Fallback to initial state
      } finally {
        if (active) {
          setReconLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const filteredCases = cases.filter((c) => {
    if (activeFilter === "all") return true;
    return c.status === activeFilter;
  });

  const handleSimulateHalt = (testType: "window" | "price" | "niid" | "consent") => {
    switch (testType) {
      case "window":
        setSandboxResult({
          haltName: "30-Day Statutory Expiry Window Violation",
          guardrail: "EligibilityGuardrail.validateRenewalWindow()",
          reason: "Policy expires on 2027-04-12 (214 days away). ActionOS refused autonomous renewal to protect customer against premature premium charges.",
          action: "Action State Machine halted transition to PLANNING. Transferred case to Customer Care reminder queue.",
        });
        break;
      case "price":
        setSandboxResult({
          haltName: "Actuarial Price Ceiling Exceeded",
          guardrail: "FinancialLimitsGuardrail.validateQuoteBounds()",
          reason: "Submitted quote ₦350,000 exceeds benchmark underwriter corridor (₦75,000 - ₦115,000) by 204%. Automated payment execution blocked.",
          action: "Execution halted at VALIDATING. Flagged for underwriter rate audit.",
        });
        break;
      case "niid":
        setSandboxResult({
          haltName: "Statutory FRSC/NIID Identity Rejection",
          guardrail: "VerifyNIIDStatutoryTool.verifyVehicle()",
          reason: "Registration number 'LAGOS-FAKE-999' returned NO_RECORD in Federal FRSC vehicle portal and National Insurance database.",
          action: "Execution blocked. Action Ledger flagged FRAUD_PREVENTION_HALT.",
        });
        break;
      case "consent":
        setSandboxResult({
          haltName: "Customer Consent Revocation Gate",
          guardrail: "AuthorizationGate.requireExplicitConfirmation()",
          reason: "Customer declined payment authorization prompt. ActionOS strictly obeys human consent and never performs autonomous deduction.",
          action: "Action State Machine transitioned to CANCELLED. Zero financial debit performed.",
        });
        break;
    }
  };

  const handleResolveCase = (caseId: string, resolution: "overridden" | "resolved") => {
    setCases((prev) =>
      prev.map((c) => (c.id === caseId ? { ...c, status: resolution } : c))
    );
    if (selectedCase?.id === caseId) {
      setSelectedCase((prev) => (prev ? { ...prev, status: resolution } : null));
    }
    setOverrideNotice(
      resolution === "overridden"
        ? `Case ${caseId} authorized via Supervisor Cryptographic Key Override.`
        : `Case ${caseId} marked as successfully resolved.`
    );
    setShowOverrideModal(false);
    setTimeout(() => setOverrideNotice(null), 4000);
  };

  // Run full sweep with recovery worker
  const handleRunSweep = async () => {
    try {
      setSweepRunning(true);
      setReconMessage({
        type: "info",
        text: "Recovery Worker Sweep initiated: Querying payment provider APIs and unconfirmed refund channels...",
      });

      const res = await fetch("/api/recovery/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50, force: true }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        const report = json.data;
        setReconMessage({
          type: "success",
          text: `Sweep Complete: Scanned ${report.totalScanned || 0} sessions. Reconciled: ${
            report.reconciledCount || 0
          }, Pending: ${report.pendingCount || 0}, Dead-Lettered: ${report.deadLetterCount || 0}.`,
        });
        await loadReconciliationQueue();
      } else {
        throw new Error(json.error?.message || "Sweep returned incomplete response");
      }
    } catch (err) {
      setReconMessage({
        type: "warning",
        text: err instanceof Error ? err.message : "Error running reconciliation sweep",
      });
    } finally {
      setSweepRunning(false);
      setTimeout(() => setReconMessage(null), 6000);
    }
  };

  // Reconcile single session with gateway
  const handleReconcileSession = async (sessionId: string) => {
    try {
      setReconcilingId(sessionId);
      setReconMessage({
        type: "info",
        text: `Probing payment gateway out-of-band for session ${sessionId}...`,
      });

      const res = await fetch("/api/recovery/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, force: true }),
      });

      const json = await res.json();
      if (json.data) {
        const result = json.data;
        setReconMessage({
          type: "success",
          text: `Session ${sessionId} reconciled: Status transitioned from ${result.previousStatus} to ${result.newStatus} (Outcome: ${result.outcome}).`,
        });
        await loadReconciliationQueue();
      } else {
        throw new Error(json.error?.message || "Reconciliation failed");
      }
    } catch (err) {
      setReconMessage({
        type: "warning",
        text: err instanceof Error ? err.message : "Error reconciling session with gateway",
      });
    } finally {
      setReconcilingId(null);
      setTimeout(() => setReconMessage(null), 6000);
    }
  };

  const deadLetterItems = reconReport?.deadLetterQueue || [];
  const retryItems =
    reconReport && reconReport.retryQueue.length > 0
      ? reconReport.retryQueue
      : BENCHMARK_RECON_ITEMS;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/40">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-72 h-72 rounded-full bg-rose-50 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 border border-rose-200 shadow-xs">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Human Escalation &amp; Safety Center
              </h1>
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-black text-rose-800 border border-rose-200">
                ZERO AUTONOMOUS DRIFT
              </span>
            </div>
            <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
              ActionOS is engineered with deterministic boundaries. When an action encounters a regulatory ambiguity, price abnormality, or unconfirmed settlement, it <strong>deliberately halts</strong> rather than fabricating outcomes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-rose-200/80 bg-rose-50/70 p-4 text-center min-w-[130px]">
              <div className="text-2xl font-black text-rose-900">
                {cases.filter((c) => c.status === "open").length}
              </div>
              <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                Open Halts
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 text-center min-w-[130px]">
              <div className="text-2xl font-black text-emerald-900">
                {cases.filter((c) => c.status !== "open").length}
              </div>
              <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                Audited &amp; Cleared
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-2xl bg-slate-100 p-1 text-xs border border-slate-200 font-bold">
            <button
              type="button"
              onClick={() => setActiveTab("guardrails")}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "guardrails"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Guardrail Halts &amp; Safety Overrides</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("reconciliation");
                loadReconciliationQueue();
              }}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "reconciliation"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <span>Durable Reconciliation Queue</span>
              {(reconReport?.totalPending ?? 2) > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 border border-amber-300">
                  {reconReport?.totalPending ?? 2}
                </span>
              )}
            </button>
          </div>

          {activeTab === "reconciliation" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunSweep}
                disabled={sweepRunning}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sweepRunning ? "animate-spin" : ""}`} />
                <span>Run Recovery Sweep</span>
              </button>

              <button
                type="button"
                onClick={loadReconciliationQueue}
                disabled={reconLoading}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition-all cursor-pointer disabled:opacity-50"
                title="Refresh recovery queue"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reconLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          )}
        </div>

        {overrideNotice && (
          <div className="mt-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{overrideNotice}</span>
          </div>
        )}

        {reconMessage && (
          <div
            className={`mt-4 p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 animate-in fade-in duration-200 ${
              reconMessage.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : reconMessage.type === "info"
                ? "bg-blue-50 border-blue-200 text-blue-900"
                : "bg-amber-50 border-amber-200 text-amber-900"
            }`}
          >
            {reconMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : reconMessage.type === "info" ? (
              <Activity className="w-4 h-4 text-blue-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{reconMessage.text}</span>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* VIEW A: RECONCILIATION QUEUE & DURABLE RECOVERY WORKER   */}
      {/* ======================================================== */}
      {activeTab === "reconciliation" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Recovery Worker Statistics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase mb-1">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-slate-400" />
                    <span>Total Uncertain Cases</span>
                  </span>
                  <span className="font-mono text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    PENDING
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-1">
                  {reconReport?.totalPending ?? retryItems.length}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Sessions flagged for deferred probe due to network timeouts or unconfirmed settlement.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-amber-700 text-xs font-bold uppercase mb-1">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Backoff Retry Queue</span>
                  </span>
                  <span className="font-mono text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">
                    EXPONENTIAL
                  </span>
                </div>
                <div className="text-2xl font-black text-amber-900 mt-1">
                  {reconReport?.retryableCount ?? retryItems.length}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Scheduled for autonomous gateway retry; prevents duplicate customer debit attempts.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-rose-700 text-xs font-bold uppercase mb-1">
                  <span className="flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>Dead-Letter Queue (DLQ)</span>
                  </span>
                  <span className="font-mono text-[10px] text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-200">
                    OPERATOR ESCALATED
                  </span>
                </div>
                <div className="text-2xl font-black text-rose-900 mt-1">
                  {deadLetterItems.length}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Exceeded maximum retries (5) without definitive gateway confirmation; requires manual review.
              </p>
            </div>
          </div>

          {/* Active Reconciliation Queue Table */}
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/30 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <h2 className="text-base font-extrabold text-slate-900">
                    Active Gateway Reconciliation &amp; Refund Settlement Queue
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  ActionOS Durable Recovery Worker monitors ambiguous transactions, queries Paystack APIs, and enforces compensating refund state machines.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunSweep}
                  disabled={sweepRunning}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3 h-3 fill-white" />
                  <span>Execute Sweep Now</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {retryItems.map((item) => {
                const isReconciling = reconcilingId === item.sessionId;
                return (
                  <div
                    key={item.sessionId}
                    className="p-5 rounded-2xl border border-slate-200/90 bg-slate-50/60 hover:bg-slate-50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {item.sessionId}
                        </span>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                          {item.status} &bull; Attempt {item.attempts || 1}/5
                        </span>
                        {item.amount && (
                          <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {formatNaira(item.amount)}
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-extrabold text-slate-900">
                        {item.customerName || item.policyNumber || "Unresolved Renewal Workflow"}
                      </div>

                      <div className="text-xs text-slate-600 font-medium">
                        {item.reason}
                      </div>

                      {item.nextRetryAt && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-500" />
                          <span>
                            Next automated probe scheduled for:{" "}
                            <span className="font-mono text-slate-600">
                              {new Date(item.nextRetryAt).toLocaleTimeString()}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/ledger?sessionId=${item.sessionId}`}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-xs"
                      >
                        <History className="w-3.5 h-3.5 text-slate-500" />
                        <span>Audit Chain</span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleReconcileSession(item.sessionId)}
                        disabled={isReconciling}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isReconciling ? "animate-spin" : ""}`} />
                        <span>Reconcile Gateway</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {deadLetterItems.map((item) => (
                <div
                  key={item.sessionId}
                  className="p-5 rounded-2xl border border-rose-200 bg-rose-50/40 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-rose-900 bg-white px-2 py-0.5 rounded border border-rose-200">
                        {item.sessionId}
                      </span>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                        DEAD_LETTERED &bull; 5/5 MAX ATTEMPTS
                      </span>
                    </div>

                    <div className="text-xs font-bold text-rose-950">
                      {item.reason || "Maximum recovery attempts exceeded without settlement confirmation."}
                    </div>

                    {item.deadLetteredAt && (
                      <div className="text-[11px] text-rose-700">
                        Escalated to supervisor queue at: {new Date(item.deadLetteredAt).toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/ledger?sessionId=${item.sessionId}`}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    >
                      <History className="w-3.5 h-3.5 text-rose-600" />
                      <span>Inspect Trail</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleReconcileSession(item.sessionId)}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Manual Override</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW B: GUARDRAIL HALTS, DEMO SANDBOX & OVERRIDES       */}
      {/* ======================================================== */}
      {activeTab === "guardrails" && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Interactive Safety Halt Demonstration Sandbox for Judges */}
          <div className="rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-700 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <h2 className="text-lg font-black tracking-tight text-white">
                    Live Guardrail Demonstration Sandbox
                  </h2>
                  <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300 border border-emerald-500/30">
                    FOR JUDGING &amp; AUDIT
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Test ActionOS safety invariants in real-time. Click any deliberate unsafe scenario to watch the execution engine immediately refuse unsafe progression.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <button
                type="button"
                onClick={() => handleSimulateHalt("window")}
                className="flex flex-col items-start p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 hover:border-amber-400 transition-all text-left group cursor-pointer"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 mb-3 group-hover:scale-110 transition-transform">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-slate-100 group-hover:text-amber-300">
                  1. 60-Day Premature Renewal
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Trigger 30-day statutory boundary halt.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSimulateHalt("price")}
                className="flex flex-col items-start p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 hover:border-rose-400 transition-all text-left group cursor-pointer"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300 mb-3 group-hover:scale-110 transition-transform">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-slate-100 group-hover:text-rose-300">
                  2. ₦350k Actuarial Price Spike
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Trigger financial bounds protection halt.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSimulateHalt("niid")}
                className="flex flex-col items-start p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 hover:border-purple-400 transition-all text-left group cursor-pointer"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300 mb-3 group-hover:scale-110 transition-transform">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-slate-100 group-hover:text-purple-300">
                  3. Unverified Plate in NIID
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Trigger statutory identity failure halt.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSimulateHalt("consent")}
                className="flex flex-col items-start p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 hover:border-blue-400 transition-all text-left group cursor-pointer"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 mb-3 group-hover:scale-110 transition-transform">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-slate-100 group-hover:text-blue-300">
                  4. Declined Human Authorization
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Trigger zero-unauthorized-charge policy.
                </div>
              </button>
            </div>

            {sandboxResult && (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 p-4 sm:p-5 animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    <h3 className="text-sm font-extrabold text-rose-200">
                      {sandboxResult.haltName}
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] bg-rose-900/60 text-rose-300 border border-rose-700 px-2 py-0.5 rounded-full font-bold">
                    EXECUTION_INTERRUPTED
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 font-semibold min-w-[120px]">Triggered Guardrail:</span>
                    <span className="font-mono text-amber-300">{sandboxResult.guardrail}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 font-semibold min-w-[120px]">Refusal Reason:</span>
                    <span className="text-slate-200">{sandboxResult.reason}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 font-semibold min-w-[120px]">Orchestrator Action:</span>
                    <span className="text-emerald-300 font-bold">{sandboxResult.action}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main Escalation Queue & Dossier View */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Queue List (5 cols) */}
            <div className="lg:col-span-5 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xl shadow-slate-200/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-slate-900">
                      Escalation Queue
                    </h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                      {filteredCases.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-xs">
                    {(["all", "open", "resolved"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setActiveFilter(filter)}
                        className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                          activeFilter === filter
                            ? "bg-slate-900 text-white"
                            : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredCases.map((c) => {
                    const isSelected = selectedCase?.id === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedCase(c)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer text-left ${
                          isSelected
                            ? "border-rose-400 bg-rose-50/40 shadow-xs ring-1 ring-rose-400/30"
                            : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-mono text-[11px] font-bold text-slate-700">
                            {c.policyNumber}
                          </span>
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                              c.status === "open"
                                ? "bg-rose-100 text-rose-800 border-rose-200"
                                : "bg-emerald-100 text-emerald-800 border-emerald-200"
                            }`}
                          >
                            {c.status}
                          </span>
                        </div>

                        <div className="text-xs font-extrabold text-slate-900 truncate">
                          {c.customerName} &bull; {c.vehicleName}
                        </div>

                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          {c.reason}
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[10px] font-medium text-slate-400">
                          <span className="font-mono text-rose-600 font-bold">
                            {c.guardrailTriggered}
                          </span>
                          <span>{c.timestamp}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Selected Case Dossier (7 cols) */}
            <div className="lg:col-span-7">
              {selectedCase ? (
                <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/30 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-400">
                          CASE {selectedCase.id}
                        </span>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            selectedCase.status === "open"
                              ? "bg-rose-100 text-rose-800 border-rose-200"
                              : "bg-emerald-100 text-emerald-800 border-emerald-200"
                          }`}
                        >
                          {selectedCase.status}
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-slate-900 mt-1">
                        {selectedCase.customerName} &mdash; {selectedCase.policyNumber}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedCase.sessionId && (
                        <Link
                          href={`/ledger?sessionId=${selectedCase.sessionId}`}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                        >
                          <History className="w-3.5 h-3.5 text-slate-500" />
                          <span>Audit Ledger</span>
                        </Link>
                      )}

                      {selectedCase.status === "open" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setShowOverrideModal(true)}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Supervisor Override</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResolveCase(selectedCase.id, "resolved")}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Audited &amp; Signed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Case Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Vehicle</div>
                      <div className="font-bold text-slate-800 mt-0.5">{selectedCase.vehicleName}</div>
                      <div className="font-mono text-slate-500 text-[11px]">{selectedCase.plateNumber}</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Guardrail Rule</div>
                      <div className="font-mono font-bold text-rose-700 mt-0.5 truncate">
                        {selectedCase.guardrailTriggered}
                      </div>
                      <div className="text-slate-500 text-[11px]">Severity: {selectedCase.severity}</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Parameters</div>
                      {selectedCase.attemptedAmount ? (
                        <div className="font-bold text-slate-800 mt-0.5">
                          {formatNaira(selectedCase.attemptedAmount)}
                        </div>
                      ) : selectedCase.expiryDate ? (
                        <div className="font-bold text-slate-800 mt-0.5">
                          Expires: {selectedCase.expiryDate}
                        </div>
                      ) : (
                        <div className="font-bold text-slate-800 mt-0.5">Statutory Halt</div>
                      )}
                      <div className="text-slate-500 text-[11px]">{selectedCase.timestamp}</div>
                    </div>
                  </div>

                  {/* Detailed Reason Card */}
                  <div className="p-4 rounded-2xl border border-rose-200/80 bg-rose-50/50 space-y-2">
                    <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                      <Info className="w-4 h-4 text-rose-600" />
                      <span>Exact Guardrail Refusal Diagnostic</span>
                    </div>
                    <p className="text-xs text-rose-950 leading-relaxed font-medium">
                      {selectedCase.reason}
                    </p>
                  </div>

                  {/* ActionOS Defense Policy */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="text-xs font-bold text-slate-900">
                      Governed Execution Architecture
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Unlike traditional generative AI agents that fabricate fallback data or carry out unauthorized operations, ActionOS isolates this transaction from automated payment and renewal rails. The session state machine is locked until an authorized human supervisor supplies signed clearance.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center p-12 rounded-3xl border border-slate-200 bg-white text-slate-400 text-xs font-medium">
                  Select an escalation case to review its diagnostic file.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {showOverrideModal && selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Supervisor Manual Override
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOverrideModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              You are authorizing execution override for policy <strong>{selectedCase.policyNumber}</strong> ({selectedCase.customerName}). This operation will be logged to the Cryptographic Action Ledger with your supervisor credentials.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Supervisor Security PIN</label>
              <input
                type="password"
                placeholder="Enter 4-digit PIN (Demo: 1234)"
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-mono focus:border-slate-900 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleResolveCase(selectedCase.id, "overridden")}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                Sign &amp; Authorize Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

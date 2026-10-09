"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Zap,
  ShieldCheck,
  RefreshCw,
  CheckCircle,
  Search,
  Filter,
  Phone,
  FileText,
  Download,
  Calendar,
  Car,
  Award,
  Sparkles,
  X,
  Lock,
  AlertTriangle,
  PlayCircle,
  Database,
  Check,
  Copy,
  Layers,
  Clock,
} from "lucide-react";
import { StatusBadge } from "@/components/actionos/status-badge";
import { AuthorizationCard, type AuthorizationOptions } from "@/components/actionos/authorization-dialog";
import { formatNaira, formatDate } from "@/lib/utils";
import type { Renewal, Policy, Customer } from "@/types/database";
import type { AuthorizationDetails, UnderwriterQuote, ActionLedgerEvent } from "@/types/actionos";

// Underwriter comparison benchmark data
const UNDERWRITER_MARKETPLACE: Record<string, UnderwriterQuote[]> = {
  default: [
    {
      id: "uw-leadway",
      underwriter: "Leadway Assurance",
      tier: "comprehensive",
      tierLabel: "Comprehensive Motor",
      amount: 87500,
      currency: "NGN",
      rating: 4.9,
      isRecommended: true,
      benefits: ["24/7 Roadside Assistance", "Towing up to 50km", "Free Tracker Calibration"],
    },
    {
      id: "uw-axa",
      underwriter: "AXA Mansard Insurance",
      tier: "executive",
      tierLabel: "Comprehensive Premium",
      amount: 89200,
      currency: "NGN",
      rating: 4.8,
      isRecommended: false,
      benefits: ["Nil Excess on 1st Claim", "Windscreen Protection up to ₦150k", "Courtesy Ride"],
    },
    {
      id: "uw-custodian",
      underwriter: "Custodian and Allied",
      tier: "comprehensive",
      tierLabel: "Value Comprehensive",
      amount: 86000,
      currency: "NGN",
      rating: 4.7,
      isRecommended: false,
      benefits: ["Standard Third-Party Limit ₦3M", "Medical Expenses up to ₦100k"],
    },
    {
      id: "uw-aiico",
      underwriter: "AIICO Insurance",
      tier: "comprehensive",
      tierLabel: "Standard Comprehensive",
      amount: 88500,
      currency: "NGN",
      rating: 4.7,
      isRecommended: false,
      benefits: ["Flood & Riot Extension", "Personal Accident Cover ₦1M"],
    },
  ],
};

interface SagaExecutionState {
  isOpen: boolean;
  renewal: Renewal | null;
  policy: Policy | null;
  customer: Customer | null;
  status: "idle" | "running_preauth" | "awaiting_auth" | "executing_auth" | "completed" | "failed";
  sessionId: string | null;
  steps: Array<{ title: string; desc: string; done: boolean; inProgress: boolean }>;
  authDetails: AuthorizationDetails | null;
  resultMessage: string | null;
  ledgerEvents: ActionLedgerEvent[];
  settlementSummary?: {
    txReference?: string;
    certificateNumber?: string;
    newExpiry?: string;
    provider?: string;
    amount?: number;
    compensatingAction?: string;
  };
}

export function RenewalOperationsCenter() {
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "urgent" | "eligible">("all");

  // Notifications / Alerts
  const [actionAlert, setActionAlert] = useState<{ type: "success" | "info" | "warning"; message: string } | null>(null);

  // Modals
  const [selectedNiidDossier, setSelectedNiidDossier] = useState<{
    policyNumber: string;
    plate: string;
    chassis: string;
    engine: string;
    vehicleName: string;
    owner: string;
    token: string;
  } | null>(null);

  const [selectedMarketplaceVehicle, setSelectedMarketplaceVehicle] = useState<{
    vehicleName: string;
    plate: string;
    policyNumber: string;
    quotes: UnderwriterQuote[];
  } | null>(null);

  // Live Saga Execution Drawer State
  const [sagaState, setSagaState] = useState<SagaExecutionState>({
    isOpen: false,
    renewal: null,
    policy: null,
    customer: null,
    status: "idle",
    sessionId: null,
    steps: [],
    authDetails: null,
    resultMessage: null,
    ledgerEvents: [],
  });

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [renRes, polRes, cusRes] = await Promise.all([
        fetch("/api/renewals").then((r) => r.json()),
        fetch("/api/policies").then((r) => r.json()),
        fetch("/api/customers").then((r) => r.json()),
      ]);

      if (renRes.success) setRenewals(renRes.data || []);
      if (polRes.success) setPolicies(polRes.data || []);
      if (cusRes.success) setCustomers(cusRes.data || []);
    } catch {
      setActionAlert({ type: "warning", message: "Failed to reload pipeline state from server." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered dataset
  const filteredRenewals = useMemo(() => {
    return renewals.filter((r) => {
      const policyNumber = r.policy?.policy_number?.toLowerCase() || "";
      const customerName = r.customer?.full_name?.toLowerCase() || "";
      const plate = (
        r.policy?.asset?.identifier ||
        (r.policy?.metadata?.vehicle_reg as string) ||
        "ABC-123-XY"
      ).toLowerCase();
      const vehicleName = (
        r.policy?.asset?.name ||
        (r.policy?.metadata?.vehicle_name as string) ||
        ""
      ).toLowerCase();

      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        policyNumber.includes(query) ||
        customerName.includes(query) ||
        plate.includes(query) ||
        vehicleName.includes(query);

      // Status filter
      const matchesStatus =
        statusFilter === "all" ||
        r.status === statusFilter ||
        (statusFilter === "pending" && (r.status === "scheduled" || r.status === "awaiting_confirmation"));

      // Urgency filter
      let matchesUrgency = true;
      if (urgencyFilter === "urgent") {
        matchesUrgency = (r.days_before_expiry || 7) <= 7;
      } else if (urgencyFilter === "eligible") {
        matchesUrgency = (r.days_before_expiry || 7) > 7 && (r.days_before_expiry || 7) <= 30;
      }

      return matchesSearch && matchesStatus && matchesUrgency;
    });
  }, [renewals, searchQuery, statusFilter, urgencyFilter]);

  // Operational metrics
  const metrics = useMemo(() => {
    const total = renewals.length;
    const urgent = renewals.filter((r) => (r.days_before_expiry || 7) <= 7).length;
    const awaitingAuth = renewals.filter(
      (r) => r.status === "awaiting_confirmation"
    ).length;
    const completed = renewals.filter((r) => r.status === "completed").length;
    const grossPremium = renewals.reduce((acc, r) => acc + (r.quote_amount || 87500), 0);

    return { total, urgent, awaitingAuth, completed, grossPremium };
  }, [renewals]);

  // Launch AI Renewal Saga workflow
  const launchSagaForRenewal = async (r: Renewal) => {
    const targetPolicy = policies.find((p) => p.id === r.policy_id) || r.policy || null;
    const targetCustomer = customers.find((c) => c.id === r.customer_id) || r.customer || null;
    const vehicleMeta = (targetPolicy?.metadata || {}) as Record<string, unknown>;
    const plate = targetPolicy?.asset?.identifier || (vehicleMeta.vehicle_reg as string) || "ABC-123-XY";
    const vehicleName = targetPolicy?.asset?.name || (vehicleMeta.vehicle_name as string) || "Toyota Camry";

    setSagaState({
      isOpen: true,
      renewal: r,
      policy: targetPolicy,
      customer: targetCustomer,
      status: "running_preauth",
      sessionId: null,
      steps: [
        { title: "N-ATLAS Intent Resolution", desc: "Parsing natural language policy renewal instruction", done: false, inProgress: true },
        { title: "NIID & FRSC Regulatory Verification", desc: `Validating vehicle ${plate} with statutory database`, done: false, inProgress: false },
        { title: "Multi-Insurer Quotation", desc: "Aggregating dynamic quotes from licensed underwriters", done: false, inProgress: false },
        { title: "ActionOS Guardrail Evaluation", desc: "Verifying 30-day window and financial ceiling", done: false, inProgress: false },
        { title: "Cryptographic Authorization Gate", desc: "Awaiting explicit non-repudiation consent", done: false, inProgress: false },
      ],
      authDetails: null,
      resultMessage: null,
      ledgerEvents: [],
    });

    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "web",
          language: "en-NG",
          inputText: `Renew vehicle insurance policy ${targetPolicy?.policy_number || "AUTO-2026-00182"} for ${vehicleName} registration ${plate}`,
        }),
      });

      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message || "Failed to start renewal workflow");
      }

      const { sessionId, authorizationRequired, authorizationDetails, events, message } = json.data;

      setSagaState((prev) => ({
        ...prev,
        sessionId,
        status: authorizationRequired ? "awaiting_auth" : "completed",
        authDetails: authorizationDetails || null,
        ledgerEvents: events || [],
        resultMessage: message,
        steps: [
          { title: "N-ATLAS Intent Resolution", desc: "Intent 'policy_renewal' confirmed with 98% confidence", done: true, inProgress: false },
          { title: "NIID & FRSC Regulatory Verification", desc: `Statutory certificate confirmed: Clear of theft flag`, done: true, inProgress: false },
          { title: "Multi-Insurer Quotation", desc: "4 competitive underwriter quotes retrieved", done: true, inProgress: false },
          { title: "ActionOS Guardrail Evaluation", desc: "Passed: Within statutory window, quote within approved limits", done: true, inProgress: false },
          { title: "Cryptographic Authorization Gate", desc: "Awaiting customer authorization check", done: false, inProgress: true },
        ],
      }));
    } catch (err) {
      setSagaState((prev) => ({
        ...prev,
        status: "failed",
        resultMessage: err instanceof Error ? err.message : "Error executing renewal saga",
      }));
    }
  };

  // Authorize & Execute remainder of Saga
  const handleAuthorizeSaga = async (authorized: boolean, options?: AuthorizationOptions) => {
    if (!sagaState.sessionId) return;

    setSagaState((prev) => ({
      ...prev,
      status: "executing_auth",
      steps: [
        ...prev.steps.map((s) => ({ ...s, done: true, inProgress: false })),
        { title: "Paystack Financial Settlement", desc: "Charging authorized amount via secured channel", done: false, inProgress: true },
        { title: "Policy Expiry Roll-Forward", desc: "Updating atomic policy validity in database", done: false, inProgress: false },
        { title: "Statutory Certificate Issuance", desc: "Generating tamper-evident NAICOM e-Certificate", done: false, inProgress: false },
      ],
    }));

    try {
      const res = await fetch(`/api/actions/${sagaState.sessionId}/authorize`, {
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
      if (!json.data) {
        throw new Error(json.error?.message || "Authorization processing failed");
      }

      const isCompensated =
        options?.simulateSagaFailure ||
        json.data.status === "failed" ||
        json.data.status === "escalated";

      setSagaState((prev) => ({
        ...prev,
        status: isCompensated ? "failed" : "completed",
        resultMessage: json.data.message,
        ledgerEvents: json.data.events || prev.ledgerEvents,
        settlementSummary: {
          txReference: `PSTK-${Date.now().toString().slice(-8)}`,
          certificateNumber: `NAICOM-2026-CERT-${Math.floor(100000 + Math.random() * 900000)}`,
          newExpiry: "October 14, 2027",
          provider: options?.selectedUnderwriter || "Leadway Assurance",
          amount: options?.customAmount || 87500,
          compensatingAction: isCompensated ? "Paystack Refund Issued & Policy Reverted" : undefined,
        },
      }));

      // Reload pipeline so UI reflects latest state
      await loadData();
    } catch (err) {
      setSagaState((prev) => ({
        ...prev,
        status: "failed",
        resultMessage: err instanceof Error ? err.message : "Authorization execution error",
      }));
    }
  };

  // Run autonomous batch discovery simulation
  const handleRunBatchDiscovery = () => {
    setActionAlert({
      type: "info",
      message: "Running Autonomous Discovery: Scanning enterprise policies against 30-day statutory renewal window...",
    });

    setTimeout(() => {
      setActionAlert({
        type: "success",
        message: "Discovery Complete: 3 policies eligible for renewal. WhatsApp outreach notifications and underwriter quotes generated.",
      });
      loadData();
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* 1. Operations Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              ActionOS Autonomous Engine Online
            </span>
            <span className="text-[11px] font-medium text-slate-500 hidden sm:inline">
              &bull; NIID / FRSC Linked
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Renewal Operations Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Autonomous execution layer orchestrating policy renewal lifecycles, statutory NIID preclearance, multi-insurer marketplace quotation, and Paystack settlement.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleRunBatchDiscovery}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition-all cursor-pointer active:scale-95"
            title="Scan upcoming policies and trigger automated customer notifications"
          >
            <PlayCircle className="w-4 h-4 text-emerald-600" />
            <span>Run Discovery Batch</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (renewals[0]) launchSagaForRenewal(renewals[0]);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer active:scale-95"
          >
            <Zap className="w-4 h-4" />
            <span>Launch AI Saga</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition-all cursor-pointer disabled:opacity-50"
            title="Refresh pipeline data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Alert banner if present */}
      {actionAlert && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-4 shadow-xs animate-in fade-in duration-200 ${
            actionAlert.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : actionAlert.type === "info"
              ? "bg-blue-50 border-blue-200 text-blue-900"
              : "bg-amber-50 border-amber-200 text-amber-900"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionAlert.type === "success" ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : actionAlert.type === "info" ? (
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span className="font-medium">{actionAlert.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionAlert(null)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Operational KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Queue Total</span>
            <Layers className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {loading ? "..." : metrics.total}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Automated policies</div>
        </div>

        <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 shadow-xs">
          <div className="flex items-center justify-between text-rose-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Critical (&le;7d)</span>
            <Clock className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-800 font-mono">
            {loading ? "..." : metrics.urgent}
          </div>
          <div className="text-[10px] text-rose-600 mt-0.5 font-semibold">Immediate outreach due</div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 shadow-xs">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Awaiting Auth</span>
            <Lock className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-800 font-mono">
            {loading ? "..." : metrics.awaitingAuth}
          </div>
          <div className="text-[10px] text-amber-600 mt-0.5 font-semibold">At Guardrail Gate</div>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 shadow-xs">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Settled & Certified</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-800 font-mono">
            {loading ? "..." : metrics.completed}
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5 font-semibold">100% NAICOM verified</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Gross Pipeline</span>
            <Database className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono truncate">
            {loading ? "..." : formatNaira(metrics.grossPremium)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Automated settlement target</div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by Customer, Policy (AUTO-...), Plate (ABC-123-XY), or Vehicle..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setUrgencyFilter("all");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === "all" && urgencyFilter === "all"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({renewals.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setUrgencyFilter("urgent");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                urgencyFilter === "urgent"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
              }`}
            >
              Urgent &le;7d ({metrics.urgent})
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setUrgencyFilter("eligible");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                urgencyFilter === "eligible"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
              }`}
            >
              Eligible 8-30d
            </button>

            <button
              type="button"
              onClick={() => {
                setUrgencyFilter("all");
                setStatusFilter("awaiting_confirmation");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === "awaiting_confirmation"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
              }`}
            >
              Awaiting Auth ({metrics.awaitingAuth})
            </button>

            <button
              type="button"
              onClick={() => {
                setUrgencyFilter("all");
                setStatusFilter("completed");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === "completed"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
              }`}
            >
              Completed ({metrics.completed})
            </button>
          </div>
        </div>
      </div>

      {/* 4. High-Density Pipeline Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-4">Policy & Customer</th>
                <th className="px-5 py-4">Vehicle & NIID Status</th>
                <th className="px-5 py-4">Expiry & Urgency</th>
                <th className="px-5 py-4">Underwriter & Quote</th>
                <th className="px-5 py-4">Lifecycle State</th>
                <th className="px-5 py-4 text-right">Autonomous Trigger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-600 mb-2" />
                    <span>Loading ActionOS renewal pipeline...</span>
                  </td>
                </tr>
              ) : filteredRenewals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-slate-500">
                    <Filter className="w-6 h-6 mx-auto text-slate-300 mb-2" />
                    <span className="font-semibold text-slate-700 block">No matching renewal records found</span>
                    <span className="text-xs text-slate-400">Try adjusting your search criteria or filter tags.</span>
                  </td>
                </tr>
              ) : (
                filteredRenewals.map((r) => {
                  const policy = r.policy;
                  const customer = r.customer;
                  const vehicleMeta = (policy?.metadata || {}) as Record<string, unknown>;
                  const plate = policy?.asset?.identifier || (vehicleMeta.vehicle_reg as string) || "ABC-123-XY";
                  const vehicleName = policy?.asset?.name || (vehicleMeta.vehicle_name as string) || "Toyota Camry (2020)";
                  const daysLeft = r.days_before_expiry || 7;
                  const isUrgent = daysLeft <= 7;
                  const policyNum = policy?.policy_number || "AUTO-2026-00182";

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors group">
                      {/* 1. Policy & Customer */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{policyNum}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(policyNum, r.id)}
                            className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5 rounded"
                            title="Copy policy number"
                          >
                            {copiedId === r.id ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <div className="text-xs text-slate-600 font-medium mt-0.5">
                          {customer?.full_name || "Demo Customer"}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 font-mono">
                          <span>{customer?.phone || "+234 800 000 0001"}</span>
                          <span className="text-emerald-700 bg-emerald-50 text-[9px] font-bold px-1 rounded border border-emerald-200">
                            NIN VERIFIED
                          </span>
                        </div>
                      </td>

                      {/* 2. Vehicle & NIID Status */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <Car className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{vehicleName}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {plate}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedNiidDossier({
                                policyNumber: policyNum,
                                plate,
                                chassis: (vehicleMeta.chassis_number as string) || "DEMO-VIN-000001",
                                engine: (vehicleMeta.engine_number as string) || "DEMO-ENGINE-000001",
                                vehicleName,
                                owner: customer?.full_name || "Amina Bello",
                                token: `NIID-2026-VAL-${Math.floor(100000 + Math.random() * 900000)}`,
                              })
                            }
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200 cursor-pointer transition-all"
                            title="Inspect NIID & FRSC roadworthiness registration record"
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>NIID Verified</span>
                          </button>
                        </div>
                      </td>

                      {/* 3. Expiry & Urgency */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          {isUrgent ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              <span>{daysLeft}d left &bull; URGENT</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Calendar className="w-2.5 h-2.5" />
                              <span>{daysLeft}d notice</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Cycle: <span className="font-semibold text-slate-700">{formatDate(r.scheduled_for)}</span>
                        </div>
                      </td>

                      {/* 4. Underwriter & Quote */}
                      <td className="px-5 py-4">
                        <div className="font-mono font-black text-sm text-emerald-700">
                          {r.quote_amount ? formatNaira(r.quote_amount) : "₦87,500"}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[11px] text-slate-600 font-medium">Leadway Assurance</span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedMarketplaceVehicle({
                                vehicleName,
                                plate,
                                policyNumber: policyNum,
                                quotes: UNDERWRITER_MARKETPLACE.default,
                              })
                            }
                            className="text-[10px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 px-1.5 py-0.2 rounded border border-teal-200 cursor-pointer"
                            title="Compare 4 licensed Nigerian underwriters"
                          >
                            4 Quotes
                          </button>
                        </div>
                      </td>

                      {/* 5. Lifecycle State */}
                      <td className="px-5 py-4">
                        <StatusBadge status={r.status} size="sm" />
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">
                          {r.payment_status === "succeeded" ? "SETTLED" : "PAYMENT PENDING"}
                        </div>
                      </td>

                      {/* 6. Action Trigger */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActionAlert({
                                type: "info",
                                message: `Simulated WhatsApp renewal message dispatched to ${customer?.phone || "+234 800 000 0001"} with interactive [Authorize] button.`,
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold transition-all inline-flex items-center gap-1 cursor-pointer"
                            title="Send WhatsApp renewal alert"
                          >
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span className="hidden sm:inline">WhatsApp</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => launchSagaForRenewal(r)}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm shadow-emerald-600/30 cursor-pointer"
                          >
                            <Zap className="w-3 h-3" />
                            <span>Launch Saga</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. In-Page AI Renewal Saga Execution Modal / Drawer */}
      {sagaState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200 shadow-xs">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-900">
                      ActionOS Autonomous Renewal Saga
                    </h3>
                    <span className="font-mono text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                      SAGA_SESSION: {sagaState.sessionId ? sagaState.sessionId.slice(0, 14) + "..." : "INITIALIZING"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Policy: <span className="font-semibold text-slate-800">{sagaState.policy?.policy_number}</span> &bull; Vehicle:{" "}
                    <span className="font-semibold text-slate-800">
                      {sagaState.policy?.asset?.identifier || "ABC-123-XY"}
                    </span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSagaState((prev) => ({ ...prev, isOpen: false }))}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Step Execution Trace */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Real-Time Saga Execution Pipeline</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {sagaState.status === "completed"
                      ? "100% EXECUTED"
                      : sagaState.status === "awaiting_auth"
                      ? "PAUSED AT AUTH GATE"
                      : "EXECUTING"}
                  </span>
                </div>

                <div className="space-y-2.5 pt-1">
                  {sagaState.steps.map((stg, idx) => (
                    <div
                      key={stg.title}
                      className="flex items-start gap-3 p-2 rounded-xl bg-white border border-slate-200/80 text-xs"
                    >
                      <div className="mt-0.5">
                        {stg.done ? (
                          <div className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        ) : stg.inProgress ? (
                          <div className="w-4 h-4 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-slate-900">{stg.title}</div>
                        <div className="text-slate-500 text-[11px]">{stg.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Authorization Card if awaiting authorization or executing */}
              {(sagaState.status === "awaiting_auth" || sagaState.status === "executing_auth") && sagaState.authDetails && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <span>ActionOS Security Gate Active</span>
                  </div>
                  <AuthorizationCard
                    details={sagaState.authDetails}
                    onAuthorize={handleAuthorizeSaga}
                    isSubmitting={sagaState.status === "executing_auth"}
                  />
                </div>
              )}

              {/* Completed State: Success or Compensated */}
              {sagaState.status === "completed" && sagaState.settlementSummary && (
                <div className="p-6 rounded-3xl bg-emerald-50 border-2 border-emerald-300 text-center space-y-4 animate-in zoom-in-95 duration-200">
                  <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/30">
                    <Award className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-emerald-950">
                      Vehicle Policy Renewed & Certified!
                    </h4>
                    <p className="text-xs text-emerald-800 mt-1 max-w-md mx-auto">
                      Statutory insurance policy rolled forward. Cryptographic NAICOM certificate generated and dispatched to customer.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left p-3 rounded-2xl bg-white border border-emerald-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">UNDERWRITER</span>
                      <span className="font-bold text-slate-800">{sagaState.settlementSummary.provider}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">PREMIUM SETTLED</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {formatNaira(sagaState.settlementSummary.amount || 87500)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">CERTIFICATE NO.</span>
                      <span className="font-mono text-[11px] font-bold text-slate-800">
                        {sagaState.settlementSummary.certificateNumber}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">VALID UNTIL</span>
                      <span className="font-bold text-slate-800">{sagaState.settlementSummary.newExpiry}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <Link
                      href="/documents"
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download NAICOM Certificate</span>
                    </Link>

                    <Link
                      href="/actions"
                      className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold transition-all inline-flex items-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                      <span>View in Action Ledger</span>
                    </Link>
                  </div>
                </div>
              )}

              {/* Failed / Compensated Saga Demonstration */}
              {sagaState.status === "failed" && (
                <div className="p-6 rounded-3xl bg-rose-50 border-2 border-rose-300 text-center space-y-4 animate-in zoom-in-95 duration-200">
                  <div className="w-14 h-14 rounded-full bg-rose-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-rose-600/30">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-rose-950">
                      Distributed Saga Failure & Compensation
                    </h4>
                    <p className="text-xs text-rose-800 mt-1 max-w-md mx-auto">
                      Upstream failure simulated. ActionOS executed compensating reversal transactions across Paystack and the database.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white border border-rose-200 text-xs text-left space-y-2">
                    <div className="flex items-center gap-2 text-rose-700 font-bold">
                      <RefreshCw className="w-4 h-4 animate-spin text-rose-600" />
                      <span>Automated Compensation Executed:</span>
                    </div>
                    <ul className="text-slate-600 text-xs space-y-1 list-disc pl-5">
                      <li>Paystack charge reversed and full customer refund credited.</li>
                      <li>Policy expiration date rolled back to original benchmark state.</li>
                      <li>Cryptographic compensation audit event appended to SHA-256 Ledger.</li>
                      <li>Operations manager escalation notification dispatched.</li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSagaState((prev) => ({ ...prev, isOpen: false }))}
                    className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
                  >
                    Close & Return to Pipeline
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono text-[10px]">
                ACTIONOS_RUNTIME_MODE: DEMO_SANDBOX &bull; CRYPTO_LEDGER_ACTIVE
              </span>
              <button
                type="button"
                onClick={() => setSagaState((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 font-bold text-slate-700 cursor-pointer text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. NIID & FRSC Statutory Regulatory Dossier Modal */}
      {selectedNiidDossier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200 shadow-xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Statutory NIID & FRSC Dossier
                  </h3>
                  <p className="text-xs text-slate-500">
                    Nigerian Insurance Industry Database &bull; Regulatory Clearance Record
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNiidDossier(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                    STATUTORY CLEARANCE TOKEN
                  </span>
                  <span className="font-mono text-sm font-black text-emerald-900">
                    {selectedNiidDossier.token}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                  VERIFIED VALID
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 text-[10px] font-bold block">VEHICLE PLATE</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">
                    {selectedNiidDossier.plate}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 text-[10px] font-bold block">REGISTERED ASSET</span>
                  <span className="font-bold text-slate-800">{selectedNiidDossier.vehicleName}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 text-[10px] font-bold block">CHASSIS / VIN</span>
                  <span className="font-mono font-bold text-slate-800 text-xs">
                    {selectedNiidDossier.chassis}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 text-[10px] font-bold block">ENGINE NUMBER</span>
                  <span className="font-mono font-bold text-slate-800 text-xs">
                    {selectedNiidDossier.engine}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-700">
                  <span>FRSC National Road Safety Registry:</span>
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Roadworthy Certified
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Anti-Theft Interpol & Police Database Flag:</span>
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Clear (No Encumbrance)
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Active Policy Ingestion State:</span>
                  <span className="text-emerald-700 font-bold">Eligible for 2026 Renewal</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedNiidDossier(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Multi-Insurer Marketplace Quotes Comparison Modal */}
      {selectedMarketplaceVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center border border-teal-200 shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Multi-Insurer Quotation Marketplace
                  </h3>
                  <p className="text-xs text-slate-500">
                    Live underwriting rates for {selectedMarketplaceVehicle.vehicleName} ({selectedMarketplaceVehicle.plate})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMarketplaceVehicle(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              {selectedMarketplaceVehicle.quotes.map((q) => (
                <div
                  key={q.underwriter}
                  className={`p-4 rounded-2xl border transition-all ${
                    q.isRecommended
                      ? "bg-emerald-50/70 border-emerald-300 shadow-xs ring-1 ring-emerald-400/30"
                      : "bg-slate-50/70 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-sm">{q.underwriter}</span>
                        {q.isRecommended && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider">
                            Recommended
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {q.tierLabel} &bull; Rating:{" "}
                        <span className="font-semibold text-slate-700">{q.rating || 4.8} / 5.0</span>
                      </span>

                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {q.benefits?.map((benefit: string) => (
                          <span
                            key={benefit}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-medium"
                          >
                            &bull; {benefit}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-black text-base text-emerald-800">
                        {formatNaira(q.amount)}
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium block">Annual Gross Premium</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>All quotes legally compliant with NAICOM statutory motor underwriting guidelines.</span>
              <button
                type="button"
                onClick={() => setSelectedMarketplaceVehicle(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

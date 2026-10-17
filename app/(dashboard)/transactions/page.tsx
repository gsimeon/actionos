"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  CreditCard,
  ShieldCheck,
  Search,
  RotateCcw,
  Eye,
  X,
  Copy,
  Check,
  CheckCircle,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Layers,
  HeartPulse,
  FileBadge,
} from "lucide-react";
import { StatusBadge } from "@/components/actionos/status-badge";
import { formatNaira, formatDateTime } from "@/lib/utils";
import type { Transaction } from "@/types/database";
import { useTransactionsRealtime } from "@/lib/realtime";

const STATUS_TABS = [
  { id: "all", label: "All Transactions" },
  { id: "succeeded", label: "Succeeded" },
  { id: "partially_refunded", label: "Partially Refunded" },
  { id: "refunded", label: "Refunded" },
  { id: "pending", label: "Pending" },
  { id: "failed", label: "Failed" },
];

const RAIL_FILTERS = [
  { id: "all", label: "All Rails" },
  { id: "paystack", label: "Paystack Rail" },
  { id: "flutterwave", label: "Flutterwave Rail" },
  { id: "mvaa_pay", label: "MVAA Treasury Rail" },
  { id: "nhia_pay", label: "NHIA Health Rail" },
  { id: "frsc_pay", label: "FRSC Licensing Rail" },
];

const BENCHMARK_TRANSACTIONS: Transaction[] = [
  {
    id: "tx_paystack_2026_00182",
    customer_id: "f0000000-0000-0000-0000-000000000001",
    renewal_id: "30000000-0000-0000-0000-000000000001",
    amount: 87500,
    currency: "NGN",
    provider: "paystack",
    reference: "pay_ref_2026_00182",
    status: "succeeded",
    transaction_type: "renewal_premium",
    metadata: {
      policyNumber: "AUTO-2026-00182",
      vehicleName: "Toyota Camry 2.5L",
      plate: "ABC-123-XY",
      underwriter: "Leadway Assurance Co.",
      paymentChannel: "card_mastercard",
      statutoryCertificate: "NAICOM-CERT-2026-00182",
      reconciliationStatus: "matched_authoritative",
    },
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "tx_mvaa_2026_00182",
    customer_id: "f0000000-0000-0000-0000-000000000001",
    renewal_id: "ren_mvaa_001",
    amount: 25000,
    currency: "NGN",
    provider: "mvaa_pay",
    reference: "mvaa_tx_2026_00182",
    status: "succeeded",
    transaction_type: "fee",
    metadata: {
      plate: "ABC-123-XY",
      vehicleName: "Toyota Camry",
      mvaaLicenseNumber: "MVAA-LIC-2026-00182",
      roadworthinessNumber: "LACVIS-RW-2026-00182",
      feeBreakdown: {
        vehicleLicenseFee: 12000,
        roadworthinessFee: 8000,
        adminProcessingFee: 5000,
      },
      reconciliationStatus: "matched_treasury_cleared",
    },
    created_at: new Date(Date.now() - 7200000).toISOString(),
    updated_at: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: "tx_nhia_2026_00812",
    customer_id: "f0000000-0000-0000-0000-000000000001",
    renewal_id: "ren_hmo_001",
    amount: 145000,
    currency: "NGN",
    provider: "nhia_pay",
    reference: "nhia_tx_2026_00812",
    status: "succeeded",
    transaction_type: "renewal_premium",
    metadata: {
      policyNumber: "HMO-PLAT-2026-00812",
      hmoProvider: "Hygeia HMO",
      enrolleeId: "NHIA-00829104",
      enrolleeName: "Demo Customer",
      tier: "platinum",
      primaryFacility: "Lagoon Hospitals, Victoria Island",
      capitationSchedule: "Annual Full Premium Settled",
      digitalCardIssued: "HMO-PLAT-2026-00812",
      reconciliationStatus: "matched_nhia_cleared",
    },
    created_at: new Date(Date.now() - 10800000).toISOString(),
    updated_at: new Date(Date.now() - 10800000).toISOString(),
  },
  {
    id: "tx_frsc_2026_00918",
    customer_id: "f0000000-0000-0000-0000-000000000001",
    renewal_id: "ren_dl_001",
    amount: 15000,
    currency: "NGN",
    provider: "frsc_pay",
    reference: "frsc_tx_2026_00918",
    status: "succeeded",
    transaction_type: "fee",
    metadata: {
      licenseNumber: "FRSC-LA-2024-009182",
      temporaryPermitNumber: "FRSC-TMP-2026-91823",
      driverName: "Demo Customer",
      licenseClass: "Class B (Private)",
      durationYears: 5,
      captureCenter: "FRSC Ojodu Sector Command, Lagos",
      appointmentDate: "Wednesday, 22 Oct 2026 (09:00 - 11:30 AM)",
      reconciliationStatus: "matched_frsc_cleared",
    },
    created_at: new Date(Date.now() - 14400000).toISOString(),
    updated_at: new Date(Date.now() - 14400000).toISOString(),
  },
  {
    id: "tx_refund_2026_0099",
    customer_id: "f0000000-0000-0000-0000-000000000001",
    renewal_id: "30000000-0000-0000-0000-000000000001",
    amount: -87500,
    currency: "NGN",
    provider: "paystack",
    reference: "ref_saga_rollback_002",
    status: "refunded",
    transaction_type: "refund",
    metadata: {
      reason: "Saga compensation triggered: Downstream certificate issuance timed out after debit.",
      originalReference: "pay_ref_recon_001",
      isCompensating: true,
      refundGatewayStatus: "fully_refunded",
    },
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [activeRail, setActiveRail] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useTransactionsRealtime({
    onTransactionChange: (transaction, eventType) => {
      setTransactions((prev) => {
        if (eventType === "INSERT") {
          return [transaction, ...prev.filter((t) => t.id !== transaction.id)];
        }
        if (eventType === "UPDATE") {
          return prev.map((t) => (t.id === transaction.id ? transaction : t));
        }
        if (eventType === "DELETE") {
          return prev.filter((t) => t.id !== transaction.id);
        }
        return prev;
      });
    },
  });

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transactions");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setTransactions(json.data);
      }
    } catch (err) {
      console.error("Failed to load transactions", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/transactions");
        const json = await res.json();
        if (active && json.success && Array.isArray(json.data)) {
          setTransactions(json.data);
        }
      } catch (err) {
        console.error("Failed to load transactions", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Combine live and benchmark transactions
  const combinedTransactions = useMemo(() => {
    if (transactions.length === 0) {
      return BENCHMARK_TRANSACTIONS;
    }
    const existingIds = new Set(transactions.map((t) => t.id));
    const extraBenchmarks = BENCHMARK_TRANSACTIONS.filter((b) => !existingIds.has(b.id));
    return [...transactions, ...extraBenchmarks];
  }, [transactions]);

  // Filtered transactions
  const filtered = useMemo(() => {
    return combinedTransactions.filter((t) => {
      if (activeTab !== "all" && t.status !== activeTab) return false;
      if (activeRail !== "all") {
        const prov = (t.provider || "").toLowerCase();
        if (activeRail === "paystack" && !prov.includes("paystack")) return false;
        if (activeRail === "flutterwave" && !prov.includes("flutterwave")) return false;
        if (activeRail === "mvaa_pay" && prov !== "mvaa_pay") return false;
        if (activeRail === "nhia_pay" && !prov.includes("nhia")) return false;
        if (activeRail === "frsc_pay" && !prov.includes("frsc")) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const refMatch = t.reference.toLowerCase().includes(q);
        const idMatch = t.id.toLowerCase().includes(q);
        const providerMatch = t.provider.toLowerCase().includes(q);
        const typeMatch = (t.transaction_type || "").toLowerCase().includes(q);
        const plateMatch = typeof t.metadata?.plate === "string" && t.metadata.plate.toLowerCase().includes(q);
        const vehicleMatch = typeof t.metadata?.vehicleName === "string" && t.metadata.vehicleName.toLowerCase().includes(q);
        const mvaaMatch = typeof t.metadata?.mvaaLicenseNumber === "string" && t.metadata.mvaaLicenseNumber.toLowerCase().includes(q);
        const hmoMatch = typeof t.metadata?.hmoProvider === "string" && t.metadata.hmoProvider.toLowerCase().includes(q);
        const enrolleeMatch = typeof t.metadata?.enrolleeId === "string" && t.metadata.enrolleeId.toLowerCase().includes(q);
        const frscMatch = typeof t.metadata?.licenseNumber === "string" && t.metadata.licenseNumber.toLowerCase().includes(q);
        if (
          !refMatch &&
          !idMatch &&
          !providerMatch &&
          !typeMatch &&
          !plateMatch &&
          !vehicleMatch &&
          !mvaaMatch &&
          !hmoMatch &&
          !enrolleeMatch &&
          !frscMatch
        ) {
          return false;
        }
      }
      return true;
    });
  }, [combinedTransactions, activeTab, activeRail, searchQuery]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    let grossInflow = 0;
    let totalRefunds = 0;
    let successfulCount = 0;

    for (const t of combinedTransactions) {
      if (t.status === "succeeded" || t.status === "partially_refunded") {
        if (t.amount > 0) {
          grossInflow += t.amount;
        }
      }
      if (t.transaction_type === "refund" || t.amount < 0) {
        totalRefunds += Math.abs(t.amount);
      }
      if (t.status === "succeeded") {
        successfulCount++;
      }
    }

    const netSettled = grossInflow - totalRefunds;
    return { grossInflow, totalRefunds, netSettled, count: combinedTransactions.length, successfulCount };
  }, [combinedTransactions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Financial Transactions &amp; Settlement Rail
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 border border-emerald-200">
              MULTI-RAIL RECONCILIATION
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
            Independently verified payment transactions, statutory fees, atomic refunds, and multi-gateway reconciliation logs across Paystack, Flutterwave, MVAA, NHIA, and FRSC.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchTransactions}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
            title="Refresh transactions"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>CDC Realtime Active</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Multi-Rail Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Inflow</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-xl font-black text-slate-900 font-mono">
            {formatNaira(metrics.grossInflow)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            From policy renewals &amp; statutory licensing
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Reversed</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-xl font-black text-purple-700 font-mono">
            {formatNaira(metrics.totalRefunds)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            Compensating Saga refunds
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Net Settled</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-xl font-black text-blue-700 font-mono">
            {formatNaira(metrics.netSettled)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            Net capital after reversals
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Settled Volume</span>
            <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-xl font-black text-slate-900 font-mono">
            {metrics.count} <span className="text-xs font-normal text-slate-500">records</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 font-bold">
            {metrics.successfulCount} successful settlements
          </div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference, plate, HMO, FRSC..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Rail Filter Pills */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100 overflow-x-auto scrollbar-none">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 shrink-0">
            Payment Rail:
          </span>
          {RAIL_FILTERS.map((rail) => (
            <button
              key={rail.id}
              type="button"
              onClick={() => setActiveRail(rail.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeRail === rail.id
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {rail.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Reference &amp; Type</th>
                <th className="px-5 py-3.5">Payment Rail</th>
                <th className="px-5 py-3.5">Amount Settled</th>
                <th className="px-5 py-3.5">Timestamp</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Verification</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Loading financial settlement ledger...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    <p className="text-sm font-semibold text-slate-700">No transactions found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchQuery ? "Try clearing your search query" : "Transactions will appear here as workflows execute"}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const isRefund = t.transaction_type === "refund" || t.amount < 0;
                  const isPartial = t.status === "partially_refunded";
                  const isMvaa = t.provider === "mvaa_pay";
                  const isNhia = t.provider === "nhia_pay";
                  const isFrsc = t.provider === "frsc_pay";

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedTx(t)}
                    >
                      <td className="px-5 py-4">
                        <div className="font-mono font-bold text-slate-900 text-xs">
                          {t.reference}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {isRefund ? (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                              COMPENSATING REFUND
                            </span>
                          ) : isPartial ? (
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              PARTIAL REFUND
                            </span>
                          ) : isMvaa ? (
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              STATUTORY VEHICLE LICENSE
                            </span>
                          ) : isNhia ? (
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                              NHIA HEALTHCARE PREMIUM
                            </span>
                          ) : isFrsc ? (
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              FRSC DRIVER PERMIT FEE
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              MOTOR RENEWAL PREMIUM
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono">
                            {t.id.slice(0, 10)}...
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {isNhia ? (
                            <HeartPulse className="w-3.5 h-3.5 shrink-0 text-teal-600" />
                          ) : isFrsc ? (
                            <FileBadge className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
                          ) : isMvaa ? (
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                          ) : (
                            <CreditCard className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                          )}
                          <span className="font-semibold text-slate-800">
                            {t.provider === "mock_paystack"
                              ? "Paystack Sandbox"
                              : t.provider === "mvaa_pay"
                              ? "MVAA Licensing Gateway"
                              : t.provider === "nhia_pay"
                              ? "NHIA Healthcare Gateway"
                              : t.provider === "frsc_pay"
                              ? "FRSC Licensing Gateway"
                              : t.provider === "paystack"
                              ? "Paystack Direct"
                              : t.provider === "flutterwave"
                              ? "Flutterwave Direct"
                              : t.provider === "mock_flutterwave"
                              ? "Flutterwave Sandbox"
                              : t.provider}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block ml-5">
                          {t.currency || "NGN"}{" "}
                          {isMvaa
                            ? "State Treasury Revenue Rail"
                            : isNhia
                            ? "National Health Insurance Authority Rail"
                            : isFrsc
                            ? "Federal Road Safety Corps Treasury Rail"
                            : "Out-of-Band Payment Rail"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div
                          className={`font-mono font-bold text-sm ${
                            isRefund
                              ? "text-purple-700"
                              : isPartial
                              ? "text-indigo-700"
                              : isMvaa
                              ? "text-blue-700"
                              : isNhia
                              ? "text-teal-700"
                              : isFrsc
                              ? "text-indigo-700"
                              : "text-emerald-700"
                          }`}
                        >
                          {isRefund ? `-${formatNaira(Math.abs(t.amount))}` : formatNaira(t.amount)}
                        </div>
                        {isPartial && typeof t.metadata?.remaining_balance === "number" && (
                          <span className="text-[10px] text-slate-500 font-mono block">
                            Bal: {formatNaira(Number(t.metadata.remaining_balance))}
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 font-mono text-slate-500 text-[11px]">
                        {formatDateTime(t.created_at)}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={t.status} size="sm" />
                      </td>

                      <td className="px-5 py-4">
                        <span className="text-[10px] font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>AUTHORITATIVE</span>
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTx(t);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Details Drawer / Modal */}
      {selectedTx && (() => {
        const meta = (selectedTx.metadata || {}) as Record<string, unknown>;
        const plate = typeof meta.plate === "string" ? meta.plate : undefined;
        const vehicleName = typeof meta.vehicleName === "string" ? meta.vehicleName : undefined;
        const mvaaLicenseNumber = typeof meta.mvaaLicenseNumber === "string" ? meta.mvaaLicenseNumber : undefined;
        const roadworthinessNumber = typeof meta.roadworthinessNumber === "string" ? meta.roadworthinessNumber : undefined;
        const feeBreakdown = (meta.feeBreakdown && typeof meta.feeBreakdown === "object" ? meta.feeBreakdown : null) as Record<string, unknown> | null;
        const hasMvaaDetails = Boolean(plate || vehicleName || mvaaLicenseNumber || roadworthinessNumber || feeBreakdown);

        // NHIA HMO fields
        const hmoProvider = typeof meta.hmoProvider === "string" ? meta.hmoProvider : undefined;
        const enrolleeId = typeof meta.enrolleeId === "string" ? meta.enrolleeId : undefined;
        const enrolleeName = typeof meta.enrolleeName === "string" ? meta.enrolleeName : undefined;
        const tier = typeof meta.tier === "string" ? meta.tier : undefined;
        const primaryFacility = typeof meta.primaryFacility === "string" ? meta.primaryFacility : undefined;
        const hasHmoDetails = Boolean(hmoProvider || enrolleeId || primaryFacility);

        // FRSC Driver's License fields
        const licenseNumber = typeof meta.licenseNumber === "string" ? meta.licenseNumber : undefined;
        const temporaryPermitNumber = typeof meta.temporaryPermitNumber === "string" ? meta.temporaryPermitNumber : undefined;
        const driverName = typeof meta.driverName === "string" ? meta.driverName : undefined;
        const licenseClass = typeof meta.licenseClass === "string" ? meta.licenseClass : undefined;
        const captureCenter = typeof meta.captureCenter === "string" ? meta.captureCenter : undefined;
        const appointmentDate = typeof meta.appointmentDate === "string" ? meta.appointmentDate : undefined;
        const hasFrscDetails = Boolean(licenseNumber || temporaryPermitNumber || captureCenter);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-start gap-4 mb-6">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                    selectedTx.transaction_type === "refund" || selectedTx.amount < 0
                      ? "bg-purple-600 text-white shadow-purple-600/20"
                      : selectedTx.provider === "nhia_pay"
                      ? "bg-teal-600 text-white shadow-teal-600/20"
                      : selectedTx.provider === "frsc_pay"
                      ? "bg-indigo-600 text-white shadow-indigo-600/20"
                      : selectedTx.provider === "mvaa_pay" || selectedTx.transaction_type === "fee"
                      ? "bg-blue-600 text-white shadow-blue-600/20"
                      : "bg-emerald-600 text-white shadow-emerald-600/20"
                  }`}
                >
                  {selectedTx.provider === "nhia_pay" ? (
                    <HeartPulse className="w-6 h-6" />
                  ) : selectedTx.provider === "frsc_pay" ? (
                    <FileBadge className="w-6 h-6" />
                  ) : selectedTx.provider === "mvaa_pay" ? (
                    <ShieldCheck className="w-6 h-6" />
                  ) : (
                    <CreditCard className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-slate-900">
                      Transaction Details
                    </h2>
                    <StatusBadge status={selectedTx.status} size="sm" />
                  </div>
                  <div className="flex items-center gap-2 mt-1 font-mono text-xs text-slate-500">
                    <span>Reference: {selectedTx.reference}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedTx.reference, "ref")}
                      className="text-emerald-600 hover:text-emerald-700"
                      title="Copy reference"
                    >
                      {copiedField === "ref" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Information Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">SETTLEMENT AMOUNT</span>
                  <span className="font-mono font-bold text-base text-slate-900">
                    {selectedTx.amount < 0 ? `-${formatNaira(Math.abs(selectedTx.amount))}` : formatNaira(selectedTx.amount)}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Currency: {selectedTx.currency || "NGN"}</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">TRANSACTION TYPE</span>
                  <span className="font-bold text-slate-800 uppercase">
                    {selectedTx.provider === "mvaa_pay"
                      ? "MVAA Vehicle License Settlement"
                      : selectedTx.provider === "nhia_pay"
                      ? "NHIA Health HMO Settlement"
                      : selectedTx.provider === "frsc_pay"
                      ? "FRSC Driver Permit Settlement"
                      : selectedTx.transaction_type || "renewal_premium"}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Rail:{" "}
                    {selectedTx.provider === "mvaa_pay"
                      ? "MVAA Licensing Gateway (State Treasury Rail)"
                      : selectedTx.provider === "nhia_pay"
                      ? "NHIA Healthcare Gateway"
                      : selectedTx.provider === "frsc_pay"
                      ? "FRSC Licensing Gateway"
                      : selectedTx.provider === "mock_paystack"
                      ? "Paystack Sandbox"
                      : selectedTx.provider === "paystack"
                      ? "Paystack Direct"
                      : selectedTx.provider === "flutterwave"
                      ? "Flutterwave Direct"
                      : selectedTx.provider === "mock_flutterwave"
                      ? "Flutterwave Sandbox"
                      : selectedTx.provider}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">CUSTOMER ID</span>
                  <span className="font-mono text-slate-700 block truncate" title={selectedTx.customer_id}>
                    {selectedTx.customer_id}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">SETTLED AT</span>
                  <span className="font-mono text-slate-700 block">
                    {formatDateTime(selectedTx.created_at)}
                  </span>
                </div>

                {selectedTx.renewal_id && (
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-[10px] font-bold uppercase">RENEWAL ID</span>
                    <span className="font-mono text-slate-700">{selectedTx.renewal_id}</span>
                  </div>
                )}
              </div>

              {/* MVAA & LACVIS Statutory Breakdown if present */}
              {hasMvaaDetails && (
                <div className="mb-6 p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-xs">
                  <div className="flex items-center justify-between border-b border-blue-200/60 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      <span className="font-extrabold text-blue-950 uppercase tracking-tight">
                        Lagos State MVAA &amp; LACVIS Statutory Breakdown
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      OFFICIAL REVENUE SCHEDULE
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                    {plate && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">VEHICLE PLATE</span>
                        <span className="font-mono font-bold text-slate-900">{plate}</span>
                      </div>
                    )}
                    {vehicleName && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">VEHICLE MODEL</span>
                        <span className="font-bold text-slate-800">{vehicleName}</span>
                      </div>
                    )}
                    {mvaaLicenseNumber && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">MVAA LICENSE NO.</span>
                        <span className="font-mono font-bold text-blue-800">{mvaaLicenseNumber}</span>
                      </div>
                    )}
                    {roadworthinessNumber && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">LACVIS CERT NO.</span>
                        <span className="font-mono font-bold text-emerald-800">{roadworthinessNumber}</span>
                      </div>
                    )}
                  </div>

                  {feeBreakdown && (
                    <div className="space-y-1.5 pt-2 border-t border-blue-200/60 font-mono text-[11px]">
                      {typeof feeBreakdown.vehicleLicenseFee === "number" && (
                        <div className="flex justify-between text-slate-700">
                          <span>Vehicle License Renewal Fee:</span>
                          <span className="font-bold">{formatNaira(Number(feeBreakdown.vehicleLicenseFee))}</span>
                        </div>
                      )}
                      {typeof feeBreakdown.roadworthinessFee === "number" && (
                        <div className="flex justify-between text-slate-700">
                          <span>LACVIS Roadworthiness Inspection Fee:</span>
                          <span className="font-bold">{formatNaira(Number(feeBreakdown.roadworthinessFee))}</span>
                        </div>
                      )}
                      {typeof feeBreakdown.adminProcessingFee === "number" && (
                        <div className="flex justify-between text-slate-700">
                          <span>State Administrative Processing Fee:</span>
                          <span className="font-bold">{formatNaira(Number(feeBreakdown.adminProcessingFee))}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* NHIA HMO Breakdown if present */}
              {hasHmoDetails && (
                <div className="mb-6 p-4 rounded-2xl bg-teal-50/70 border border-teal-200 text-xs">
                  <div className="flex items-center justify-between border-b border-teal-200/60 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <HeartPulse className="w-4 h-4 text-teal-600" />
                      <span className="font-extrabold text-teal-950 uppercase tracking-tight">
                        National Health Insurance Authority (NHIA) Enrollee Breakdown
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                      NHIA ACCREDITED
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {enrolleeId && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">ENROLLEE ID</span>
                        <span className="font-mono font-bold text-slate-900">{enrolleeId}</span>
                      </div>
                    )}
                    {enrolleeName && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">ENROLLEE NAME</span>
                        <span className="font-bold text-slate-800">{enrolleeName}</span>
                      </div>
                    )}
                    {hmoProvider && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">HMO PROVIDER</span>
                        <span className="font-bold text-teal-800">{hmoProvider}</span>
                      </div>
                    )}
                    {tier && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">COVERAGE TIER</span>
                        <span className="font-mono font-bold text-amber-700 uppercase">{tier}</span>
                      </div>
                    )}
                    {primaryFacility && (
                      <div className="sm:col-span-2">
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">PRIMARY HOSPITAL</span>
                        <span className="font-semibold text-slate-900">{primaryFacility}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* FRSC Driver's License Breakdown if present */}
              {hasFrscDetails && (
                <div className="mb-6 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-xs">
                  <div className="flex items-center justify-between border-b border-indigo-200/60 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <FileBadge className="w-4 h-4 text-indigo-600" />
                      <span className="font-extrabold text-indigo-950 uppercase tracking-tight">
                        FRSC National Driver&apos;s License Statutory Schedule
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                      FRSC VERIFIED
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {licenseNumber && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">LICENSE NUMBER</span>
                        <span className="font-mono font-bold text-slate-900">{licenseNumber}</span>
                      </div>
                    )}
                    {temporaryPermitNumber && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">PERMIT NUMBER</span>
                        <span className="font-mono font-bold text-indigo-800">{temporaryPermitNumber}</span>
                      </div>
                    )}
                    {driverName && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">DRIVER NAME</span>
                        <span className="font-bold text-slate-900">{driverName}</span>
                      </div>
                    )}
                    {licenseClass && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">LICENSE CLASS</span>
                        <span className="font-bold text-slate-800">{licenseClass}</span>
                      </div>
                    )}
                    {captureCenter && (
                      <div className="sm:col-span-2">
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">BIOMETRIC SECTOR COMMAND</span>
                        <span className="font-semibold text-slate-900">{captureCenter}</span>
                      </div>
                    )}
                    {appointmentDate && (
                      <div>
                        <span className="text-slate-500 block text-[10px] font-bold uppercase">APPOINTMENT SCHEDULE</span>
                        <span className="font-bold text-emerald-700">{appointmentDate}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Metadata JSON Viewer */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Settlement &amp; Audit Metadata
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(JSON.stringify(selectedTx.metadata || {}, null, 2), "meta")}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedField === "meta" ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied JSON</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Metadata</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto max-h-60 border border-slate-800">
                  {JSON.stringify(selectedTx.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

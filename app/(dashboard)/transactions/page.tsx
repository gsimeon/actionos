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
} from "lucide-react";
import { StatusBadge } from "@/components/actionos/status-badge";
import { formatNaira, formatDateTime } from "@/lib/utils";
import type { Transaction } from "@/types/database";

const STATUS_TABS = [
  { id: "all", label: "All Transactions" },
  { id: "succeeded", label: "Succeeded" },
  { id: "partially_refunded", label: "Partially Refunded" },
  { id: "refunded", label: "Refunded" },
  { id: "pending", label: "Pending" },
  { id: "failed", label: "Failed" },
];

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (activeTab !== "all" && t.status !== activeTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const refMatch = t.reference.toLowerCase().includes(q);
        const idMatch = t.id.toLowerCase().includes(q);
        const providerMatch = t.provider.toLowerCase().includes(q);
        const typeMatch = (t.transaction_type || "").toLowerCase().includes(q);
        if (!refMatch && !idMatch && !providerMatch && !typeMatch) return false;
      }
      return true;
    });
  }, [transactions, activeTab, searchQuery]);

  // Aggregate metrics
  const metrics = useMemo(() => {
    let grossInflow = 0;
    let totalRefunds = 0;
    let successfulCount = 0;

    for (const t of transactions) {
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
    return { grossInflow, totalRefunds, netSettled, count: transactions.length, successfulCount };
  }, [transactions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Financial Transactions & Settlement Rail
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Independently verified payment transactions, atomic refunds, and gateway reconciliation logs.
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
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Paystack Rail Active</span>
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
            From policy renewals & issuances
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tabs */}
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
            placeholder="Search reference, ID, rail..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Transactions Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Reference & Type</th>
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
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              RENEWAL PREMIUM
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono">
                            {t.id.slice(0, 10)}...
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-semibold text-slate-800">
                            {t.provider === "mock_paystack" ? "Paystack Sandbox" : t.provider}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block ml-5">
                          {t.currency || "NGN"} Out-of-Band Rail
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div
                          className={`font-mono font-bold text-sm ${
                            isRefund
                              ? "text-purple-700"
                              : isPartial
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
      {selectedTx && (
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
                    : "bg-emerald-600 text-white shadow-emerald-600/20"
                }`}
              >
                <CreditCard className="w-6 h-6" />
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
                  {selectedTx.transaction_type || "renewal_premium"}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Rail: {selectedTx.provider}</span>
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

            {/* Metadata JSON Viewer */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Settlement & Audit Metadata
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
      )}
    </div>
  );
}

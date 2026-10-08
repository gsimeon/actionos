"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, Clock, AlertTriangle, ArrowUpRight, Zap } from "lucide-react";
import { StatusBadge } from "@/components/actionos/status-badge";
import { formatDate, formatNaira } from "@/lib/utils";
import type { Policy } from "@/types/database";

const FILTER_TABS = [
  { id: "all", label: "All Policies" },
  { id: "expiring", label: "Expiring (Due Soon)" },
  { id: "active", label: "Active" },
  { id: "renewed", label: "Renewed" },
  { id: "expired", label: "Expired" },
];

export function getExpiryBadge(expiryDate: string) {
  const diffTime = new Date(expiryDate).getTime() - new Date("2026-10-07").getTime();
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (days <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
        <AlertTriangle className="w-3 h-3" /> Overdue
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
        <Clock className="w-3 h-3" /> Due in {days} days!
      </span>
    );
  }
  if (days <= 14) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-yellow-800 bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-200">
        Due in {days} days
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
        Due in {days} days
      </span>
    );
  }
  return null;
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/policies?status=${activeTab}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setPolicies(res.data);
      })
      .finally(() => setLoading(false));
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Insurance Policy Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Motor, HMO, and asset coverage portfolios with proactive expiry detection.
          </p>
        </div>

        <Link
          href="/actions"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Renew via Voice/AI</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Policies Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Policy Number</th>
                <th className="px-5 py-3.5">Policyholder</th>
                <th className="px-5 py-3.5">Insured Vehicle / Asset</th>
                <th className="px-5 py-3.5">Expiry Date</th>
                <th className="px-5 py-3.5">Premium</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500">
                    Loading policies...
                  </td>
                </tr>
              ) : policies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500">
                    No policies found in this category.
                  </td>
                </tr>
              ) : (
                policies.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-mono font-bold text-slate-900 text-xs">
                          {p.policy_number}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 block ml-6">
                        {p.metadata?.provider_name as string || "Demo Insurance"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {p.customer?.full_name || "Customer Account"}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {p.customer?.customer_number || ""}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-slate-800 font-semibold">
                        {p.asset?.name || p.metadata?.vehicle_name as string || "Toyota Camry"}
                      </div>
                      <span className="font-mono text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        {p.asset?.identifier || p.metadata?.vehicle_reg as string || "ABC-123-XY"}
                      </span>
                    </td>
                    <td className="px-5 py-4 space-y-1">
                      <div className="font-semibold text-slate-700">
                        {formatDate(p.expiry_date)}
                      </div>
                      {getExpiryBadge(p.expiry_date)}
                    </td>
                    <td className="px-5 py-4 font-mono font-bold text-emerald-700">
                      {formatNaira(p.premium)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={p.status} size="sm" />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/actions?policy=${p.policy_number}`}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-semibold transition-all inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Renew</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

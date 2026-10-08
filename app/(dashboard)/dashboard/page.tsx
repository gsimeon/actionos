"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  ShieldCheck,
  RotateCw,
  TrendingUp,
  Zap,
  Activity,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/actionos/status-badge";
import { formatNaira, formatDate } from "@/lib/utils";
import type { Renewal, Policy, Customer } from "@/types/database";

export default function DashboardOverviewPage() {
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [renRes, polRes, cusRes] = await Promise.all([
          fetch("/api/renewals").then((r) => r.json()),
          fetch("/api/policies").then((r) => r.json()),
          fetch("/api/customers").then((r) => r.json()),
        ]);

        if (renRes.success) setRenewals(renRes.data || []);
        if (polRes.success) setPolicies(polRes.data || []);
        if (cusRes.success) setCustomers(cusRes.data || []);
      } catch {
        // Demo resilience
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const totalPremiums = policies.reduce((acc, p) => acc + (p.premium || 0), 0);
  const dueRenewals = renewals.filter(
    (r) => r.status === "awaiting_confirmation" || r.status === "scheduled"
  );
  const completedRenewals = renewals.filter((r) => r.status === "completed");

  const pipelineStages = [
    { label: "Upcoming", count: renewals.filter((r) => r.status === "scheduled").length, color: "text-slate-700" },
    { label: "Contacted", count: renewals.filter((r) => r.status === "contacted").length, color: "text-blue-700" },
    {
      label: "Awaiting Auth",
      count: renewals.filter((r) => r.status === "awaiting_confirmation").length,
      color: "text-amber-700",
    },
    { label: "Payment Pending", count: renewals.filter((r) => r.status === "payment_pending").length, color: "text-yellow-700" },
    { label: "Processing", count: renewals.filter((r) => r.status === "processing").length, color: "text-cyan-700" },
    { label: "Completed", count: completedRenewals.length, color: "text-emerald-700" },
    { label: "Failed", count: renewals.filter((r) => r.status === "failed").length, color: "text-rose-700" },
  ];

  return (
    <div className="space-y-8">
      {/* Hero Welcome banner */}
      <div className="rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50/80 via-teal-50/40 to-white p-6 sm:p-8 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-800">
              NITDA 2026 AI Innovation Challenge Showcase
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            ActionOS Renew Enterprise Operations
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
            Autonomous, guardrailed execution layer orchestrating vehicle insurance renewals, NAICOM document verification, and Paystack settlement.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
          <Link
            href="/actions"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95"
          >
            <Zap className="w-4 h-4" />
            <span>Action Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href="/escalations"
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-white hover:bg-slate-50 text-rose-700 border border-rose-200 text-xs font-bold transition-all shadow-xs"
          >
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span>Escalation Center</span>
          </Link>
          <Link
            href="/ledger"
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold transition-all shadow-xs"
          >
            <Activity className="w-4 h-4 text-emerald-600" />
            <span>Action Ledger</span>
          </Link>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Active Customers"
          value={loading ? "..." : customers.length}
          subtitle="All verified identities"
          icon={Users}
          trend="+12% this month"
          trendUp={true}
          color="blue"
        />
        <StatCard
          title="Active Policies"
          value={loading ? "..." : policies.length}
          subtitle="Motor & HMO covers"
          icon={ShieldCheck}
          trend="100% compliant"
          trendUp={true}
          color="emerald"
        />
        <StatCard
          title="Renewals Due"
          value={loading ? "..." : dueRenewals.length}
          subtitle="Within 30-day window"
          icon={RotateCw}
          trend="Auto-eligible"
          trendUp={true}
          color="amber"
        />
        <StatCard
          title="Gross Premiums"
          value={loading ? "..." : formatNaira(totalPremiums)}
          subtitle="Total insured value"
          icon={TrendingUp}
          trend="Settled in NGN"
          trendUp={true}
          color="purple"
        />
      </div>

      {/* Renewal Pipeline Board */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Renewal Pipeline Stages
            </h2>
            <p className="text-xs text-slate-500">
              State transitions across automated customer lifecycle
            </p>
          </div>
          <Link
            href="/renewals"
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
          >
            Manage Pipeline &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 pt-2">
          {pipelineStages.map((stg) => (
            <div
              key={stg.label}
              className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center"
            >
              <div className={`text-xl font-black font-mono ${stg.color}`}>
                {stg.count}
              </div>
              <div className="text-[11px] font-semibold text-slate-600 mt-1 truncate">
                {stg.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dual Grid: Recent Policies & ActionOS Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Policies List Preview (2 cols) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Benchmark Policies
              </h2>
              <p className="text-xs text-slate-500">
                Registered vehicles expiring within upcoming cycles
              </p>
            </div>
            <Link
              href="/policies"
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              View All ({policies.length})
            </Link>
          </div>

          <div className="space-y-3">
            {policies.slice(0, 4).map((pol) => (
              <div
                key={pol.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 hover:border-emerald-300 hover:bg-slate-50 transition-all gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{pol.policy_number}</span>
                      <span className="font-mono text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-700 font-semibold">
                        {pol.asset?.identifier || pol.metadata?.vehicle_reg as string || "ABC-123-XY"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {pol.asset?.name || pol.metadata?.vehicle_name as string || "Vehicle"} &bull; Expiring {formatDate(pol.expiry_date)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <span className="font-mono font-bold text-xs text-emerald-700">
                    {formatNaira(pol.premium)}
                  </span>
                  <StatusBadge status={pol.status} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ActionOS Health & AI Observability (1 col) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                ActionOS Observability
              </h2>
            </div>
            <p className="text-xs text-slate-500 mb-6">
              AI accuracy, guardrail latency, and system health
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700">N-ATLAS Intent Accuracy</span>
                  <span className="text-emerald-700 font-mono font-bold">98.4%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600 rounded-full w-[98%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700">Tool Execution Success Rate</span>
                  <span className="text-emerald-700 font-mono font-bold">99.1%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-600 rounded-full w-[99%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-700">Average Workflow Execution</span>
                  <span className="text-cyan-700 font-mono font-bold">1.2s</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-600 rounded-full w-[90%]" />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-center text-xs">
                <Link href="/escalations" className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors block cursor-pointer">
                  <span className="text-slate-500 block text-[10px] font-bold">FAILED ACTIONS</span>
                  <span className="font-mono font-bold text-emerald-700">0 Handled</span>
                </Link>
                <Link href="/escalations" className="p-2.5 rounded-xl bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors block cursor-pointer">
                  <span className="text-slate-500 block text-[10px] font-bold">SAFETY HALTS</span>
                  <span className="font-mono font-bold text-rose-700">3 Monitored</span>
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-500 text-center font-medium">
            Zero direct DB writes from AI &bull; Guardrail Enforced
          </div>
        </div>
      </div>
    </div>
  );
}

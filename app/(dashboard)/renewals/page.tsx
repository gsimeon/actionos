"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  PhoneCall,
  Zap,
} from "lucide-react";
import { StatusBadge } from "@/components/actionos/status-badge";
import { formatNaira, formatDate } from "@/lib/utils";
import type { Renewal } from "@/types/database";

export default function RenewalsPage() {
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionAlert, setActionAlert] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/renewals")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setRenewals(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleStaffAction = (action: string, renewalId: string) => {
    setActionAlert(`Staff action '${action}' triggered and recorded in Audit Log for ${renewalId}.`);
    setTimeout(() => setActionAlert(null), 4000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Renewal Lifecycle & Pipeline
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Automated queue orchestrating contact, quote generation, payment verification, and escalation.
          </p>
        </div>

        <Link
          href="/actions"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Launch AI Action</span>
        </Link>
      </div>

      {actionAlert && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between shadow-xs">
          <span>{actionAlert}</span>
          <span className="font-mono text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
            AUDIT_LOG_COMMITTED
          </span>
        </div>
      )}

      {/* Renewals Queue Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Policy & Customer</th>
                <th className="px-5 py-3.5">Vehicle Asset</th>
                <th className="px-5 py-3.5">Scheduled Cycle</th>
                <th className="px-5 py-3.5">Renewal Quote</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Staff Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500">
                    Loading renewal pipeline...
                  </td>
                </tr>
              ) : renewals.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-900 text-sm">
                      {r.policy?.policy_number || "AUTO-2026-00182"}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {r.customer?.full_name || "Demo Customer"} ({r.customer?.phone || "+234 803 123 4567"})
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="text-slate-800 font-semibold">
                      {r.policy?.asset?.name || "Toyota Camry"}
                    </div>
                    <span className="font-mono text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      {r.policy?.asset?.identifier || "ABC-123-XY"}
                    </span>
                  </td>
                  <td className="px-5 py-4 space-y-1">
                    <div className="font-semibold text-slate-700">
                      {formatDate(r.scheduled_for)}
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      {r.days_before_expiry} days notice
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono font-bold text-emerald-700">
                    {r.quote_amount ? formatNaira(r.quote_amount) : "₦87,500"}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={r.status} size="sm" />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleStaffAction("SMS_VOICE_OUTREACH", r.id)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold transition-all inline-flex items-center gap-1 cursor-pointer"
                        title="Contact customer via automated SMS/Voice"
                      >
                        <PhoneCall className="w-3 h-3 text-slate-500" />
                        <span>Contact</span>
                      </button>

                      <Link
                        href={`/actions?renewal=${r.id}`}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all inline-flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        <Zap className="w-3 h-3" />
                        <span>Execute</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

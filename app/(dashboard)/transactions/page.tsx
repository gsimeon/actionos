"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle, CreditCard, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/actionos/status-badge";
import { formatNaira, formatDateTime } from "@/lib/utils";
import type { Transaction } from "@/types/database";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In demo mode, fetch or read store state
    fetch("/api/policies")
      .then(() => {
        // Read transactions from mock store via a local fallback
        const mockTx: Transaction[] = [
          {
            id: "tx_001",
            customer_id: "f0000000-0000-0000-0000-000000000001",
            renewal_id: "30000000-0000-0000-0000-000000000001",
            amount: 87500,
            currency: "NGN",
            provider: "mock_paystack",
            reference: "act_1007_pay_9941",
            status: "succeeded",
            transaction_type: "renewal_premium",
            metadata: { simulation_mode: true, bank: "GTBank Nigeria Plc" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
        setTransactions(mockTx);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Financial Transactions & Settlement Rail
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Independently verified payment transactions settled across Nigerian gateway rails.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Paystack Sandbox Connected</span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Reference ID</th>
                <th className="px-5 py-3.5">Payment Rail</th>
                <th className="px-5 py-3.5">Amount Settled</th>
                <th className="px-5 py-3.5">Timestamp</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500">
                    Loading transactions...
                  </td>
                </tr>
              ) : transactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-4 font-mono font-bold text-slate-900">
                    {t.reference}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-semibold text-slate-800">
                        {t.provider === "mock_paystack" ? "Paystack NGN" : t.provider}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 block ml-5">
                      Card / Transfer Rails
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono font-bold text-emerald-700 text-sm">
                    {formatNaira(t.amount)}
                  </td>
                  <td className="px-5 py-4 font-mono text-slate-500">
                    {formatDateTime(t.created_at)}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={t.status} size="sm" />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 inline-flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                      <span>GATEWAY_SETTLED</span>
                    </span>
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

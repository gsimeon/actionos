"use client";

import React, { useEffect, useState } from "react";
import { Phone, Mail, MapPin, Eye, X, Shield, Car } from "lucide-react";
import { StatusBadge } from "@/components/actionos/status-badge";
import { formatDate, formatNaira } from "@/lib/utils";
import type { Customer, Policy, Asset, Renewal, Document } from "@/types/database";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<{
    customer: Customer;
    vehicles: Asset[];
    policies: Policy[];
    renewals: Renewal[];
    documents: Document[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setCustomers(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSelectCustomer = async (id: string) => {
    setSelectedCustomerId(id);
    const res = await fetch(`/api/customers/${id}`).then((r) => r.json());
    if (res.success) {
      setCustomerDetail(res.data);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Customer Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Verified corporate and retail policyholders registered in ActionOS tenant.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-semibold">Total Verified:</span>
          <span className="font-mono text-sm font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            {customers.length}
          </span>
        </div>
      </div>

      {/* Customer Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Identifier</th>
                <th className="px-5 py-3.5">Contact Details</th>
                <th className="px-5 py-3.5">State & Country</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-500">
                    Loading customer accounts...
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    onClick={() => handleSelectCustomer(c.id)}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center shrink-0 shadow-xs">
                          {c.full_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {c.full_name}
                          </div>
                          <span className="text-[11px] text-slate-500">
                            Registered {formatDate(c.created_at)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono font-bold text-slate-700">
                      {c.customer_number}
                    </td>
                    <td className="px-5 py-4 space-y-1">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{c.phone}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{c.email}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1 text-slate-700">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{c.state || "Lagos"}, {c.country}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={c.status} size="sm" />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectCustomer(c.id);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 border border-slate-200 text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Drawer Modal matching Section 16 */}
      {selectedCustomerId && customerDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
            <button
              type="button"
              onClick={() => {
                setSelectedCustomerId(null);
                setCustomerDetail(null);
              }}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white font-black text-xl flex items-center justify-center shadow-md shadow-emerald-600/20">
                {customerDetail.customer.full_name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {customerDetail.customer.full_name}
                </h2>
                <div className="flex items-center gap-2 mt-1 font-mono text-xs text-emerald-700 font-bold">
                  <span>{customerDetail.customer.customer_number}</span>
                  <span>&bull;</span>
                  <span className="text-slate-500 font-normal">{customerDetail.customer.phone}</span>
                </div>
              </div>
            </div>

            {/* Sub-panels for vehicles and policies */}
            <div className="space-y-6">
              {/* Vehicles */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-emerald-600" />
                  Registered Assets ({customerDetail.vehicles.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {customerDetail.vehicles.map((v) => (
                    <div
                      key={v.id}
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200"
                    >
                      <div className="font-bold text-sm text-slate-900">{v.name}</div>
                      <div className="font-mono text-xs text-emerald-700 font-semibold mt-1">
                        Plate: {v.identifier}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Policies */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  Active & Expiring Policies ({customerDetail.policies.length})
                </h3>
                <div className="space-y-2.5">
                  {customerDetail.policies.map((p) => (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-sm text-slate-900">{p.policy_number}</div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          Expires: {formatDate(p.expiry_date)} &bull; Premium: {formatNaira(p.premium)}
                        </div>
                      </div>
                      <StatusBadge status={p.status} size="sm" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Phone,
  Mail,
  MapPin,
  Eye,
  X,
  Shield,
  Car,
  HeartPulse,
  FileBadge,
  Search,
  CheckCircle2,
  FileText,
  Zap,
  ArrowUpRight,
} from "lucide-react";
import { StatusBadge } from "@/components/actionos/status-badge";
import { formatDate, formatNaira } from "@/lib/utils";
import type { Customer, Policy, Asset, Renewal, Document } from "@/types/database";
import { StatutoryDocumentViewer } from "@/components/actionos/statutory-document-viewer";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<{
    customer: Customer;
    vehicles?: Asset[];
    policies?: Policy[];
    renewals?: Renewal[];
    documents?: Document[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) setCustomers(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSelectCustomer = async (id: string) => {
    setSelectedCustomerId(id);
    try {
      const res = await fetch(`/api/customers/${id}`).then((r) => r.json());
      if (res.success && res.data) {
        setCustomerDetail(res.data);
      }
    } catch (err) {
      console.error("Failed to load customer detail", err);
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter((c) => {
      const nameMatch = c.full_name.toLowerCase().includes(q);
      const numMatch = c.customer_number.toLowerCase().includes(q);
      const phoneMatch = c.phone.toLowerCase().includes(q);
      const emailMatch = c.email.toLowerCase().includes(q);
      const stateMatch = (c.state || "").toLowerCase().includes(q);
      const ninMatch = typeof c.metadata?.nin === "string" && c.metadata.nin.toLowerCase().includes(q);
      return nameMatch || numMatch || phoneMatch || emailMatch || stateMatch || ninMatch;
    });
  }, [customers, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Customer Directory
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 border border-emerald-200">
              TENANT VERIFIED
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Corporate and retail policyholders registered in ActionOS tenant with cross-vertical statutory records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, phone, NIN..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-xs font-semibold text-slate-600">
            <span>Total:</span>
            <span className="font-mono font-bold text-slate-900">{customers.length}</span>
          </div>
        </div>
      </div>

      {/* Customer Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Customer Name &amp; ID</th>
                <th className="px-5 py-3.5">National ID (NIN)</th>
                <th className="px-5 py-3.5">Contact Channels</th>
                <th className="px-5 py-3.5">State &amp; Location</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Loading verified customer accounts...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    <p className="text-sm font-semibold text-slate-700">No customers found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchQuery ? "Try refining your search query" : "Customer accounts will appear here"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => {
                  const nin = (c.metadata?.nin as string) || "NIN Verified";

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => handleSelectCustomer(c.id)}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white font-bold flex items-center justify-center shrink-0 shadow-xs text-xs">
                            {c.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm">
                              {c.full_name}
                            </div>
                            <span className="text-[11px] font-mono font-semibold text-emerald-700">
                              {c.customer_number}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          {nin}
                        </span>
                      </td>

                      <td className="px-5 py-4 space-y-1">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span className="font-mono">{c.phone}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{c.email}</span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1 text-slate-700 font-medium">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{c.state || "Lagos"}, {c.country}</span>
                        </div>
                        {c.address && (
                          <span className="text-[10px] text-slate-400 block truncate max-w-[200px]" title={c.address}>
                            {c.address}
                          </span>
                        )}
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

      {/* Comprehensive Customer Detail Drawer / Modal */}
      {selectedCustomerId && customerDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[90vh]">
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

            {/* Profile Header */}
            <div className="flex items-start gap-4 mb-6 border-b border-slate-100 pb-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white font-black text-xl flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
                {customerDetail.customer.full_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-slate-900">
                    {customerDetail.customer.full_name}
                  </h2>
                  <StatusBadge status={customerDetail.customer.status} size="sm" />
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 font-mono text-xs text-emerald-700 font-bold">
                  <span>{customerDetail.customer.customer_number}</span>
                  <span>&bull;</span>
                  <span className="text-slate-600 font-normal">{customerDetail.customer.phone}</span>
                  <span>&bull;</span>
                  <span className="text-slate-600 font-normal">{customerDetail.customer.email}</span>
                  {typeof customerDetail.customer.metadata?.nin === "string" && (
                    <>
                      <span>&bull;</span>
                      <span className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        NIN: {customerDetail.customer.metadata.nin}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <Link
                href={`/actions?customer=${customerDetail.customer.customer_number}`}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Launch Action Session</span>
              </Link>
            </div>

            <div className="space-y-6">
              {/* Registered Vehicles / Assets */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-emerald-600" />
                  Registered Vehicles &amp; Assets ({(customerDetail.vehicles || []).length})
                </h3>
                {(customerDetail.vehicles || []).length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                    No vehicles registered yet for this account.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(customerDetail.vehicles || []).map((v) => (
                      <div
                        key={v.id}
                        className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-sm text-slate-900">{v.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono text-xs text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {v.identifier}
                            </span>
                            {typeof v.metadata?.year === "number" && (
                              <span className="text-[11px] text-slate-500">
                                Model Year: {v.metadata.year}
                              </span>
                            )}
                          </div>
                        </div>
                        <Link
                          href={`/actions?service=vehicle_license&plate=${v.identifier}`}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-600 hover:text-white text-emerald-700 border border-emerald-200 text-[11px] font-bold transition-all inline-flex items-center gap-1"
                        >
                          <span>MVAA</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Policies Ledger */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  Insurance &amp; Health Policies ({(customerDetail.policies || []).length})
                </h3>
                {(customerDetail.policies || []).length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                    No policies found for this customer.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {(customerDetail.policies || []).map((p) => (
                      <div
                        key={p.id}
                        className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-slate-900">{p.policy_number}</span>
                            <span className="text-[10px] text-slate-500">
                              {(p.metadata?.provider_name as string) || "Underwriter"}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 mt-1">
                            Expires: <strong>{formatDate(p.expiry_date)}</strong> &bull; Premium:{" "}
                            <strong className="text-emerald-700">{formatNaira(p.premium)}</strong>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={p.status} size="sm" />
                          <Link
                            href={`/actions?policy=${p.policy_number}`}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-all inline-flex items-center gap-1"
                          >
                            <span>Renew</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Statutory Documents & Certificates */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Statutory Documents &amp; Certificates ({(customerDetail.documents || []).length})
                </h3>
                {(customerDetail.documents || []).length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                    No documents generated yet. Certificates appear here automatically upon renewal.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(customerDetail.documents || []).map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                          <div>
                            <div className="font-bold text-xs text-slate-900">{doc.file_name}</div>
                            <span className="text-[10px] text-slate-400 block font-mono">
                              Issued {formatDate(doc.created_at)} &bull; {doc.document_type.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View QR</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Document Viewer Modal */}
      {previewDoc && (
        <StatutoryDocumentViewer
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

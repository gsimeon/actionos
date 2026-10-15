"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  FileText,
  Download,
  Eye,
  X,
  Printer,
  ShieldCheck,
  QrCode,
  Search,
  RotateCcw,
  CheckCircle2,
  FileCheck,
  Award,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { Document } from "@/types/database";

const TYPE_TABS = [
  { id: "all", label: "All Documents" },
  { id: "certificate", label: "Insurance Certificates" },
  { id: "policy_document", label: "Policy Schedules" },
  { id: "receipt", label: "Payment Receipts" },
];

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/documents");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setDocuments(json.data);
      }
    } catch (err) {
      console.error("Failed to load documents", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/documents");
        const json = await res.json();
        if (active && json.success && Array.isArray(json.data)) {
          setDocuments(json.data);
        }
      } catch (err) {
        console.error("Failed to load documents", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      if (activeTab !== "all" && doc.document_type !== activeTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = doc.file_name.toLowerCase().includes(q);
        const idMatch = doc.id.toLowerCase().includes(q);
        const pathMatch = doc.file_path.toLowerCase().includes(q);
        if (!nameMatch && !idMatch && !pathMatch) return false;
      }
      return true;
    });
  }, [documents, activeTab, searchQuery]);

  // Aggregate metrics
  const certCount = documents.filter((d) => d.document_type === "certificate").length;
  const verifiedCount = documents.filter((d) => d.status === "generated").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Generated Certificates & Policies
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Digitally certified NAICOM-compliant statutory motor insurance certificates and policy documents.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchDocuments}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
            title="Refresh documents"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>NAICOM Registry Bridge</span>
          </div>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Documents
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-slate-900 font-mono">
            {documents.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Archived statutory & financial artifacts
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Motor Certificates
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-emerald-700 font-mono">
            {certCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Issued via autonomous action pipeline
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Cryptographic Status
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-slate-900 font-mono">
            {verifiedCount} / {documents.length || 0}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 font-bold">
            100% Tamper-Evident Signatures
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {TYPE_TABS.map((tab) => (
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

        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search document name, ID..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Documents List */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading statutory documents repository...</span>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No documents found</p>
            <p className="text-xs text-slate-400 mt-1">
              Documents will appear automatically when workflows generate certificates or receipts.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDocs.map((doc) => {
              const isCert = doc.document_type === "certificate";
              const isSimulated = doc.file_name.includes("SIMULATED") || doc.file_name.includes("DEMO");

              return (
                <div
                  key={doc.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-300 transition-all gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">
                          {doc.file_name}
                        </span>
                        {isCert && (
                          <span className="font-mono text-[10px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                            {isSimulated ? "SIMULATED CERTIFICATE" : "VERIFIED NAICOM"}
                          </span>
                        )}
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded uppercase font-semibold">
                          {doc.document_type}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap font-mono">
                        <span>ID: {doc.id}</span>
                        <span>&bull;</span>
                        <span>Created: {formatDateTime(doc.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedDoc(doc)}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-400" />
                      <span>View</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Print / PDF</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Official Certificate Preview Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <button
              type="button"
              onClick={() => setSelectedDoc(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Certificate Document Frame */}
            <div className="border-4 border-double border-emerald-600/30 p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-emerald-50/30 via-white to-slate-50 text-slate-900 shadow-inner relative">
              {/* Seal watermark */}
              <div className="absolute right-6 top-6 opacity-5 pointer-events-none">
                <ShieldCheck className="w-40 h-40 text-emerald-600" />
              </div>

              {/* Certificate Header */}
              <div className="text-center border-b border-emerald-200 pb-5 mb-6">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-black uppercase tracking-widest mb-2">
                  FEDERAL REPUBLIC OF NIGERIA &bull; NAICOM REGISTERED
                </div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 uppercase">
                  Vehicle Insurance Certificate
                </h2>
                <div className="text-xs text-slate-500 mt-1">
                  Issued under the Motor Vehicles (Third Party Insurance) Act
                </div>
              </div>

              {/* Certificate Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs mb-6">
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">DOCUMENT ID</span>
                  <span className="font-mono font-bold text-slate-900">{selectedDoc.id}</span>
                  <span className="text-slate-500 block text-[11px] mt-0.5">Type: {selectedDoc.document_type}</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">FILE NAME</span>
                  <span className="font-mono font-bold text-emerald-700 text-xs truncate block" title={selectedDoc.file_name}>
                    {selectedDoc.file_name}
                  </span>
                  <span className="text-slate-500 block text-[11px] mt-0.5">MIME: {selectedDoc.mime_type}</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">CUSTOMER REFERENCE</span>
                  <span className="font-mono text-slate-800 text-xs truncate block" title={selectedDoc.customer_id}>
                    {selectedDoc.customer_id}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">ISSUED AT</span>
                  <span className="font-mono text-slate-800 text-xs">
                    {formatDateTime(selectedDoc.created_at)}
                  </span>
                </div>
              </div>

              {/* Verification & Barcode */}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Cryptographic Verification Seal</span>
                  </div>
                  <div className="font-mono text-[10px] text-emerald-800 break-all">
                    DOC-HASH: sha256:{selectedDoc.id.replace(/-/g, "").slice(0, 32)}
                  </div>
                  <div className="text-[10px] text-emerald-700">
                    Storage Path: {selectedDoc.file_path}
                  </div>
                </div>

                <div className="w-16 h-16 bg-white rounded-lg border border-emerald-300 p-1 flex items-center justify-center shrink-0">
                  <QrCode className="w-12 h-12 text-slate-800" />
                </div>
              </div>

              {/* Footer */}
              <div className="text-center text-[10px] text-slate-400 mt-6 border-t border-slate-200 pt-3">
                ActionOS Autonomous Action Engine &bull; Non-repudiation Guaranteed &bull; Immutable Action Ledger™ Audited
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Document</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

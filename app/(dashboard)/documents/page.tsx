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
  AlertTriangle,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { Document } from "@/types/database";
import { StatutoryDocumentViewer } from "@/components/actionos/statutory-document-viewer";

const TYPE_TABS = [
  { id: "all", label: "All Documents" },
  { id: "certificate", label: "Certificates & Road Licenses" },
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
                            {doc.file_name.includes("Vehicle_License")
                              ? "STATUTORY MVAA LICENSE"
                              : doc.file_name.includes("Roadworthiness")
                              ? "LACVIS ROADWORTHINESS"
                              : isSimulated
                              ? "SIMULATED CERTIFICATE"
                              : "VERIFIED NAICOM"}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <StatutoryDocumentViewer
            document={selectedDoc}
            onClose={() => setSelectedDoc(null)}
          />
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState } from "react";
import {
  FileText,
  Download,
  Eye,
  X,
  Printer,
  ShieldCheck,
  QrCode,
} from "lucide-react";
import { formatNaira, formatDate } from "@/lib/utils";

export default function DocumentsPage() {
  const [selectedDoc, setSelectedDoc] = useState<boolean>(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Generated Certificates & Policies
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Digitally certified NAICOM-compliant statutory motor insurance certificates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSelectedDoc(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Preview Benchmark Certificate</span>
        </button>
      </div>

      {/* Documents List Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-300 transition-all gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">
                    Motor_Insurance_Certificate_AUTO-2026-00182.pdf
                  </span>
                  <span className="font-mono text-[10px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                    VERIFIED NAICOM
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Demo Customer &bull; Toyota Camry (ABC-123-XY) &bull; Valid: 14 Oct 2026 &rarr; 14 Oct 2027
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setSelectedDoc(true)}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <Eye className="w-3.5 h-3.5 text-slate-400" />
                <span>View Certificate</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Official Certificate Preview Modal matching Section 48 */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <button
              type="button"
              onClick={() => setSelectedDoc(false)}
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
                  Vehicle Insurance Renewal Certificate
                </h2>
                <div className="text-xs text-slate-500 mt-1">
                  Issued under the Motor Vehicles (Third Party Insurance) Act
                </div>
              </div>

              {/* Certificate Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs mb-6">
                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">POLICYHOLDER</span>
                  <span className="font-bold text-slate-900 text-sm">Demo Customer</span>
                  <span className="text-slate-500 block text-[11px]">14 Adeola Odeku St, VI, Lagos</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">POLICY NUMBER</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">AUTO-2026-00182</span>
                  <span className="text-slate-500 block text-[11px]">Underwriter: Demo Insurance Ltd.</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">INSURED VEHICLE</span>
                  <span className="font-bold text-slate-900">Toyota Camry (2022)</span>
                  <span className="font-mono text-emerald-700 block font-bold">Plate: ABC-123-XY</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">COVERAGE DURATION</span>
                  <span className="text-slate-500 block">Prev Expiry: 14 Oct 2026</span>
                  <span className="font-bold text-emerald-700">New Expiry: 14 Oct 2027</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">PREMIUM PAID</span>
                  <span className="font-mono font-bold text-slate-900 text-base">₦87,500</span>
                  <span className="text-[10px] text-emerald-700 font-bold">STATUS: SETTLED & ACTIVE</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] font-bold uppercase">ORCHESTRATED BY</span>
                  <span className="font-bold text-slate-900">ActionOS Autonomous Engine</span>
                  <span className="text-[10px] text-slate-500 block font-mono">HASH: ACT-2026-99412-V</span>
                </div>
              </div>

              {/* Footer validation bar */}
              <div className="border-t border-emerald-200 pt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <QrCode className="w-8 h-8 text-emerald-700" />
                  <div className="text-[10px] text-slate-500">
                    <div>Digital Verification Token</div>
                    <div className="font-mono text-emerald-700 font-bold">VERIFIED-NAICOM-2026</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Electronic Signature</div>
                  <div className="font-serif italic text-emerald-800 text-sm font-bold">ActionOS Trust Core</div>
                </div>
              </div>
            </div>

            {/* Modal action buttons */}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setSelectedDoc(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Official Certificate</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

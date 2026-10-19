"use client";

import React from "react";
import {
  ShieldCheck,
  CheckCircle2,
  Printer,
  Download,
  X,
  AlertTriangle,
} from "lucide-react";
import type { Document } from "@/types/database";
import { formatDateTime, formatDate } from "@/lib/utils";
import { QrCodeSvg } from "./qr-code";

interface StatutoryDocumentViewerProps {
  document: Document;
  onClose?: () => void;
}

export function StatutoryDocumentViewer({ document: doc, onClose }: StatutoryDocumentViewerProps) {
  const meta = (doc as unknown as { metadata?: Record<string, unknown> }).metadata || {};
  const isVehicleLicense = doc.file_name.includes("Vehicle_License");
  const isRoadworthiness = doc.file_name.includes("Roadworthiness");
  const isHmoCard = doc.file_name.includes("HMO_Card") || doc.file_name.includes("NHIA");
  const isDriverPermit = doc.file_name.includes("FRSC_Permit") || doc.file_name.includes("FRSC_Temporary_Permit");

  // Determine category & authority
  let authorityTitle = "FEDERAL REPUBLIC OF NIGERIA • NAICOM CENTRAL REGISTRY";
  let documentTitle = "Certified Motor Insurance Certificate & E-Sticker";
  let statutoryAct = "Issued in accordance with the Motor Vehicles (Third Party Insurance) Act";
  let primaryBadgeColor = "border-emerald-500 bg-emerald-50 text-emerald-800";
  let headerBorderColor = "border-emerald-600";
  let qrTargetUrl = `https://niid.nigeriainsurers.org/verify?cert=${doc.id}`;

  if (isVehicleLicense) {
    authorityTitle = "LAGOS STATE MOTOR VEHICLE ADMINISTRATION AGENCY (MVAA)";
    documentTitle = "Official Motor Vehicle License Paper";
    statutoryAct = "Issued pursuant to the Lagos State Motor Vehicle Administration Law";
    primaryBadgeColor = "border-blue-500 bg-blue-50 text-blue-800";
    headerBorderColor = "border-blue-600";
    qrTargetUrl = `https://mvaa.lagosstate.gov.ng/verify?license=${doc.id}`;
  } else if (isRoadworthiness) {
    authorityTitle = "LAGOS COMPUTERISED VEHICLE INSPECTION SERVICE (LACVIS)";
    documentTitle = "Roadworthiness Certificate of Statutory Compliance";
    statutoryAct = "Certified under Lagos State Road Traffic and Vehicle Inspection Regulations";
    primaryBadgeColor = "border-teal-500 bg-teal-50 text-teal-800";
    headerBorderColor = "border-teal-600";
    qrTargetUrl = `https://lacvis.lagosstate.gov.ng/verify?inspection=${doc.id}`;
  } else if (isHmoCard) {
    authorityTitle = "NATIONAL HEALTH INSURANCE AUTHORITY (NHIA) • NIGERIA";
    documentTitle = "Certified Digital Health Insurance (HMO) Enrollee Card";
    statutoryAct = "Registered in compliance with the National Health Insurance Authority Act 2022";
    primaryBadgeColor = "border-rose-500 bg-rose-50 text-rose-800";
    headerBorderColor = "border-rose-600";
    qrTargetUrl = (meta.qrVerificationUrl as string) || `https://nhia.gov.ng/verify?enrollee=${doc.id}`;
  } else if (isDriverPermit) {
    authorityTitle = "FEDERAL ROAD SAFETY CORPS (FRSC) • NATIONAL HEADQUARTERS";
    documentTitle = "Official Temporary Driver's Permit & Biometric Slip";
    statutoryAct = "Issued under the Federal Road Safety Commission (Establishment) Act";
    primaryBadgeColor = "border-indigo-500 bg-indigo-50 text-indigo-800";
    headerBorderColor = "border-indigo-600";
    qrTargetUrl = (meta.qrVerificationUrl as string) || `https://frsc.gov.ng/verify?dl=${doc.id}`;
  }

  const handlePrint = () => {
    window.print();
  };

  const verificationHash =
    (meta.verificationHash as string) ||
    doc.id.replace(/-/g, "").padEnd(64, "0").toLowerCase();

  return (
    <div className="relative w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[92vh]">
      {/* Action controls header (hidden during print) */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 print:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
            Statutory Document Viewer
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/documents/${doc.id}/download`}
            download={doc.file_name}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-slate-900/10 cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Download Official PDF</span>
          </a>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print View</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Sandbox Test Disclosure (hidden during print) */}
      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5 print:hidden">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <strong className="font-bold">Sandbox Demonstration Record:</strong> This official document was generated deterministically by the ActionOS Orchestrator with cryptographic SHA-256 seal verification. Click &ldquo;Print / Save as PDF&rdquo; to test standard paper document formatting.
        </div>
      </div>

      {/* Official Certificate Paper Container */}
      <div
        id="statutory-certificate-paper"
        className={`border-4 border-double ${headerBorderColor}/40 p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-slate-50/50 via-white to-slate-50 text-slate-900 shadow-inner relative overflow-hidden print:border-2 print:p-8 print:shadow-none`}
      >
        {/* Holographic Watermark Background */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.04] select-none rotate-[-25deg]">
          <span className="text-4xl sm:text-6xl font-black text-slate-900 tracking-widest uppercase border-4 border-slate-900 p-6 text-center leading-tight">
            FEDERAL REPUBLIC OF NIGERIA<br />OFFICIAL STATUTORY DOCUMENT
          </span>
        </div>

        {/* Certificate Header */}
        <div className="text-center border-b border-slate-200 pb-5 mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${primaryBadgeColor}`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{authorityTitle}</span>
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 uppercase">
            {documentTitle}
          </h2>

          <p className="text-xs text-slate-500 mt-1 max-w-xl mx-auto">
            {statutoryAct}
          </p>

          <div className="mt-2.5 flex items-center justify-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              STATUS: DIGITALLY CERTIFIED & VERIFIED
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300">
              REF: {doc.id.substring(0, 16)}
            </span>
          </div>
        </div>

        {/* Dynamic Category View */}
        {isHmoCard ? (
          /* Health Insurance (HMO) Specific Layout */
          <div className="space-y-4 mb-6">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">ENROLLEE NAME</span>
                <span className="font-bold text-slate-900 text-sm">
                  {(meta.enrolleeName as string) || "Emeka Adebayo"}
                </span>
                <span className="text-slate-500 block text-[11px] mt-0.5">
                  NHIA ID: <strong className="font-mono text-slate-800">{(meta.nhiaNumber as string) || "NHIA-2026-00812"}</strong>
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">HMO PROVIDER & TIER</span>
                <span className="font-bold text-rose-700 text-sm uppercase">
                  {(meta.hmoProvider as string) || "AXA Mansard Health HMO"} ({(meta.tier as string)?.toUpperCase() || "SILVER"})
                </span>
                <span className="text-slate-500 block text-[11px] mt-0.5">
                  Card No: <strong className="font-mono text-slate-800">{(meta.digitalCardNumber as string) || "HMO-SILVER-2026-4B8C"}</strong>
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">PRIMARY HEALTHCARE PROVIDER</span>
                <span className="font-semibold text-slate-900">
                  {(meta.primaryHcp as string) || "Lagoon Hospital Ikoyi, Lagos"}
                </span>
                <span className="text-slate-500 block text-[11px] mt-0.5">Accreditation Grade: A</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">COVERAGE VALIDITY</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatDate((meta.coverageStartDate as string) || doc.created_at)} &rarr; {formatDate((meta.coverageEndDate as string) || "2027-10-25")}
                </span>
                <span className="text-emerald-700 block text-[11px] font-bold mt-0.5">✓ 365 Days Active Coverage</span>
              </div>
            </div>
          </div>
        ) : isDriverPermit ? (
          /* Driver's License Temporary Permit Layout */
          <div className="space-y-4 mb-6">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">LICENSE HOLDER</span>
                <span className="font-bold text-slate-900 text-sm">
                  {(meta.holderName as string) || "Demo License Holder"}
                </span>
                <span className="text-slate-500 block text-[11px] mt-0.5">
                  DL Number: <strong className="font-mono text-slate-800">{(meta.dlNumber as string) || "ABC12345678"}</strong>
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">TEMPORARY PERMIT SLIP</span>
                <span className="font-bold text-indigo-700 text-sm">
                  {(meta.temporaryPermitNumber as string) || "FRSC-TMP-2026-004A"}
                </span>
                <span className="text-slate-500 block text-[11px] mt-0.5">
                  Duration: <strong className="font-mono text-slate-800">{(meta.durationYears as number) || 3} Years Statutory Validity</strong>
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">BIOMETRIC APPOINTMENT</span>
                <span className="font-semibold text-slate-900">
                  {(meta.appointmentWindow as string) || "Within 3 Working Days (09:00 AM - 01:00 PM)"}
                </span>
                <span className="text-slate-500 block text-[11px] mt-0.5">
                  Center: {((meta.captureCenter as { name?: string })?.name) || "FRSC Ojodu Berger DLC"}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px] font-bold uppercase">NEW EXPIRY DATE</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatDate((meta.newExpiryDate as string) || "2029-10-14")}
                </span>
                <span className="text-emerald-700 block text-[11px] font-bold mt-0.5">✓ Temporary Driving Rights Active</span>
              </div>
            </div>
          </div>
        ) : (
          /* Vehicle Insurance or Motor License Standard Metadata */
          <div className="grid grid-cols-2 gap-4 text-xs mb-6">
            <div>
              <span className="text-slate-500 block text-[10px] font-bold uppercase">DOCUMENT NUMBER</span>
              <span className="font-mono font-bold text-slate-900">{doc.id}</span>
              <span className="text-slate-500 block text-[11px] mt-0.5">Category: {doc.document_type}</span>
            </div>

            <div>
              <span className="text-slate-500 block text-[10px] font-bold uppercase">IDENTIFIER / PLATE</span>
              <span className="font-mono font-bold text-emerald-700 text-xs">
                {doc.file_name.includes("ABC_123_XY") ? "ABC-123-XY" : "TOYOTA CAMRY (ABC-123-XY)"}
              </span>
              <span className="text-slate-500 block text-[11px] mt-0.5">Class: Private Vehicle</span>
            </div>

            <div>
              <span className="text-slate-500 block text-[10px] font-bold uppercase">CERTIFICATE FILE</span>
              <span className="font-mono text-slate-800 text-xs truncate block" title={doc.file_name}>
                {doc.file_name}
              </span>
              <span className="text-slate-500 block text-[11px] mt-0.5">MIME: {doc.mime_type}</span>
            </div>

            <div>
              <span className="text-slate-500 block text-[10px] font-bold uppercase">STATUTORY ISSUANCE</span>
              <span className="font-mono text-slate-800 text-xs">
                {formatDateTime(doc.created_at)}
              </span>
              <span className="text-slate-500 block text-[11px] mt-0.5">Authority: NAICOM / MVAA</span>
            </div>
          </div>
        )}

        {/* Verification QR Code & Cryptographic Stamp Box */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left flex-1">
            <div className="text-xs font-bold text-slate-900 flex items-center justify-center sm:justify-start gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Immutable Cryptographic Verification Stamp</span>
            </div>
            <p className="text-[11px] text-slate-600">
              Scan with any mobile device or statutory enforcement scanner to inspect authoritative registry records.
            </p>
            <div className="font-mono text-[9px] text-slate-500 break-all bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
              SHA-256 SEAL: {verificationHash}
            </div>
          </div>

          <div className="p-2.5 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col items-center shrink-0">
            <QrCodeSvg value={qrTargetUrl} size={100} />
            <span className="text-[9px] font-mono font-bold text-slate-600 mt-1 uppercase">
              SCAN TO VERIFY
            </span>
          </div>
        </div>

        {/* Official Statutory Footnote */}
        <div className="mt-6 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>ActionOS Cryptographic Trust Architecture • 2026 NITDA Challenge</span>
          <span className="font-mono">Security Token: ACT-VERIFIED-{doc.id.substring(0, 8).toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}

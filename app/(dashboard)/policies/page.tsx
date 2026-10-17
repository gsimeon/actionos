"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Shield,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  Zap,
  HeartPulse,
  Car,
  FileBadge,
  Eye,
  Search,
  Layers,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { StatusBadge } from "@/components/actionos/status-badge";
import { formatDate, formatNaira } from "@/lib/utils";
import type { Policy, Document } from "@/types/database";
import { StatutoryDocumentViewer } from "@/components/actionos/statutory-document-viewer";

export const VERTICAL_TABS = [
  { id: "all", label: "All Portfolios" },
  { id: "motor", label: "Motor Insurance (NAICOM)", icon: Car },
  { id: "hmo", label: "Health HMO (NHIA)", icon: HeartPulse },
  { id: "driver_license", label: "Driver's License (FRSC)", icon: FileBadge },
  { id: "vehicle_license", label: "Vehicle License (MVAA)", icon: Shield },
];

export const STATUS_TABS = [
  { id: "all", label: "All Statuses" },
  { id: "expiring", label: "Expiring (Due Soon)" },
  { id: "active", label: "Active" },
  { id: "renewed", label: "Renewed" },
  { id: "expired", label: "Expired" },
];

export function getExpiryBadge(expiryDate: string, referenceDate?: Date | string) {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const diffTime = new Date(expiryDate).getTime() - ref.getTime();
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

export interface PortfolioRecord {
  id: string;
  vertical: "motor" | "hmo" | "driver_license" | "vehicle_license";
  identifier: string;
  regulatoryBody: "NAICOM" | "NHIA" | "FRSC" | "MVAA";
  providerName: string;
  policyholderName: string;
  customerNumber: string;
  nin?: string;
  title: string;
  subtitle: string;
  expiryDate: string;
  premium: number;
  status: "active" | "expiring" | "renewed" | "expired";
  actionUrl: string;
  documentData: Document;
}

const BENCHMARK_PORTFOLIOS: PortfolioRecord[] = [
  // Health HMO Portfolios
  {
    id: "pol_hmo_001",
    vertical: "hmo",
    identifier: "HMO-PLAT-2026-00812",
    regulatoryBody: "NHIA",
    providerName: "Hygeia HMO",
    policyholderName: "Demo Customer",
    customerNumber: "CUS-000001",
    nin: "DEMO-NIN-000001",
    title: "Platinum Comprehensive Health Cover",
    subtitle: "Lagoon Hospitals, VI • Enrollee ID: NHIA-00829104",
    expiryDate: "2026-10-24",
    premium: 145000,
    status: "expiring",
    actionUrl: "/actions?service=hmo&policy=HMO-PLAT-2026-00812",
    documentData: {
      id: "doc_stat_hmo_001",
      customer_id: "c0000000-0000-0000-0000-000000000001",
      renewal_id: "ren_hmo_001",
      document_type: "certificate",
      file_name: "ActionOS_NHIA_HMO_Card_00812.pdf",
      file_path: "/documents/health/ActionOS_NHIA_HMO_Card_00812.pdf",
      mime_type: "application/pdf",
      status: "generated",
      created_at: new Date().toISOString(),
      ...({
        metadata: {
          enrolleeName: "Demo Customer",
          enrolleeId: "NHIA-00829104",
          policyNumber: "HMO-PLAT-2026-00812",
          hmoProvider: "Hygeia HMO",
          tier: "platinum",
          primaryFacility: "Lagoon Hospitals, Victoria Island",
          expiryDate: "2027-10-24",
          sha256Hash: "8f7e2a1b9c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789ab",
        },
      } as unknown as Record<string, unknown>),
    },
  },
  {
    id: "pol_hmo_002",
    vertical: "hmo",
    identifier: "HMO-GOLD-2026-00391",
    regulatoryBody: "NHIA",
    providerName: "Reliance HMO",
    policyholderName: "Demo Customer Two",
    customerNumber: "CUS-000002",
    nin: "DEMO-NIN-000002",
    title: "Gold Family Medical Shield",
    subtitle: "Reddington Hospital, VI • Enrollee ID: NHIA-00918231",
    expiryDate: "2026-12-15",
    premium: 95000,
    status: "active",
    actionUrl: "/actions?service=hmo&policy=HMO-GOLD-2026-00391",
    documentData: {
      id: "doc_stat_hmo_002",
      customer_id: "c0000000-0000-0000-0000-000000000002",
      renewal_id: "ren_hmo_002",
      document_type: "certificate",
      file_name: "ActionOS_NHIA_HMO_Card_00391.pdf",
      file_path: "/documents/health/ActionOS_NHIA_HMO_Card_00391.pdf",
      mime_type: "application/pdf",
      status: "generated",
      created_at: new Date().toISOString(),
      ...({
        metadata: {
          enrolleeName: "Demo Customer Two",
          enrolleeId: "NHIA-00918231",
          policyNumber: "HMO-GOLD-2026-00391",
          hmoProvider: "Reliance HMO",
          tier: "gold",
          primaryFacility: "Reddington Hospital, Victoria Island",
          expiryDate: "2027-12-15",
          sha256Hash: "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b",
        },
      } as unknown as Record<string, unknown>),
    },
  },
  // FRSC Driver's License Portfolios
  {
    id: "pol_dl_001",
    vertical: "driver_license",
    identifier: "FRSC-LA-2024-009182",
    regulatoryBody: "FRSC",
    providerName: "Federal Road Safety Corps (FRSC)",
    policyholderName: "Demo Customer",
    customerNumber: "CUS-000001",
    nin: "DEMO-NIN-000001",
    title: "Class B Private Driver's License (5-Year)",
    subtitle: "FRSC Ojodu Sector Command • Lagos State",
    expiryDate: "2026-10-20",
    premium: 15000,
    status: "expiring",
    actionUrl: "/actions?service=driver_license&license=FRSC-LA-2024-009182",
    documentData: {
      id: "doc_stat_dl_001",
      customer_id: "c0000000-0000-0000-0000-000000000001",
      renewal_id: "ren_dl_001",
      document_type: "certificate",
      file_name: "ActionOS_FRSC_Temporary_Permit_009182.pdf",
      file_path: "/documents/licensing/ActionOS_FRSC_Temporary_Permit_009182.pdf",
      mime_type: "application/pdf",
      status: "generated",
      created_at: new Date().toISOString(),
      ...({
        metadata: {
          driverName: "Demo Customer",
          licenseNumber: "FRSC-LA-2024-009182",
          temporaryPermitNumber: "FRSC-TMP-2026-91823",
          licenseClass: "Class B (Private)",
          durationYears: 5,
          captureCenter: "FRSC Ojodu Sector Command, Lagos",
          appointmentDate: "Wednesday, 22 Oct 2026 (09:00 - 11:30 AM)",
          expiryDate: "2031-10-20",
          sha256Hash: "4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d",
        },
      } as unknown as Record<string, unknown>),
    },
  },
  {
    id: "pol_dl_002",
    vertical: "driver_license",
    identifier: "FRSC-ABJ-2023-004419",
    regulatoryBody: "FRSC",
    providerName: "Federal Road Safety Corps (FRSC)",
    policyholderName: "Demo Customer Three",
    customerNumber: "CUS-000003",
    nin: "DEMO-NIN-000003",
    title: "Class E Heavy Articulated Commercial License",
    subtitle: "FRSC Mabushi Command • FCT Abuja",
    expiryDate: "2027-04-10",
    premium: 10500,
    status: "active",
    actionUrl: "/actions?service=driver_license&license=FRSC-ABJ-2023-004419",
    documentData: {
      id: "doc_stat_dl_002",
      customer_id: "c0000000-0000-0000-0000-000000000003",
      renewal_id: "ren_dl_002",
      document_type: "certificate",
      file_name: "ActionOS_FRSC_Temporary_Permit_004419.pdf",
      file_path: "/documents/licensing/ActionOS_FRSC_Temporary_Permit_004419.pdf",
      mime_type: "application/pdf",
      status: "generated",
      created_at: new Date().toISOString(),
      ...({
        metadata: {
          driverName: "Demo Customer Three",
          licenseNumber: "FRSC-ABJ-2023-004419",
          temporaryPermitNumber: "FRSC-TMP-2026-44190",
          licenseClass: "Class E (Articulated Commercial)",
          durationYears: 3,
          captureCenter: "FRSC Mabushi Sector Command, Abuja",
          expiryDate: "2030-04-10",
          sha256Hash: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        },
      } as unknown as Record<string, unknown>),
    },
  },
  // MVAA Vehicle License Portfolios
  {
    id: "pol_mvaa_001",
    vertical: "vehicle_license",
    identifier: "MVAA-LIC-2026-00182",
    regulatoryBody: "MVAA",
    providerName: "Lagos State MVAA & LACVIS",
    policyholderName: "Demo Customer",
    customerNumber: "CUS-000001",
    nin: "DEMO-NIN-000001",
    title: "Annual Road Vehicle License & LACVIS Test",
    subtitle: "Toyota Camry • ABC-123-XY (Lagos State)",
    expiryDate: "2026-10-14",
    premium: 25000,
    status: "expiring",
    actionUrl: "/actions?service=vehicle_license&plate=ABC-123-XY",
    documentData: {
      id: "doc_stat_mvaa_001",
      customer_id: "c0000000-0000-0000-0000-000000000001",
      renewal_id: "ren_mvaa_001",
      document_type: "certificate",
      file_name: "ActionOS_Vehicle_License_ABC-123-XY.pdf",
      file_path: "/documents/vehicles/ActionOS_Vehicle_License_ABC-123-XY.pdf",
      mime_type: "application/pdf",
      status: "generated",
      created_at: new Date().toISOString(),
      ...({
        metadata: {
          plateNumber: "ABC-123-XY",
          vehicleMake: "Toyota Camry",
          mvaaLicenseNumber: "MVAA-LIC-2026-00182",
          roadworthinessNumber: "LACVIS-RW-2026-00182",
          issuingAuthority: "Lagos State MVAA",
          expiryDate: "2027-10-14",
          sha256Hash: "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
        },
      } as unknown as Record<string, unknown>),
    },
  },
];

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [activeVertical, setActiveVertical] = useState("all");
  const [activeStatus, setActiveStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  const fetchPolicies = () => {
    setLoading(true);
    fetch(`/api/policies?status=${activeStatus}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setPolicies(res.data);
        }
      })
      .catch((err) => console.error("Failed to fetch policies:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPolicies();
  }, [activeStatus]);

  // Convert motor policies from API to PortfolioRecords
  const motorPortfolioRecords = useMemo<PortfolioRecord[]>(() => {
    return policies.map((p) => {
      const vehicleName = p.asset?.name || (p.metadata?.vehicle_name as string) || "Toyota Camry";
      const vehicleReg = p.asset?.identifier || (p.metadata?.vehicle_reg as string) || "ABC-123-XY";
      const providerName = (p.metadata?.provider_name as string) || "Leadway Assurance Co.";

      return {
        id: p.id,
        vertical: "motor",
        identifier: p.policy_number,
        regulatoryBody: "NAICOM",
        providerName,
        policyholderName: p.customer?.full_name || "Demo Customer",
        customerNumber: p.customer?.customer_number || "CUS-000001",
        nin: (p.customer?.metadata?.nin as string) || "DEMO-NIN-000001",
        title: (p.metadata?.policy_type_name as string) || "Comprehensive Motor Insurance",
        subtitle: `${vehicleName} • ${vehicleReg}`,
        expiryDate: p.expiry_date,
        premium: p.premium,
        status: (p.status as "active" | "expiring" | "renewed" | "expired") || "active",
        actionUrl: `/actions?policy=${p.policy_number}`,
        documentData: {
          id: `doc_cert_${p.policy_number}`,
          customer_id: p.customer_id,
          renewal_id: `ren_${p.id}`,
          document_type: "certificate",
          file_name: `NAICOM_Certificate_${p.policy_number}.pdf`,
          file_path: `/documents/insurance/NAICOM_Certificate_${p.policy_number}.pdf`,
          mime_type: "application/pdf",
          status: "generated",
          created_at: p.created_at,
          ...({
            metadata: {
              policyNumber: p.policy_number,
              certificateNumber: `NAICOM-CERT-${p.policy_number}`,
              insuredName: p.customer?.full_name || "Demo Customer",
              vehicleName,
              vehicleReg,
              providerName,
              expiryDate: p.expiry_date,
              sha256Hash: "7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
            },
          } as unknown as Record<string, unknown>),
        },
      };
    });
  }, [policies]);

  // Combined portfolios across all verticals
  const allPortfolios = useMemo<PortfolioRecord[]>(() => {
    return [...motorPortfolioRecords, ...BENCHMARK_PORTFOLIOS];
  }, [motorPortfolioRecords]);

  // Filtered list
  const filtered = useMemo(() => {
    return allPortfolios.filter((item) => {
      // Vertical filter
      if (activeVertical !== "all" && item.vertical !== activeVertical) return false;

      // Status filter
      if (activeStatus !== "all" && item.status !== activeStatus) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const idMatch = item.identifier.toLowerCase().includes(q);
        const nameMatch = item.policyholderName.toLowerCase().includes(q);
        const provMatch = item.providerName.toLowerCase().includes(q);
        const titleMatch = item.title.toLowerCase().includes(q);
        const subMatch = item.subtitle.toLowerCase().includes(q);
        const regMatch = item.regulatoryBody.toLowerCase().includes(q);
        if (!idMatch && !nameMatch && !provMatch && !titleMatch && !subMatch && !regMatch) {
          return false;
        }
      }

      return true;
    });
  }, [allPortfolios, activeVertical, activeStatus, searchQuery]);

  // Metric aggregates
  const metrics = useMemo(() => {
    let totalPremium = 0;
    let expiringCount = 0;
    let activeCount = 0;

    for (const item of allPortfolios) {
      totalPremium += item.premium;
      if (item.status === "expiring") expiringCount++;
      if (item.status === "active") activeCount++;
    }

    return {
      totalCount: allPortfolios.length,
      expiringCount,
      activeCount,
      totalPremium,
    };
  }, [allPortfolios]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Statutory Portfolio & Policy Ledger
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800 border border-emerald-200">
              4 VERTICALS ACTIVE
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
            Proactive tracking and 1-click renewal across Motor (NAICOM), Health HMO (NHIA), Driver's License (FRSC), and Vehicle License (MVAA).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchPolicies}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
            title="Refresh policies"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/actions"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Renew via Voice/AI</span>
          </Link>
        </div>
      </div>

      {/* Aggregate Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Portfolios
            </span>
            <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-slate-900 font-mono">
            {metrics.totalCount} <span className="text-xs font-normal text-slate-500">records</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Across 4 Nigerian regulatory frameworks
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Expiring (Urgent)
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-amber-800 font-mono">
            {metrics.expiringCount} <span className="text-xs font-normal text-amber-600">due soon</span>
          </div>
          <div className="mt-1 text-[11px] text-amber-700 font-medium">
            Automated reminders active via WhatsApp
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Active / Protected
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-emerald-700 font-mono">
            {metrics.activeCount} <span className="text-xs font-normal text-emerald-600">covered</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 font-medium">
            100% statutory compliance recorded
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Annual Premium Value
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-xl font-black text-slate-900 font-mono">
            {formatNaira(metrics.totalPremium)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            Total managed insurance &amp; statutory fees
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="space-y-3">
        {/* Vertical Switcher */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {VERTICAL_TABS.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeVertical === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveVertical(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Status Tabs and Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveStatus(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeStatus === tab.id
                    ? "bg-emerald-600 text-white shadow-xs"
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
              placeholder="Search policy, plate, hospital, FRSC..."
              className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Policies Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3.5">Policy / License</th>
                <th className="px-5 py-3.5">Regulatory Authority</th>
                <th className="px-5 py-3.5">Policyholder / Enrollee</th>
                <th className="px-5 py-3.5">Asset / Hospital / Class</th>
                <th className="px-5 py-3.5">Expiry Date</th>
                <th className="px-5 py-3.5">Premium / Fee</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Loading statutory policy ledgers...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    <p className="text-sm font-semibold text-slate-700">No records found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchQuery ? "Try refining your search terms" : "No policies match the selected vertical filter"}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {item.vertical === "motor" && <Car className="w-4 h-4 text-emerald-600 shrink-0" />}
                          {item.vertical === "hmo" && <HeartPulse className="w-4 h-4 text-blue-600 shrink-0" />}
                          {item.vertical === "driver_license" && <FileBadge className="w-4 h-4 text-indigo-600 shrink-0" />}
                          {item.vertical === "vehicle_license" && <Shield className="w-4 h-4 text-amber-600 shrink-0" />}
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            {item.identifier}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 block ml-6 mt-0.5">
                          {item.providerName}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        {item.regulatoryBody === "NAICOM" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            NAICOM Verified
                          </span>
                        )}
                        {item.regulatoryBody === "NHIA" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            NHIA Accredited
                          </span>
                        )}
                        {item.regulatoryBody === "FRSC" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            FRSC Statutory
                          </span>
                        )}
                        {item.regulatoryBody === "MVAA" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            MVAA / LACVIS
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">
                          {item.policyholderName}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                          <span>{item.customerNumber}</span>
                          {item.nin && <span>• {item.nin}</span>}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-slate-800 font-semibold truncate max-w-[220px]" title={item.title}>
                          {item.title}
                        </div>
                        <span className="text-[10px] text-slate-500 block truncate max-w-[220px]" title={item.subtitle}>
                          {item.subtitle}
                        </span>
                      </td>

                      <td className="px-5 py-4 space-y-1">
                        <div className="font-semibold text-slate-700">
                          {formatDate(item.expiryDate)}
                        </div>
                        {getExpiryBadge(item.expiryDate)}
                      </td>

                      <td className="px-5 py-4 font-mono font-bold text-slate-900">
                        {formatNaira(item.premium)}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={item.status} size="sm" />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDoc(item.documentData)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                            title="Preview Statutory Certificate with Vector QR"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <Link
                            href={item.actionUrl}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-xs font-semibold transition-all inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>Renew</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Embedded Statutory Document Viewer Modal */}
      {selectedDoc && (
        <StatutoryDocumentViewer
          document={selectedDoc}
          onClose={() => setSelectedDoc(null)}
        />
      )}
    </div>
  );
}

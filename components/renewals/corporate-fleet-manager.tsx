"use client";

import React, { useState } from "react";
import {
  Car,
  CheckCircle2,
  AlertTriangle,
  Download,
  RefreshCw,
  Building2,
  Lock,
  Check,
} from "lucide-react";
import { formatNaira } from "@/lib/utils";

export interface FleetVehicle {
  id: string;
  plateNumber: string;
  chassisNumber: string;
  makeModel: string;
  vehicleType: "commercial_bus" | "haulage_truck" | "delivery_van" | "sedan";
  driverName: string;
  driverPhone: string;
  expiryDate: string;
  daysUntilExpiry: number;
  frscStatus: "cleared" | "fine_unpaid";
  frscFineAmount?: number;
  frscTicketNumber?: string;
  lacvisStatus: "passed" | "failed";
  lacvisBrakeEfficiency: number; // percentage
  lacvisEmissions: "pass" | "fail";
  niidStatus: "cleared" | "flagged";
  mvaaFee: number;
  niidFee: number;
  lasdriFee: number;
  selected: boolean;
  renewalStatus: "pending" | "clearing" | "authorized" | "completed";
  certNumber?: string;
}

const GIG_FLEET_SAMPLE: FleetVehicle[] = [
  {
    id: "flt-001",
    plateNumber: "LND-452-AA",
    chassisNumber: "JT2BF22K9W0182741",
    makeModel: "Toyota HiAce 2.7L Commuter",
    vehicleType: "commercial_bus",
    driverName: "Ibrahim Musa",
    driverPhone: "+234 803 111 2233",
    expiryDate: new Date(Date.now() + 5 * 86400000).toISOString(),
    daysUntilExpiry: 5,
    frscStatus: "cleared",
    lacvisStatus: "passed",
    lacvisBrakeEfficiency: 86,
    lacvisEmissions: "pass",
    niidStatus: "cleared",
    mvaaFee: 8500,
    niidFee: 15000,
    lasdriFee: 2500,
    selected: true,
    renewalStatus: "pending",
  },
  {
    id: "flt-002",
    plateNumber: "KJA-891-BT",
    chassisNumber: "JT2BF22K9W0199182",
    makeModel: "Toyota HiAce High Roof",
    vehicleType: "commercial_bus",
    driverName: "Emeka Okafor",
    driverPhone: "+234 802 333 4455",
    expiryDate: new Date(Date.now() + 6 * 86400000).toISOString(),
    daysUntilExpiry: 6,
    frscStatus: "fine_unpaid",
    frscFineAmount: 10000,
    frscTicketNumber: "FRSC-LAG-2026-9012",
    lacvisStatus: "passed",
    lacvisBrakeEfficiency: 82,
    lacvisEmissions: "pass",
    niidStatus: "cleared",
    mvaaFee: 8500,
    niidFee: 15000,
    lasdriFee: 2500,
    selected: false,
    renewalStatus: "pending",
  },
  {
    id: "flt-003",
    plateNumber: "APP-512-XY",
    chassisNumber: "WDB9066331S109823",
    makeModel: "Mercedes-Benz Sprinter 314",
    vehicleType: "delivery_van",
    driverName: "Babatunde Lawal",
    driverPhone: "+234 809 777 8899",
    expiryDate: new Date(Date.now() + 9 * 86400000).toISOString(),
    daysUntilExpiry: 9,
    frscStatus: "cleared",
    lacvisStatus: "failed",
    lacvisBrakeEfficiency: 38,
    lacvisEmissions: "pass",
    niidStatus: "cleared",
    mvaaFee: 9500,
    niidFee: 15000,
    lasdriFee: 2500,
    selected: false,
    renewalStatus: "pending",
  },
  {
    id: "flt-004",
    plateNumber: "FKJ-334-LK",
    chassisNumber: "JT2BF22K9W0204912",
    makeModel: "Toyota HiAce 2.7L Commuter",
    vehicleType: "commercial_bus",
    driverName: "Chinedu Eze",
    driverPhone: "+234 813 555 6677",
    expiryDate: new Date(Date.now() + 11 * 86400000).toISOString(),
    daysUntilExpiry: 11,
    frscStatus: "cleared",
    lacvisStatus: "passed",
    lacvisBrakeEfficiency: 88,
    lacvisEmissions: "pass",
    niidStatus: "cleared",
    mvaaFee: 8500,
    niidFee: 15000,
    lasdriFee: 2500,
    selected: true,
    renewalStatus: "pending",
  },
  {
    id: "flt-005",
    plateNumber: "EKY-782-BC",
    chassisNumber: "VF73A4HAA12903812",
    makeModel: "Peugeot Boxer Cargo Van",
    vehicleType: "delivery_van",
    driverName: "Aliyu Garba",
    driverPhone: "+234 805 222 1100",
    expiryDate: new Date(Date.now() + 14 * 86400000).toISOString(),
    daysUntilExpiry: 14,
    frscStatus: "cleared",
    lacvisStatus: "passed",
    lacvisBrakeEfficiency: 81,
    lacvisEmissions: "pass",
    niidStatus: "cleared",
    mvaaFee: 9500,
    niidFee: 15000,
    lasdriFee: 2500,
    selected: true,
    renewalStatus: "pending",
  },
  {
    id: "flt-006",
    plateNumber: "GGE-119-AZ",
    chassisNumber: "JT2BF22K9W0221948",
    makeModel: "Toyota HiAce 2.7L Commuter",
    vehicleType: "commercial_bus",
    driverName: "Segun Obafemi",
    driverPhone: "+234 818 999 0011",
    expiryDate: new Date(Date.now() + 18 * 86400000).toISOString(),
    daysUntilExpiry: 18,
    frscStatus: "cleared",
    lacvisStatus: "passed",
    lacvisBrakeEfficiency: 84,
    lacvisEmissions: "pass",
    niidStatus: "cleared",
    mvaaFee: 8500,
    niidFee: 15000,
    lasdriFee: 2500,
    selected: true,
    renewalStatus: "pending",
  },
  {
    id: "flt-007",
    plateNumber: "KTU-902-DX",
    chassisNumber: "JT2BF22K9W0230192",
    makeModel: "Toyota Coaster 30-Seater",
    vehicleType: "commercial_bus",
    driverName: "Danjuma Yakubu",
    driverPhone: "+234 803 777 6655",
    expiryDate: new Date(Date.now() + 21 * 86400000).toISOString(),
    daysUntilExpiry: 21,
    frscStatus: "cleared",
    lacvisStatus: "passed",
    lacvisBrakeEfficiency: 79,
    lacvisEmissions: "pass",
    niidStatus: "cleared",
    mvaaFee: 14500,
    niidFee: 20000,
    lasdriFee: 2500,
    selected: true,
    renewalStatus: "pending",
  },
  {
    id: "flt-008",
    plateNumber: "MUS-441-QA",
    chassisNumber: "WDB9066331S110948",
    makeModel: "Mercedes-Benz Sprinter 314",
    vehicleType: "delivery_van",
    driverName: "Femi Adeyemi",
    driverPhone: "+234 802 888 7766",
    expiryDate: new Date(Date.now() + 25 * 86400000).toISOString(),
    daysUntilExpiry: 25,
    frscStatus: "cleared",
    lacvisStatus: "passed",
    lacvisBrakeEfficiency: 85,
    lacvisEmissions: "pass",
    niidStatus: "cleared",
    mvaaFee: 9500,
    niidFee: 15000,
    lasdriFee: 2500,
    selected: true,
    renewalStatus: "pending",
  },
];

export function CorporateFleetManager() {
  const [fleetName] = useState("GIG Mobility Inter-State Fleet");
  const [vehicles, setVehicles] = useState<FleetVehicle[]>(GIG_FLEET_SAMPLE);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [batchSettled, setBatchSettled] = useState(false);
  const [batchManifestId, setBatchManifestId] = useState<string | null>(null);

  // Compute Metrics
  const totalVehicles = vehicles.length;
  const clearedCount = vehicles.filter(
    (v) => v.frscStatus === "cleared" && v.lacvisStatus === "passed" && v.niidStatus === "cleared"
  ).length;
  const redFlagCount = totalVehicles - clearedCount;

  const selectedVehicles = vehicles.filter((v) => v.selected);
  const selectedTotalCost = selectedVehicles.reduce(
    (sum, v) => sum + v.mvaaFee + v.niidFee + v.lasdriFee,
    0
  );

  const toggleSelectVehicle = (id: string) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, selected: !v.selected } : v))
    );
  };

  const selectAllCleared = () => {
    setVehicles((prev) =>
      prev.map((v) => {
        const isEligible =
          v.frscStatus === "cleared" && v.lacvisStatus === "passed" && v.niidStatus === "cleared";
        return { ...v, selected: isEligible };
      })
    );
  };

  const runParallelPreflight = () => {
    setIsPreflighting(true);
    setTimeout(() => {
      setIsPreflighting(false);
    }, 1200);
  };

  const executeBatchRenewal = () => {
    setIsAuthorizing(true);
    setTimeout(() => {
      setIsAuthorizing(false);
      setBatchSettled(true);
      const manifestId = `ACT-CORP-MNF-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      setBatchManifestId(manifestId);
      setVehicles((prev) =>
        prev.map((v) => {
          if (v.selected) {
            return {
              ...v,
              renewalStatus: "completed",
              certNumber: `MVAA-CORP-${v.plateNumber.replace(/-/g, "")}`,
              daysUntilExpiry: 365,
            };
          }
          return v;
        })
      );
    }, 1500);
  };

  const downloadManifestPdf = () => {
    // Generate text/csv manifest for download
    const rows = [
      ["Plate", "Model", "Driver", "FRSC Status", "LACVIS Brakes", "Cert ID", "Merkle Proof"],
      ...vehicles.map((v) => [
        v.plateNumber,
        v.makeModel,
        v.driverName,
        v.frscStatus,
        `${v.lacvisBrakeEfficiency}%`,
        v.certNumber || "PENDING",
        "0x7c9a2e...VALID",
      ]),
    ];
    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ActionOS_Fleet_Manifest_${fleetName.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & KPIs */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400 uppercase tracking-widest mb-1.5">
              <Building2 className="w-4 h-4" />
              <span>Enterprise Fleet Statutory Clearinghouse</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {fleetName}
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Automated parallel pre-flight statutory clearance across MVAA, FRSC, LACVIS, and NIID for commercial fleets. One consolidated invoice, zero duplicate fines, instant Merkle compliance badges.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={runParallelPreflight}
              disabled={isPreflighting}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPreflighting ? "animate-spin" : ""}`} />
              <span>{isPreflighting ? "Pinging Agencies..." : "Run Parallel Pre-Flight"}</span>
            </button>

            <button
              onClick={downloadManifestPdf}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Manifest (.CSV)</span>
            </button>
          </div>
        </div>

        {/* Fleet KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-slate-700/60">
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Total Fleet Units
            </span>
            <div className="text-2xl font-black font-mono text-white">{totalVehicles}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Commercial transport assets</div>
          </div>

          <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-2xl p-4">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
              Pre-Flight Cleared
            </span>
            <div className="text-2xl font-black font-mono text-emerald-300">{clearedCount}</div>
            <div className="text-[10px] text-emerald-400/80 mt-0.5">0 Fines &bull; 100% Brake Pass</div>
          </div>

          <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-4">
            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block mb-1">
              Statutory Red Flags
            </span>
            <div className="text-2xl font-black font-mono text-rose-300">{redFlagCount}</div>
            <div className="text-[10px] text-rose-400/80 mt-0.5">Requires maintenance/fine fix</div>
          </div>

          <div className="bg-amber-950/40 border border-amber-800/60 rounded-2xl p-4">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
              Selected Batch Total
            </span>
            <div className="text-2xl font-black font-mono text-amber-300">
              {formatNaira(selectedTotalCost)}
            </div>
            <div className="text-[10px] text-amber-400/80 mt-0.5">
              {selectedVehicles.length} of {totalVehicles} units selected
            </div>
          </div>
        </div>
      </div>

      {/* Batch Completion Notice */}
      {batchSettled && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-center justify-between text-xs text-emerald-950 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <span className="font-extrabold text-sm text-emerald-900 block">
                Batch Renewal Settlement Completed &bull; Manifest ID: {batchManifestId}
              </span>
              <span>
                {selectedVehicles.length} vehicles cleared and registered on NAICOM / MVAA / FRSC registries. Windshield digital badges dispatched to driver SMS.
              </span>
            </div>
          </div>
          <button
            onClick={downloadManifestPdf}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center gap-1 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download E-Badges
          </button>
        </div>
      )}

      {/* 2. Batch Execution Control Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={selectAllCleared}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-slate-200 transition-colors cursor-pointer"
          >
            Select All Cleared ({clearedCount})
          </button>
          <button
            onClick={() => setVehicles((prev) => prev.map((v) => ({ ...v, selected: false })))}
            className="px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            Clear Selection
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] text-slate-500 font-medium block">Consolidated Batch Amount:</span>
            <span className="text-lg font-black font-mono text-emerald-700">
              {formatNaira(selectedTotalCost)}
            </span>
          </div>

          <button
            onClick={executeBatchRenewal}
            disabled={isAuthorizing || selectedVehicles.length === 0}
            className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-md flex items-center gap-2 transition-all cursor-pointer ${
              selectedVehicles.length === 0
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 active:translate-y-0.5"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>
              {isAuthorizing
                ? "Settling NIBSS NIP Batch..."
                : `Authorize Batch Renewal (${selectedVehicles.length} Units)`}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Fleet Vehicle Table */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Car className="w-4 h-4 text-emerald-600" />
            <span>Commercial Fleet Roster & Pre-Flight Diagnostic Grid</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            Automated Statutory Ingestion Protocol
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4 w-10">Select</th>
                <th className="py-3 px-4">Vehicle & Plate</th>
                <th className="py-3 px-4">Driver Assigned</th>
                <th className="py-3 px-4">Expiry</th>
                <th className="py-3 px-4">FRSC Violations</th>
                <th className="py-3 px-4">LACVIS Inspection</th>
                <th className="py-3 px-4">NIID Cover</th>
                <th className="py-3 px-4 text-right">Statutory Fee</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vehicles.map((v) => {
                const hasRedFlag =
                  v.frscStatus !== "cleared" || v.lacvisStatus !== "passed" || v.niidStatus !== "cleared";

                return (
                  <tr
                    key={v.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      v.selected ? "bg-emerald-50/20" : hasRedFlag ? "bg-rose-50/20" : ""
                    }`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={v.selected}
                        onChange={() => toggleSelectVehicle(v.id)}
                        disabled={hasRedFlag && v.renewalStatus !== "completed"}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40"
                      />
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 font-mono text-xs flex items-center gap-1.5">
                        <span>{v.plateNumber}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-sans font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          {v.vehicleType.replace("_", " ")}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{v.makeModel}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{v.driverName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{v.driverPhone}</div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold ${
                          v.daysUntilExpiry <= 7
                            ? "text-rose-700 font-bold"
                            : v.daysUntilExpiry <= 14
                            ? "text-amber-700"
                            : "text-slate-700"
                        }`}
                      >
                        {v.daysUntilExpiry} days
                      </span>
                    </td>

                    {/* FRSC Check */}
                    <td className="py-3 px-4">
                      {v.frscStatus === "cleared" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          <Check className="w-2.5 h-2.5" />
                          0 Fines
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md"
                          title={v.frscTicketNumber}
                        >
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Unpaid Fine: {formatNaira(v.frscFineAmount || 10000)}
                        </span>
                      )}
                    </td>

                    {/* LACVIS Roadworthiness Check */}
                    <td className="py-3 px-4">
                      {v.lacvisStatus === "passed" ? (
                        <div className="text-[10px] font-medium text-emerald-800">
                          <span className="font-bold">PASSED</span> ({v.lacvisBrakeEfficiency}% brakes)
                        </div>
                      ) : (
                        <div className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                          <span>FAILED: Brakes {v.lacvisBrakeEfficiency}% (&lt;50%)</span>
                        </div>
                      )}
                    </td>

                    {/* NIID Status */}
                    <td className="py-3 px-4">
                      {v.niidStatus === "cleared" ? (
                        <span className="text-[10px] font-semibold text-emerald-700">Clear</span>
                      ) : (
                        <span className="text-[10px] font-bold text-rose-700">Chassis Duplicate</span>
                      )}
                    </td>

                    {/* Total Statutory Cost */}
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatNaira(v.mvaaFee + v.niidFee + v.lasdriFee)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      {v.renewalStatus === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          Renewed
                        </span>
                      ) : hasRedFlag ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300 px-2 py-0.5 rounded-full">
                          Action Required
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                          Pre-Cleared
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

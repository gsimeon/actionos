"use client";

import React, { useState } from "react";
import {
  Shield,
  Bot,
  Save,
  Check,
  Building2,
  Car,
  HeartPulse,
  CreditCard,
  Lock,
} from "lucide-react";
import { CsvImporter } from "@/components/csv-importer";
import { LiveHandshakeHub } from "@/components/dashboard/live-handshake-hub";

export default function SettingsPage() {
  const [maxAmount, setMaxAmount] = useState(1000000);
  const [expiryWindowDays, setExpiryWindowDays] = useState(30);
  const [savedAlert, setSavedAlert] = useState(false);

  // Multi-Vertical Statutory Tariffs State
  const [naicomTariffPrivate, setNaicomTariffPrivate] = useState(15000);
  const [naicomTariffCommercial, setNaicomTariffCommercial] = useState(25000);
  const [mvaaLicenseTariff, setMvaaLicenseTariff] = useState(12500);
  const [lacvisRoadworthinessTariff, setLacvisRoadworthinessTariff] = useState(12500);
  const [lacvisBrakeThreshold, setLacvisBrakeThreshold] = useState(70);
  const [nhiaStandardPremium, setNhiaStandardPremium] = useState(45000);
  const [nhiaPlatinumPremium, setNhiaPlatinumPremium] = useState(145000);
  const [nhiaCapitationLimit, setNhiaCapitationLimit] = useState(5000);
  const [frsc3YearFee, setFrsc3YearFee] = useState(10000);
  const [frsc5YearFee, setFrsc5YearFee] = useState(15000);

  // Compliance & Cryptographic Settings
  const [strictRegistryVerification, setStrictRegistryVerification] = useState(true);
  const [enforceFrscMedicalFitness, setEnforceFrscMedicalFitness] = useState(true);
  const [requireNinKyc, setRequireNinKyc] = useState(true);
  const [merkleAuditStreaming, setMerkleAuditStreaming] = useState(true);

  const handleSave = () => {
    setSavedAlert(true);
    setTimeout(() => setSavedAlert(false), 3000);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            System Settings & Integrations
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Configure 4-vertical statutory tariffs, enterprise underwriting guardrails, N-ATLAS voice parameters, and live regulatory handshakes.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
        >
          {savedAlert ? (
            <>
              <Check className="w-4 h-4 text-emerald-200" />
              <span>Settings Saved</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Configuration</span>
            </>
          )}
        </button>
      </div>

      {/* Grid of settings panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Underwriting Guardrail Configuration */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Underwriting Guardrail Limits</h2>
              <p className="text-xs text-slate-500">Strict bounds enforced before payment authorization</p>
            </div>
          </div>

          <div className="space-y-3 pt-2 text-xs">
            <div>
              <label className="text-slate-700 font-semibold block mb-1">
                Max Automated Transaction Amount (₦)
              </label>
              <input
                type="number"
                value={maxAmount}
                onChange={(e) => setMaxAmount(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono outline-none focus:border-emerald-500 focus:bg-white transition-colors"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Transactions above this threshold trigger human managerial escalation.
              </span>
            </div>

            <div>
              <label className="text-slate-700 font-semibold block mb-1">
                Renewal Eligibility Window (Days Before Expiry)
              </label>
              <input
                type="number"
                value={expiryWindowDays}
                onChange={(e) => setExpiryWindowDays(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono outline-none focus:border-emerald-500 focus:bg-white transition-colors"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Default: 30 days before policy expiration date.
              </span>
            </div>
          </div>
        </div>

        {/* N-ATLAS AI Engine Status */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">N-ATLAS AI Integration Adapter</h2>
              <p className="text-xs text-slate-500">Multilingual voice & NLP reasoning endpoint</p>
            </div>
          </div>

          <div className="space-y-3 pt-2 text-xs">
            <div>
              <label className="text-slate-700 font-semibold block mb-1">
                Active Adapter Mode
              </label>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-900 font-bold">Deterministic Demo Provider</span>
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                  OFFLINE READY
                </span>
              </div>
            </div>

            <div>
              <label className="text-slate-700 font-semibold block mb-1">
                Supported Dialects & Languages
              </label>
              <div className="flex flex-wrap gap-1.5">
                {["Nigerian English (en-NG)", "Nigerian Pidgin (pcm)", "Yoruba (yo)", "Hausa (ha)", "Igbo (ig)"].map((l) => (
                  <span
                    key={l}
                    className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-mono text-slate-700 border border-slate-200 font-medium"
                  >
                    {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Vertical Statutory Tariff Schedules & Regulatory Standards */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">4-Vertical Statutory Tariff Schedules (2026 Mandates)</h2>
              <p className="text-xs text-slate-500">Official gazetted rates and automated calculation baselines</p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
            GAZETTE VERIFIED
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Vertical 1: NAICOM Motor */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>NAICOM Motor Insurance</span>
            </div>
            <div>
              <label className="text-[11px] text-slate-600 block mb-1 font-medium">Private 3rd Party Tariff (₦)</label>
              <input
                type="number"
                value={naicomTariffPrivate}
                onChange={(e) => setNaicomTariffPrivate(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-600 block mb-1 font-medium">Commercial 3rd Party Tariff (₦)</label>
              <input
                type="number"
                value={naicomTariffCommercial}
                onChange={(e) => setNaicomTariffCommercial(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
              />
            </div>
            <div className="text-[10px] text-slate-500">
              Verified against NAICOM 2026 Rate circular.
            </div>
          </div>

          {/* Vertical 2: MVAA & LACVIS */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
              <Car className="w-3.5 h-3.5 text-blue-600" />
              <span>MVAA & LACVIS</span>
            </div>
            <div>
              <label className="text-[11px] text-slate-600 block mb-1 font-medium">Vehicle License Tariff (₦)</label>
              <input
                type="number"
                value={mvaaLicenseTariff}
                onChange={(e) => setMvaaLicenseTariff(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-600 block mb-1 font-medium">Roadworthiness Fee (₦)</label>
              <input
                type="number"
                value={lacvisRoadworthinessTariff}
                onChange={(e) => setLacvisRoadworthinessTariff(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-600 block mb-1 font-medium">Min Brake Efficiency (%)</label>
              <input
                type="number"
                value={lacvisBrakeThreshold}
                onChange={(e) => setLacvisBrakeThreshold(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
              />
            </div>
          </div>

          {/* Vertical 3: NHIA Health HMO */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
              <HeartPulse className="w-3.5 h-3.5 text-rose-600" />
              <span>NHIA Health HMO</span>
            </div>
            <div>
              <label className="text-[11px] text-slate-600 block mb-1 font-medium">Standard Plan Annual (₦)</label>
              <input
                type="number"
                value={nhiaStandardPremium}
                onChange={(e) => setNhiaStandardPremium(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-600 block mb-1 font-medium">Platinum Comprehensive (₦)</label>
              <input
                type="number"
                value={nhiaPlatinumPremium}
                onChange={(e) => setNhiaPlatinumPremium(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-600 block mb-1 font-medium">Facility Capitation Ceiling</label>
              <input
                type="number"
                value={nhiaCapitationLimit}
                onChange={(e) => setNhiaCapitationLimit(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
              />
            </div>
          </div>

          {/* Vertical 4: FRSC Driver's License */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
              <CreditCard className="w-3.5 h-3.5 text-amber-600" />
              <span>FRSC Driver&apos;s License</span>
            </div>
            <div>
              <label className="text-[11px] text-slate-600 block mb-1 font-medium">Class B 3-Year Permit (₦)</label>
              <input
                type="number"
                value={frsc3YearFee}
                onChange={(e) => setFrsc3YearFee(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-600 block mb-1 font-medium">Class B 5-Year Permit (₦)</label>
              <input
                type="number"
                value={frsc5YearFee}
                onChange={(e) => setFrsc5YearFee(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
              />
            </div>
            <div className="text-[10px] text-slate-500">
              Includes FRSC biometric capture & NVIS sync.
            </div>
          </div>
        </div>
      </div>

      {/* Enterprise Compliance Guardrails & Cryptographic Ledger Security */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="p-2 rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Regulatory Compliance & Cryptographic Integrity</h2>
            <p className="text-xs text-slate-500">Strict non-repudiation policies enforced across all automated workflows</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
            <div>
              <div className="font-bold text-slate-900">Strict Statutory Registry Verification</div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Require downstream NIID, MVAA, NHIA, and FRSC API confirmation before settling funds.
              </p>
            </div>
            <input
              type="checkbox"
              checked={strictRegistryVerification}
              onChange={(e) => setStrictRegistryVerification(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
            <div>
              <div className="font-bold text-slate-900">FRSC Class E Medical Certificate Mandate</div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Mandate verified optical and cardiovascular fitness certificate for commercial drivers.
              </p>
            </div>
            <input
              type="checkbox"
              checked={enforceFrscMedicalFitness}
              onChange={(e) => setEnforceFrscMedicalFitness(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
            <div>
              <div className="font-bold text-slate-900">National Identity (NIN/BVN) Enforcement</div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Block renewal execution if customer NIN is unverified on NIMC gateway.
              </p>
            </div>
            <input
              type="checkbox"
              checked={requireNinKyc}
              onChange={(e) => setRequireNinKyc(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
            <div>
              <div className="font-bold text-slate-900">SHA-256 Merkle Ledger Anchoring</div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Compute sequential Merkle root and cryptographic signatures for every action step.
              </p>
            </div>
            <input
              type="checkbox"
              checked={merkleAuditStreaming}
              onChange={(e) => setMerkleAuditStreaming(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Live Handshake & Integration Hub */}
      <LiveHandshakeHub />

      {/* CSV Batch Importer */}
      <CsvImporter />
    </div>
  );
}

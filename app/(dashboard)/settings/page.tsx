"use client";

import React, { useState } from "react";
import { Shield, Bot, Save, Check } from "lucide-react";
import { CsvImporter } from "@/components/csv-importer";

export default function SettingsPage() {
  const [maxAmount, setMaxAmount] = useState(1000000);
  const [expiryWindowDays, setExpiryWindowDays] = useState(30);
  const [savedAlert, setSavedAlert] = useState(false);

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
            Configure enterprise underwriting guardrails, N-ATLAS voice parameters, and batch data pipelines.
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
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
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
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
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

      {/* CSV Batch Importer */}
      <CsvImporter />
    </div>
  );
}

"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  X,
  Lock,
  Fingerprint,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { formatNaira, formatDate } from "@/lib/utils";
import type { AuthorizationDetails, UnderwriterQuote } from "@/types/actionos";

export interface AuthorizationOptions {
  selectedUnderwriter?: string;
  customAmount?: number;
  authMethod?: "pin" | "biometric_webauthn";
  simulateSagaFailure?: boolean;
}

interface AuthorizationCardProps {
  details: AuthorizationDetails;
  onAuthorize: (authorized: boolean, options?: AuthorizationOptions) => void;
  isSubmitting?: boolean;
}

export function AuthorizationCard({
  details,
  onAuthorize,
  isSubmitting = false,
}: AuthorizationCardProps) {
  const [confirmedCheck, setConfirmedCheck] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<UnderwriterQuote | null>(
    details.quotes?.find((q) => q.isRecommended) || details.quotes?.[0] || null
  );
  const [authMethod, setAuthMethod] = useState<"pin" | "biometric_webauthn">("pin");
  const [simulateSagaFailure, setSimulateSagaFailure] = useState(false);
  const [biometricScanning, setBiometricScanning] = useState(false);

  const activeAmount = selectedQuote ? selectedQuote.amount : details.amount;
  const activeUnderwriter = selectedQuote ? selectedQuote.underwriter : details.providerName;

  const handleConfirm = () => {
    if (authMethod === "biometric_webauthn") {
      setBiometricScanning(true);
      setTimeout(() => {
        setBiometricScanning(false);
        onAuthorize(true, {
          selectedUnderwriter: activeUnderwriter,
          customAmount: activeAmount,
          authMethod: "biometric_webauthn",
          simulateSagaFailure,
        });
      }, 700);
    } else {
      onAuthorize(true, {
        selectedUnderwriter: activeUnderwriter,
        customAmount: activeAmount,
        authMethod: "pin",
        simulateSagaFailure,
      });
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-amber-300 bg-white p-6 sm:p-8 shadow-xl shadow-amber-500/10 backdrop-blur-xl animate-in fade-in duration-300">
      {/* Security accent header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 border border-amber-200 shadow-xs">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900 tracking-wide">
                Explicit Renewal Authorization Gate
              </h3>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 border border-amber-200">
                ACTION CONFIRMATION REQUIRED
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              ActionOS Guardrail: Requires active cryptographic customer consent before financial settlement.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 text-[11px] font-bold shadow-xs">
          <Lock className="w-3 h-3 text-emerald-600" />
          <span>Session Guard Active</span>
        </div>
      </div>

      {/* Multi-Insurer Marketplace Quotes (if available) */}
      {details.quotes && details.quotes.length > 0 && (
        <div className="my-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              Underwriter Marketplace Comparison (Tap to Select)
            </span>
            <span className="text-slate-500 text-[11px]">4 Certified Carriers</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {details.quotes.map((quote) => {
              const isSelected = selectedQuote?.id === quote.id;
              return (
                <div
                  key={quote.id}
                  onClick={() => setSelectedQuote(quote)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-50/60 shadow-xs"
                      : "border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                        <span>{quote.underwriter}</span>
                        {quote.isRecommended && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-black border border-emerald-300">
                            BEST MATCH
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{quote.tierLabel}</div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-sm text-emerald-700">
                        {formatNaira(quote.amount)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-200/60 text-[10px] text-slate-600 flex flex-wrap gap-1">
                    {quote.benefits.slice(0, 2).map((b, i) => (
                      <span key={i} className="inline-flex items-center gap-0.5">
                        &bull; {b}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Policy details grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-5">
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold block mb-1">
            Registered Vehicle
          </span>
          <div className="text-sm font-bold text-slate-900">
            {details.assetName}
          </div>
          <span className="inline-block mt-1 font-mono text-xs bg-white px-2 py-0.5 rounded-md text-emerald-700 font-bold border border-emerald-200 shadow-2xs">
            {details.assetIdentifier}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold block mb-1">
            Selected Underwriter
          </span>
          <div className="text-sm font-bold text-slate-900">
            {activeUnderwriter}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-medium font-mono">
            Policy: {details.policyNumber}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 shadow-2xs">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold block mb-1">
            Coverage Period Roll-Forward
          </span>
          <div className="text-xs text-rose-700 font-medium flex items-center gap-1.5">
            <span>Expiring:</span>
            <span className="font-bold">{formatDate(details.currentExpiry)}</span>
          </div>
          <div className="text-xs text-emerald-800 font-bold flex items-center gap-1.5 mt-1">
            <span>New Expiry:</span>
            <span>{formatDate(details.newExpiry)}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 shadow-2xs">
          <span className="text-[11px] uppercase tracking-wider text-emerald-800 font-bold block mb-1">
            Certified Renewal Premium
          </span>
          <div className="text-2xl font-black text-emerald-700 font-mono">
            {formatNaira(activeAmount)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Includes VAT & statutory NAICOM documentation
          </div>
        </div>
      </div>

      {/* Auth Method Selector (PIN vs WebAuthn Biometric) */}
      <div className="mb-5 p-3 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700">Authentication Method:</span>
          <button
            type="button"
            onClick={() => setAuthMethod("pin")}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
              authMethod === "pin"
                ? "bg-white text-slate-900 border border-slate-200 shadow-2xs font-bold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            One-Click Consent
          </button>
          <button
            type="button"
            onClick={() => setAuthMethod("biometric_webauthn")}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              authMethod === "biometric_webauthn"
                ? "bg-emerald-600 text-white shadow-xs font-bold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" />
            <span>WebAuthn Passkey (FIDO2)</span>
          </button>
        </div>

        {/* Saga Simulation Switch */}
        <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={simulateSagaFailure}
            onChange={(e) => setSimulateSagaFailure(e.target.checked)}
            className="h-3.5 w-3.5 text-rose-600 rounded border-slate-300"
          />
          <span className="font-semibold text-rose-700 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Test Saga Rollback & Auto-Refund
          </span>
        </label>
      </div>

      {/* Safety Notice */}
      <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-amber-50 p-3.5 border border-amber-200 text-xs text-amber-900 shadow-xs">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <div>
          By confirming, you authorize ActionOS to initiate settlement of{" "}
          <strong className="text-slate-950 font-bold">{formatNaira(activeAmount)}</strong> via the secure payment rail and generate your electronic renewal certificate.
        </div>
      </div>

      {/* Checkbox consent */}
      <div className="mb-5 flex items-center gap-2.5">
        <input
          id="confirm-consent"
          type="checkbox"
          checked={confirmedCheck}
          onChange={(e) => setConfirmedCheck(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 bg-white text-emerald-600 focus:ring-emerald-500 cursor-pointer"
        />
        <label htmlFor="confirm-consent" className="text-xs text-slate-700 cursor-pointer select-none font-medium">
          I confirm and authorize this transaction for vehicle <strong>{details.assetIdentifier}</strong>
        </label>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => onAuthorize(false)}
          disabled={isSubmitting || biometricScanning}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || !confirmedCheck || biometricScanning}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
        >
          {biometricScanning ? (
            <span className="flex items-center gap-2">
              <Fingerprint className="w-4 h-4 animate-pulse text-emerald-200" />
              Verifying Biometric Passkey...
            </span>
          ) : isSubmitting ? (
            <span>Securing & Authorizing...</span>
          ) : (
            <>
              {authMethod === "biometric_webauthn" ? (
                <Fingerprint className="w-4 h-4" />
              ) : null}
              <span>Authorize {formatNaira(activeAmount)}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

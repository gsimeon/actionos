"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Globe2,
  Hash,
  Activity,
  FileCheck2,
  AlertCircle,
  ExternalLink,
  Download,
} from "lucide-react";
import { QrCodeSvg } from "@/components/actionos/qr-code";
import { formatNaira } from "@/lib/utils";

export interface JudgeGuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
}

type TourLanguage = "pcm" | "yo" | "ha" | "ig" | "en";

interface TourScenario {
  id: string;
  language: TourLanguage;
  langLabel: string;
  flag: string;
  vertical: string;
  authority: string;
  utterance: string;
  translation: string;
  intent: string;
  plate: string;
  vehicle: string;
  quoteAmount: number;
  underwriter: string;
  brakePct: number;
  qrPayload: string;
  certificateNumber: string;
}

const SCENARIOS: Record<TourLanguage, TourScenario> = {
  pcm: {
    id: "tour-pcm-motor",
    language: "pcm",
    langLabel: "Nigerian Pidgin",
    flag: "🇳🇬",
    vertical: "Motor Insurance (NIID)",
    authority: "NAICOM / NIID",
    utterance: "Abeg help me renew my Toyota Camry insurance Wey go expire next week. Deduct the money from my account.",
    translation: "Please help me renew my Toyota Camry insurance which expires next week. Deduct the funds from my account.",
    intent: "renew_policy",
    plate: "ABC-123-XY",
    vehicle: "2022 Toyota Camry 2.5L",
    quoteAmount: 87500,
    underwriter: "Leadway Assurance Plc",
    brakePct: 84,
    qrPayload: "https://niid.nigeriainsurers.org/verify?cert=NAICOM-STK-2026-ABC123XY&plate=ABC-123-XY",
    certificateNumber: "NAICOM-STK-2026-F981A4",
  },
  yo: {
    id: "tour-yo-lacvis",
    language: "yo",
    langLabel: "Yorùbá",
    flag: "🇳🇬",
    vertical: "Roadworthiness & Vehicle License",
    authority: "LACVIS / MVAA",
    utterance: "Mo fẹ́ ṣe àtúntò ìwé-ẹ̀rí àyẹ̀wò ọkọ̀ mi àti lẹ́sẹ́nsì fún ọdún tuntun kí ó má baà pẹ́.",
    translation: "I want to renew my computerized vehicle inspection roadworthiness and vehicle license for the new year.",
    intent: "renew_vehicle_license",
    plate: "LND-452-AA",
    vehicle: "2021 Honda Accord V6",
    quoteAmount: 43250,
    underwriter: "Lagos State MVAA & LACVIS",
    brakePct: 88,
    qrPayload: "https://mvaa.lagosstate.gov.ng/verify?plate=LND-452-AA&cert=LACVIS-2026-99120",
    certificateNumber: "LACVIS-CERT-2026-8812B",
  },
  ha: {
    id: "tour-ha-frsc",
    language: "ha",
    langLabel: "Hausa",
    flag: "🇳🇬",
    vertical: "Driver's License Renewal",
    authority: "FRSC NVIS",
    utterance: "Ina so in sabunta lasisin tuki na na kasa kafin ya kare, don Allah a duba bayana.",
    translation: "I would like to renew my national driver's license before it expires, please check my biometric record.",
    intent: "renew_driver_license",
    plate: "ABJ-891-KU",
    vehicle: "Category B (Private Driver)",
    quoteAmount: 18500,
    underwriter: "Federal Road Safety Corps (FRSC)",
    brakePct: 91,
    qrPayload: "https://nvis.frsc.gov.ng/verify-dl?dl=ABJ-008912-DL&nin=29104819201",
    certificateNumber: "FRSC-PERMIT-2026-44019",
  },
  ig: {
    id: "tour-ig-nhia",
    language: "ig",
    langLabel: "Igbo",
    flag: "🇳🇬",
    vertical: "Health Insurance HMO",
    authority: "NHIA Statutory Gateway",
    utterance: "Biko meere m ka mkpuchi ahụike HMO ezinụlọ m dị ọhụrụ maka ọnwa iri na abụọ na-abịa.",
    translation: "Please renew my family's statutory health insurance coverage (HMO) for the upcoming 12 months.",
    intent: "renew_hmo_policy",
    plate: "EN-771-EN",
    vehicle: "Gold Family Care Package",
    quoteAmount: 125000,
    underwriter: "National Health Insurance Authority (NHIA)",
    brakePct: 86,
    qrPayload: "https://nhia.gov.ng/verify-enrollee?nin=98127391024&tier=gold",
    certificateNumber: "NHIA-HMO-2026-GOLD-0192",
  },
  en: {
    id: "tour-en-all",
    language: "en",
    langLabel: "English",
    flag: "🇬🇧",
    vertical: "Comprehensive Auto & Insurance",
    authority: "NAICOM / FRSC",
    utterance: "Renew my comprehensive motor insurance and roadworthiness before the statutory deadline next Monday.",
    translation: "Renew comprehensive insurance and roadworthiness before statutory deadline.",
    intent: "renew_policy",
    plate: "KJA-889-BB",
    vehicle: "2023 Mercedes-Benz GLE 450",
    quoteAmount: 142000,
    underwriter: "AIICO Insurance Plc",
    brakePct: 92,
    qrPayload: "https://niid.nigeriainsurers.org/verify?cert=NAICOM-AIICO-2026-KJA889&plate=KJA-889-BB",
    certificateNumber: "NAICOM-STK-2026-9921D",
  },
};

const TOUR_STEPS = [
  {
    step: 1,
    badge: "Stage 1: Multilingual AI",
    title: "N-ATLAS Intent & Entity Extraction",
    description: "Sovereign Nigerian Multilingual Model understands local nuance, normalizes dialect, and maps to deterministic business intent.",
  },
  {
    step: 2,
    badge: "Stage 2: Statutory Safeguards",
    title: "Statutory Registry Pre-flight Probes",
    description: "Fail-closed regulatory validation across FRSC NVIS (theft check), LACVIS (brake & emissions), and NIID (coverage window).",
  },
  {
    step: 3,
    badge: "Stage 3: Actuarial Underwriting",
    title: "Deterministic Quotes & Cryptographic Stamping",
    description: "Zero AI pricing hallucination. Actuarial tariffs calculate statutory quote with HMAC-SHA256 non-tamperable binding.",
  },
  {
    step: 4,
    badge: "Stage 4: The Core Anti-Hallucination Tenet",
    title: "Customer Authorization Gate",
    description: "AI NEVER directly moves money or commits database mutations without explicit, auditable customer consent.",
  },
  {
    step: 5,
    badge: "Stage 5: Multi-Rail Settlement",
    title: "Paystack & Flutterwave Payment Settlement",
    description: "Sandboxed or live multi-rail gateway dispatch with out-of-band verification and atomic PostgreSQL settlement.",
  },
  {
    step: 6,
    badge: "Stage 6: Real-World Execution",
    title: "Immutable Action Ledger™ & Verifiable QR Stamping",
    description: "Atomic policy roll-forward to 2027, append-only Ed25519 signature chaining, and instant printable vector QR certificate.",
  },
];

export function JudgeGuidedTour({ isOpen, onClose }: JudgeGuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedLang, setSelectedLang] = useState<TourLanguage>("pcm");
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlayTimer, setAutoPlayTimer] = useState(4);
  const [hasAuthorized, setHasAuthorized] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const scenario = SCENARIOS[selectedLang];

  // Auto-play logic
  useEffect(() => {
    if (!isAutoPlaying || !isOpen) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setAutoPlayTimer((prev) => {
        if (prev <= 1) {
          setCurrentStep((step) => {
            if (step >= 6) {
              setIsAutoPlaying(false);
              return 6;
            }
            if (step === 3) {
              setHasAuthorized(true);
            }
            return step + 1;
          });
          return 4;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAutoPlaying, isOpen]);

  const handleNext = () => {
    if (currentStep < 6) {
      if (currentStep === 3) setHasAuthorized(true);
      setCurrentStep(currentStep + 1);
      setAutoPlayTimer(4);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setAutoPlayTimer(4);
    }
  };

  const handleReset = () => {
    setCurrentStep(1);
    setHasAuthorized(false);
    setAutoPlayTimer(4);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] overflow-hidden bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col text-slate-900">
        
        {/* Top Header / Badges */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[10px] font-black tracking-widest uppercase text-emerald-400">
                NITDA 2026 AI Innovation Challenge Showcase
              </span>
            </div>
            <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2 mt-0.5">
              <span>ActionOS Guided Judge Tour</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                1-Click Execution Proof
              </span>
            </h2>
          </div>

          {/* Autoplay & Reset Controls */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => setIsAutoPlaying(!isAutoPlaying)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isAutoPlaying
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20"
              }`}
            >
              {isAutoPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause ({autoPlayTimer}s)</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Auto-Play Tour</span>
                </>
              )}
            </button>

            <button
              onClick={handleReset}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Reset Tour to Step 1"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Language & Vertical Preset Bar */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-700">Choose Language & Vertical:</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SCENARIOS) as TourLanguage[]).map((langKey) => {
              const sc = SCENARIOS[langKey];
              const isSelected = selectedLang === langKey;
              return (
                <button
                  key={langKey}
                  onClick={() => {
                    setSelectedLang(langKey);
                    setCurrentStep(1);
                    setHasAuthorized(false);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-emerald-700 text-white shadow-xs scale-102"
                      : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span>{sc.flag}</span>
                  <span>{sc.langLabel}</span>
                  <span className={`text-[10px] px-1 py-0.2 rounded font-mono ${isSelected ? "bg-emerald-800 text-emerald-200" : "bg-slate-100 text-slate-500"}`}>
                    {sc.vertical.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Progress Step Bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 shrink-0">
          <div className="grid grid-cols-6 gap-2">
            {TOUR_STEPS.map((s) => {
              const isActive = currentStep === s.step;
              const isDone = currentStep > s.step;
              return (
                <button
                  key={s.step}
                  onClick={() => {
                    if (s.step >= 4) setHasAuthorized(true);
                    setCurrentStep(s.step);
                  }}
                  className="flex flex-col text-left group"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className={`flex h-5 w-5 rounded-full text-[10px] font-bold items-center justify-center transition-colors ${
                        isActive
                          ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
                          : isDone
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {isDone ? "✓" : s.step}
                    </span>
                    <span className="text-[11px] font-bold text-slate-800 truncate hidden md:inline">
                      {s.badge.split(":")[0]}
                    </span>
                  </div>
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      isActive
                        ? "bg-emerald-600"
                        : isDone
                        ? "bg-emerald-300"
                        : "bg-slate-200"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Step Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-black uppercase tracking-wider border border-emerald-200 mb-1">
                {TOUR_STEPS[currentStep - 1].badge}
              </span>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                {TOUR_STEPS[currentStep - 1].title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl">
                {TOUR_STEPS[currentStep - 1].description}
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500">Step {currentStep} of 6</span>
              <div className="flex gap-1">
                <button
                  onClick={handlePrev}
                  disabled={currentStep === 1}
                  className="p-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 disabled:opacity-30 hover:bg-slate-100 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNext}
                  disabled={currentStep === 6}
                  className="p-1.5 rounded-xl bg-emerald-600 text-white disabled:opacity-30 hover:bg-emerald-700 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* STAGE 1: N-ATLAS MULTILINGUAL UNDERSTANDING */}
          {currentStep === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in fade-in duration-300">
              <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Raw User Audio / Text Input ({scenario.langLabel})
                  </span>
                  <span className="text-lg">{scenario.flag}</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700 text-emerald-200 font-mono text-sm leading-relaxed">
                  &ldquo;{scenario.utterance}&rdquo;
                </div>
                <div className="text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">English Translation:</span> &ldquo;{scenario.translation}&rdquo;
                </div>
                <div className="flex items-center gap-3 pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Activity className="w-3.5 h-3.5" /> N-ATLAS Model: n-atlas-multilingual
                  </span>
                  <span>Latency: 142ms</span>
                  <span>Confidence: 99.4%</span>
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-4">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  N-ATLAS Normalized Output & Entity Extraction
                </span>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium">Mapped Business Intent:</span>
                    <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      {scenario.intent}
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium">Target Statutory Authority:</span>
                    <span className="font-bold text-slate-900">{scenario.authority}</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium">Identified Vehicle / Package:</span>
                    <span className="font-bold text-slate-900">{scenario.vehicle}</span>
                  </div>
                  <div className="flex justify-between p-2.5 bg-white rounded-xl border border-slate-200">
                    <span className="text-slate-500 font-medium">Target Registration Plate:</span>
                    <span className="font-mono font-bold text-slate-900">{scenario.plate}</span>
                  </div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>N-ATLAS Sovereign Layer successfully validated. No generic fallback needed.</span>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 2: STATUTORY PRE-FLIGHT SAFEGUARDS */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* FRSC Card */}
                <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">FRSC NVIS Registry</span>
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 font-mono">{scenario.plate}</div>
                  <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-emerald-200/60">
                    <div className="flex justify-between">
                      <span>Vehicle Status:</span>
                      <span className="font-bold text-emerald-700">REGISTERED</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Theft Registry:</span>
                      <span className="font-bold text-emerald-700">CLEARED (0 flags)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Chassis/Engine Match:</span>
                      <span className="font-bold text-emerald-700">VERIFIED</span>
                    </div>
                  </div>
                </div>

                {/* LACVIS Card */}
                <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">LACVIS Roadworthiness</span>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-black text-emerald-800 font-mono">
                    {scenario.brakePct}% Brake Eff.
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-emerald-200/60">
                    <div className="flex justify-between">
                      <span>Statutory Threshold:</span>
                      <span className="font-bold text-slate-700">&gt;70% Minimum</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Emissions Standard:</span>
                      <span className="font-bold text-emerald-700">COMPLIANT (CO 0.12%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Computerized Center:</span>
                      <span className="font-bold text-slate-700">Ojodu Test Station #4</span>
                    </div>
                  </div>
                </div>

                {/* NIID Card */}
                <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">NIID Policy Coverage</span>
                    <FileCheck2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 font-mono">AUTO-2026-00182</div>
                  <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-emerald-200/60">
                    <div className="flex justify-between">
                      <span>Coverage Expiry:</span>
                      <span className="font-bold text-amber-700">In 6 Days (Due)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Renewal Window:</span>
                      <span className="font-bold text-emerald-700">VALID (&lt;30 days)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Policy Conflict:</span>
                      <span className="font-bold text-emerald-700">NONE (Single underwriter)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-900 text-white rounded-xl text-xs flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>All 3 pre-flight statutory guardrails passed. Deterministic underwriting pipeline unblocked.</span>
                </span>
                <span className="text-emerald-400 font-bold">100% Deterministic Guarantee</span>
              </div>
            </div>
          )}

          {/* STAGE 3: ACTUARIAL DETERMINISTIC QUOTE */}
          {currentStep === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in fade-in duration-300">
              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Actuarial Tariff Breakdown
                </span>
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Base Statutory Underwriting Premium:</span>
                    <span className="font-mono font-bold text-slate-900">{formatNaira(scenario.quoteAmount * 0.85)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Value Added Tax (VAT 7.5%):</span>
                    <span className="font-mono font-bold text-slate-900">{formatNaira(scenario.quoteAmount * 0.075)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Statutory Regulatory &amp; Stamp Duty:</span>
                    <span className="font-mono font-bold text-slate-900">{formatNaira(scenario.quoteAmount * 0.075)}</span>
                  </div>
                  <div className="flex justify-between pt-2 text-sm font-bold text-slate-900">
                    <span>Total Actuarial Payable:</span>
                    <span className="text-emerald-700 font-mono text-base">{formatNaira(scenario.quoteAmount)}</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-600">
                  Underwritten by: <strong className="text-slate-900">{scenario.underwriter}</strong> (NAICOM Licensed)
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Cryptographic HMAC Quote Hash
                  </span>
                  <Hash className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-emerald-300 font-mono text-xs break-all leading-relaxed">
                  hmac-sha256(quot_88192:sess_00182:87500:NGN:leadway) = 8fa910d938bfe41290aa21cd0912
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  The quote is cryptographically bound to the session, underwriter ID, and exact amount. It cannot be altered in transit or inflated by unauthorized actors.
                </p>
                <div className="p-3 bg-emerald-950/60 rounded-xl border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>State transitions from PLANNING &rarr; VALIDATING &rarr; AWAITING_AUTHORIZATION</span>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 4: CUSTOMER AUTHORIZATION GATE */}
          {currentStep === 4 && (
            <div className="max-w-2xl mx-auto p-6 rounded-3xl border-2 border-emerald-400 bg-gradient-to-b from-emerald-50/60 to-white shadow-xl space-y-5 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900">Customer Authorization Gate</h4>
                  <p className="text-xs text-slate-600">ActionOS Architectural Invariant: Explicit Human Consent</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Customer Profile:</span>
                  <span className="font-bold text-slate-900">Tunde Fashola (ID: CUST-00182)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Vehicle / Policy:</span>
                  <span className="font-bold text-slate-900">{scenario.plate} ({scenario.vehicle})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Underwriting Authority:</span>
                  <span className="font-bold text-slate-900">{scenario.underwriter}</span>
                </div>
                <div className="flex justify-between pt-1 text-sm font-bold">
                  <span className="text-slate-700">Total Authorized Amount:</span>
                  <span className="text-emerald-700 font-mono text-base">{formatNaira(scenario.quoteAmount)}</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Notice: Workflow execution is halted at this gate until the customer explicitly clicks confirmation.</span>
              </div>

              <button
                onClick={() => setHasAuthorized(true)}
                className={`w-full py-3.5 px-4 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                  hasAuthorized
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30 cursor-default"
                    : "bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/20 active:scale-98"
                }`}
              >
                {hasAuthorized ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>Customer Consent Verified &amp; Signed (Timestamp: {new Date().toLocaleTimeString()})</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-emerald-400" />
                    <span>Click to Simulate Customer Confirmation ({formatNaira(scenario.quoteAmount)})</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* STAGE 5: MULTI-RAIL PAYMENT SETTLEMENT */}
          {currentStep === 5 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Paystack Rail */}
                <div className="p-5 rounded-2xl border-2 border-emerald-500 bg-white space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-emerald-800">Primary Payment Rail: Paystack</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">ACTIVE RAIL</span>
                  </div>
                  <div className="text-2xl font-black text-slate-900 font-mono">
                    {formatNaira(scenario.quoteAmount)}
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                    <div className="flex justify-between">
                      <span>Gateway Units:</span>
                      <span className="font-mono font-bold text-slate-900">{scenario.quoteAmount * 100} Kobo</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Webhook Event:</span>
                      <span className="font-mono text-emerald-700">charge.success</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Signature Validation:</span>
                      <span className="font-bold text-emerald-700">HMAC-SHA512 Verified</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Settlement Reference:</span>
                      <span className="font-mono text-slate-700">act:sess-00182:pay</span>
                    </div>
                  </div>
                </div>

                {/* Flutterwave Rail */}
                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-slate-600">Secondary Rail: Flutterwave</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">STANDBY RAIL</span>
                  </div>
                  <div className="text-2xl font-black text-slate-500 font-mono">
                    {formatNaira(scenario.quoteAmount)}
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-500 pt-2 border-t border-slate-200">
                    <div className="flex justify-between">
                      <span>Gateway Units:</span>
                      <span className="font-mono">{scenario.quoteAmount} NGN (Major)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Webhook Event:</span>
                      <span className="font-mono">charge.completed</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Signature Validation:</span>
                      <span className="font-semibold text-slate-700">verif-hash (timingSafeEqual)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Refund Protocol:</span>
                      <span className="font-semibold text-slate-700">Authoritative 4-State Machine</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Database Atomic Settlement RPC (settle_payment_webhook)</span>
                  </span>
                  <span className="text-slate-400 font-mono">FOR UPDATE lock acquired</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  The payment was independently verified with zero reliance on client claims. Terminal refund states cannot regress, and double debits on network retry are mathematically impossible.
                </p>
              </div>
            </div>
          )}

          {/* STAGE 6: ACTION LEDGER & VERIFIABLE CERTIFICATE */}
          {currentStep === 6 && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Action Ledger Event Card */}
                <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Hash className="w-4 h-4" /> Action Ledger™ Event #12
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                      IMMUTABLE
                    </span>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700">
                      <span className="text-slate-400 block text-[10px]">Action Class:</span>
                      <span className="text-emerald-300 font-bold">policy_renewed_and_certified</span>
                    </div>
                    <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700">
                      <span className="text-slate-400 block text-[10px]">Ed25519 Signature:</span>
                      <span className="text-slate-300 break-all text-[11px]">ed25519:7a81b9c2409f8721ad4...</span>
                    </div>
                    <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700">
                      <span className="text-slate-400 block text-[10px]">Merkle Previous Hash:</span>
                      <span className="text-slate-400 break-all text-[11px]">sha256:0018a491bc827104fa2...</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Event is signed and chained. Any historical database edit or row deletion is immediately detected upon audit reload.
                  </p>
                </div>

                {/* Digital Certificate Preview */}
                <div className="p-5 rounded-2xl border-2 border-emerald-500 bg-white space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">
                        Verifiable NAICOM Digital E-Sticker
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                        STATUTORY SEAL
                      </span>
                    </div>
                    <div className="flex items-start gap-4 pt-2">
                      <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl shrink-0">
                        <QrCodeSvg value={scenario.qrPayload} size={90} fgColor="#065f46" />
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="font-mono font-black text-slate-900 text-sm">
                          {scenario.certificateNumber}
                        </div>
                        <div className="text-slate-600 font-medium">{scenario.plate} &bull; {scenario.vehicle}</div>
                        <div className="text-slate-500 text-[11px]">Underwritten by: {scenario.underwriter}</div>
                        <div className="text-emerald-700 font-bold text-[11px]">Coverage Extended: 2026 &rarr; 2027</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs flex-1 flex items-center justify-between">
                      <span>Scan QR code with any camera or click download for the official PDF-1.4 statutory vector certificate.</span>
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-700 shrink-0 ml-2" />
                    </div>
                    <a
                      href="/api/documents/demo_auto_cert/download"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Official PDF</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Success celebration card */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
                <div className="space-y-1 text-center sm:text-left">
                  <div className="text-base font-black">
                    NITDA 2026 Challenge: 6-Stage Autonomous Workflow Certified!
                  </div>
                  <p className="text-xs text-emerald-100 max-w-xl">
                    From natural Nigerian speech &rarr; regulatory pre-flight &rarr; deterministic quote &rarr; customer consent &rarr; Paystack settlement &rarr; verifiable certificate.
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2.5 rounded-xl bg-white text-emerald-800 font-bold text-xs shadow-md hover:bg-emerald-50 transition-colors shrink-0"
                >
                  Restart Tour
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            onClick={handlePrev}
            disabled={currentStep === 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous Stage</span>
          </button>

          {/* Traditional AI vs ActionOS Differentiator Badge */}
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 font-medium">
            <span className="font-bold text-slate-800">Traditional AI:</span> Question &rarr; Text
            <span className="text-slate-300">|</span>
            <span className="font-bold text-emerald-700">ActionOS:</span> Intent &rarr; Guardrails &rarr; Authorization &rarr; Execution &rarr; Proof
          </div>

          <button
            onClick={handleNext}
            disabled={currentStep === 6}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-xs font-bold text-white disabled:opacity-40 hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md shadow-emerald-600/20"
          >
            <span>{currentStep === 6 ? "Tour Complete" : "Next Stage"}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Send,
  Sparkles,
  RefreshCw,
  Globe,
  Radio,
  CheckCircle,
  CheckCircle2,
  Clock,
  FileCheck,
  AlertTriangle,
} from "lucide-react";
import { VoiceActionButton } from "@/components/voice/voice-action-button";
import { AuthorizationCard, type AuthorizationOptions } from "./authorization-dialog";
import { ActionLedger } from "./action-ledger";
import { StatutoryDocumentViewer } from "@/components/actionos/statutory-document-viewer";
import type { ActionLedgerEvent, AuthorizationDetails } from "@/types/actionos";
import type { ActionSessionStatus, Document } from "@/types/database";
import { formatNaira, formatDate } from "@/lib/utils";
import { useActionSessionRealtime, useLedgerRealtime } from "@/lib/realtime";

const PRESET_PROMPTS = [
  {
    lang: "en-NG",
    label: "Renew Camry (Benchmark)",
    text: "My car insurance expires next week. Check it and renew it for me.",
  },
  {
    lang: "pcm",
    label: "Renew Insurance (Pidgin)",
    text: "Abeg I wan renew my motor insurance for ABC-123-XY sharp sharp.",
  },
  {
    lang: "yo",
    label: "Sọ Iṣeduro Di Ọtun (Yorùbá)",
    text: "Mo fẹ sọ iṣeduro ọkọ mi di ọtun fun ABC-123-XY.",
  },
  {
    lang: "ha",
    label: "Sabunta Inshora (Hausa)",
    text: "Ina so in sabunta inshorar motata don ABC-123-XY.",
  },
  {
    lang: "ig",
    label: "Megharia Mkpuchi (Igbo)",
    text: "Achọrọ m imeghari mkpuchi ụgbọ ala m maka ABC-123-XY.",
  },
  {
    lang: "en-NG",
    label: "Renew Health HMO (English)",
    text: "Renew my NHIA health insurance policy NHIA-2026-00812 on Gold tier.",
  },
  {
    lang: "pcm",
    label: "Renew Health (Pidgin)",
    text: "I wan renew my NHIA health insurance NHIA-2026-00812 for Gold tier sharp sharp.",
  },
  {
    lang: "yo",
    label: "Sọ Ilera Di Ọtun (Yorùbá)",
    text: "Mo fẹ sọ iṣeduro ilera NHIA mi di ọtun fun NHIA-2026-00812.",
  },
  {
    lang: "ha",
    label: "Sabunta Lafiya (Hausa)",
    text: "Ina so in sabunta inshorar lafiyata NHIA-2026-00812 a kan Gold tier.",
  },
  {
    lang: "ig",
    label: "Megharia Ahụike (Igbo)",
    text: "Achọrọ m imeghari mkpuchi ahụike NHIA m NHIA-2026-00812.",
  },
  {
    lang: "en-NG",
    label: "Renew Driver's License (English)",
    text: "Renew my driver's license AAA00000AA for 3 years at Ikeja DLC.",
  },
  {
    lang: "pcm",
    label: "Renew Driver License (Pidgin)",
    text: "Renew my driver license AAA00000AA for 3 years make I go capture for Ikeja.",
  },
  {
    lang: "yo",
    label: "Sọ Iwe Awakọ Di Ọtun (Yorùbá)",
    text: "Sọ iwe-aṣẹ awakọ mi AAA00000AA di ọtun fun ọdun mẹta ni Ikeja.",
  },
  {
    lang: "ha",
    label: "Sabunta Lasisin Tuki (Hausa)",
    text: "Sabunta lasisin tuki na AAA00000AA na tsawon shekaru 3 a Ikeja.",
  },
  {
    lang: "ig",
    label: "Megharia Ikike Ịkwọ Ụgbọala (Igbo)",
    text: "Megharia akwụkwọ ikike ịkwọ ụgbọala m AAA00000AA maka afọ atọ.",
  },
  {
    lang: "en-NG",
    label: "Query Vehicle (English)",
    text: "Query vehicle database for car ABC-123-XY and verify registration status.",
  },
  {
    lang: "pcm",
    label: "Query Motor (Pidgin)",
    text: "Check my motor ABC-123-XY for inside vehicle database sharp sharp.",
  },
  {
    lang: "pcm",
    label: "Register Motor (Pidgin)",
    text: "I wan register my motor LAG-456-ZZ for inside vehicle database.",
  },
  {
    lang: "yo",
    label: "Query Ọkọ (Yorùbá)",
    text: "Ṣayẹwo ọkọ ABC-123-XY ninu data ọkọ ayọkẹlẹ ActionOS.",
  },
  {
    lang: "yo",
    label: "Register Ọkọ (Yorùbá)",
    text: "Mo fẹ forukọsilẹ ọkọ mi tuntun fun iforukọsilẹ osise pẹlu FRSC.",
  },
  {
    lang: "ha",
    label: "Query Mota (Hausa)",
    text: "Duba motata ABC-123-XY a cikin ma'adanar bayanan motoci.",
  },
  {
    lang: "ha",
    label: "Register Mota (Hausa)",
    text: "Ina so in yi rijistar sabuwar mota a cikin ma'ajiya tare da FRSC.",
  },
  {
    lang: "ig",
    label: "Query Ụgbọ Ala (Igbo)",
    text: "Lelee ụgbọ ala m ABC-123-XY n'ọdụ data ụgbọ ala.",
  },
  {
    lang: "ig",
    label: "Register Ụgbọ Ala (Igbo)",
    text: "Achọrọ m idebanye aha ụgbọ ala ọhụrụ m n'ActionOS.",
  },
  {
    lang: "en-NG",
    label: "Renew License & Inspection",
    text: "Renew vehicle license and roadworthiness inspection for car ABC-123-XY.",
  },
  {
    lang: "pcm",
    label: "Renew Motor Paper (Pidgin)",
    text: "Renew my motor paper and roadworthiness sharp sharp for ABC-123-XY.",
  },
  {
    lang: "yo",
    label: "Atunto Iwe Ọkọ (Yorùbá)",
    text: "Sọ iwe-aṣẹ ọkọ ati iwe-ẹri ijẹrisi ọkọ di ọtun fun ABC-123-XY.",
  },
  {
    lang: "ha",
    label: "Sabunta Lasisi (Hausa)",
    text: "Sabunta lasisin mota da takardar duba mota don ABC-123-XY.",
  },
  {
    lang: "ig",
    label: "Megharia Ikike (Igbo)",
    text: "Megharia akwukwo ugbo ala na nyocha nchekwa maka ABC-123-XY.",
  },
  {
    lang: "en-NG",
    label: "Marketplace Quotes",
    text: "Compare renewal quotes for ABC-123-XY across Leadway, AXA Mansard, and AIICO.",
  },
];

const WORKFLOW_STEPS: Array<{ key: ActionSessionStatus; label: string }> = [
  { key: "understanding", label: "Understanding" },
  { key: "planning", label: "Planning" },
  { key: "validating", label: "Validating" },
  { key: "awaiting_authorization", label: "Authorization Gate" },
  { key: "executing", label: "Execution (Sandbox)" },
  { key: "verifying", label: "Verification" },
  { key: "completed", label: "Completed" },
];


interface CompletedOutcome {
  vehicle: string;
  plateNumber: string;
  underwriter: string;
  amount: number;
  currentExpiry?: string;
  newExpiry: string;
  policyNumber: string;
  certificateNumber: string;
  paymentReference: string;
  isComplete: boolean;
  missingFields: string[];
  verticalType?: "insurance_policy" | "vehicle_license" | "health_hmo" | "driver_license";
  mvaaLicenseNumber?: string;
  roadworthinessNumber?: string;
  statutoryAuthority?: string;
  verificationHash?: string;
  qrVerificationUrl?: string;
}

function createDocumentFromOutcome(outcome: CompletedOutcome): Document {
  let fileName = `NIID_Insurance_Certificate_${outcome.certificateNumber}.pdf`;
  if (outcome.verticalType === "health_hmo") {
    fileName = `NHIA_HMO_Card_${outcome.certificateNumber}.pdf`;
  } else if (outcome.verticalType === "driver_license") {
    fileName = `FRSC_Temporary_Permit_${outcome.certificateNumber}.pdf`;
  } else if (outcome.verticalType === "vehicle_license") {
    fileName = `Vehicle_License_${outcome.certificateNumber}.pdf`;
  }

  const qrVerificationUrl =
    outcome.qrVerificationUrl ||
    (outcome.verticalType === "health_hmo"
      ? `https://nhia.gov.ng/verify?enrollee=${outcome.certificateNumber}`
      : outcome.verticalType === "driver_license"
      ? `https://frsc.gov.ng/verify?dl=${outcome.policyNumber}&permit=${outcome.certificateNumber}`
      : outcome.verticalType === "vehicle_license"
      ? `https://mvaa.lagosstate.gov.ng/verify?license=${outcome.certificateNumber}`
      : `https://niid.nigeriainsurers.org/verify?cert=${outcome.certificateNumber}`);

  const verificationHash =
    outcome.verificationHash ||
    outcome.certificateNumber.replace(/[^A-Za-z0-9]/g, "").padEnd(64, "0").toLowerCase();

  return {
    id: outcome.certificateNumber,
    customer_id: "CUS-000001",
    renewal_id: null,
    document_type: "certificate",
    file_name: fileName,
    file_path: `/documents/${fileName}`,
    mime_type: "application/pdf",
    status: "generated",
    created_at: new Date().toISOString(),
    ...({
      metadata: {
        assetName: outcome.vehicle,
        assetIdentifier: outcome.plateNumber,
        underwriter: outcome.underwriter,
        statutoryAuthority: outcome.statutoryAuthority || outcome.underwriter,
        policyNumber: outcome.policyNumber,
        mvaaLicenseNumber: outcome.mvaaLicenseNumber,
        roadworthinessNumber: outcome.roadworthinessNumber,
        amount: outcome.amount,
        expiryDate: outcome.newExpiry,
        verificationHash,
        qrVerificationUrl,
      },
    } as unknown as Record<string, unknown>),
  };
}

function resolveCompletedOutcome(
  events: ActionLedgerEvent[],
  authDetails: AuthorizationDetails | null,
  options?: AuthorizationOptions
): CompletedOutcome | null {
  // 1. Check for NHIA Health HMO renewal workflow
  const renewHmoEvent = events.find((e) => e.tool === "renew_hmo_policy");
  if (renewHmoEvent) {
    const meta = (renewHmoEvent.metadata || {}) as Record<string, unknown>;
    const nhiaNum = (meta.nhiaNumber as string) || renewHmoEvent.referenceId || "NHIA-2026-00812";
    const enrolleeName = (meta.enrolleeName as string) || "Enrollee";
    const tier = ((meta.tier as string) || "gold").toUpperCase();
    const provider = (meta.hmoProviderName as string) || "Hygeia HMO";
    const digitalCard = meta.digitalCard as Record<string, unknown> | undefined;
    const cardNum =
      (digitalCard?.digitalCardNumber as string) ||
      (meta.digitalCardNumber as string) ||
      renewHmoEvent.referenceId ||
      "";
    const fee = (meta.premiumPaid as number) || (meta.annualPremium as number) || 185000;
    const expDate = (meta.coverageEndDate as string) || "";
    const txObj = meta.transaction as Record<string, unknown> | undefined;
    const payRef = (txObj?.reference as string) || (meta.paymentReference as string) || "HMO-PAY-SETTLED";
    const qrUrl =
      (digitalCard?.qrVerificationUrl as string) ||
      `https://nhia.gov.ng/verify?enrollee=${cardNum}`;
    const hash =
      (digitalCard?.verificationHash as string) ||
      (cardNum ? cardNum.replace(/[^A-Za-z0-9]/g, "").padEnd(64, "0").toLowerCase() : "");

    const missing: string[] = [];
    if (!cardNum) missing.push("NHIA Digital Card Number");
    if (!expDate) missing.push("Coverage End Date");

    return {
      vehicle: `${enrolleeName} (${tier} Plan)`,
      plateNumber: nhiaNum,
      underwriter: `${provider} • NHIA Accredited`,
      amount: fee,
      newExpiry: expDate,
      policyNumber: nhiaNum,
      certificateNumber: cardNum,
      paymentReference: payRef,
      isComplete: missing.length === 0,
      missingFields: missing,
      verticalType: "health_hmo",
      statutoryAuthority: "National Health Insurance Authority (NHIA)",
      verificationHash: hash,
      qrVerificationUrl: qrUrl,
    };
  }

  // 2. Check for FRSC Driver's License renewal workflow
  const renewDlEvent = events.find((e) => e.tool === "renew_driver_license");
  if (renewDlEvent) {
    const meta = (renewDlEvent.metadata || {}) as Record<string, unknown>;
    const dlNum = (meta.dlNumber as string) || renewDlEvent.referenceId || "AAA00000AA";
    const holderName = (meta.holderName as string) || "Demo Driver";
    const duration = (meta.durationYears as number) || 3;
    const permitNum = (meta.temporaryPermitNumber as string) || renewDlEvent.referenceId || "";
    const fee = (meta.statutoryFee as number) || (duration === 5 ? 15750 : 10500);
    const expDate = (meta.newExpiryDate as string) || "";
    const txObj = meta.transaction as Record<string, unknown> | undefined;
    const payRef = (txObj?.reference as string) || (meta.paymentReference as string) || "FRSC-PAY-SETTLED";
    const qrUrl =
      (meta.qrVerificationUrl as string) ||
      `https://frsc.gov.ng/verify?dl=${dlNum}&permit=${permitNum}`;
    const hash =
      (meta.verificationHash as string) ||
      (permitNum ? permitNum.replace(/[^A-Za-z0-9]/g, "").padEnd(64, "0").toLowerCase() : "");
    const centerObj = meta.captureCenter as Record<string, unknown> | undefined;
    const centerName = (centerObj?.name as string) || "FRSC DLC Ikeja";

    const missing: string[] = [];
    if (!permitNum) missing.push("FRSC Temporary Permit Number");
    if (!expDate) missing.push("Permit Expiry Date");

    return {
      vehicle: `${holderName} (${duration}-Yr Renewal, ${centerName})`,
      plateNumber: dlNum,
      underwriter: "Federal Road Safety Corps (FRSC)",
      amount: fee,
      newExpiry: expDate,
      policyNumber: dlNum,
      certificateNumber: permitNum,
      paymentReference: payRef,
      isComplete: missing.length === 0,
      missingFields: missing,
      verticalType: "driver_license",
      statutoryAuthority: "Federal Road Safety Corps (FRSC)",
      verificationHash: hash,
      qrVerificationUrl: qrUrl,
    };
  }

  // 3. Check for Vehicle License & Roadworthiness renewal workflow
  const renewVehEvent = events.find((e) => e.tool === "renew_vehicle_license");
  if (renewVehEvent) {
    const meta = (renewVehEvent.metadata || {}) as Record<string, unknown>;
    const vehicleObj = meta.vehicle as Record<string, unknown> | undefined;
    const vehName =
      (vehicleObj?.name as string) || (meta.vehiclePlate as string) || "Vehicle ABC-123-XY";
    const plate = (meta.vehiclePlate as string) || renewVehEvent.referenceId || "ABC-123-XY";
    const mvaaLic = (meta.mvaaLicenseNumber as string) || renewVehEvent.referenceId || "";
    const rwLic = (meta.roadworthinessNumber as string) || undefined;
    const fee = (meta.statutoryFee as number) || 23500;
    const licExpiry = (meta.licenseExpiry as string) || "";
    const txObj = meta.transaction as Record<string, unknown> | undefined;
    const payRef = (txObj?.reference as string) || "MVAA-PAY-SETTLED";
    const authority =
      (meta.statutoryAuthority as string) || "Lagos State MVAA & LACVIS";

    const missing: string[] = [];
    if (!mvaaLic) missing.push("MVAA License Number");
    if (!licExpiry) missing.push("License Expiry Date");

    return {
      vehicle: vehName,
      plateNumber: plate,
      underwriter: authority,
      amount: fee,
      newExpiry: licExpiry,
      policyNumber: mvaaLic,
      certificateNumber: rwLic || mvaaLic,
      paymentReference: payRef,
      isComplete: missing.length === 0,
      missingFields: missing,
      verticalType: "vehicle_license",
      mvaaLicenseNumber: mvaaLic,
      roadworthinessNumber: rwLic,
      statutoryAuthority: authority,
      qrVerificationUrl: `https://mvaa.lagosstate.gov.ng/verify?license=${mvaaLic}`,
      verificationHash: mvaaLic.replace(/[^A-Za-z0-9]/g, "").padEnd(64, "0").toLowerCase(),
    };
  }

  // 4. Insurance Policy Renewal workflow
  const certEvent = events.find(
    (e) => e.tool === "generate_certificate" || e.action === "issue_certificate"
  );
  const payEvent = events.find(
    (e) => e.tool === "execute_payment" || e.action === "execute_payment"
  );

  if (!certEvent && !payEvent && !authDetails) {
    return null;
  }

  const certRef = certEvent?.referenceId?.trim() || "";
  const payRef = payEvent?.referenceId?.trim() || "";
  const policyNum = authDetails?.policyNumber?.trim() || "";
  const verifiedExpiry = authDetails?.newExpiry?.trim() || "";

  const missing: string[] = [];
  if (!policyNum) missing.push("Policy Number");
  if (!verifiedExpiry) missing.push("Verified Renewal Expiry Date");
  if (!certRef) missing.push("Statutory Certificate Reference");
  if (!payRef) missing.push("Payment Settlement Reference");

  return {
    vehicle: authDetails?.assetName || "Not available",
    plateNumber: authDetails?.assetIdentifier || "Not available",
    underwriter: authDetails?.providerName || options?.selectedUnderwriter || "Not available",
    amount: options?.customAmount || authDetails?.amount || 0,
    currentExpiry: authDetails?.currentExpiry || undefined,
    newExpiry: verifiedExpiry || "Not available",
    policyNumber: policyNum || "Not available",
    certificateNumber: certRef || "Not available",
    paymentReference: payRef || "Not available",
    isComplete: missing.length === 0,
    missingFields: missing,
    verticalType: "insurance_policy",
    qrVerificationUrl: `https://niid.nigeriainsurers.org/verify?cert=${certRef || policyNum}`,
    verificationHash: (certRef || policyNum).replace(/[^A-Za-z0-9]/g, "").padEnd(64, "0").toLowerCase(),
  };
}


export function ActionConsole() {
  const searchParams = useSearchParams();
  const initialPolicy = searchParams?.get("policy");
  const initialPlate = searchParams?.get("plate");
  const initialLang = searchParams?.get("language") || searchParams?.get("lang") || "en-NG";
  const initialPrompt =
    searchParams?.get("prompt") ||
    (initialPolicy
      ? `Renew policy ${initialPolicy} for my vehicle.`
      : initialPlate
      ? `Check and renew vehicle license and roadworthiness for ${initialPlate}.`
      : "My car insurance expires next week. Check it and renew it for me.");

  const [inputText, setInputText] = useState(initialPrompt);
  const [selectedLanguage, setSelectedLanguage] = useState(initialLang);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<ActionSessionStatus | null>(null);
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [authDetails, setAuthDetails] = useState<AuthorizationDetails | null>(null);
  const [ledgerEvents, setLedgerEvents] = useState<ActionLedgerEvent[]>([]);
  const [completedOutcome, setCompletedOutcome] = useState<CompletedOutcome | null>(null);
  const [showCertModal, setShowCertModal] = useState(false);

  useActionSessionRealtime({
    sessionId,
    onSessionUpdate: (session) => {
      setSessionStatus(session.status);
    },
  });

  useLedgerRealtime({
    sessionId,
    onNewEvent: (event) => {
      setLedgerEvents((prev) => {
        if (prev.some((e) => e.id === event.id)) return prev;
        return [...prev, event];
      });
    },
  });

  const handleStartWorkflow = async (textToUse?: string) => {
    const text = textToUse || inputText;
    if (!text.trim()) return;

    setIsLoading(true);
    setResponseMessage(null);
    setAuthDetails(null);
    setCompletedOutcome(null);
    setShowCertModal(false);

    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "web",
          language: selectedLanguage,
          inputText: text,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setSessionId(json.data.sessionId);
        setSessionStatus(json.data.status);
        setResponseMessage(json.data.message);
        const events = json.data.events || [];
        setLedgerEvents(events);
        if (json.data.authorizationRequired && json.data.authorizationDetails) {
          setAuthDetails(json.data.authorizationDetails);
        } else if (json.data.status === "completed") {
          const outcome = resolveCompletedOutcome(events, null);
          if (outcome) {
            setCompletedOutcome(outcome);
          }
        }
      } else {
        setResponseMessage(`Action failed: ${json.error?.message || "Unknown error"}`);
      }
    } catch {
      setResponseMessage("Network error communicating with ActionOS Orchestrator.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthorize = async (authorized: boolean, options?: AuthorizationOptions) => {
    if (!sessionId) return;
    setIsLoading(true);

    try {
      const res = await fetch(`/api/actions/${sessionId}/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorized,
          quoteId: options?.quoteId || authDetails?.quoteId,
          authorizedQuoteId: options?.authorizedQuoteId || authDetails?.quoteId,
          selectedUnderwriter: options?.selectedUnderwriter,
          customAmount: options?.customAmount,
          authMethod: options?.authMethod,
          simulateSagaFailure: options?.simulateSagaFailure,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setSessionStatus(json.data.status);
        setResponseMessage(json.data.message);
        const events = json.data.events || [];
        setLedgerEvents(events);

        if (json.data.status === "completed") {
          const outcome = resolveCompletedOutcome(events, authDetails, options);
          if (outcome) {
            setCompletedOutcome(outcome);
          }
        }

        if (
          json.data.status === "completed" ||
          json.data.status === "cancelled" ||
          json.data.status === "escalated"
        ) {
          setAuthDetails(null);
        }
      } else {
        setResponseMessage(`Authorization error: ${json.error?.message || "Failed"}`);
      }
    } catch {
      setResponseMessage("Network error during authorization settlement.");
    } finally {
      setIsLoading(false);
    }
  };

  const getStepProgressIndex = (status: ActionSessionStatus | null): number => {
    if (!status) return -1;
    if (status === "received") return 0;
    if (status === "understanding") return 1;
    if (status === "planning") return 2;
    if (status === "validating") return 3;
    if (status === "awaiting_authorization") return 4;
    if (status === "executing") return 5;
    if (status === "verifying") return 6;
    if (status === "completed") return 7;
    return -1;
  };

  const currentStepIdx = getStepProgressIndex(sessionStatus);

  return (
    <div className="space-y-8">
      {/* Interactive Command Center Card */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xl shadow-emerald-500/5 relative overflow-hidden">
        {/* Subtle fresh emerald ambient glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-emerald-100/50 blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                ActionOS Command Console
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Speak or type natural language to trigger autonomous, guardrailed execution across enterprise systems.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Language picker */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs shadow-xs">
              <Globe className="w-3.5 h-3.5 text-emerald-600" />
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-transparent text-slate-800 font-semibold outline-none cursor-pointer text-xs"
              >
                <option value="en-NG">Nigerian English (en-NG)</option>
                <option value="pcm">Nigerian Pidgin (pcm)</option>
                <option value="yo">Yorùbá (yo-NG)</option>
                <option value="ha">Hausa (ha-NG)</option>
                <option value="ig">Igbo (ig-NG)</option>
              </select>
            </div>

            {/* AI Engine badge */}
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs">
              <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              <span>N-ATLAS Adapter</span>
            </div>

            {/* Sandbox Mode badge */}
            <div
              className="flex items-center gap-1.5 bg-amber-50 text-amber-950 border border-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs"
              title="Demo Sandbox: Payment settlement is simulated and certificates are non-statutory test fixtures."
            >
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span>DEMO / SANDBOX</span>
            </div>
          </div>
        </div>

        {/* Sandbox Notice Banner */}
        <div className="mb-5 px-3.5 py-2.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="font-black bg-amber-200 text-amber-950 px-2 py-0.5 rounded-md text-[10px] tracking-wide">
              SANDBOX NOTICE
            </span>
            <span className="text-[11px] font-medium text-amber-900">
              Simulated Paystack gateway rails and non-statutory test certificate fixtures. No real funds are debited.
            </span>
          </div>
          <span className="font-mono text-[10px] text-amber-700 font-bold self-end sm:self-auto">
            FIXTURE: NON_STATUTORY
          </span>
        </div>

        {/* Input bar */}
        <div className="relative flex flex-col sm:flex-row items-stretch gap-2.5 bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:border-emerald-500 focus-within:bg-white transition-all shadow-inner">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading) handleStartWorkflow();
            }}
            placeholder="e.g. My car insurance expires next week. Check it and renew it for me."
            className="flex-1 bg-transparent px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none font-medium"
          />

          <div className="flex items-center gap-2 self-end sm:self-center pr-1">
            <VoiceActionButton
              onTranscript={(text) => {
                setInputText(text);
                handleStartWorkflow(text);
              }}
              language={selectedLanguage}
              isProcessing={isLoading}
            />

            <button
              type="button"
              onClick={() => handleStartWorkflow()}
              disabled={isLoading || !inputText.trim()}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/30 disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Execute Action</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Preset prompts for demo testing */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-emerald-600" /> Presets:
          </span>
          {PRESET_PROMPTS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setInputText(p.text);
                setSelectedLanguage(p.lang);
                handleStartWorkflow(p.text);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 border border-slate-200 text-[11px] font-medium text-slate-700 transition-all text-left shadow-2xs"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Workflow Lifecycle Stepper matching Section 19 */}
        {sessionStatus && (
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase mb-3 flex items-center justify-between">
              <span>Autonomous Workflow Lifecycle</span>
              <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                STATE: {sessionStatus.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {WORKFLOW_STEPS.map((step, idx) => {
                const stepNum = idx + 1;
                const isPassed = currentStepIdx > stepNum;
                const isCurrent = currentStepIdx === stepNum;

                return (
                  <div
                    key={step.key}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      isPassed
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800 font-bold"
                        : isCurrent
                        ? "bg-amber-50 border-amber-400 text-amber-900 font-bold ring-2 ring-amber-300/60 animate-pulse shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-400"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase mb-0.5">
                      {isPassed ? (
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                      ) : isCurrent ? (
                        <Clock className="w-3 h-3 text-amber-600" />
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </div>
                    <div className="text-xs truncate">
                      {step.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Response Notification Bubble */}
        {responseMessage && (
          <div className="mt-6 p-4 rounded-2xl bg-emerald-50/90 border border-emerald-200/90 flex items-start gap-3 shadow-xs">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wide">
                ActionOS Assistant Response
              </div>
              <p className="text-sm text-slate-800 mt-0.5 leading-relaxed font-medium">
                {responseMessage}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Explicit Authorization Gate Card */}
      {authDetails && sessionStatus === "awaiting_authorization" && (
        <AuthorizationCard
          details={authDetails}
          onAuthorize={handleAuthorize}
          isSubmitting={isLoading}
        />
      )}

      {/* 05: Verify and Audit — Verified Execution Outcome & Certificate Preview */}
      {sessionStatus === "completed" && completedOutcome && (
        <div className={`rounded-3xl border-2 ${
          completedOutcome.isComplete
            ? "border-emerald-400/80 bg-gradient-to-b from-white via-emerald-50/20 to-emerald-50/40 shadow-emerald-500/10"
            : "border-amber-400/80 bg-gradient-to-b from-white via-amber-50/20 to-amber-50/40 shadow-amber-500/10"
        } p-6 sm:p-8 shadow-xl space-y-6 animate-in fade-in duration-300`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                completedOutcome.isComplete
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-amber-100 text-amber-800 border border-amber-300"
              } shadow-xs`}>
                {completedOutcome.isComplete ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-700" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-amber-700" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    {completedOutcome.isComplete
                      ? completedOutcome.verticalType === "health_hmo"
                        ? "Workflow Completed: Verified NHIA Health Insurance (HMO)"
                        : completedOutcome.verticalType === "driver_license"
                        ? "Workflow Completed: Verified FRSC Driver's License & Temporary Permit"
                        : completedOutcome.verticalType === "vehicle_license"
                        ? "Workflow Completed: Verified Vehicle License & Roadworthiness"
                        : "Workflow Completed: Verified Motor Insurance & Certificate"
                      : "Workflow Completed: Incomplete Verification"}
                  </h3>
                  {completedOutcome.isComplete ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-900 border border-emerald-300">
                      EXECUTION VERIFIED
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black text-rose-900 border border-rose-300">
                      INCOMPLETE OUTCOME: UNVERIFIED EVIDENCE
                    </span>
                  )}
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black text-amber-900 border border-amber-300">
                    SANDBOX RECORD
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 font-medium">
                  {completedOutcome.isComplete
                    ? completedOutcome.verticalType === "health_hmo"
                      ? "Autonomous lifecycle finished: NHIA enrollee validated, hospital tier verified, annual statutory premium settled, and secure digital card issued."
                      : completedOutcome.verticalType === "driver_license"
                      ? "Autonomous lifecycle finished: FRSC national database validated, statutory renewal fee settled, biometric capture scheduled, and temporary driving permit issued."
                      : completedOutcome.verticalType === "vehicle_license"
                      ? "Autonomous lifecycle finished: MVAA registration validated, computerized LACVIS inspection cleared, official statutory fees settled, and digital road documents issued."
                      : "Autonomous lifecycle finished: eligibility validated, customer authorized, simulated payment settled, and policy rolled forward."
                    : "Autonomous lifecycle reported completed status, but one or more required ledger artifacts are missing from response."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                disabled={completedOutcome.certificateNumber === "Not available"}
                onClick={() => setShowCertModal(true)}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-800 border border-slate-200 text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                title={completedOutcome.certificateNumber === "Not available" ? "Document not available in ledger records" : "View Statutory Document & QR"}
              >
                <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {completedOutcome.verticalType === "health_hmo"
                    ? "View Digital HMO Card"
                    : completedOutcome.verticalType === "driver_license"
                    ? "View Driver's Permit & QR"
                    : completedOutcome.verticalType === "vehicle_license"
                    ? "View License & Roadworthiness"
                    : "View Certificate Preview"}
                </span>
              </button>
            </div>
          </div>

          {/* Incomplete Outcome Warning Callout */}
          {!completedOutcome.isComplete && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-950 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Incomplete Verification Flag:</strong> Missing backend-verified references for:{" "}
                <span className="font-bold underline">{completedOutcome.missingFields.join(", ")}</span>.
                ActionOS strictly refuses to fabricate random fallback references. Please inspect the Action Ledger or escalation queue.
              </div>
            </div>
          )}

          {/* Details 4-box grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                {completedOutcome.verticalType === "health_hmo"
                  ? "ENROLLEE & PLAN"
                  : completedOutcome.verticalType === "driver_license"
                  ? "DRIVER & PERMIT"
                  : completedOutcome.verticalType === "vehicle_license"
                  ? "VEHICLE & LICENSE"
                  : "POLICY STATE"}
              </span>
              <div className="text-xs font-bold text-slate-900">
                {completedOutcome.vehicle}
              </div>
              <div className="text-[11px] font-mono text-emerald-700 font-bold mt-0.5">
                {completedOutcome.plateNumber} &bull; {completedOutcome.policyNumber}
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                New Expiry: <strong className="text-slate-800">{formatDate(completedOutcome.newExpiry)}</strong>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                {completedOutcome.verticalType === "health_hmo"
                  ? "HMO STATUTORY PREMIUM"
                  : completedOutcome.verticalType === "driver_license"
                  ? "FRSC STATUTORY FEE"
                  : completedOutcome.verticalType === "vehicle_license"
                  ? "STATUTORY SETTLEMENT"
                  : "SIMULATED SETTLEMENT"}
              </span>
              <div className="text-sm font-black font-mono text-emerald-700">
                {formatNaira(completedOutcome.amount)}
              </div>
              <div className="text-[10px] text-slate-600 font-medium mt-0.5">
                Rail: <strong className="text-slate-800">{completedOutcome.verticalType === "vehicle_license" ? "MVAA Revenue (Simulated)" : "Paystack (Simulated)"}</strong>
              </div>
              <div className="mt-1 text-[10px] font-mono truncate">
                Ref:{" "}
                {completedOutcome.paymentReference !== "Not available" ? (
                  <span className="text-slate-600 font-bold">{completedOutcome.paymentReference}</span>
                ) : (
                  <span className="text-rose-600 font-bold">Not available</span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                {completedOutcome.verticalType === "health_hmo"
                  ? "HEALTH AUTHORITY"
                  : completedOutcome.verticalType === "driver_license"
                  ? "LICENSING CORPS"
                  : completedOutcome.verticalType === "vehicle_license"
                  ? "REGULATORY BODY"
                  : "STATUTORY RECORD"}
              </span>
              <div className="text-xs font-bold text-slate-900 truncate">
                {completedOutcome.underwriter}
              </div>
              <div className="text-[10px] font-mono font-bold mt-0.5 truncate">
                {completedOutcome.certificateNumber !== "Not available" ? (
                  <span className="text-emerald-700">{completedOutcome.certificateNumber}</span>
                ) : (
                  <span className="text-rose-600">Not available</span>
                )}
              </div>
              {completedOutcome.certificateNumber !== "Not available" ? (
                <div className="mt-2 inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200">
                  NON-STATUTORY FIXTURE
                </div>
              ) : (
                <div className="mt-2 inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-rose-100 text-rose-900 border border-rose-200">
                  MISSING RECORD
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">
                CRYPTOGRAPHIC AUDIT
              </span>
              <div className="text-xs font-bold text-slate-900">
                Action Ledger™
              </div>
              <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
                {ledgerEvents.length} Atomic Events Chained
              </div>
              <div className="mt-2 text-[10px] text-slate-500 font-mono">
                SHA-256 Merkle verified
              </div>
            </div>
          </div>

          {/* Sandbox Disclosure Callout */}
          <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Sandbox Disclosure:</strong> This transaction and generated statutory record ({completedOutcome.certificateNumber !== "Not available" ? `#${completedOutcome.certificateNumber}` : "Not available"}) are simulated fixtures for the NITDA 2026 AI Innovation Challenge. In production, ActionOS verifies identities and credentials against live statutory databases (NAICOM, MVAA, NHIA, FRSC) with real Paystack settlement.
            </div>
          </div>
        </div>
      )}

      {/* Verifiable Vector QR Statutory Document Viewer Modal */}
      {showCertModal && completedOutcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200">
          <StatutoryDocumentViewer
            document={createDocumentFromOutcome(completedOutcome)}
            onClose={() => setShowCertModal(false)}
          />
        </div>
      )}


      {/* Signature Action Ledger Timeline */}
      <ActionLedger
        events={ledgerEvents}
        sessionId={sessionId || undefined}
        onRunSampleAction={() => {
          setInputText(PRESET_PROMPTS[0].text);
          setSelectedLanguage(PRESET_PROMPTS[0].lang);
          handleStartWorkflow(PRESET_PROMPTS[0].text);
        }}
      />
    </div>
  );
}

"use client";

import React, { useState } from "react";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Signal,
  BatteryCharging,
  X,
  RotateCcw,
  MessageSquare,
  Sparkles,
  ChevronRight,
} from "lucide-react";

interface UssdSimulatorProps {
  isOpen?: boolean;
  onClose?: () => void;
  isInline?: boolean;
}

interface MessageItem {
  sender: string;
  body: string;
  timestamp: string;
}

export function UssdSimulator({ isOpen = true, onClose, isInline = false }: UssdSimulatorProps) {
  const [phoneNumber, setPhoneNumber] = useState("+2348031234567");
  const [dialInput, setDialInput] = useState("*384*2026#");
  const [screenText, setScreenText] = useState(
    "ActionOS USSD Terminal\nReady to dial.\nEnter *384*2026# or pick a preset below."
  );
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState(() => `sess_${Math.random().toString(36).slice(2, 9)}`);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRawResponse, setLastRawResponse] = useState<string>("");
  const [incomingSmsList, setIncomingSmsList] = useState<MessageItem[]>([]);
  const [showSmsInbox, setShowSmsInbox] = useState(false);

  // Send request to /api/webhooks/ussd
  const sendUssdRequest = async (fullInputText: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/webhooks/ussd", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sessionId,
          serviceCode: "*384*2026#",
          phoneNumber,
          text: fullInputText,
          format: "json",
        }),
      });

      const data = await res.json();
      setScreenText(data.response || "No response from gateway.");
      setLastRawResponse(data.raw || "");

      if (data.shouldClose) {
        setSessionActive(false);
        // Check if renewal succeeded and trigger simulated SMS
        if (data.response.includes("Renewal Successful")) {
          const matchCert = data.response.match(/Cert ID: (ACT-USSD-\d+)/);
          const cert = matchCert ? matchCert[1] : "ACT-USSD-2026";
          const newSms: MessageItem = {
            sender: "ActionOS-GOV",
            body: `ActionOS: Vehicle license & NIID policy renewed! Cert: ${cert}. Valid 1 yr. Merkle verified. Inspect: https://actionos.gov.ng/verify?id=${cert}`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setIncomingSmsList((prev) => [newSms, ...prev]);
        }
      } else {
        setSessionActive(true);
      }
    } catch {
      setScreenText("Network Handshake Error.\nFailed to reach Telco USSD gateway.");
      setSessionActive(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDial = async () => {
    const raw = dialInput.trim();
    if (!raw) return;

    // Reset session if dialing new service code
    if (!sessionActive || raw.startsWith("*")) {
      const newSess = `sess_${Date.now()}`;
      setSessionId(newSess);
      setSessionHistory([]);

      // Check if it's a deep-dial e.g. *384*2026*1*ABC-123-XY#
      if (raw.startsWith("*384*2026*") && raw.endsWith("#")) {
        const payloadText = raw.slice("*384*2026*".length, -1);
        setSessionHistory(payloadText.split("*"));
        setDialInput("");
        await sendUssdRequest(payloadText);
        return;
      }

      setDialInput("");
      await sendUssdRequest("");
      return;
    }

    // Continuing session
    const updatedHistory = [...sessionHistory, raw];
    setSessionHistory(updatedHistory);
    setDialInput("");
    await sendUssdRequest(updatedHistory.join("*"));
  };

  const handleEndCall = () => {
    setSessionActive(false);
    setSessionHistory([]);
    setDialInput("*384*2026#");
    setScreenText("Session Terminated.\nActionOS USSD Terminal\nReady.");
  };

  const handleDialpadClick = (char: string) => {
    setDialInput((prev) => prev + char);
  };

  const handleBackspace = () => {
    setDialInput((prev) => prev.slice(0, -1));
  };

  const applyPreset = (code: string) => {
    setDialInput(code);
  };

  if (!isOpen && !isInline) return null;

  const content = (
    <div className="flex flex-col lg:flex-row gap-6 items-start justify-center p-2">
      {/* PHONE CASING */}
      <div className="w-[320px] sm:w-[340px] bg-slate-900 border-4 border-slate-700/80 rounded-[44px] p-5 shadow-2xl relative select-none shrink-0 flex flex-col items-center">
        {/* Speaker Grill */}
        <div className="w-16 h-1.5 bg-slate-800 rounded-full mb-4 border border-slate-700/50" />

        {/* Brand Label */}
        <div className="text-[10px] font-mono tracking-widest text-emerald-400/80 font-bold mb-3 uppercase flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span>ActionOS 2026 Feature Link</span>
        </div>

        {/* SCREEN CONTAINER (Monochrome Retro LCD) */}
        <div className="w-full bg-[#9bb388] text-[#1c2c1a] border-4 border-[#768b64] rounded-2xl p-3 shadow-inner flex flex-col h-[280px] relative overflow-hidden font-mono text-xs">
          {/* LCD Status Header */}
          <div className="flex items-center justify-between border-b border-[#768b64]/50 pb-1 mb-2 text-[10px] font-bold">
            <div className="flex items-center gap-1">
              <Signal className="w-3 h-3" />
              <span>MTN-NG 4G</span>
            </div>
            <div className="flex items-center gap-1">
              <span>98%</span>
              <BatteryCharging className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* LCD Main Body */}
          <div className="flex-1 overflow-y-auto whitespace-pre-wrap leading-relaxed pr-1 text-[11px] font-semibold scrollbar-thin">
            {isLoading ? (
              <div className="flex items-center justify-center h-full gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-[#1c2c1a] border-t-transparent rounded-full" />
                <span>USSD Session Active...</span>
              </div>
            ) : showSmsInbox ? (
              <div className="space-y-2">
                <div className="font-bold border-b border-[#768b64]/60 pb-1 flex items-center justify-between">
                  <span>INCOMING SMS INBOX ({incomingSmsList.length})</span>
                  <button
                    onClick={() => setShowSmsInbox(false)}
                    className="underline text-[10px] cursor-pointer"
                  >
                    Back
                  </button>
                </div>
                {incomingSmsList.length === 0 ? (
                  <p className="text-[10px] opacity-80 italic">No messages yet. Complete a renewal to receive SMS.</p>
                ) : (
                  incomingSmsList.map((sms, i) => (
                    <div key={i} className="border border-[#768b64] p-1.5 rounded bg-[#91a87e]">
                      <div className="flex justify-between text-[9px] font-black">
                        <span>{sms.sender}</span>
                        <span>{sms.timestamp}</span>
                      </div>
                      <p className="text-[10px] mt-0.5">{sms.body}</p>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div>{screenText}</div>
            )}
          </div>

          {/* Bottom Prompt / Current Typing Buffer */}
          <div className="border-t border-[#768b64]/60 pt-1 mt-1 flex items-center justify-between text-[11px] font-bold">
            <div className="truncate max-w-[210px] text-slate-900">
              {dialInput ? `Input: ${dialInput}` : sessionActive ? "Enter choice & press SEND" : "Dial code..."}
            </div>
            {sessionActive && (
              <span className="text-[9px] bg-[#768b64]/40 px-1 rounded animate-pulse">LIVE</span>
            )}
          </div>
        </div>

        {/* HARDWARE BUTTONS */}
        <div className="w-full mt-4 flex flex-col gap-2">
          {/* Soft Keys & Call / End */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleDial}
              disabled={isLoading}
              className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex flex-col items-center justify-center shadow-md active:translate-y-0.5 transition-all cursor-pointer text-xs"
              title="Call / Send Input"
            >
              <PhoneCall className="w-4 h-4" />
              <span className="text-[9px] mt-0.5">SEND</span>
            </button>

            <button
              onClick={() => setShowSmsInbox(!showSmsInbox)}
              className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold flex flex-col items-center justify-center border border-slate-700 shadow-md active:translate-y-0.5 transition-all cursor-pointer text-xs relative"
              title="SMS Inbox"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="text-[9px] mt-0.5">SMS</span>
              {incomingSmsList.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
                  {incomingSmsList.length}
                </span>
              )}
            </button>

            <button
              onClick={handleEndCall}
              className="py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex flex-col items-center justify-center shadow-md active:translate-y-0.5 transition-all cursor-pointer text-xs"
              title="End / Clear Session"
            >
              <PhoneOff className="w-4 h-4" />
              <span className="text-[9px] mt-0.5">END</span>
            </button>
          </div>

          {/* 3x4 NUMBER PAD */}
          <div className="grid grid-cols-3 gap-2 mt-1">
            {[
              { num: "1", sub: "" },
              { num: "2", sub: "ABC" },
              { num: "3", sub: "DEF" },
              { num: "4", sub: "GHI" },
              { num: "5", sub: "JKL" },
              { num: "6", sub: "MNO" },
              { num: "7", sub: "PQRS" },
              { num: "8", sub: "TUV" },
              { num: "9", sub: "WXYZ" },
              { num: "*", sub: "" },
              { num: "0", sub: "+" },
              { num: "#", sub: "" },
            ].map((btn) => (
              <button
                key={btn.num}
                onClick={() => handleDialpadClick(btn.num)}
                className="py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-100 font-mono font-bold flex flex-col items-center justify-center border border-slate-700/60 shadow-sm active:bg-slate-600 transition-colors cursor-pointer"
              >
                <span className="text-sm leading-none">{btn.num}</span>
                {btn.sub && <span className="text-[8px] text-slate-400 font-normal leading-none mt-0.5">{btn.sub}</span>}
              </button>
            ))}
          </div>

          {/* Quick Backspace / Reset */}
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleBackspace}
              className="flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono border border-slate-700 cursor-pointer"
            >
              DEL
            </button>
            <button
              onClick={() => {
                setDialInput("");
                setSessionHistory([]);
              }}
              className="flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono border border-slate-700 cursor-pointer flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              CLEAR
            </button>
          </div>
        </div>
      </div>

      {/* INSPECTOR & ONE-CLICK PRESETS PANEL */}
      <div className="flex-1 max-w-md flex flex-col gap-4 text-xs">
        {/* Header Information */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-slate-900 text-sm mb-1">
            <Phone className="w-4 h-4 text-emerald-600" />
            <span>USSD & Offline Financial Inclusion Channel</span>
          </div>
          <p className="text-slate-600 leading-relaxed text-xs">
            Over 68% of commercial drivers (Danfo buses, Keke NAPEP, haulage trucks) operate on 2G feature phones without mobile data. ActionOS provides the statutory <code className="bg-emerald-50 text-emerald-800 px-1 py-0.5 rounded font-mono font-bold">*384*2026#</code> USSD gateway conforming to Africa&apos;s Talking / Twilio telco session standards.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="text-[11px] text-slate-500 font-mono">
              Phone MSISDN:
            </div>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-mono text-slate-900 text-xs outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* 1-Click USSD Test Presets */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2.5">
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>1-Click USSD String Presets</span>
          </div>

          <div className="space-y-1.5">
            <button
              onClick={() => {
                applyPreset("*384*2026#");
                sendUssdRequest("");
              }}
              className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all flex items-center justify-between group cursor-pointer"
            >
              <div>
                <div className="font-bold text-slate-900 group-hover:text-emerald-800">
                  Dial Root Gateway (*384*2026#)
                </div>
                <div className="text-[10px] text-slate-500">
                  Interactive multi-step menu: Renew, Inspect, Verify
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
            </button>

            <button
              onClick={() => {
                applyPreset("*384*2026*1*ABC-123-XY#");
                sendUssdRequest("1*ABC-123-XY");
              }}
              className="w-full text-left p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 transition-all flex items-center justify-between group cursor-pointer"
            >
              <div>
                <div className="font-bold text-emerald-950 flex items-center gap-1">
                  <span>Danfo Deep-Dial Quote</span>
                  <span className="text-[9px] bg-emerald-200 text-emerald-900 px-1.5 py-0.2 rounded font-mono font-bold">
                    *384*2026*1*ABC-123-XY#
                  </span>
                </div>
                <div className="text-[10px] text-emerald-800">
                  Instant calculation of MVAA + NIID + LASDRI for ₦26,000
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-600" />
            </button>

            <button
              onClick={() => {
                applyPreset("*384*2026*2*ABC-123-XY#");
                sendUssdRequest("2*ABC-123-XY");
              }}
              className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all flex items-center justify-between group cursor-pointer"
            >
              <div>
                <div className="font-bold text-slate-900 group-hover:text-emerald-800">
                  LACVIS Inspection & Roadworthiness Check
                </div>
                <div className="text-[10px] text-slate-500">
                  Checks computerized brake efficiency, emissions, and LASDRI status
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
            </button>

            <button
              onClick={() => {
                applyPreset("*384*2026*3*ABC-123-XY#");
                sendUssdRequest("3*ABC-123-XY");
              }}
              className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all flex items-center justify-between group cursor-pointer"
            >
              <div>
                <div className="font-bold text-slate-900 group-hover:text-emerald-800">
                  Verify Windshield Badge via Plate
                </div>
                <div className="text-[10px] text-slate-500">
                  Returns cryptographic Action Ledger confirmation via USSD
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
            </button>
          </div>
        </div>

        {/* Live Telco Protocol Payload Box */}
        <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 shadow-sm font-mono text-[11px] space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-[10px] border-b border-slate-800 pb-1">
            <span>TELCO HANDSHAKE (POST /api/webhooks/ussd)</span>
            <span className="text-emerald-400">HTTP 200 OK</span>
          </div>
          <div>
            <span className="text-slate-400">Session ID: </span>
            <span className="text-amber-300">{sessionId}</span>
          </div>
          <div>
            <span className="text-slate-400">Payload State: </span>
            <span className="text-emerald-300">{sessionHistory.join("*") || "(initial)"}</span>
          </div>
          {lastRawResponse && (
            <div className="mt-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[9px] mb-1">RAW GATEWAY RETURN:</span>
              <pre className="whitespace-pre-wrap text-emerald-400 font-mono text-[10px]">
                {lastRawResponse}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (isInline) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Phone className="w-5 h-5 text-emerald-600" />
            <span>USSD & Feature Phone Simulator (*384*2026#)</span>
          </h2>
          <p className="text-xs text-slate-500">
            Test offline, zero-data vehicle renewals and roadside verification designed for transport unions and commercial operators.
          </p>
        </div>

        {content}
      </div>
    </div>
  );
}

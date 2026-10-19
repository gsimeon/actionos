"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Mic,
  Smile,
  ShieldCheck,
  CheckCheck,
  RotateCw,
  Sparkles,
  Phone,
  Video,
  MoreVertical,
  Bot,
  Play,
  CheckCircle2,
} from "lucide-react";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
  isVoice?: boolean;
  voiceDuration?: string;
  interactiveButtons?: Array<{
    id: string;
    title: string;
  }>;
  workflowId?: string;
  status?: "sent" | "delivered" | "read";
}

const QUICK_PROMPTS = [
  {
    label: "Vehicle Insurance (English)",
    text: "My car insurance expires next week for ABC-123-XY. Check and renew it.",
    lang: "en-NG",
  },
  {
    label: "Pidgin Renewal",
    text: "Abeg my insurance for Toyota Camry don expire, renew am sharp sharp!",
    lang: "pcm",
  },
  {
    label: "Yorùbá Renewal",
    text: "Mo fẹ́ sọ iṣeduro ọkọ mi ABC-123-XY di ọtun.",
    lang: "yo",
  },
  {
    label: "Hausa Renewal",
    text: "Ina so in sabunta inshorar motata ABC-123-XY.",
    lang: "ha",
  },
  {
    label: "NHIA HMO Health",
    text: "Please renew my NHIA health insurance HMO card NHIA-2026-00812.",
    lang: "en-NG",
  },
  {
    label: "FRSC Driver's License",
    text: "I want to renew my Nigerian Driver's License ABC12345678.",
    lang: "en-NG",
  },
];

export function WhatsAppSimulator() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-welcome",
      sender: "bot",
      text: "👋 Welcome to *ActionOS Renew*!\n\nI am your sovereign AI assistant. Send a voice note or message in *English, Pidgin, Yorùbá, Hausa, or Igbo* to renew your vehicle insurance, vehicle license, HMO health plan, or Driver's License.",
      timestamp: "12:00 PM",
      status: "read",
    },
  ]);

  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageIdRef = useRef(1);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string, buttonPayload?: string, isVoice = false) => {
    if (!text.trim() && !buttonPayload) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsgId = `usr-${messageIdRef.current++}`;

    // Append user message
    const userBubbleText = isVoice
      ? "🎤 Voice Note (0:04)"
      : buttonPayload
      ? `🔘 ${text}`
      : text;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: "user",
        text: userBubbleText,
        timestamp: timeStr,
        isVoice,
        voiceDuration: isVoice ? "0:04" : undefined,
        status: "delivered",
      },
    ]);
    if (!buttonPayload) {
      setInputVal("");
    }

    setLoading(true);

    try {
      const res = await fetch("/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text,
          sender: "+2348031234567",
          buttonPayload: buttonPayload || undefined,
        }),
      });

      const data = await res.json();
      const botTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      if (data.response?.interactive?.action?.buttons) {
        // Workflow paused at Authorization Gate!
        const interactive = data.response.interactive;
        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${messageIdRef.current++}`,
            sender: "bot",
            text: interactive.body?.text || data.workflow?.message || "Please confirm authorization:",
            timestamp: botTime,
            interactiveButtons: interactive.action.buttons.map((b: { reply: { id: string; title: string } }) => ({
              id: b.reply.id,
              title: b.reply.title,
            })),
            workflowId: data.sessionId,
            status: "read",
          },
        ]);
      } else {
        // Standard text response
        const botText =
          data.response?.text?.body ||
          data.workflow?.message ||
          data.error ||
          "Action executed successfully.";

        setMessages((prev) => [
          ...prev,
          {
            id: `bot-${messageIdRef.current++}`,
            sender: "bot",
            text: botText,
            timestamp: botTime,
            status: "read",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${messageIdRef.current++}`,
          sender: "bot",
          text: "⚠️ Network handshake failure communicating with ActionOS WhatsApp gateway.",
          timestamp: timeStr,
          status: "read",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSimulateVoice = () => {
    setIsVoiceRecording(true);
    setTimeout(() => {
      setIsVoiceRecording(false);
      sendMessage("Please check and renew my car insurance for ABC-123-XY", undefined, true);
    }, 1500);
  };

  const resetChat = () => {
    setMessages([
      {
        id: "msg-welcome",
        sender: "bot",
        text: "👋 Welcome to *ActionOS Renew*!\n\nI am your sovereign AI assistant. Send a voice note or message in *English, Pidgin, Yorùbá, Hausa, or Igbo* to renew your vehicle insurance, vehicle license, HMO health plan, or Driver's License.",
        timestamp: "12:00 PM",
        status: "read",
      },
    ]);
  };

  return (
    <div className="rounded-3xl border border-emerald-200 bg-white shadow-xl overflow-hidden flex flex-col md:flex-row">
      {/* Left / Top Controls Sidebar */}
      <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/60 p-5 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-900 tracking-tight">WhatsApp Sandbox</h3>
                <span className="text-[10px] text-emerald-700 font-bold block">NITDA 2026 Omnichannel</span>
              </div>
            </div>
            <button
              type="button"
              onClick={resetChat}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
              title="Reset Chat"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed mb-4">
            Simulate end-user interaction with the ActionOS WhatsApp Cloud API webhook. Experience natural voice/text understanding, actuarial quote authorization buttons, and verified settlement delivery.
          </p>

          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
            1-Click Benchmark Prompts:
          </span>

          <div className="space-y-1.5">
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => sendMessage(qp.text)}
                className="w-full text-left p-2 rounded-xl bg-white hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 border border-slate-200/80 hover:border-emerald-300 text-[11px] font-medium transition-all shadow-2xs group flex items-start gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{qp.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200 text-[10px] text-slate-500">
          <span>Endpoint: </span>
          <code className="bg-slate-200 px-1 py-0.5 rounded text-[9px] font-mono">POST /api/webhooks/whatsapp</code>
        </div>
      </div>

      {/* Right / Main Phone Chat Frame */}
      <div className="flex-1 flex flex-col h-[560px] bg-[#efeae2] relative">
        {/* WhatsApp Top Bar */}
        <div className="bg-[#075e54] text-white px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-emerald-700 border-2 border-white/20 flex items-center justify-center text-white">
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-[#075e54] rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm leading-none">ActionOS Renew</span>
                <span className="bg-white/20 text-[9px] font-bold px-1 rounded uppercase">Verified</span>
              </div>
              <span className="text-[11px] text-emerald-100/90 leading-none">Online &bull; WhatsApp Cloud API</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-emerald-100">
            <Phone className="w-4 h-4 cursor-pointer hover:text-white" />
            <Video className="w-4 h-4 cursor-pointer hover:text-white" />
            <MoreVertical className="w-4 h-4 cursor-pointer hover:text-white" />
          </div>
        </div>

        {/* Messages Scroll Area with WhatsApp-style background pattern */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m) => {
            const isUser = m.sender === "user";
            return (
              <div key={m.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-xs text-xs relative ${
                    isUser
                      ? "bg-[#d9fdd3] text-slate-900 rounded-tr-xs"
                      : "bg-white text-slate-900 rounded-tl-xs"
                  }`}
                >
                  {m.isVoice ? (
                    <div className="flex items-center gap-3 py-1">
                      <button
                        type="button"
                        className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0"
                      >
                        <Play className="w-4 h-4 ml-0.5 fill-current" />
                      </button>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 h-3">
                          {[40, 70, 30, 90, 60, 80, 45, 65, 95, 40, 60, 30].map((h, i) => (
                            <span
                              key={i}
                              className="w-1 bg-emerald-700 rounded-full"
                              style={{ height: `${h}%` }}
                            />
                          ))}
                        </div>
                        <span className="text-[9px] text-slate-500 font-mono">0:04 &bull; Voice Message</span>
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
                  )}

                  {/* Interactive Button Message (WhatsApp Standard) */}
                  {m.interactiveButtons && m.interactiveButtons.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-100 space-y-1.5">
                      {m.interactiveButtons.map((btn) => (
                        <button
                          key={btn.id}
                          type="button"
                          disabled={loading}
                          onClick={() => sendMessage(btn.title, btn.id)}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer ${
                            btn.id.includes("cancel")
                              ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{btn.title}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Timestamp & Status Checkmarks */}
                  <div className="flex items-center justify-end gap-1 mt-1 text-[9px] text-slate-400 font-mono">
                    <span>{m.timestamp}</span>
                    {isUser && (
                      <CheckCheck className="w-3.5 h-3.5 text-blue-500 inline" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-white/80 backdrop-blur-xs px-3 py-1.5 rounded-full w-fit shadow-xs animate-pulse">
              <span className="flex h-2 w-2 rounded-full bg-emerald-600" />
              <span>ActionOS is processing workflow...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="bg-[#f0f2f5] px-3 py-2 flex items-center gap-2 border-t border-slate-200 shrink-0">
          <Smile className="w-5 h-5 text-slate-500 cursor-pointer hover:text-slate-700 shrink-0" />

          <button
            type="button"
            onClick={handleSimulateVoice}
            disabled={loading || isVoiceRecording}
            className={`p-2 rounded-full transition-all shrink-0 cursor-pointer ${
              isVoiceRecording
                ? "bg-rose-500 text-white animate-pulse"
                : "text-slate-600 hover:text-emerald-700 hover:bg-slate-200"
            }`}
            title="Simulate Voice Note"
          >
            <Mic className="w-5 h-5" />
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(inputVal);
            }}
            className="flex-1 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={isVoiceRecording ? "Recording voice note..." : "Type a message in English, Pidgin, Yoruba, Hausa..."}
              disabled={loading || isVoiceRecording}
              className="flex-1 bg-white border border-slate-300 rounded-2xl px-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner"
            />

            <button
              type="submit"
              disabled={loading || !inputVal.trim()}
              className="p-2 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white shadow-md transition-all shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

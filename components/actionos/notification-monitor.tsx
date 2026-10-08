"use client";

import React, { useState } from "react";
import {
  Bell,
  MessageSquare,
  Mail,
  Smartphone,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Download,
  ExternalLink,
} from "lucide-react";

export interface NotificationPreview {
  channel: "in_app" | "sms" | "whatsapp" | "email";
  recipient: string;
  title: string;
  body: string;
  timestamp: string;
  status: "delivered" | "sent" | "pending";
}

const BENCHMARK_NOTIFICATIONS: NotificationPreview[] = [
  {
    channel: "whatsapp",
    recipient: "+234 801 111 1111 (Demo Customer)",
    title: "ActionOS Renew — Certificate Ready",
    body: "Hello Demo Customer! 👋 Your Toyota Camry (ABC-123-XY) insurance has been successfully renewed with Leadway Assurance for ₦87,500. New Expiry: 14 Oct 2027. Your digital NAICOM certificate NAICOM-CERT-2026-00182 is attached.",
    timestamp: "Just now",
    status: "delivered",
  },
  {
    channel: "sms",
    recipient: "+234 801 111 1111",
    title: "ActionOS Statutory SMS",
    body: "ActionOS: Policy AUTO-2026-00182 for ABC-123-XY renewed successfully. Coverage extended to 14/10/2027. Premium: NGN 87,500. Reg: NAICOM-CERT-2026-00182.",
    timestamp: "1 min ago",
    status: "delivered",
  },
  {
    channel: "email",
    recipient: "customer@actionos.ng",
    title: "Policy Renewal Confirmation & Statutory Certificate — AUTO-2026-00182",
    body: "Dear Demo Customer,\n\nWe confirm the successful renewal of your Comprehensive Motor Insurance policy underwritten by Leadway Assurance Company Ltd.\n\n• Vehicle: Toyota Camry (ABC-123-XY)\n• Premium Paid: ₦87,500\n• Effective: 14 Oct 2026 to 14 Oct 2027\n• NIID Record: Validated on Nigerian Insurance Industry Database\n\nYour official digitally-signed certificate is attached as a secure PDF.",
    timestamp: "1 min ago",
    status: "delivered",
  },
  {
    channel: "in_app",
    recipient: "In-App Notification Feed",
    title: "Policy Successfully Renewed",
    body: "Toyota Camry ABC-123-XY renewed with Leadway Assurance. Coverage active until 14 Oct 2027.",
    timestamp: "2 mins ago",
    status: "delivered",
  },
];

export function NotificationMonitor() {
  const [activeChannel, setActiveChannel] = useState<"whatsapp" | "sms" | "email" | "in_app">("whatsapp");
  const [notifications, setNotifications] = useState<NotificationPreview[]>(BENCHMARK_NOTIFICATIONS);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchSuccess, setDispatchSuccess] = useState(false);

  const handleDispatchTest = (channel: "whatsapp" | "sms" | "email" | "in_app") => {
    setIsDispatching(true);
    setDispatchSuccess(false);

    setTimeout(() => {
      const newNotif: NotificationPreview = {
        channel,
        recipient:
          channel === "whatsapp"
            ? "+234 801 111 1111 (Demo Customer)"
            : channel === "sms"
            ? "+234 801 111 1111"
            : channel === "email"
            ? "customer@actionos.ng"
            : "In-App Notification Feed",
        title:
          channel === "whatsapp"
            ? "ActionOS Renew — Live Dispatch"
            : channel === "sms"
            ? "ActionOS Statutory SMS Alert"
            : channel === "email"
            ? "Instant Policy Renewal Certificate"
            : "Policy Renewal Action Completed",
        body: `Test multi-channel broadcast across ${channel.toUpperCase()} rail. Policy AUTO-2026-00182 confirmed with cryptographic seal.`,
        timestamp: "Just now",
        status: "delivered",
      };

      setNotifications((prev) => [newNotif, ...prev]);
      setActiveChannel(channel);
      setIsDispatching(false);
      setDispatchSuccess(true);
      setTimeout(() => setDispatchSuccess(false), 3000);
    }, 600);
  };

  const currentNotification = notifications.find((n) => n.channel === activeChannel) || notifications[0];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { key: "whatsapp", label: "WhatsApp Business", icon: MessageSquare, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          { key: "sms", label: "Statutory SMS", icon: Smartphone, color: "text-blue-700 bg-blue-50 border-blue-200" },
          { key: "email", label: "HTML Certificate Email", icon: Mail, color: "text-purple-700 bg-purple-50 border-purple-200" },
          { key: "in_app", label: "In-App Notification", icon: Bell, color: "text-amber-700 bg-amber-50 border-amber-200" },
        ].map((item) => {
          const Icon = item.icon;
          const isSelected = activeChannel === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveChannel(item.key as typeof activeChannel)}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? "bg-white border-slate-900 shadow-md ring-2 ring-slate-900/10"
                  : "bg-white/80 border-slate-200/90 hover:bg-white hover:border-slate-300"
              }`}
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl mb-3 border ${item.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-xs font-bold text-slate-900">{item.label}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 font-medium">
                {notifications.filter((n) => n.channel === item.key).length} Dispatched
              </div>
            </button>
          );
        })}
      </div>

      {/* Interactive Dispatch Sandbox & Live Channel Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Dispatch Controls & Triggers (5 cols) */}
        <div className="lg:col-span-5 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl shadow-slate-200/30 space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-base font-extrabold text-slate-900">
                Multi-Channel Dispatcher
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Trigger real-time notifications across individual communication rails to test statutory and customer delivery formats.
            </p>
          </div>

          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider text-[10px]">
              Simulate Instant Dispatch
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleDispatchTest("whatsapp")}
                disabled={isDispatching}
                className="p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>Send WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => handleDispatchTest("sms")}
                disabled={isDispatching}
                className="p-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
              >
                <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                <span>Send SMS</span>
              </button>

              <button
                type="button"
                onClick={() => handleDispatchTest("email")}
                disabled={isDispatching}
                className="p-3 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
              >
                <Mail className="w-3.5 h-3.5 text-purple-600" />
                <span>Send Email</span>
              </button>

              <button
                type="button"
                onClick={() => handleDispatchTest("in_app")}
                disabled={isDispatching}
                className="p-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
              >
                <Bell className="w-3.5 h-3.5 text-amber-600" />
                <span>Send In-App</span>
              </button>
            </div>
          </div>

          {dispatchSuccess && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Notification successfully dispatched and recorded in repository!</span>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Nigerian Regulatory Compliance</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              SMS messages are formatted in accordance with NCC Do-Not-Disturb (DND) transactional gateway guidelines. WhatsApp notifications deliver interactive rich media templates with one-tap digital certificate verification.
            </p>
          </div>
        </div>

        {/* Right Column: Live Visual Device / Mock Preview (7 cols) */}
        <div className="lg:col-span-7 rounded-3xl border border-slate-200/90 bg-slate-900 text-white p-6 sm:p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase text-slate-400 font-bold">
                  LIVE RAIL SIMULATION:
                </span>
                <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-mono font-bold uppercase">
                  {activeChannel}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {currentNotification?.recipient}
              </span>
            </div>

            {/* Simulated Device Content */}
            {activeChannel === "whatsapp" && (
              <div className="max-w-md mx-auto rounded-3xl bg-slate-950 border border-slate-800 p-5 shadow-2xl space-y-3">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-xs text-white">
                    AO
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1">
                      <span>ActionOS Verified Business</span>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    </div>
                    <div className="text-[10px] text-slate-400">Official Auto-Renewal Bot</div>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#005c4b]/30 border border-[#005c4b]/50 text-xs text-slate-100 leading-relaxed space-y-2">
                  <p>{currentNotification.body}</p>
                  <div className="text-[10px] text-slate-400 text-right">{currentNotification.timestamp}</div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <div className="p-2.5 rounded-xl bg-slate-800 text-center text-xs font-bold text-emerald-400 border border-slate-700 flex items-center justify-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    <span>Download NAICOM Certificate</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-800 text-center text-xs font-bold text-slate-300 border border-slate-700 flex items-center justify-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Verify on NIID Portal</span>
                  </div>
                </div>
              </div>
            )}

            {activeChannel === "sms" && (
              <div className="max-w-md mx-auto rounded-3xl bg-slate-950 border border-slate-800 p-5 shadow-2xl space-y-3">
                <div className="text-center border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-400 font-mono">SMS &bull; ACTIONOS</span>
                </div>
                <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-900/60 text-xs text-slate-100 leading-relaxed font-mono">
                  {currentNotification.body}
                </div>
                <div className="text-[10px] text-slate-500 text-right">Delivered via Primary Route &bull; DND Override Active</div>
              </div>
            )}

            {activeChannel === "email" && (
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-5 shadow-2xl space-y-3 text-xs">
                <div className="border-b border-slate-800 pb-3 space-y-1">
                  <div className="text-slate-400"><strong className="text-slate-300">From:</strong> renewals@actionos.ng</div>
                  <div className="text-slate-400"><strong className="text-slate-300">Subject:</strong> {currentNotification.title}</div>
                </div>
                <div className="whitespace-pre-line text-slate-200 leading-relaxed font-sans bg-slate-900/50 p-4 rounded-xl border border-slate-800/80">
                  {currentNotification.body}
                </div>
                <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-mono font-bold text-slate-200">NAICOM-CERT-2026-00182.pdf</span>
                  </div>
                  <span className="text-[10px] font-bold text-purple-300">SHA-256 SEALED</span>
                </div>
              </div>
            )}

            {activeChannel === "in_app" && (
              <div className="max-w-md mx-auto rounded-3xl bg-slate-950 border border-slate-800 p-5 shadow-2xl space-y-3">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="text-xs font-bold text-white">{currentNotification.title}</div>
                    <div className="text-[11px] text-slate-300 leading-relaxed">{currentNotification.body}</div>
                    <div className="text-[10px] text-slate-500 pt-1">{currentNotification.timestamp}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span>Cryptographic Action Ledger Trace: Linked</span>
            <span className="font-mono text-emerald-400 font-bold">DISPATCH_CONFIRMED</span>
          </div>
        </div>
      </div>
    </div>
  );
}

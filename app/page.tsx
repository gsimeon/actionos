"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Zap,
  ArrowRight,
  Bot,
  Lock,
  Layers,
  FileCheck,
  Scale,
  Sparkles,
  Play,
} from "lucide-react";
import { ActionConsole } from "@/components/actionos/action-console";
import { JudgeGuidedTour } from "@/components/dashboard/judge-guided-tour";

export default function HomePage() {
  const [showTour, setShowTour] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-emerald-500 selection:text-white">
      {/* Top Navbar */}
      <nav className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xl sticky top-0 z-50 px-4 sm:px-8 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-tight text-slate-900">ActionOS</span>
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800 border border-emerald-300">
                  RENEW
                </span>
              </div>
              <span className="text-[10px] text-slate-500 block -mt-0.5 font-medium">
                NITDA 2026 AI Innovation Challenge
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-600">
            <a href="#demo" className="hover:text-emerald-700 transition-colors">
              Interactive Demo
            </a>
            <a href="#architecture" className="hover:text-emerald-700 transition-colors">
              Architecture
            </a>
            <a href="#differentiator" className="hover:text-emerald-700 transition-colors">
              The Action Layer
            </a>
            <a href="#features" className="hover:text-emerald-700 transition-colors">
              Capabilities
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 transition-all shadow-xs"
            >
              Sign In
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
            >
              <span>Launch App</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-16 sm:pt-24 pb-20 px-4 sm:px-8 max-w-7xl mx-auto overflow-hidden">
        {/* Ambient radial glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-r from-emerald-300/20 via-teal-200/20 to-transparent blur-3xl rounded-full pointer-events-none" />

        <div className="text-center max-w-4xl mx-auto relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold tracking-wide uppercase mb-6 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>NITDA National AI Innovation Challenge 2026</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-slate-900 tracking-tight leading-[1.08]">
            AI that doesn’t just understand. <br />
            <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 bg-clip-text text-transparent">
              It acts.
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-xl text-slate-700 font-medium max-w-2xl mx-auto leading-relaxed">
            &ldquo;N-ATLAS gives AI a Nigerian voice. ActionOS gives that voice the ability to act.&rdquo;
          </p>

          <p className="mt-2 text-xs sm:text-sm text-slate-600 max-w-xl mx-auto">
            ActionOS turns natural language and voice into secure, auditable business actions — governed by deterministic guardrails, human authorization gates, and cryptographic ledger verification.
          </p>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setShowTour(true)}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-emerald-600 to-teal-600 hover:from-amber-600 hover:to-teal-700 text-white font-black text-sm shadow-xl shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all flex items-center justify-center gap-2 active:scale-95 ring-2 ring-emerald-400/50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-200" />
              <span>⚡ 1-Click NITDA Judge Tour</span>
            </button>

            <a
              href="#demo"
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-lg shadow-slate-900/20 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Try Interactive Renewal</span>
            </a>

            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm border border-slate-300 shadow-xs transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 text-emerald-600" />
              <span>Enterprise Dashboard</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Signature Differentiator Comparison Section */}
      <section id="differentiator" className="py-16 px-4 sm:px-8 max-w-6xl mx-auto border-t border-slate-200">
        <div className="text-center mb-12">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            THE ARCHITECTURAL SHIFT
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
            Why ActionOS is NOT Merely a Chatbot
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-xl mx-auto">
            Traditional assistants stop at generating text. ActionOS provides deterministic action planning, authorization gates, and audit trails required for real enterprise operations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Traditional AI Box */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm relative">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                TRADITIONAL LLM ASSISTANT
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                Information Only
              </span>
            </div>
            <div className="space-y-4 font-mono text-xs text-slate-600">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-blue-600 font-bold">1. User</span>
                <span>&rarr; &quot;My car insurance expires next week.&quot;</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <span className="text-slate-600 font-bold">2. LLM</span>
                <span>&rarr; Generates helpful text about renewing insurance.</span>
              </div>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-sans leading-relaxed">
                &times; Cannot query live NAICOM database<br />
                &times; Cannot verify policy ownership<br />
                &times; Cannot execute bank settlement<br />
                &times; Cannot issue certified document
              </div>
            </div>
          </div>

          {/* ActionOS Box */}
          <div className="rounded-3xl border-2 border-emerald-500/50 bg-gradient-to-b from-white via-emerald-50/20 to-emerald-50/50 p-6 sm:p-8 shadow-xl shadow-emerald-500/5 relative">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                ACTIONOS ORCHESTRATION ENGINE
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                Real-World Action
              </span>
            </div>
            <div className="space-y-2.5 text-xs text-slate-800">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">1</span>
                <span><strong>AI Understanding:</strong> Multilingual N-ATLAS entity parsing with schema bounds</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">2</span>
                <span><strong>Action Plan:</strong> Ordered deterministic workflow with eligibility checks</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">3</span>
                <span><strong>Authorization Gate:</strong> Explicit customer confirmation before money moves</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">4</span>
                <span><strong>Controlled Execution:</strong> Sandboxed Paystack settlement & policy roll-forward</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-teal-800 text-[10px] font-bold">5</span>
                <span><strong>Cryptographic Audit:</strong> Action Ledger™ with SHA-256 Merkle hash chain</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Renewal Demo Sandbox Section */}
      <section id="demo" className="py-16 px-4 sm:px-8 max-w-5xl mx-auto border-t border-slate-200">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold uppercase tracking-wider mb-3 shadow-xs">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span>Interactive Demo Sandbox &bull; Simulated Settlement & Test Certificates</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
            Experience ActionOS in Action
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-xl mx-auto">
            Try the benchmark Toyota Camry (ABC-123-XY) renewal workflow below. Speak or type in Nigerian English, Pidgin, Yorùbá, Hausa, or Igbo.
          </p>
        </div>

        <Suspense fallback={<div className="h-64 animate-pulse bg-slate-100 rounded-3xl border border-slate-200" />}>
          <ActionConsole />
        </Suspense>
      </section>

      {/* 6 Core Pillars Section matching Section 38 */}
      <section id="features" className="py-20 px-4 sm:px-8 max-w-7xl mx-auto border-t border-slate-200">
        <div className="text-center mb-16">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            PLATFORM ARCHITECTURE
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
            Six Pillars of Safe Autonomous Action
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4 border border-emerald-100">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">1. Understand</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Native N-ATLAS multilingual voice adapter parsing English, Pidgin, Yorùbá, Hausa, and Igbo with deterministic schema validation to constrain AI outputs.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center mb-4 border border-teal-100">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">2. Plan</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Deterministic planner generating strictly ordered action plans before any state changes occur.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-4 border border-amber-100">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">3. Authorize</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Uncompromising authorization gates. AI can propose, but cannot move ₦1 without explicit user authorization.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-4 border border-blue-100">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">4. Execute</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Sandboxed tool execution through ToolRegistry with strict RBAC limits, tenant boundaries, and idempotency keys.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center mb-4 border border-purple-100">
              <Scale className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">5. Verify</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Independent out-of-band verification confirming bank settlement and database roll-forward before issuing completion.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4 border border-emerald-100">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">6. Audit</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Signature Action Ledger™ recording every actor, tool execution, and SHA-256 Merkle hash chain for independent, tamper-evident verification.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12 px-4 sm:px-8 text-center text-xs text-slate-600">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="font-bold text-slate-900">ActionOS</span>
            <span>&bull; Built for the 2026 NITDA National AI Innovation Challenge</span>
          </div>
          <div>
            N-ATLAS Voice &bull; Deterministic Execution Layer &bull; NAICOM Ready
          </div>
        </div>
      </footer>

      <JudgeGuidedTour isOpen={showTour} onClose={() => setShowTour(false)} />
    </div>
  );
}

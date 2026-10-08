"use client";

import React from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Radio,
  Search,
  Zap,
} from "lucide-react";

export function DashboardHeader() {
  return (
    <header className="border-b border-slate-200/90 bg-white/80 backdrop-blur-xl sticky top-0 z-40 px-4 sm:px-8 py-3 shadow-xs">
      {/* Simulation mode alert banner matching Section 12 & 41 */}
      <div className="mb-2 py-1.5 px-3 rounded-xl bg-amber-50 border border-amber-200/90 flex items-center justify-between text-xs text-amber-900 shadow-xs">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-bold text-amber-900">SIMULATION MODE:</span>
          <span className="hidden sm:inline text-amber-800">
            No real money is being charged. Bank rails and NAICOM certificates run on secure test fixtures.
          </span>
        </div>
        <span className="text-[10px] font-mono font-bold bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md text-amber-900">
          NITDA 2026 CHALLENGE
        </span>
      </div>

      <div className="flex items-center justify-between gap-4">
        {/* Breadcrumb or search */}
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative w-full hidden sm:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search policies, plates (ABC-123-XY), customers..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-xs"
            />
          </div>
          <Link
            href="/actions"
            className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold shadow-sm"
          >
            <Zap className="w-3.5 h-3.5" />
            Action Console
          </Link>
        </div>

        {/* Status badges and user */}
        <div className="flex items-center gap-3">
          {/* N-ATLAS Badge */}
          <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1.5 rounded-xl text-xs shadow-xs">
            <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span className="text-emerald-700 hidden sm:inline">AI Engine:</span>
            <span className="font-bold text-emerald-800">Demo AI Adapter</span>
          </div>

          {/* User profile badge */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-emerald-600/30">
              DC
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-bold text-slate-900 leading-tight">
                Demo Customer
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
                Customer &bull; CUS-000001
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

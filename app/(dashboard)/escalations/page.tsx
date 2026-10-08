"use client";

import React from "react";
import { HumanEscalationCenter } from "@/components/actionos/human-escalation-center";

export default function EscalationsPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Human Escalation & Safety Center
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Review deliberate execution halts, inspect regulatory safety invariants, and authorize high-trust supervisor overrides.
        </p>
      </div>

      <HumanEscalationCenter />
    </div>
  );
}

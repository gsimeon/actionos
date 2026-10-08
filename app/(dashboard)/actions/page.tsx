import React from "react";
import { ActionConsole } from "@/components/actionos/action-console";

export default function ActionsPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          ActionOS Workflow Console
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Interact using English, Nigerian Pidgin, Yoruba, Hausa, or Igbo to trigger real-world business actions with cryptographic verification and audit logging.
        </p>
      </div>

      <ActionConsole />
    </div>
  );
}

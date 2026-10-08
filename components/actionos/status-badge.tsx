import React from "react";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({ status, size = "md", className }: StatusBadgeProps) {
  const norm = status.toLowerCase();

  let colors = "bg-slate-100 text-slate-700 border-slate-200";
  let dotColor = "bg-slate-400";

  if (["active", "completed", "succeeded", "verified", "delivered", "generated"].includes(norm)) {
    colors = "bg-emerald-50 text-emerald-700 border-emerald-200";
    dotColor = "bg-emerald-500";
  } else if (
    ["expiring", "awaiting_confirmation", "awaiting_authorization", "payment_pending", "processing", "in_review", "pending"].includes(norm)
  ) {
    colors = "bg-amber-50 text-amber-800 border-amber-300";
    dotColor = "bg-amber-500 animate-pulse";
  } else if (["expired", "failed", "cancelled", "suspended"].includes(norm)) {
    colors = "bg-rose-50 text-rose-700 border-rose-200";
    dotColor = "bg-rose-500";
  } else if (["escalated"].includes(norm)) {
    colors = "bg-purple-50 text-purple-700 border-purple-200";
    dotColor = "bg-purple-500 animate-pulse";
  } else if (["renewed"].includes(norm)) {
    colors = "bg-teal-50 text-teal-700 border-teal-200";
    dotColor = "bg-teal-500";
  }

  const formatText = status.replace(/_/g, " ").toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-bold rounded-full border transition-all duration-150 shadow-xs",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        colors,
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColor)} />
      {formatText}
    </span>
  );
}

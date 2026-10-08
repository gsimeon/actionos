import React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: "emerald" | "amber" | "blue" | "purple";
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
  color = "emerald",
  className,
}: StatCardProps) {
  const colorStyles = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  }[color];

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all relative overflow-hidden group",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {title}
          </span>
          <div className="text-2xl font-black text-slate-900 mt-1 tracking-tight font-mono">
            {value}
          </div>
        </div>

        <div className={cn("p-2.5 rounded-xl border shrink-0 shadow-xs", colorStyles)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {(subtitle || trend) && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          {subtitle && <span className="text-slate-500 text-[11px] font-medium">{subtitle}</span>}
          {trend && (
            <span
              className={cn(
                "font-bold text-[11px]",
                trendUp ? "text-emerald-700" : "text-slate-500"
              )}
            >
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

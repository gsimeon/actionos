"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  Users,
  ShieldAlert,
  RotateCw,
  Receipt,
  FileText,
  Settings,
  ShieldCheck,
  ChevronRight,
  Hash,
  Bell,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Action Console", href: "/actions", icon: Zap, highlight: true },
  { name: "Renewals Pipeline", href: "/renewals", icon: RotateCw },
  { name: "Escalation Center", href: "/escalations", icon: AlertTriangle },
  { name: "Action Ledger", href: "/ledger", icon: Hash },
  { name: "Notifications Hub", href: "/notifications", icon: Bell },
  { name: "Policies", href: "/policies", icon: ShieldAlert },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Transactions", href: "/transactions", icon: Receipt },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Settings & Import", href: "/settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200/90 bg-white/95 backdrop-blur-xl flex flex-col justify-between hidden md:flex min-h-screen p-4 shadow-xs">
      <div>
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 px-3 py-3 mb-6 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-black tracking-tight text-slate-900">ActionOS</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-black text-emerald-800 border border-emerald-200">
                RENEW
              </span>
            </div>
            <span className="text-[10px] text-slate-500 block -mt-0.5 font-medium">
              Voice Action Layer
            </span>
          </div>
        </Link>

        {/* Navigation items */}
        <div className="space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Workflows & Operations
          </div>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group",
                  isActive
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200/90 shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      isActive
                        ? "text-emerald-700"
                        : "text-slate-400 group-hover:text-emerald-600",
                      item.highlight && !isActive && "text-emerald-600 font-bold"
                    )}
                  />
                  <span>{item.name}</span>
                </div>
                {item.highlight && !isActive && (
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                )}
                {isActive && <ChevronRight className="h-3.5 w-3.5 text-emerald-600" />}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Tenant / Demo Context Card */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 text-xs shadow-xs">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            ORGANIZATION
          </span>
          <span className="text-[9px] font-bold text-emerald-700 bg-white px-1.5 py-0.5 rounded border border-emerald-200 shadow-xs">
            DEMO MODE
          </span>
        </div>
        <div className="font-bold text-slate-900 truncate">ActionOS Demo Insurance</div>
        <div className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-1.5 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>NITDA 2026 Sandbox</span>
        </div>
      </div>
    </aside>
  );
}

"use client";

import React from "react";
import { NotificationMonitor } from "@/components/actionos/notification-monitor";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Multi-Channel Notification Architecture
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Inspect and test ActionOS automated customer notices across SMS (DND compliant), Email, In-App, and WhatsApp Business interactive templates.
        </p>
      </div>

      <NotificationMonitor />
    </div>
  );
}

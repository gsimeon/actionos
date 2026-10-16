"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Renewal } from "@/types/database";

interface UseRenewalsRealtimeProps {
  customerId?: string | null;
  onRenewalChange?: (renewal: Renewal, eventType: "INSERT" | "UPDATE" | "DELETE") => void;
  enabled?: boolean;
}

export function useRenewalsRealtime({
  customerId,
  onRenewalChange,
  enabled = true,
}: UseRenewalsRealtimeProps) {
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channelName = customerId
      ? `renewals-realtime-customer-${customerId}`
      : "renewals-realtime-all";

    const filter = customerId ? `customer_id=eq.${customerId}` : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "renewals",
          filter,
        },
        (payload) => {
          if (onRenewalChange) {
            const target = (payload.new || payload.old) as Renewal;
            onRenewalChange(target, payload.eventType as "INSERT" | "UPDATE" | "DELETE");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId, enabled, onRenewalChange]);
}

"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NotificationRecord } from "@/types/database";

interface UseNotificationsRealtimeProps {
  customerId?: string | null;
  onNotification?: (notification: NotificationRecord) => void;
  enabled?: boolean;
}

export function useNotificationsRealtime({
  customerId,
  onNotification,
  enabled = true,
}: UseNotificationsRealtimeProps) {
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channelName = customerId
      ? `notifications-realtime-customer-${customerId}`
      : "notifications-realtime-global";

    const filter = customerId ? `customer_id=eq.${customerId}` : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter,
        },
        (payload) => {
          if (onNotification && payload.new) {
            onNotification(payload.new as NotificationRecord);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId, enabled, onNotification]);
}

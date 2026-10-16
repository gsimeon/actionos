"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types/database";

interface UseTransactionsRealtimeProps {
  customerId?: string | null;
  onTransactionChange?: (transaction: Transaction, eventType: "INSERT" | "UPDATE" | "DELETE") => void;
  enabled?: boolean;
}

export function useTransactionsRealtime({
  customerId,
  onTransactionChange,
  enabled = true,
}: UseTransactionsRealtimeProps) {
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channelName = customerId
      ? `transactions-realtime-customer-${customerId}`
      : "transactions-realtime-all";

    const filter = customerId ? `customer_id=eq.${customerId}` : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter,
        },
        (payload) => {
          if (onTransactionChange) {
            const target = (payload.new || payload.old) as Transaction;
            onTransactionChange(target, payload.eventType as "INSERT" | "UPDATE" | "DELETE");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId, enabled, onTransactionChange]);
}

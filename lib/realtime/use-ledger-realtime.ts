"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ActionLedgerEvent } from "@/types/actionos";

interface UseLedgerRealtimeProps {
  sessionId?: string | null;
  onNewEvent?: (event: ActionLedgerEvent) => void;
  enabled?: boolean;
}

export function useLedgerRealtime({
  sessionId,
  onNewEvent,
  enabled = true,
}: UseLedgerRealtimeProps) {
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channelName = sessionId
      ? `ledger-realtime-session-${sessionId}`
      : "ledger-realtime-global";

    const filter = sessionId ? `session_id=eq.${sessionId}` : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "action_ledger_events",
          filter,
        },
        (payload) => {
          if (onNewEvent && payload.new) {
            const raw = payload.new as Record<string, unknown>;
            const actor = (raw.actor as ActionLedgerEvent["actor"]) || "ActionOS Engine";
            const event: ActionLedgerEvent = {
              id: (raw.id as string) || "",
              sessionId: (raw.session_id as string) || "",
              sequenceNumber: (raw.sequence_number as number) || 0,
              timestamp: (raw.created_at as string) || new Date().toISOString(),
              action: (raw.action as string) || "",
              tool: (raw.tool_name as string) || undefined,
              status: (raw.status as ActionLedgerEvent["status"]) || "verified",
              actor,
              description: (raw.description as string) || "",
              metadata: (raw.metadata as Record<string, unknown>) || {},
              referenceId: (raw.reference_id as string) || undefined,
              hash: (raw.event_hash as string) || "",
              previousHash: (raw.previous_event_hash as string) || "",
              signature: (raw.signature as string) || "",
              signingKeyVersion: (raw.key_version as string) || "v1",
              isCompensating: Boolean(raw.is_compensating),
            };
            onNewEvent(event);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, enabled, onNewEvent]);
}

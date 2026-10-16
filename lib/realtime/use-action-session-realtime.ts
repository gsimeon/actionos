"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ActionSession, ActionStep } from "@/types/database";

interface UseActionSessionRealtimeProps {
  sessionId: string | null;
  onSessionUpdate?: (session: ActionSession) => void;
  onStepUpdate?: (step: ActionStep) => void;
  enabled?: boolean;
}

export function useActionSessionRealtime({
  sessionId,
  onSessionUpdate,
  onStepUpdate,
  enabled = true,
}: UseActionSessionRealtimeProps) {
  useEffect(() => {
    if (!sessionId || !enabled) return;

    const supabase = createClient();
    const channelName = `session-realtime-${sessionId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "action_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          if (onSessionUpdate && payload.new) {
            onSessionUpdate(payload.new as ActionSession);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "action_steps",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (onStepUpdate && payload.new) {
            onStepUpdate(payload.new as ActionStep);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, enabled, onSessionUpdate, onStepUpdate]);
}

//! Subscribe to the engine's events for one user via Supabase Realtime.
//!
//! The in-box engine forwards every HoustonEvent into `public.houston_events`
//! (the cloud sink). We listen for INSERTs filtered to this user. RLS gates the
//! rows to the user, so the browser client must have called `realtime.setAuth`
//! (handled in `@/lib/supabase/client`) or these events never arrive.

"use client";

import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface EngineEventRow {
  id: number;
  topic: string;
  event_type: string;
  payload: unknown;
  created_at: string;
}

export function useEngineEvents(userId: string | null): EngineEventRow[] {
  const [events, setEvents] = useState<EngineEventRow[]>([]);

  useEffect(() => {
    if (!userId) {
      setEvents([]);
      return;
    }
    const supabase = createClient();
    const channel = supabase
      .channel(`houston_events:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "houston_events",
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresInsertPayload<EngineEventRow>) => {
          setEvents((prev) => [...prev, payload.new]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return events;
}

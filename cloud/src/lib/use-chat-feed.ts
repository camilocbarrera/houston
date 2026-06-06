//! Reconstruct chat feeds from the cloud event stream.
//!
//! The in-box engine forwards every HoustonEvent into `public.houston_events`
//! (the cloud sink). The desktop builds its chat by folding `FeedItem` events
//! through `mergeFeedItem` (see `app/src/stores/feeds.ts`); we do the exact
//! same fold here, but sourced from Supabase instead of the engine WebSocket —
//! same reducer, same `@houston-ai/chat` types, so the chat renders identically.
//!
//! On mount we backfill from the table (full history) then subscribe to live
//! INSERTs, so opening a second device shows the whole conversation AND stays
//! live — the multi-device sync demo.

"use client";

import { mergeFeedItem } from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";
import type { HoustonEvent } from "@houston-ai/core";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface EventRow {
  id: number;
  event_type: string;
  payload: HoustonEvent;
  created_at: string;
}

export type SessionRunStatus = "starting" | "running" | "completed" | "error";

/** agentPath → sessionKey → feed items */
export type AgentFeeds = Record<string, Record<string, FeedItem[]>>;
/** agentPath → sessionKey → latest run status */
export type SessionStatuses = Record<string, Record<string, SessionRunStatus>>;

export interface ChatFeedState {
  feeds: AgentFeeds;
  statuses: SessionStatuses;
  /** Bumped whenever an activity-related event arrives, so consumers can
   *  refetch the board (activity create/status-flip/delete). */
  activityTick: number;
  /** Bumped whenever the workspace agent roster changes (agent created /
   *  deleted / renamed / recolored on ANY client), so the shell refetches the
   *  sidebar list — this is what makes a new agent appear live in every open
   *  client at the same time. */
  agentsTick: number;
  /** Bumped on Composio lifecycle/connection events so the Integrations tab
   *  refetches status + connected toolkits live (a connection landing fires
   *  ComposioConnectionAdded). */
  composioTick: number;
}

/** Fold one event into the prior state (pure — used for backfill + live). */
function reduceEvent(state: ChatFeedState, ev: HoustonEvent): ChatFeedState {
  if (ev.type === "FeedItem") {
    const { agent_path, session_key, item } = ev.data;
    const agentBucket = state.feeds[agent_path] ?? {};
    const next = mergeFeedItem(agentBucket[session_key] ?? [], item as FeedItem);
    return {
      ...state,
      feeds: {
        ...state.feeds,
        [agent_path]: { ...agentBucket, [session_key]: next },
      },
    };
  }
  // Activity create / status-flip / delete → nudge consumers to refetch the
  // board. The engine owns the terminal status flip (→ needs_you) and emits
  // ActivityChanged; we don't parse it, just count it.
  if (ev.type.startsWith("Activit")) {
    return { ...state, activityTick: state.activityTick + 1 };
  }
  // Agent roster changed somewhere — nudge consumers to refetch /api/agents.
  if (ev.type === "AgentsChanged") {
    return { ...state, agentsTick: state.agentsTick + 1 };
  }
  // Composio CLI/connection lifecycle — refetch Integrations state.
  if (ev.type === "ComposioConnectionAdded" || ev.type === "ComposioCliReady") {
    return { ...state, composioTick: state.composioTick + 1 };
  }
  if (ev.type === "SessionStatus") {
    const { agent_path, session_key, status } = ev.data;
    if (
      status === "starting" ||
      status === "running" ||
      status === "completed" ||
      status === "error"
    ) {
      const agentBucket = state.statuses[agent_path] ?? {};
      return {
        ...state,
        statuses: {
          ...state.statuses,
          [agent_path]: { ...agentBucket, [session_key]: status },
        },
      };
    }
  }
  return state;
}

const EMPTY: ChatFeedState = {
  feeds: {},
  statuses: {},
  activityTick: 0,
  agentsTick: 0,
  composioTick: 0,
};

export function useChatFeed(userId: string | null): ChatFeedState {
  const [state, setState] = useState<ChatFeedState>(EMPTY);

  useEffect(() => {
    if (!userId) {
      setState(EMPTY);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    // Backfill: replay the whole history, then go live. RLS scopes rows to the
    // user; the browser client called `realtime.setAuth` so reads + Realtime
    // both pass.
    void supabase
      .from("houston_events")
      .select("id, event_type, payload, created_at")
      .order("created_at", { ascending: true })
      .then(({ data, error }: { data: EventRow[] | null; error: unknown }) => {
        if (cancelled || error || !data) return;
        setState((prev) =>
          (data as EventRow[]).reduce((acc, row) => reduceEvent(acc, row.payload), prev),
        );
      });

    const channel = supabase
      .channel(`houston_feed:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "houston_events",
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresInsertPayload<EventRow>) => {
          setState((prev) => reduceEvent(prev, payload.new.payload));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return state;
}

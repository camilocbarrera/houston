/**
 * Cloud event source — the desktop's realtime feed when in cloud-engine mode.
 *
 * In local mode the desktop folds the engine's WebSocket firehose. In cloud
 * mode the box freezes when idle and can't hold a reliable WS, so instead we
 * fold the SAME Supabase `houston_events` stream the web client uses (the box
 * forwards every HoustonEvent there via its cloud sink). One shared realtime
 * channel for every client → all clients react to the identical stream and show
 * the same information at the same time. This is the agora-chat pattern applied
 * to Houston: Supabase Realtime is the single sync transport.
 *
 * Live-only (no backfill): initial board/agent state still comes from the box
 * over REST, exactly like local mode loads from its engine; this stream carries
 * the live deltas (FeedItem / SessionStatus / *Changed) on top.
 *
 * RLS scopes `houston_events` to the signed-in user, so the socket only needs
 * `realtime.setAuth(token)` and no explicit user filter — the server drops
 * other users' rows. Without setAuth, RLS silently drops everything.
 */

import type { HoustonEvent } from "@houston-ai/core";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { logger } from "./logger";

interface EventRow {
  payload: HoustonEvent;
}

// One shared channel + fan-out, so the several hooks that subscribe (session
// events, query invalidation, analytics) don't each open a socket.
const handlers = new Set<(ev: HoustonEvent) => void>();
let channel: RealtimeChannel | null = null;
let started = false;

function ensureChannel(): void {
  if (started) return;
  started = true;

  // Authenticate the realtime socket with the user's JWT (RLS gate).
  void supabase.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (token) supabase.realtime.setAuth(token);
  });
  supabase.auth.onAuthStateChange((_e, session) => {
    if (session?.access_token) supabase.realtime.setAuth(session.access_token);
  });

  channel = supabase
    .channel("houston_cloud_events")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "houston_events" },
      (payload) => {
        const ev = (payload.new as EventRow | undefined)?.payload;
        if (!ev) return;
        for (const h of handlers) {
          try {
            h(ev);
          } catch (err) {
            logger.warn(`[cloud-events] handler threw: ${err}`);
          }
        }
      },
    )
    .subscribe((status) => {
      logger.info(`[cloud-events] channel status: ${status}`);
    });
}

/**
 * Subscribe to the cloud event stream. Mirrors `subscribeHoustonEvents`'s
 * contract (returns an unsubscribe). The underlying channel is shared and torn
 * down once the last subscriber leaves.
 */
export function subscribeCloudEvents(handler: (ev: HoustonEvent) => void): () => void {
  handlers.add(handler);
  ensureChannel();
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0 && channel) {
      void supabase.removeChannel(channel);
      channel = null;
      started = false;
    }
  };
}

//! Browser Supabase client. One instance reused across the app so Realtime
//! channels share a single socket.
//!
//! Realtime `postgres_changes` are RLS-filtered by the user's JWT, so the socket
//! MUST carry the access token (`realtime.setAuth`) or RLS silently drops every
//! change — you'd never see the engine's events. Set eagerly + on every auth
//! change (the gotcha learned from the agora-chat reference).

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (browserClient) return browserClient;

  const client = createBrowserClient(
    publicEnv.SUPABASE_URL,
    publicEnv.SUPABASE_ANON_KEY,
  );
  browserClient = client;

  client.auth.getSession().then(({ data }) => {
    if (data.session?.access_token) {
      client.realtime.setAuth(data.session.access_token);
    }
  });
  client.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token) {
      client.realtime.setAuth(session.access_token);
    }
  });

  return client;
}

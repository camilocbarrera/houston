//! Houston Cloud web client (demo spine).
//!
//! Sign in (Supabase magic link) → provision-or-get your engine box → watch the
//! box's events stream in live over Supabase Realtime. This is the smallest end
//! to-end proof of the architecture: backend (API routes) + frontend + auth in
//! one Next.js app, talking to a per-user engine box.

"use client";

import type { AuthChangeEvent, Session, UserResponse } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEngineEvents } from "@/lib/use-engine-events";

interface BoxHandle {
  id: string;
  baseUrl: string;
  token: string;
  provider: string;
}

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [box, setBox] = useState<BoxHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const events = useEngineEvents(userId);

  // Track auth state.
  useEffect(() => {
    const supabase = createClient();
    void supabase.auth
      .getUser()
      .then((res: UserResponse) => setUserId(res.data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_e: AuthChangeEvent, session: Session | null) => {
        setUserId(session?.user?.id ?? null);
      },
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load any existing box once signed in.
  useEffect(() => {
    if (!userId) {
      setBox(null);
      return;
    }
    fetch("/api/me/box")
      .then((r) => r.json())
      .then((d) => setBox(d.box ?? null))
      .catch((e) => setNotice(String(e)));
  }, [userId]);

  const signIn = useCallback(async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email });
    setNotice(error ? error.message : `Magic link sent to ${email}.`);
  }, [email]);

  const signOut = useCallback(async () => {
    await createClient().auth.signOut();
  }, []);

  const provision = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/provision", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Provision failed");
      setBox(data.box);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Houston Cloud</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>
        Your engine, hosted. One box per user, synced live.
      </p>

      {!userId ? (
        <section style={card}>
          <h2 style={h2}>Sign in</h2>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />
          <button type="button" onClick={signIn} disabled={!email} style={button}>
            Send magic link
          </button>
        </section>
      ) : (
        <section style={card}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <h2 style={h2}>Your box</h2>
            <button type="button" onClick={signOut} style={linkButton}>
              Sign out
            </button>
          </div>
          {box ? (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
              {box.provider} · <span style={{ color: "#8ab4ff" }}>{box.baseUrl}</span>
            </p>
          ) : (
            <button type="button" onClick={provision} disabled={busy} style={button}>
              {busy ? "Provisioning…" : "Deploy my engine"}
            </button>
          )}
        </section>
      )}

      {userId && (
        <section style={card}>
          <h2 style={h2}>Live events ({events.length})</h2>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {events.length === 0 ? (
              <p style={{ opacity: 0.5 }}>Waiting for the engine…</p>
            ) : (
              events
                .slice()
                .reverse()
                .map((ev) => (
                  <div key={ev.id} style={eventRow}>
                    <span style={{ color: "#8ab4ff" }}>{ev.event_type}</span>{" "}
                    <span style={{ opacity: 0.6 }}>{ev.topic}</span>
                  </div>
                ))
            )}
          </div>
        </section>
      )}

      {notice && <p style={{ color: "#ffb86b", fontSize: 14 }}>{notice}</p>}
    </main>
  );
}

const card: React.CSSProperties = {
  background: "#15151c",
  border: "1px solid #26262f",
  borderRadius: 12,
  padding: 20,
  marginTop: 20,
};
const h2: React.CSSProperties = { fontSize: 16, margin: "0 0 12px" };
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #33333f",
  background: "#0b0b0f",
  color: "#e7e7ea",
  marginBottom: 12,
  boxSizing: "border-box",
};
const button: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "#3b6cff",
  color: "white",
  fontWeight: 600,
  cursor: "pointer",
};
const linkButton: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#8ab4ff",
  cursor: "pointer",
  fontSize: 13,
};
const eventRow: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 13,
  padding: "4px 0",
  borderBottom: "1px solid #1e1e26",
};

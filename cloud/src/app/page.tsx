//! Houston Cloud web client.
//!
//! Sign in (Supabase magic link) → provision-or-get your engine box → chat with
//! your cloud agents using the SAME ChatPanel the desktop app ships. Feed items
//! sync live over Supabase Realtime, so every signed-in device is a window into
//! one cloud brain: send from one, watch it stream on the others.

"use client";

import type { AuthChangeEvent, Session, UserResponse } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { CloudChat } from "@/components/cloud-chat";
import { createClient } from "@/lib/supabase/client";
import { useChatFeed } from "@/lib/use-chat-feed";

interface BoxHandle {
  id: string;
  baseUrl: string;
  token: string;
  provider: string;
}
interface Agent {
  id: string;
  name: string;
  folderPath: string;
  color?: string;
}

/** Stable one-conversation-per-agent key for the demo. */
const sessionKeyFor = (agent: Agent) => `cloud-${agent.id}`;

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [box, setBox] = useState<BoxHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bootMsg, setBootMsg] = useState<string | null>(null);
  const [newAgentName, setNewAgentName] = useState("");

  const { feeds, statuses } = useChatFeed(userId);

  // Track auth state.
  useEffect(() => {
    const supabase = createClient();
    void supabase.auth
      .getUser()
      .then((res: UserResponse) => setUserId(res.data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_e: AuthChangeEvent, session: Session | null) => setUserId(session?.user?.id ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load any existing box once signed in.
  useEffect(() => {
    if (!userId) {
      setBox(null);
      setAgents([]);
      return;
    }
    fetch("/api/me/box")
      .then((r) => r.json())
      .then((d) => setBox(d.box ?? null))
      .catch((e) => setNotice(String(e)));
  }, [userId]);

  // Once a box exists, bootstrap + load agents — retrying while the engine
  // finishes booting (binary download + launch can take ~10-20s on a fresh box).
  useEffect(() => {
    if (!box) return;
    let cancelled = false;
    setBootMsg("Waking your engine…");
    (async () => {
      for (let attempt = 0; attempt < 12 && !cancelled; attempt++) {
        try {
          const res = await fetch("/api/agents");
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Failed to load agents");
          if (cancelled) return;
          setAgents(data.agents);
          setActiveId((cur) => cur ?? data.agents[0]?.id ?? null);
          setBootMsg(null);
          return;
        } catch (err) {
          if (attempt === 11) {
            setBootMsg(null);
            setNotice(err instanceof Error ? err.message : String(err));
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [box]);

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

  const createAgent = useCallback(async () => {
    const name = newAgentName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create agent");
      setAgents((prev) => [...prev, data.agent]);
      setActiveId(data.agent.id);
      setNewAgentName("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }, [newAgentName]);

  // --- Signed out ---
  if (!userId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 p-6">
        <h1 className="text-2xl font-semibold">Houston Cloud</h1>
        <p className="text-sm text-muted-foreground">Your engine, hosted. Synced live.</p>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none"
        />
        <button
          type="button"
          onClick={signIn}
          disabled={!email}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Send magic link
        </button>
        {notice && <p className="text-sm text-warning">{notice}</p>}
      </main>
    );
  }

  const active = agents.find((a) => a.id === activeId) ?? null;
  const sessionKey = active ? sessionKeyFor(active) : "";
  const feedItems = active ? (feeds[active.folderPath]?.[sessionKey] ?? []) : [];
  const running = active
    ? ["starting", "running"].includes(statuses[active.folderPath]?.[sessionKey] ?? "")
    : false;

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold">Houston Cloud</span>
        <button type="button" onClick={signOut} className="text-xs text-muted-foreground">
          Sign out
        </button>
      </header>

      {!box ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">No engine yet.</p>
          <button
            type="button"
            onClick={provision}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Provisioning…" : "Deploy my engine"}
          </button>
          {notice && <p className="text-sm text-warning">{notice}</p>}
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-border bg-sidebar p-2">
            <span className="px-2 py-1 text-xs font-medium text-muted-foreground">Agents</span>
            {agents.map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => setActiveId(a.id)}
                className={`rounded-md px-2 py-1.5 text-left text-sm ${
                  a.id === activeId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
                }`}
              >
                {a.name}
              </button>
            ))}
            <div className="mt-2 flex gap-1">
              <input
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createAgent()}
                placeholder="New agent"
                className="min-w-0 flex-1 rounded-md border border-input bg-card px-2 py-1 text-xs outline-none"
              />
              <button
                type="button"
                onClick={createAgent}
                className="rounded-md bg-secondary px-2 text-xs text-secondary-foreground"
              >
                +
              </button>
            </div>
            {bootMsg && <p className="px-2 pt-2 text-xs text-muted-foreground">{bootMsg}</p>}
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            {active ? (
              <CloudChat
                key={active.id}
                agentPath={active.folderPath}
                sessionKey={sessionKey}
                feedItems={feedItems}
                running={running}
                onError={setNotice}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {bootMsg ?? "Select an agent."}
              </div>
            )}
            {notice && <p className="border-t border-border px-4 py-2 text-sm text-warning">{notice}</p>}
          </section>
        </div>
      )}
    </main>
  );
}

//! Houston Cloud entry: auth + box gate, then the full desktop shell.
//!
//! Sign in (Supabase magic link) → provision-or-get your engine box → render the
//! SAME desktop UI (CloudShell, built from @houston-ai/* components) pointed at
//! that box. The shell is heavy + client-only, so it's loaded with ssr:false.

"use client";

import type { AuthChangeEvent, Session, UserResponse } from "@supabase/supabase-js";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const CloudShell = dynamic(
  () => import("@/components/cloud-shell").then((m) => m.CloudShell),
  { ssr: false, loading: () => <Centered>Loading…</Centered> },
);

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

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then((res: UserResponse) => setUserId(res.data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_e: AuthChangeEvent, session: Session | null) => setUserId(session?.user?.id ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

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
    const { error } = await createClient().auth.signInWithOtp({ email });
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

  if (userId && box) {
    return <CloudShell userId={userId} onSignOut={signOut} />;
  }

  return (
    <Centered>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <h1 className="text-2xl font-semibold">Houston Cloud</h1>
        <p className="text-sm text-muted-foreground">Your engine, hosted. Synced live.</p>
        {!userId ? (
          <>
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
          </>
        ) : (
          <button
            type="button"
            onClick={provision}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Provisioning…" : "Deploy my engine"}
          </button>
        )}
        {notice && <p className="text-sm text-warning">{notice}</p>}
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      {children}
    </main>
  );
}

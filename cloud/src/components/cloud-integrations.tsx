//! Composio integrations for the cloud Integrations tab.
//!
//! Headless-friendly: login is a paste-back flow (open the login URL, paste the
//! key back), and connecting a toolkit opens an authorize URL in a new tab. The
//! engine's connection watcher emits ComposioConnectionAdded → Supabase →
//! `composioTick` bumps here → we refetch and the toolkit flips to "Connected".

"use client";

import { useCallback, useEffect, useState } from "react";
import type { ComposioApp, ComposioStatus } from "@/lib/server/engine";

interface State {
  status: ComposioStatus;
  apps: ComposioApp[];
  connections: string[];
}

export function CloudIntegrations({
  composioTick,
  onError,
}: {
  composioTick: number;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [login, setLogin] = useState<{ loginUrl: string; cliKey: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/composio");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load integrations");
      setState(data);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void refetch();
  }, [refetch, composioTick]);

  const startLogin = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/composio/login", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login failed to start");
      setLogin({ loginUrl: data.login_url, cliKey: data.cli_key });
      window.open(data.login_url, "_blank", "noopener");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [onError]);

  const completeLogin = useCallback(async () => {
    if (!login) return;
    setBusy(true);
    try {
      const res = await fetch("/api/composio/login/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliKey: login.cliKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login completion failed");
      setLogin(null);
      await refetch();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [login, onError, refetch]);

  const connect = useCallback(
    async (toolkit: string) => {
      try {
        const res = await fetch("/api/composio/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolkit }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Connect failed");
        window.open(data.redirect_url, "_blank", "noopener");
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    },
    [onError],
  );

  if (loading) {
    return <Centered>Loading integrations…</Centered>;
  }

  // Not authenticated → login (paste-back).
  if (!state || state.status.status !== "ok") {
    return (
      <Centered>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">Connect Composio</h2>
          <p className="text-sm text-muted-foreground">
            Link your Composio account to give your agents tools (Gmail, Slack, and more).
          </p>
          {!login ? (
            <button
              type="button"
              onClick={startLogin}
              disabled={busy}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Starting…" : "Connect Composio"}
            </button>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Approve Houston in the Composio tab that opened, then click below.
              </p>
              <button
                type="button"
                onClick={completeLogin}
                disabled={busy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Finishing…" : "I've approved — finish"}
              </button>
              <button
                type="button"
                onClick={() => window.open(login.loginUrl, "_blank", "noopener")}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Reopen Composio login
              </button>
            </>
          )}
        </div>
      </Centered>
    );
  }

  // Authenticated → toolkit catalog.
  const connected = new Set(state.connections);
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-foreground">Integrations</h2>
          {state.status.email && (
            <span className="text-xs text-muted-foreground">{state.status.email}</span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {state.apps.map((app) => {
            const isConnected = connected.has(app.toolkit);
            return (
              <div
                key={app.toolkit}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                {app.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={app.logo_url} alt="" className="h-8 w-8 rounded" />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{app.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{app.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => connect(app.toolkit)}
                  disabled={isConnected}
                  className="shrink-0 rounded-md border border-input px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
                >
                  {isConnected ? "Connected" : "Connect"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-6 text-sm">{children}</div>;
}

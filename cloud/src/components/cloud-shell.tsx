//! Houston Cloud shell — the SAME desktop UI, recomposed from @houston-ai/*:
//! AppSidebar + WorkspaceSwitcher + TabBar (@houston-ai/layout) around the
//! Activity board (CloudBoard → @houston-ai/board AIBoard). Data is cloud-wired:
//! workspaces/agents/activities over REST, chat feed over Supabase Realtime.
//!
//! Rendered ssr:false (heavy client-only components) by page.tsx.

"use client";

import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { AppSidebar, TabBar, WorkspaceSwitcher } from "@houston-ai/layout";
import type { SidebarItem } from "@houston-ai/layout";
import { Blend, LayoutDashboard, Menu, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CloudBoard } from "@/components/cloud-board";
import { CloudIntegrations } from "@/components/cloud-integrations";
import { CloudUserMenu } from "@/components/cloud-user-menu";
import type { Activity } from "@/lib/server/engine";
import { useChatFeed } from "@/lib/use-chat-feed";

interface Agent {
  id: string;
  name: string;
  folderPath: string;
  color?: string;
}
interface Workspace {
  id: string;
  name: string;
}

const TABS = [
  { id: "activity", label: "Activity" },
  { id: "routines", label: "Routines" },
  { id: "files", label: "Files" },
  { id: "job-description", label: "Job Description" },
  { id: "integrations", label: "Integrations" },
  { id: "archived", label: "Archived" },
];

export function CloudShell({ userId, onSignOut }: { userId: string; onSignOut: () => void }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("activity");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [boot, setBoot] = useState("Waking your engine…");
  // Mobile sidebar drawer (off-canvas on < md; always visible on md+).
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { feeds, statuses, activityTick, agentsTick, composioTick } = useChatFeed(userId);
  const active = agents.find((a) => a.id === activeAgentId) ?? null;

  // Bootstrap: workspaces + agents (retries while the box engine boots).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 12 && !cancelled; i++) {
        try {
          const [wsRes, agRes] = await Promise.all([
            fetch("/api/workspaces").then((r) => r.json()),
            fetch("/api/agents").then((r) => r.json()),
          ]);
          if (cancelled) return;
          if (wsRes.workspaces) setWorkspaces(wsRes.workspaces);
          if (agRes.agents) {
            setAgents(agRes.agents);
            setActiveAgentId((cur) => cur ?? agRes.agents[0]?.id ?? null);
            setBoot("");
            return;
          }
          throw new Error(agRes.error ?? "loading");
        } catch {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      if (!cancelled) setBoot("");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // (Re)load the active agent's activities — on switch and on every engine
  // ActivityChanged (activityTick) so status flips land on the board live.
  const reloadActivities = useCallback(() => {
    if (!active) return;
    fetch(`/api/activities?agentPath=${encodeURIComponent(active.folderPath)}`)
      .then((r) => r.json())
      .then((d) => d.activities && setActivities(d.activities))
      .catch((e) => setNotice(String(e)));
  }, [active]);

  useEffect(() => {
    reloadActivities();
  }, [reloadActivities, activityTick]);

  // Roster reactivity: when ANY client adds / renames / recolors an agent, the
  // box emits AgentsChanged → Supabase → agentsTick bumps here → refetch the
  // list so the new agent appears live in every open client. Skipped on the
  // first render (agentsTick 0) since the bootstrap effect already loaded it.
  useEffect(() => {
    if (agentsTick === 0) return;
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        if (d.agents) {
          setAgents(d.agents);
          setActiveAgentId((cur) => cur ?? d.agents[0]?.id ?? null);
        }
      })
      .catch((e) => setNotice(String(e)));
  }, [agentsTick]);

  const createAgent = useCallback(async () => {
    const name = window.prompt("New agent name");
    if (!name?.trim()) return;
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create agent");
      setAgents((prev) => [...prev, data.agent]);
      setActiveAgentId(data.agent.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Colored Houston-helmet avatar per agent — the SAME glyph the desktop renders
  // (AgentSidebarIcon). Running glow when any of the agent's sessions is live.
  const items: SidebarItem[] = agents.map((a) => {
    const agentStatuses = statuses[a.folderPath] ?? {};
    const running = Object.values(agentStatuses).some(
      (s) => s === "running" || s === "starting",
    );
    return {
      id: a.id,
      name: a.name,
      icon: <HoustonAvatar color={resolveAgentColor(a.color)} diameter={20} running={running} />,
    };
  });
  // Selecting anything from the sidebar also closes the mobile drawer.
  const pick = (fn: () => void) => () => {
    fn();
    setDrawerOpen(false);
  };
  const navItems = [
    { id: "dashboard", label: "Mission Control", icon: <LayoutDashboard className="h-4 w-4" />, onClick: pick(() => setActiveTab("activity")) },
    { id: "connections", label: "Integrations", icon: <Blend className="h-4 w-4" />, onClick: pick(() => setActiveTab("integrations")) },
    { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" />, onClick: () => {} },
  ];

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <AppSidebar
        header={
          <WorkspaceSwitcher
            workspaces={workspaces}
            currentId={workspaces[0]?.id ?? null}
            currentName={workspaces[0]?.name ?? "Personal"}
            onSwitch={() => {}}
            onCreate={() => setNotice("Workspace creation is coming soon.")}
          />
        }
        navItems={navItems}
        sectionLabel="Your Agents"
        items={items}
        selectedId={activeAgentId}
        onSelect={(id) => {
          setActiveAgentId(id);
          setDrawerOpen(false);
        }}
        onAdd={createAgent}
        footer={<CloudUserMenu onSignOut={onSignOut} />}
        mobileOpen={drawerOpen}
        onMobileClose={() => setDrawerOpen(false)}
      >
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Mobile top bar: hamburger opens the sidebar drawer. Hidden on md+. */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 md:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="rounded-md p-1 text-foreground hover:bg-accent"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate text-sm font-semibold text-foreground">
              {active?.name ?? "Houston Cloud"}
            </span>
          </div>
          {active ? (
            <>
              <TabBar title={active.name} tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
              <div className="min-h-0 flex-1">
                {activeTab === "activity" ? (
                  <CloudBoard
                    key={active.id}
                    agentPath={active.folderPath}
                    agentName={active.name}
                    activities={activities}
                    feedItems={feeds[active.folderPath] ?? {}}
                    statuses={statuses[active.folderPath] ?? {}}
                    onMutated={reloadActivities}
                    onError={setNotice}
                  />
                ) : activeTab === "integrations" ? (
                  <CloudIntegrations composioTick={composioTick} onError={setNotice} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {TABS.find((t) => t.id === activeTab)?.label} — coming soon
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {boot || "Select an agent."}
            </div>
          )}
        </main>
      </AppSidebar>
      {notice && (
        <div className="fixed inset-x-4 bottom-4 z-[60] rounded-lg border border-border bg-card px-4 py-2 text-sm text-warning shadow md:inset-x-auto md:right-4 md:max-w-sm">
          {notice}
        </div>
      )}
    </div>
  );
}

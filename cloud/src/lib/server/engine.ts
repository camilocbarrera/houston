//! Server-side REST client for an in-box Houston engine.
//!
//! Why not reuse `@houston-ai/engine-client`? That client authenticates REST
//! calls with an `Authorization: Bearer` header — and the Upstash Box preview
//! proxy STRIPS that header (verified: localhost+token → 200, preview+token via
//! header → 401). The engine also accepts `?token=` (auth.rs), which the proxy
//! leaves intact, so cloud talks to its boxes that way. These helpers run only
//! in Next route handlers, so the token never reaches the browser.
//!
//! Beta policy — no silent failures: every call throws the engine's real error
//! message (`{ error: { message } }`) so the route handler can surface it.

/** The bits of a provisioned box these helpers need. */
export interface EngineTarget {
  baseUrl: string;
  token: string;
}

export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  folderPath: string;
  configId: string;
  color?: string;
  createdAt: string;
}

export interface CreateAgentRequest {
  name: string;
  configId: string;
  color?: string;
  claudeMd?: string;
  seeds?: Record<string, string>;
}

export interface StartSessionRequest {
  sessionKey: string;
  prompt: string;
  systemPrompt?: string;
  provider?: string;
  model?: string;
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  status: string;
  session_key?: string;
  agent?: string;
  updated_at?: string;
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

/** One round-trip to the in-box engine, authenticated via `?token=`. */
async function call<T>(
  target: EngineTarget,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const base = target.baseUrl.replace(/\/$/, "");
  const sep = path.includes("?") ? "&" : "?";
  const url = `${base}/v1${path}${sep}token=${encodeURIComponent(target.token)}`;

  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // The engine box is external; don't let Next cache mutations or reads.
    cache: "no-store",
  });

  if (!res.ok) {
    const parsed = (await res.json().catch(() => null)) as ErrorBody | null;
    const message =
      parsed?.error?.message ?? `Engine ${method} ${path} failed (${res.status})`;
    throw new Error(message);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return (await res.json()) as T;
}

const seg = (s: string) => encodeURIComponent(s);

export function health(target: EngineTarget): Promise<{ status: string; version: string }> {
  return call(target, "GET", "/health");
}

export function listWorkspaces(target: EngineTarget): Promise<Workspace[]> {
  return call(target, "GET", "/workspaces");
}

export function createWorkspace(target: EngineTarget, name: string): Promise<Workspace> {
  return call(target, "POST", "/workspaces", { name });
}

export function listAgents(target: EngineTarget, workspaceId: string): Promise<Agent[]> {
  return call(target, "GET", `/workspaces/${seg(workspaceId)}/agents`);
}

export async function createAgent(
  target: EngineTarget,
  workspaceId: string,
  req: CreateAgentRequest,
): Promise<Agent> {
  const result = await call<{ agent: Agent }>(
    target,
    "POST",
    `/workspaces/${seg(workspaceId)}/agents`,
    req,
  );
  return result.agent;
}

export function startSession(
  target: EngineTarget,
  agentPath: string,
  req: StartSessionRequest,
): Promise<{ sessionKey: string }> {
  // The preview proxy percent-decodes the URL path before the engine routes it,
  // which corrupts an agent path carried as an encoded path segment (slashes
  // collapse → routing 404; double-encoding resolves to a garbage relative
  // dir). So pass the agent path in the BODY (never path-decoded) and POST to a
  // sentinel segment — the engine's `StartRequest.agentPath` wins over the URL.
  return call(target, "POST", `/agents/_/sessions`, { ...req, agentPath });
}

/** Start the filesystem watcher so agent-side file writes emit `FilesChanged`.
 *  The engine holds one watcher per process; this swaps it to `agentPath`. */
export function startAgentWatcher(target: EngineTarget, agentPath: string): Promise<void> {
  return call(target, "POST", "/watcher/start", { agentPath });
}

// Activities (missions) — the board's items. These routes take the agent path
// as a `?agent_path=` QUERY param, which the preview proxy passes through fine
// (only path SEGMENTS get the decode treatment), so no body-param trick needed.

export function listActivities(target: EngineTarget, agentPath: string): Promise<Activity[]> {
  return call(target, "GET", `/agents/activities?agent_path=${encodeURIComponent(agentPath)}`);
}

export function createActivity(
  target: EngineTarget,
  agentPath: string,
  body: { title: string; description: string; status?: string; session_key?: string },
): Promise<Activity> {
  return call(
    target,
    "POST",
    `/agents/activities?agent_path=${encodeURIComponent(agentPath)}`,
    body,
  );
}

export function deleteActivity(
  target: EngineTarget,
  agentPath: string,
  id: string,
): Promise<void> {
  return call(
    target,
    "DELETE",
    `/agents/activities/${seg(id)}?agent_path=${encodeURIComponent(agentPath)}`,
  );
}

// Composio integrations. All flat routes (no agent path in the URL), so they
// pass through the box proxy unchanged. Login + connect are URL/paste-back
// flows — the user opens a URL in their own browser and (for login) pastes a
// key back, so they work headless against a cloud box.

export type ComposioStatus =
  | { status: "needs_auth" }
  | { status: "ok"; email?: string | null; org_name?: string | null }
  | { status: "error"; message: string };

export interface ComposioApp {
  toolkit: string;
  name: string;
  description: string;
  logo_url: string;
  categories: string[];
}

export interface StartLoginResponse {
  login_url: string;
  cli_key: string;
}

export interface StartLinkResponse {
  redirect_url: string;
  connected_account_id: string;
  toolkit: string;
}

export function composioStatus(target: EngineTarget): Promise<ComposioStatus> {
  return call(target, "GET", "/composio/status");
}

export function composioApps(target: EngineTarget): Promise<ComposioApp[]> {
  return call(target, "GET", "/composio/apps");
}

/** Connected toolkit slugs (e.g. `["gmail", "slack"]`). */
export function composioConnections(target: EngineTarget): Promise<string[]> {
  return call(target, "GET", "/composio/connections");
}

export function composioStartLogin(target: EngineTarget): Promise<StartLoginResponse> {
  return call(target, "POST", "/composio/login");
}

export function composioCompleteLogin(target: EngineTarget, cliKey: string): Promise<void> {
  return call(target, "POST", "/composio/login/complete", { cliKey });
}

export function composioConnect(
  target: EngineTarget,
  toolkit: string,
): Promise<StartLinkResponse> {
  return call(target, "POST", "/composio/connections", { toolkit });
}

export function composioWatch(target: EngineTarget, toolkit: string): Promise<void> {
  return call(target, "POST", "/composio/connections/watch", { toolkit });
}

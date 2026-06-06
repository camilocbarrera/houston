/**
 * Cloud-engine mode for the desktop app.
 *
 * By default the desktop talks to its LOCAL engine sidecar (see `engine.ts`).
 * When the user opts into cloud mode, the desktop instead points its engine
 * client at their Houston Cloud box — the SAME engine the web app uses — so all
 * clients are windows into one engine and data syncs across them.
 *
 * The box's base URL + engine token live in `houston_boxes` (RLS: a user reads
 * only their own row). We read it with the signed-in Supabase session, persist
 * the handle + mode in localStorage, and let the BOOT path be the single source
 * of truth: toggling reloads the window so `resolveConfig()` (engine.ts) picks
 * the right target on a clean start — no fragile live engine-swap.
 *
 * The box sits behind the Upstash preview proxy, which strips the
 * `Authorization` header, so cloud mode uses `authMode: "query"` (token on the
 * URL). The WS already authenticates via `?token=`, so the existing firehose +
 * query-invalidation machinery works unchanged against the box.
 */

import { supabase } from "./supabase";
import { logger } from "./logger";

const MODE_KEY = "houston.engine.mode"; // "cloud" | "local" | unset
const BOX_KEY = "houston.engine.box";
const AUTO_KEY = "houston.engine.autochecked"; // sessionStorage guard (per run)

/** Persisted engine mode, or null if the user has never chosen. */
export function getEngineMode(): "cloud" | "local" | null {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === "cloud" || m === "local" ? m : null;
  } catch {
    return null;
  }
}

/**
 * Whether the box answers a health check FROM THE WEBVIEW (not just curl).
 * This catches the case where the box is up but its responses can't be read by
 * the browser — e.g. the Upstash proxy + engine both emit
 * `Access-Control-Allow-Origin`, and a duplicate ACAO makes the webview reject
 * every response as a CORS failure ("Load failed"). Also wakes a frozen box.
 */
async function boxReachable(box: CloudBox): Promise<boolean> {
  try {
    const r = await fetch(`${box.baseUrl}/v1/health?token=${encodeURIComponent(box.token)}`);
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Boot guard: if cloud mode is persisted but the box can't actually be reached
 * from the webview, revert to the local engine and reload so the app isn't
 * bricked on a screen whose data never loads. Called early in engine bootstrap.
 */
export async function verifyCloudOrRevert(): Promise<void> {
  const cfg = getCloudEngineConfig();
  if (!cfg) return;
  if (await boxReachable(cfg)) return;
  logger.error("[cloud-engine] cloud box unreachable from webview — reverting to local engine");
  localStorage.setItem(MODE_KEY, "local");
  localStorage.removeItem(BOX_KEY);
  window.location.reload();
}

export interface CloudBox {
  baseUrl: string;
  token: string;
}

export interface CloudEngineConfig extends CloudBox {
  authMode: "query";
}

/** The signed-in user's box, or null if they haven't deployed one yet. Throws
 *  on a real query error (surfaced to the caller, never swallowed). */
export async function fetchMyBox(): Promise<CloudBox | null> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("houston_boxes")
    .select("base_url, token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load your cloud engine: ${error.message}`);
  if (!data) return null;
  return { baseUrl: data.base_url as string, token: data.token as string };
}

/** Cloud-engine target from persisted state, or null when in local mode. Pure
 *  + synchronous so `engine.ts resolveConfig()` can call it at module load. */
export function getCloudEngineConfig(): CloudEngineConfig | null {
  try {
    if (localStorage.getItem(MODE_KEY) !== "cloud") return null;
    const raw = localStorage.getItem(BOX_KEY);
    if (!raw) return null;
    const box = JSON.parse(raw) as CloudBox;
    if (!box.baseUrl || !box.token) return null;
    return { ...box, authMode: "query" };
  } catch {
    return null;
  }
}

export function isCloudEngineActive(): boolean {
  return getCloudEngineConfig() !== null;
}

/** Switch the desktop onto the user's cloud box. Fetches the box handle,
 *  persists it + the mode, then reloads so the boot path repoints the engine.
 *  Throws if no box exists yet (caller surfaces it to the user). */
export async function enableCloudEngine(): Promise<void> {
  const box = await fetchMyBox();
  if (!box) {
    throw new Error("No cloud engine found. Deploy it in the web app first, then try again.");
  }
  if (!(await boxReachable(box))) {
    throw new Error(
      "Your cloud engine isn't reachable from the desktop yet (the box needs the CORS-aware engine build). Staying on the local engine.",
    );
  }
  localStorage.setItem(BOX_KEY, JSON.stringify(box));
  localStorage.setItem(MODE_KEY, "cloud");
  logger.info(`[cloud-engine] switching to cloud box ${box.baseUrl}`);
  window.location.reload();
}

/** Switch back to the local sidecar engine. Records the choice as "local" (not
 *  unset) so auto-enable won't immediately flip it back to cloud. */
export function disableCloudEngine(): void {
  localStorage.setItem(MODE_KEY, "local");
  localStorage.removeItem(BOX_KEY);
  logger.info("[cloud-engine] switching back to local engine");
  window.location.reload();
}

/**
 * On a fresh signed-in boot with no explicit mode chosen yet, default to cloud
 * if the user has a box — so "same data on web + desktop" works without hunting
 * for a toggle. Runs at most once per app run (sessionStorage guard) and only
 * reloads when it actually finds a box; no box → stays on the local engine.
 */
export async function autoEnableCloudIfAvailable(): Promise<void> {
  if (getEngineMode()) return; // user already chose cloud or local
  try {
    if (sessionStorage.getItem(AUTO_KEY)) return;
    sessionStorage.setItem(AUTO_KEY, "1");
  } catch {
    /* sessionStorage unavailable — fall through, the mode check still guards */
  }
  let box: CloudBox | null = null;
  try {
    box = await fetchMyBox();
  } catch (e) {
    logger.warn(`[cloud-engine] auto-enable box lookup failed: ${e}`);
    return; // stay local; the menu toggle can retry
  }
  if (!box) return; // no cloud box yet → local engine
  // Only switch if the webview can actually read the box (CORS etc.). If not,
  // leave mode unset so a later boot retries once the box is fixed — don't
  // brick the desktop in an unreachable cloud mode.
  if (!(await boxReachable(box))) {
    logger.warn("[cloud-engine] box found but unreachable from webview — staying local for now");
    return;
  }
  localStorage.setItem(BOX_KEY, JSON.stringify(box));
  localStorage.setItem(MODE_KEY, "cloud");
  logger.info(`[cloud-engine] auto-entering cloud mode (box ${box.baseUrl})`);
  window.location.reload();
}

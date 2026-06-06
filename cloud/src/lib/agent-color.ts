//! Assign each agent a distinct palette color so the sidebar helmets are
//! visually differentiable — the desktop create flow always picks one, but the
//! cloud bootstrap/create paths used to send none, so every agent rendered as
//! the same default (charcoal).
//!
//! This runs server-side (Next route handlers / bootstrap), so it must NOT
//! import the `@houston-ai/core` barrel — that pulls React components in and
//! breaks the server bundle. The wire contract is just the ordered list of
//! palette *ids*: the engine persists the id string and the client's
//! `resolveAgentColor` (ui/core) turns it back into the right hex per theme.
//!
//! SOURCE OF TRUTH for the ids + their order: `ui/core/src/agent-colors.ts`
//! `AGENT_COLORS`. Keep this list in sync with that one.

const AGENT_COLOR_IDS = [
  "charcoal",
  "forest",
  "navy",
  "purple",
  "crimson",
  "orange",
  "golden",
] as const;

/** The palette color id for the Nth agent in a workspace (round-robin). Stable
 *  by index so the first agent is always `charcoal`, the second `forest`, etc.,
 *  matching the order a user sees in the desktop color picker. */
export function colorIdForIndex(index: number): string {
  return AGENT_COLOR_IDS[index % AGENT_COLOR_IDS.length];
}

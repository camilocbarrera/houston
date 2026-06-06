//! Skills seeded into every cloud agent at creation.
//!
//! Composio's own `composio --install-skill claude` is broken in the bundled
//! CLI (errors "skill asset composio-skill.zip not found"), so cloud agents
//! never learned they can use connected apps — they'd say "I have no email
//! access" even with Gmail linked. We seed the skill ourselves: the engine
//! writes these files into the agent folder on create and auto-creates the
//! `.claude/skills/<slug>` symlink when skills are listed, so a fresh chat
//! picks it up. Reprovision-safe — bootstrap re-seeds on a new box.

/** SKILL.md teaching the agent to use the authenticated `composio` CLI. */
const CONNECTED_APPS_SKILL = `---
name: connected-apps
description: Read and act on the user's connected apps — Gmail email, calendar, Slack, GitHub and 1000+ others. Use whenever the user asks to check, read, search, summarize, or send email, or do anything in a connected service.
category: integrations
integrations: [gmail]
---

## Connected apps via Composio

You can act on the user's connected third-party apps using the \`composio\` CLI. It is already installed, on your PATH, and authenticated. Connections such as Gmail are authorized by the user, so USE THEM — never tell the user you have no access to their email or apps.

### 1. Find the right tool
\`\`\`
composio search "<what you want to do>" --toolkits <slug>
\`\`\`
Example: \`composio search "fetch recent emails" --toolkits gmail\` → JSON with tool \`slug\`s.

### 2. Inspect inputs (optional)
\`\`\`
composio execute <SLUG> --get-schema
\`\`\`

### 3. Execute
\`\`\`
composio execute <SLUG> -d '<json args>'
\`\`\`
Examples:
- Recent email: \`composio execute GMAIL_FETCH_EMAILS -d '{"max_results": 10}'\`
- Search email: \`composio execute GMAIL_FETCH_EMAILS -d '{"query": "invoice", "max_results": 20}'\`

### Rules
- Default to trying \`composio execute\` — you DO have access to the user's connected apps.
- If a tool reports the toolkit is not connected, ask the user (in plain language) to connect it from the Integrations tab, then retry.
- Parse the JSON output and summarize results for the user in plain language.
`;

/** Seed files (path relative to the agent folder → content) every cloud agent
 *  is created with. Passed as `seeds` to the engine's createAgent. */
export const AGENT_SEED_SKILLS: Record<string, string> = {
  ".agents/skills/connected-apps/SKILL.md": CONNECTED_APPS_SKILL,
};

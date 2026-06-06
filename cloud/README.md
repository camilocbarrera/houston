# Houston Cloud

A **Next.js app** that is the whole product: control-plane API (backend) +
web client (frontend) + Supabase auth, in one deployable. It provisions one
cloud-hosted engine **box per user**; clients connect to that box over the same
HTTP protocol they'd use locally — the only thing that changes is the `baseUrl`.

```
pnpm dev        # run the app (needs .env.local — see .env.example)
pnpm test       # control-plane unit tests (16)
pnpm typecheck  # tsc --noEmit
pnpm build      # next build
```

Offline demo with no real backend: `SANDBOX_PROVIDER=mock` + dummy
`NEXT_PUBLIC_SUPABASE_*` → in-memory store, fake boxes.

## What it is

Dev (or Houston itself) doesn't want to run infra. The control plane provisions
a sandbox per user, boots the engine inside it, and hands clients a URL + token.
Events flow back to clients through **Supabase Realtime** (the engine's cloud
event sink), so reactivity survives a box that freezes when idle.

## Layout

- `src/sandbox/`, `src/store/`, `src/control-plane.ts` — pure, unit-tested
  control-plane core (swappable provider + store). No React, no Next.
- `src/app/` — Next.js: `api/provision` + `api/me/box` route handlers (server,
  hold the service-role key) and `page.tsx` (auth → provision → live events).
- `src/lib/` — Supabase clients (server/browser/admin), env, the realtime hook,
  and `server/control-plane.ts` (wires the core from env).

## Architecture

```
client (web/desktop/phone)
  │  1. auth (Supabase)
  │  2. POST /provision ─────────────► control plane (this package)
  │                                       │  provisionOrGet(user)
  │                                       ├─ SandboxProvider.provision() ─► Upstash Box (engine on :7777)
  │                                       └─ BoxStore.save(user → handle)  (Supabase houston_boxes)
  │  ◄── { baseUrl, token } ─────────────┘
  │  3. REST commands ──────────────────────────────────────────────────► box engine (direct, bearer token)
  └─ 4. subscribe Supabase Realtime ◄── houston_events ◄── engine cloud sink (in box)
```

Command path is **direct REST to the box**; the sync/event path is **Supabase
Realtime**. The box's preview URL therefore only needs HTTP, never WS.

## Swappable sandbox backend

The box brand is swappable — that's the whole point of `src/sandbox/`:

- `types.ts` — the `SandboxProvider` interface every backend implements.
- `upstash-box.ts` — `UpstashBoxProvider` (real `@upstash/box` SDK: `Box.create`
  + `getPreviewUrl(7777)`; `Box.get(id)` for `status`/`wake`/`destroy`). Depends
  on a narrow `UpstashBoxSdk` port so it's unit-tested without a live box.
- `mock.ts` — `MockSandboxProvider`, for tests and an offline demo
  (`SANDBOX_PROVIDER=mock`).
- `registry.ts` — selects the backend by `SANDBOX_PROVIDER` (default `upstash`).

Swapping to another vendor or a proprietary box = one new implementor + one
`registry` case. No control-plane changes. Mirrors the engine's AI-provider
`REGISTRY` pattern, one layer up.

## Persistence

`src/store/` keeps the `user → box` mapping (one box per user):
`SupabaseBoxStore` (table `public.houston_boxes`) in production,
`InMemoryBoxStore` for tests / offline.

## Control-plane logic

`src/control-plane.ts` — `provisionOrGet(user)` (idempotent: reuse the stored
box, else provision + save) and `destroyForUser(user)`. Framework-agnostic so it
can sit behind any HTTP layer.

## Env

| Var | Purpose |
|-----|---------|
| `SANDBOX_PROVIDER` | `upstash` (default) or `mock` |
| `UPSTASH_BOX_API_KEY` | Upstash Box auth (read by the SDK) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | box store + stamped into each box's cloud sink |
| `ANTHROPIC_API_KEY` | stamped into each box for the agent CLIs |

## Status

- ✅ Swappable provider + store + control-plane logic, unit-tested (`pnpm test`).
- ✅ Supabase migrations: `houston_events` (event sync), `houston_boxes` (mapping).
- ✅ Next.js app: Supabase-auth'd `/api/provision` + `/api/me/box`, web client
  (auth → provision → live event feed). `next build` clean.
- ⏳ Live test against real Supabase + Upstash creds.
- ⏳ Live gate: boot the `always-on` engine image inside a real box, verify the
  preview URL serves the engine. Determines the `engineBootSpec` boot strategy
  (custom image vs in-box bootstrap). `page.tsx` still needs the chat/send UI +
  multi-agent list.

## Original product framing

Revenue engine for Houston: hosts engine instances for third-party devs; Always
On + Teams could dogfood on it. Open questions still to solve: multi-tenant cost
(one box per user today), pricing model, whitelabeling, SLA/support tiers,
self-service vs sales-led onboarding, and the engine plugin/extension model.

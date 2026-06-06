-- Houston Cloud: event sync table.
--
-- The cloud-hosted engine (one box per user, see `cloud/` + `always-on/`)
-- forwards every HoustonEvent it emits into this table using the service-role
-- key. Clients subscribe through Supabase Realtime, filtered to their own
-- user_id by RLS, and use the rows to invalidate TanStack Query caches -- the
-- same reactivity contract the desktop gets over the WS firehose, just brokered
-- through Supabase so it survives a box that freezes when idle.

create table if not exists public.houston_events (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references auth.users (id) on delete cascade,
    topic       text not null,
    event_type  text not null,
    payload     jsonb not null,
    created_at  timestamptz not null default now()
);

-- Clients read their most recent events first; the engine only ever inserts.
create index if not exists houston_events_user_created_idx
    on public.houston_events (user_id, created_at desc);

alter table public.houston_events enable row level security;

-- A user may read only their own events. Inserts come exclusively from the
-- engine via the service-role key, which bypasses RLS -- so there is no insert
-- policy for end users on purpose.
create policy "read own events"
    on public.houston_events
    for select
    using (auth.uid() = user_id);

-- Realtime fan-out. Clients subscribe with supabase-js:
--   supabase.channel('events')
--     .on('postgres_changes',
--         { event: 'INSERT', schema: 'public', table: 'houston_events',
--           filter: `user_id=eq.${userId}` },
--         handler)
--     .subscribe()
alter publication supabase_realtime add table public.houston_events;

-- Houston Cloud: shared mission/activity state.
--
-- The board's data (unlike the chat, which is reconstructable from
-- `houston_events`) is not carried in the event stream — events only signal
-- "something changed". To let EVERY client (web + desktop) render the same
-- board WITHOUT each calling the box engine, the box mirrors each activity's
-- full state into this table on create/update/delete. Clients read + subscribe
-- here; Supabase Realtime keeps them in lockstep. This is the agora pattern:
-- the database is the shared source of truth for the synced view.
--
-- Written by the box with the service-role key (bypasses RLS). A user reads
-- only their own rows.

create table if not exists public.houston_activities (
    user_id     uuid not null references auth.users (id) on delete cascade,
    agent_path  text not null,
    id          text not null,            -- the engine's activity id
    title       text not null default '',
    description text not null default '',
    status      text not null default '',
    session_key text,
    updated_at  timestamptz not null default now(),
    primary key (user_id, agent_path, id)
);

alter table public.houston_activities enable row level security;

create policy "read own activities"
    on public.houston_activities
    for select
    using (auth.uid() = user_id);

-- Live updates for subscribers.
alter publication supabase_realtime add table public.houston_activities;

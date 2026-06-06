-- Houston Cloud: shared Composio connection state.
--
-- Which toolkits the user has connected lives in the box's Composio CLI state.
-- Mirror the connected-toolkit slugs here (like agents/activities) so every
-- client can show the same integrations without calling the box. One row per
-- connected toolkit. Written by the web with the service-role key; a user reads
-- only their own rows.

create table if not exists public.houston_connections (
    user_id    uuid not null references auth.users (id) on delete cascade,
    toolkit    text not null,            -- e.g. "gmail", "slack"
    updated_at timestamptz not null default now(),
    primary key (user_id, toolkit)
);

alter table public.houston_connections enable row level security;

create policy "read own connections"
    on public.houston_connections
    for select
    using (auth.uid() = user_id);

alter publication supabase_realtime add table public.houston_connections;

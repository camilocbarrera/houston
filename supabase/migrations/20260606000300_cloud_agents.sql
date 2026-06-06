-- Houston Cloud: shared agent roster.
--
-- Agents created in the web app live on the box; the desktop has its own local
-- agents, so it can't see them. Like activities, the agent list isn't in the
-- event stream, so the box (via the web app, which already lists agents and
-- holds the service-role key) mirrors the roster here. Every client reads +
-- subscribes → same sidebar everywhere, no box calls. Agora model.
--
-- Written with the service-role key; a user reads only their own rows.

create table if not exists public.houston_agents (
    user_id      uuid not null references auth.users (id) on delete cascade,
    workspace_id text not null,
    id           text not null,           -- the engine's agent id
    name         text not null default '',
    folder_path  text not null default '',
    color        text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    primary key (user_id, id)
);

alter table public.houston_agents enable row level security;

create policy "read own agents"
    on public.houston_agents
    for select
    using (auth.uid() = user_id);

alter publication supabase_realtime add table public.houston_agents;

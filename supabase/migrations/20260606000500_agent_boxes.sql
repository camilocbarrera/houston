-- Houston Cloud: optional per-agent isolated boxes.
--
-- By default every agent shares the user's one box (houston_boxes). For heavy
-- or specialized agents the user can "isolate" an agent — give it its own
-- dedicated box with separate compute. This table maps an agent to its
-- dedicated box (and the agent's folder path inside that box, used to route the
-- board/chat there). Absence of a row = the agent uses the shared user box.
--
-- Written by the control plane with the service-role key; a user reads only
-- their own rows.

create table if not exists public.houston_agent_boxes (
    user_id     uuid not null references auth.users (id) on delete cascade,
    agent_id    text not null,            -- the engine agent id (from the shared box)
    sandbox_id  text not null,
    provider    text not null,
    base_url    text not null,
    token       text not null,
    agent_path  text not null,            -- the agent's folder path inside the isolated box
    created_at  timestamptz not null default now(),
    primary key (user_id, agent_id)
);

alter table public.houston_agent_boxes enable row level security;

create policy "read own agent boxes"
    on public.houston_agent_boxes
    for select
    using (auth.uid() = user_id);

alter publication supabase_realtime add table public.houston_agent_boxes;

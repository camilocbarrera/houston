-- Houston Cloud: user -> box mapping.
--
-- One row per user (one box per user). Written by the control plane with the
-- service-role key. A user reads only their own row (RLS) to learn their box's
-- base_url + engine token so the client can talk to the box directly over REST.

create table if not exists public.houston_boxes (
    user_id     uuid primary key references auth.users (id) on delete cascade,
    sandbox_id  text not null,
    provider    text not null,
    base_url    text not null,
    token       text not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

alter table public.houston_boxes enable row level security;

-- A user may read only their own box. Writes come exclusively from the control
-- plane via the service-role key (bypasses RLS) -- no user insert/update policy.
create policy "read own box"
    on public.houston_boxes
    for select
    using (auth.uid() = user_id);

-- Run in Supabase SQL Editor; row-level security is mandatory.
create table if not exists public.flowhub_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.flowhub_state enable row level security;
drop policy if exists "Owner can read" on public.flowhub_state;
drop policy if exists "Owner can insert" on public.flowhub_state;
drop policy if exists "Owner can update" on public.flowhub_state;
create policy "Owner can read" on public.flowhub_state for select to authenticated using (auth.uid() = user_id);
create policy "Owner can insert" on public.flowhub_state for insert to authenticated with check (auth.uid() = user_id);
create policy "Owner can update" on public.flowhub_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

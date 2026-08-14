-- One encrypted-at-rest JSON snapshot per authenticated user. The browser always uses its own JWT.
create table if not exists public.reader_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.reader_snapshots enable row level security;

drop policy if exists "Users read own reader snapshot" on public.reader_snapshots;
create policy "Users read own reader snapshot" on public.reader_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users insert own reader snapshot" on public.reader_snapshots;
create policy "Users insert own reader snapshot" on public.reader_snapshots
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own reader snapshot" on public.reader_snapshots;
create policy "Users update own reader snapshot" on public.reader_snapshots
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own reader snapshot" on public.reader_snapshots;
create policy "Users delete own reader snapshot" on public.reader_snapshots
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.set_reader_snapshot_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_reader_snapshot_updated_at on public.reader_snapshots;
create trigger set_reader_snapshot_updated_at
before update on public.reader_snapshots
for each row execute procedure public.set_reader_snapshot_updated_at();

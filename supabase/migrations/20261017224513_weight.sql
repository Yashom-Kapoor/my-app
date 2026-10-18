-- Body weight: one entry per day (re-entering a day replaces it). Unit is set in the app.
create table public.weight_entries (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  logged_on date not null,
  weight numeric(5, 1) not null check (weight > 0 and weight < 1500),
  created_at timestamptz not null default now(),
  primary key (user_id, logged_on)
);

alter table public.weight_entries enable row level security;
grant select, insert, update, delete on public.weight_entries to authenticated;

create policy "owner select" on public.weight_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner insert" on public.weight_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner update" on public.weight_entries for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner delete" on public.weight_entries for delete to authenticated using ((select auth.uid()) = user_id);

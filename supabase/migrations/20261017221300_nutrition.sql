-- Nutrition: saved foods, daily log, per-nutrient goals.

create extension if not exists pg_trgm with schema extensions;

-- Tracked nutrients. Add a value here (and columns below) to track more.
create type public.nutrient as enum ('calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g');

-- Saved ("repeating") foods you can search and re-log. Values are per serving.
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(trim(name)) > 0),
  serving text,
  calories numeric(7, 1) not null default 0 check (calories >= 0),
  protein_g numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6, 1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6, 1) not null default 0 check (fat_g >= 0),
  fiber_g numeric(6, 1) not null default 0 check (fiber_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index foods_user_id_idx on public.foods (user_id);
create index foods_name_trgm_idx on public.foods using gin (name extensions.gin_trgm_ops);

-- One row per thing eaten. Per-serving values are copied from the food so
-- editing a saved food never rewrites history. food_id is null for one-off items.
create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  food_id uuid references public.foods on delete set null,
  logged_on date not null,
  name text not null check (length(trim(name)) > 0),
  servings numeric(5, 2) not null default 1 check (servings > 0),
  calories numeric(7, 1) not null default 0 check (calories >= 0),
  protein_g numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6, 1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6, 1) not null default 0 check (fat_g >= 0),
  fiber_g numeric(6, 1) not null default 0 check (fiber_g >= 0),
  created_at timestamptz not null default now()
);

create index food_logs_user_day_idx on public.food_logs (user_id, logged_on);
create index food_logs_food_id_idx on public.food_logs (food_id);

-- A goal is a min, a max, or both, for one nutrient.
create table public.nutrition_goals (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nutrient public.nutrient not null,
  min numeric(7, 1) check (min >= 0),
  max numeric(7, 1) check (max >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, nutrient),
  check (min is not null or max is not null),
  check (min is null or max is null or min <= max)
);

-- Daily totals (servings × per-serving values). security_invoker keeps RLS applied.
create view public.nutrition_daily_totals with (security_invoker = true) as
select
  user_id,
  logged_on,
  sum(calories * servings) as calories,
  sum(protein_g * servings) as protein_g,
  sum(carbs_g * servings) as carbs_g,
  sum(fat_g * servings) as fat_g,
  sum(fiber_g * servings) as fiber_g
from public.food_logs
group by user_id, logged_on;

-- Keep foods.updated_at current.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger foods_set_updated_at before update on public.foods
  for each row execute function public.set_updated_at();
create trigger nutrition_goals_set_updated_at before update on public.nutrition_goals
  for each row execute function public.set_updated_at();

-- Access: owner-only on every table.
alter table public.foods enable row level security;
alter table public.food_logs enable row level security;
alter table public.nutrition_goals enable row level security;

grant select, insert, update, delete on public.foods, public.food_logs, public.nutrition_goals to authenticated;
grant select on public.nutrition_daily_totals to authenticated;
revoke all on public.nutrition_daily_totals from anon;

create policy "owner select" on public.foods for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner insert" on public.foods for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner update" on public.foods for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner delete" on public.foods for delete to authenticated using ((select auth.uid()) = user_id);

create policy "owner select" on public.food_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner insert" on public.food_logs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner update" on public.food_logs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner delete" on public.food_logs for delete to authenticated using ((select auth.uid()) = user_id);

create policy "owner select" on public.nutrition_goals for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner insert" on public.nutrition_goals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner update" on public.nutrition_goals for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner delete" on public.nutrition_goals for delete to authenticated using ((select auth.uid()) = user_id);

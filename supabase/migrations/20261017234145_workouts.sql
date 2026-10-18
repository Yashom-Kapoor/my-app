-- Workouts: exercise library, templates, logged workouts and sets.

create type public.muscle_group as enum (
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body'
);
create type public.equipment as enum (
  'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other'
);
-- weighted: weight × reps. bodyweight: reps, with optional added weight.
create type public.exercise_kind as enum ('weighted', 'bodyweight');

-- user_id null = built-in exercise, readable by everyone, editable by no one.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users on delete cascade,
  name text not null check (length(trim(name)) > 0),
  muscle_group public.muscle_group not null,
  equipment public.equipment not null,
  kind public.exercise_kind not null default 'weighted',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index exercises_name_unique
  on public.exercises (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index exercises_user_id_idx on public.exercises (user_id);

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(trim(name)) > 0),
  notes text,
  created_at timestamptz not null default now()
);
create index workout_templates_user_id_idx on public.workout_templates (user_id);

create table public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  template_id uuid not null references public.workout_templates on delete cascade,
  exercise_id uuid not null references public.exercises on delete restrict,
  position int not null default 0,
  target_sets int not null default 3 check (target_sets between 1 and 20),
  target_reps text,
  rest_seconds int not null default 120 check (rest_seconds between 0 and 1800)
);
create index template_exercises_user_id_idx on public.template_exercises (user_id);
create index template_exercises_template_id_idx on public.template_exercises (template_id, position);
create index template_exercises_exercise_id_idx on public.template_exercises (exercise_id);

-- ended_at null = in progress.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default 'Workout',
  template_id uuid references public.workout_templates on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  check (ended_at is null or ended_at >= started_at)
);
create index workouts_user_started_idx on public.workouts (user_id, started_at desc);
create index workouts_template_id_idx on public.workouts (template_id);
create unique index workouts_one_active_idx on public.workouts (user_id) where ended_at is null;

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workout_id uuid not null references public.workouts on delete cascade,
  exercise_id uuid not null references public.exercises on delete restrict,
  position int not null default 0,
  rest_seconds int not null default 120 check (rest_seconds between 0 and 1800),
  notes text
);
create index workout_exercises_user_id_idx on public.workout_exercises (user_id);
create index workout_exercises_workout_id_idx on public.workout_exercises (workout_id, position);
create index workout_exercises_exercise_id_idx on public.workout_exercises (exercise_id);

-- completed_at null = not checked off yet.
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises on delete cascade,
  position int not null default 0,
  weight numeric(6, 1) check (weight >= 0),
  reps int check (reps >= 0 and reps <= 1000),
  completed_at timestamptz
);
create index workout_sets_user_id_idx on public.workout_sets (user_id);
create index workout_sets_workout_exercise_id_idx on public.workout_sets (workout_exercise_id, position);

-- Completed sets from finished workouts, with Epley estimated 1RM (weighted, ≤15 reps).
create view public.exercise_set_history with (security_invoker = true) as
select
  s.id as set_id,
  s.user_id,
  we.exercise_id,
  w.id as workout_id,
  w.started_at,
  s.position,
  s.weight,
  s.reps,
  case when s.weight > 0 and s.reps between 1 and 15
    then round(s.weight * (1 + s.reps / 30.0), 1) end as e1rm
from public.workout_sets s
join public.workout_exercises we on we.id = s.workout_exercise_id
join public.workouts w on w.id = we.workout_id
where s.completed_at is not null and w.ended_at is not null;

-- For each exercise, the completed sets from its most recent finished workout before `before`.
create function public.last_sets(exercise_ids uuid[], before timestamptz default now())
returns table (exercise_id uuid, "position" int, weight numeric, reps int)
language sql stable security invoker set search_path = '' as $$
  with latest as (
    select distinct on (we.exercise_id) we.exercise_id, we.id as workout_exercise_id
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.exercise_id = any(exercise_ids)
      and w.ended_at is not null
      and w.started_at < before
      and exists (
        select 1 from public.workout_sets s
        where s.workout_exercise_id = we.id and s.completed_at is not null
      )
    order by we.exercise_id, w.started_at desc
  )
  select l.exercise_id, s.position, s.weight, s.reps
  from latest l
  join public.workout_sets s on s.workout_exercise_id = l.workout_exercise_id
  where s.completed_at is not null
  order by l.exercise_id, s.position;
$$;

revoke execute on function public.last_sets(uuid[], timestamptz) from public, anon;
grant execute on function public.last_sets(uuid[], timestamptz) to authenticated;

-- Access.
alter table public.exercises enable row level security;
alter table public.workout_templates enable row level security;
alter table public.template_exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;

grant select, insert, update, delete on
  public.exercises, public.workout_templates, public.template_exercises,
  public.workouts, public.workout_exercises, public.workout_sets
to authenticated;
grant select on public.exercise_set_history to authenticated;
revoke all on public.exercise_set_history from anon;

create policy "read built-in or own" on public.exercises for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy "owner insert" on public.exercises for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "owner update" on public.exercises for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner delete" on public.exercises for delete to authenticated
  using ((select auth.uid()) = user_id);

do $$
declare t text;
begin
  foreach t in array array['workout_templates', 'template_exercises', 'workouts', 'workout_exercises', 'workout_sets'] loop
    execute format('create policy "owner select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Built-in exercise library.
insert into public.exercises (user_id, name, muscle_group, equipment, kind) values
  (null, 'Bench Press', 'chest', 'barbell', 'weighted'),
  (null, 'Incline Bench Press', 'chest', 'barbell', 'weighted'),
  (null, 'Dumbbell Bench Press', 'chest', 'dumbbell', 'weighted'),
  (null, 'Incline Dumbbell Press', 'chest', 'dumbbell', 'weighted'),
  (null, 'Dumbbell Fly', 'chest', 'dumbbell', 'weighted'),
  (null, 'Cable Crossover', 'chest', 'cable', 'weighted'),
  (null, 'Machine Chest Press', 'chest', 'machine', 'weighted'),
  (null, 'Pec Deck', 'chest', 'machine', 'weighted'),
  (null, 'Push-Up', 'chest', 'bodyweight', 'bodyweight'),
  (null, 'Dip', 'chest', 'bodyweight', 'bodyweight'),

  (null, 'Deadlift', 'back', 'barbell', 'weighted'),
  (null, 'Barbell Row', 'back', 'barbell', 'weighted'),
  (null, 'Dumbbell Row', 'back', 'dumbbell', 'weighted'),
  (null, 'Lat Pulldown', 'back', 'cable', 'weighted'),
  (null, 'Seated Cable Row', 'back', 'cable', 'weighted'),
  (null, 'T-Bar Row', 'back', 'barbell', 'weighted'),
  (null, 'Chest-Supported Row', 'back', 'machine', 'weighted'),
  (null, 'Straight-Arm Pulldown', 'back', 'cable', 'weighted'),
  (null, 'Pull-Up', 'back', 'bodyweight', 'bodyweight'),
  (null, 'Chin-Up', 'back', 'bodyweight', 'bodyweight'),
  (null, 'Inverted Row', 'back', 'bodyweight', 'bodyweight'),

  (null, 'Overhead Press', 'shoulders', 'barbell', 'weighted'),
  (null, 'Dumbbell Shoulder Press', 'shoulders', 'dumbbell', 'weighted'),
  (null, 'Arnold Press', 'shoulders', 'dumbbell', 'weighted'),
  (null, 'Lateral Raise', 'shoulders', 'dumbbell', 'weighted'),
  (null, 'Cable Lateral Raise', 'shoulders', 'cable', 'weighted'),
  (null, 'Rear Delt Fly', 'shoulders', 'dumbbell', 'weighted'),
  (null, 'Face Pull', 'shoulders', 'cable', 'weighted'),
  (null, 'Machine Shoulder Press', 'shoulders', 'machine', 'weighted'),
  (null, 'Shrug', 'shoulders', 'dumbbell', 'weighted'),

  (null, 'Barbell Curl', 'biceps', 'barbell', 'weighted'),
  (null, 'Dumbbell Curl', 'biceps', 'dumbbell', 'weighted'),
  (null, 'Hammer Curl', 'biceps', 'dumbbell', 'weighted'),
  (null, 'Preacher Curl', 'biceps', 'machine', 'weighted'),
  (null, 'Cable Curl', 'biceps', 'cable', 'weighted'),
  (null, 'Incline Dumbbell Curl', 'biceps', 'dumbbell', 'weighted'),

  (null, 'Triceps Pushdown', 'triceps', 'cable', 'weighted'),
  (null, 'Overhead Triceps Extension', 'triceps', 'cable', 'weighted'),
  (null, 'Skull Crusher', 'triceps', 'barbell', 'weighted'),
  (null, 'Close-Grip Bench Press', 'triceps', 'barbell', 'weighted'),
  (null, 'Bench Dip', 'triceps', 'bodyweight', 'bodyweight'),

  (null, 'Wrist Curl', 'forearms', 'dumbbell', 'weighted'),
  (null, 'Farmer''s Carry', 'forearms', 'dumbbell', 'weighted'),

  (null, 'Back Squat', 'quads', 'barbell', 'weighted'),
  (null, 'Front Squat', 'quads', 'barbell', 'weighted'),
  (null, 'Leg Press', 'quads', 'machine', 'weighted'),
  (null, 'Hack Squat', 'quads', 'machine', 'weighted'),
  (null, 'Leg Extension', 'quads', 'machine', 'weighted'),
  (null, 'Goblet Squat', 'quads', 'dumbbell', 'weighted'),
  (null, 'Bulgarian Split Squat', 'quads', 'dumbbell', 'weighted'),
  (null, 'Walking Lunge', 'quads', 'dumbbell', 'weighted'),
  (null, 'Bodyweight Squat', 'quads', 'bodyweight', 'bodyweight'),

  (null, 'Romanian Deadlift', 'hamstrings', 'barbell', 'weighted'),
  (null, 'Lying Leg Curl', 'hamstrings', 'machine', 'weighted'),
  (null, 'Seated Leg Curl', 'hamstrings', 'machine', 'weighted'),
  (null, 'Good Morning', 'hamstrings', 'barbell', 'weighted'),
  (null, 'Nordic Curl', 'hamstrings', 'bodyweight', 'bodyweight'),

  (null, 'Hip Thrust', 'glutes', 'barbell', 'weighted'),
  (null, 'Glute Bridge', 'glutes', 'bodyweight', 'bodyweight'),
  (null, 'Cable Kickback', 'glutes', 'cable', 'weighted'),
  (null, 'Hip Abduction', 'glutes', 'machine', 'weighted'),

  (null, 'Standing Calf Raise', 'calves', 'machine', 'weighted'),
  (null, 'Seated Calf Raise', 'calves', 'machine', 'weighted'),

  (null, 'Hanging Leg Raise', 'core', 'bodyweight', 'bodyweight'),
  (null, 'Cable Crunch', 'core', 'cable', 'weighted'),
  (null, 'Ab Wheel Rollout', 'core', 'other', 'bodyweight'),
  (null, 'Crunch', 'core', 'bodyweight', 'bodyweight'),
  (null, 'Russian Twist', 'core', 'other', 'weighted'),

  (null, 'Kettlebell Swing', 'full_body', 'kettlebell', 'weighted'),
  (null, 'Power Clean', 'full_body', 'barbell', 'weighted'),
  (null, 'Burpee', 'full_body', 'bodyweight', 'bodyweight');

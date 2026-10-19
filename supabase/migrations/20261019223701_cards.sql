-- Flashcards: concepts and cards extracted from materials, review history, and study settings.

alter table public.materials add column cards_hash text;

create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  material_id uuid not null references public.materials on delete cascade,
  key text not null,
  title text not null,
  position integer not null,
  deleted_at timestamptz,
  unique (material_id, key)
);
create index concepts_user_idx on public.concepts (user_id);
create index concepts_course_idx on public.concepts (course_id);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  material_id uuid not null references public.materials on delete cascade,
  -- Primary concept of every card; contrast cards also set other_concept_id.
  concept_id uuid not null references public.concepts on delete cascade,
  other_concept_id uuid references public.concepts on delete set null,
  key text not null,
  page integer,
  level text not null check (level in ('explain', 'why', 'apply', 'contrast', 'trap')),
  front text not null,
  back text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  -- FSRS scheduling state (matches CardState in src/lib/classes/cards/fsrs.ts).
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  learning_steps integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0 check (state between 0 and 3),
  last_review timestamptz,
  unique (material_id, key)
);
create index cards_due_idx on public.cards (user_id, due) where deleted_at is null;
create index cards_course_idx on public.cards (course_id);
create index cards_concept_idx on public.cards (concept_id);
create index cards_other_concept_idx on public.cards (other_concept_id);

create table public.card_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id uuid not null references public.cards on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  state_before smallint not null,
  state_after smallint not null,
  scheduled_days integer not null,
  seconds integer,
  reviewed_at timestamptz not null default now()
);
create index card_reviews_user_idx on public.card_reviews (user_id, reviewed_at);
create index card_reviews_card_idx on public.card_reviews (card_id);

create table public.study_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  target_date date,
  budget_minutes integer not null default 60 check (budget_minutes between 5 and 300)
);

do $$
declare t text;
begin
  foreach t in array array['concepts', 'cards', 'card_reviews', 'study_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

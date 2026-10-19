-- Classes: synced courses, Gradescope assignments, and a Canvas/Ed announcement inbox.

-- One row per connected source. `secret` is AES-GCM ciphertext (decrypted server-side only).
create table public.class_connections (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  provider text not null check (provider in ('gradescope', 'canvas', 'ed')),
  secret text not null,
  status text not null default 'ok' check (status in ('ok', 'expired', 'error')),
  last_error text,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  code text not null,
  term text,
  gradescope_id text,
  canvas_id text,
  ed_id text,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, gradescope_id),
  unique (user_id, canvas_id),
  unique (user_id, ed_id)
);

-- Gradescope assignments. `done_at` is a manual check-off and is never touched by sync.
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  external_id text not null,
  title text not null,
  url text,
  released_at timestamptz,
  due_at timestamptz,
  late_due_at timestamptz,
  status text not null default 'missing' check (status in ('submitted', 'graded', 'missing')),
  score text,
  done_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, external_id)
);
create index assignments_due_idx on public.assignments (user_id, due_at);
create index assignments_course_idx on public.assignments (course_id);

-- `read_at` is set from the inbox and is never touched by sync.
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  source text not null check (source in ('canvas', 'ed')),
  external_id text not null,
  title text not null,
  body text not null default '',
  author text,
  url text,
  posted_at timestamptz not null,
  read_at timestamptz,
  unique (user_id, source, external_id)
);
create index announcements_posted_idx on public.announcements (user_id, posted_at desc);
create index announcements_course_idx on public.announcements (course_id);

do $$
declare t text;
begin
  foreach t in array array['class_connections', 'courses', 'assignments', 'announcements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

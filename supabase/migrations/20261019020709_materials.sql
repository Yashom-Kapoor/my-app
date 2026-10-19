-- Course materials: discovered by the Hub sync, transcribed by the ingest-materials Claude Code skill.

alter table public.courses add column website_url text;

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  kind text not null check (kind in ('slides', 'discussion', 'solutions', 'exam_prep', 'exam', 'notes', 'other')),
  format text not null check (format in ('pdf', 'gslides', 'html')),
  title text not null,
  week_label text,
  sort_date date,
  source_url text not null,
  -- Solutions point at the worksheet they answer.
  parent_id uuid references public.materials on delete set null,
  storage_path text,
  content_hash text,
  page_count integer,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  error text,
  discovered_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (user_id, source_url)
);
create index materials_course_idx on public.materials (course_id, sort_date);
create index materials_status_idx on public.materials (user_id, status);
create index materials_parent_idx on public.materials (parent_id);

create table public.material_pages (
  material_id uuid not null references public.materials on delete cascade,
  page integer not null check (page > 0),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  markdown text not null,
  needs_review boolean not null default false,
  primary key (material_id, page)
);
create index material_pages_user_idx on public.material_pages (user_id);

do $$
declare t text;
begin
  foreach t in array array['materials', 'material_pages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Original files, stored at <user id>/<course id>/<material id>.pdf. The ingest skill writes with the
-- secret key; the app only reads its owner's folder (to sign "Open original" links).
insert into storage.buckets (id, name, public) values ('materials', 'materials', false);
create policy "owner read materials" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);

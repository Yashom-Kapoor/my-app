# Hub

Personal everything app. Next.js 16 + Supabase, installable as a PWA.

## Setup

1. `cp .env.example .env.local` and fill in your Supabase URL, publishable key, and `ALLOWED_EMAIL`.
2. In the Supabase dashboard → Authentication:
   - **URL Configuration**: set Site URL and add `http://localhost:3000/auth/confirm` (and your prod URL) to Redirect URLs.
   - **Sign In / Providers**: after your first sign-in, turn off "Allow new users to sign up".
3. `npm install && npm run dev`

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`.

## Structure

- `src/app/(app)/` — signed-in app. Each module is a folder (`nutrition/`, …).
- `src/lib/modules.ts` — module registry; drives the sidebar and mobile tab bar.
- `src/lib/supabase/` — browser/server clients and the session-refresh helper used by `src/proxy.ts`.
- `src/proxy.ts` — refreshes the session and redirects signed-out requests to `/login`.
- `src/app/manifest.ts`, `public/sw.js`, `public/icons/` — PWA. The service worker only registers in production builds.
- `supabase/migrations/` — schema changes (`supabase migration new <name>`).

## Adding a module

1. Create `src/app/(app)/<slug>/page.tsx`.
2. Add `{ href: "/<slug>", name, icon }` to `src/lib/modules.ts`.
3. Add tables in a migration using the pattern below.

## Table convention

New `public` tables are not exposed to the Data API automatically, so grant access explicitly and always enable RLS:

```sql
create table public.example (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.example enable row level security;
grant select, insert, update, delete on public.example to authenticated;

create policy "owner select" on public.example for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner insert" on public.example for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner update" on public.example for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owner delete" on public.example for delete to authenticated using ((select auth.uid()) = user_id);
```

## Installing on your phone

Deploy (e.g. Vercel), open the site in Safari → Share → **Add to Home Screen**. On Android/Chrome use **Install app**.

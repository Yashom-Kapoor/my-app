-- Materials deliberately left untranscribed (e.g. a full published textbook). Unlike failed, they don't count as waiting.

alter table public.materials drop constraint materials_status_check;
alter table public.materials
  add constraint materials_status_check check (status in ('pending', 'processing', 'ready', 'failed', 'skipped'));

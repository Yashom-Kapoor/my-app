-- Projects and homework as materials; ipynb notebooks are converted by Hub itself, like html.

alter table public.materials drop constraint materials_kind_check;
alter table public.materials
  add constraint materials_kind_check check (kind in ('slides', 'discussion', 'solutions', 'exam_prep', 'exam', 'notes', 'other', 'project', 'homework'));

alter table public.materials drop constraint materials_format_check;
alter table public.materials
  add constraint materials_format_check check (format in ('pdf', 'gslides', 'html', 'ipynb'));

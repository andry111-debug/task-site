-- N_119_site_sections_sync
-- Таблицы для обмена локальной программы OPR Project Manager с сайтом.
-- В таблицах хранятся только справочники и карточки файлов. Бинарные файлы в БД не записываются.

create table if not exists public.opr_site_sections (
  id text primary key,
  project_key text not null default 'opr_donetsk',
  building_gp_no text,
  building_name text,
  building_key text,
  stage text,
  section_code text,
  section_title text,
  cipher text,
  common_storage_folder text,
  common_latest_version_name text,
  gip_storage_folder text,
  is_common_site_section boolean not null default false,
  active boolean not null default true,
  source_updated_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opr_site_section_files (
  id uuid primary key default gen_random_uuid(),
  section_id text not null references public.opr_site_sections(id) on delete cascade,
  project_key text not null default 'opr_donetsk',
  building_gp_no text,
  building_name text,
  stage text,
  section_code text,
  section_title text,
  file_name text,
  file_url text,
  yandex_path text,
  storage_path text,
  comment text,
  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_opr_site_sections_project on public.opr_site_sections(project_key);
create index if not exists idx_opr_site_sections_building on public.opr_site_sections(building_key);
create index if not exists idx_opr_site_sections_stage_code on public.opr_site_sections(stage, section_code);
create index if not exists idx_opr_site_section_files_section on public.opr_site_section_files(section_id);
create index if not exists idx_opr_site_section_files_project on public.opr_site_section_files(project_key);

alter table public.opr_site_sections enable row level security;
alter table public.opr_site_section_files enable row level security;

-- Для текущей простой схемы сайта доступ идет через ключ Supabase, как в существующих таблицах сайта.
-- Если в проекте уже включена строгая авторизация, политики можно заменить на более узкие.

drop policy if exists "opr_site_sections_select_all" on public.opr_site_sections;
create policy "opr_site_sections_select_all"
  on public.opr_site_sections for select
  using (true);

drop policy if exists "opr_site_sections_insert_all" on public.opr_site_sections;
create policy "opr_site_sections_insert_all"
  on public.opr_site_sections for insert
  with check (true);

drop policy if exists "opr_site_sections_update_all" on public.opr_site_sections;
create policy "opr_site_sections_update_all"
  on public.opr_site_sections for update
  using (true)
  with check (true);

drop policy if exists "opr_site_section_files_select_all" on public.opr_site_section_files;
create policy "opr_site_section_files_select_all"
  on public.opr_site_section_files for select
  using (true);

drop policy if exists "opr_site_section_files_insert_all" on public.opr_site_section_files;
create policy "opr_site_section_files_insert_all"
  on public.opr_site_section_files for insert
  with check (true);

drop policy if exists "opr_site_section_files_update_all" on public.opr_site_section_files;
create policy "opr_site_section_files_update_all"
  on public.opr_site_section_files for update
  using (true)
  with check (true);

create or replace function public.set_opr_site_sync_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_opr_site_sections_updated_at on public.opr_site_sections;
create trigger trg_opr_site_sections_updated_at
before update on public.opr_site_sections
for each row execute function public.set_opr_site_sync_updated_at();

drop trigger if exists trg_opr_site_section_files_updated_at on public.opr_site_section_files;
create trigger trg_opr_site_section_files_updated_at
before update on public.opr_site_section_files
for each row execute function public.set_opr_site_sync_updated_at();

-- N_149. Очередь входящих файлов, загруженных пользователями сайта.
-- Файл физически загружается на Яндекс.Диск во временную папку /Папка ГИПа/_Входящие_с_сайта/...
-- Эта таблица хранит заявку на обработку файла локальной программой ГИПа.

create extension if not exists pgcrypto;

create table if not exists public.opr_site_incoming_files (
    id uuid primary key default gen_random_uuid(),
    project_key text not null default 'opr_donetsk',
    site_section_id text,
    building_gp_no text,
    building_name text,
    stage text,
    section_code text,
    section_title text,
    target_area text not null default 'source',
    target_yandex_folder text,
    original_filename text not null,
    stored_filename text not null,
    yandex_temp_path text not null,
    file_size bigint,
    sha256 text,
    mime_type text,
    uploaded_by text,
    uploaded_by_email text,
    uploaded_at timestamptz not null default now(),
    user_comment text,
    status text not null default 'pending',
    gip_decision text,
    gip_comment text,
    processing_started_at timestamptz,
    processing_by text,
    processed_at timestamptz,
    final_yandex_path text,
    created_document_card_id uuid,
    error_message text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint opr_site_incoming_files_status_check check (status in ('pending','viewed','processing','approved','rejected','done','error')),
    constraint opr_site_incoming_files_target_area_check check (target_area in ('project_file','tz','source','remark','answer'))
);

create index if not exists opr_site_incoming_files_project_status_idx
    on public.opr_site_incoming_files(project_key, status, uploaded_at desc);

create index if not exists opr_site_incoming_files_section_idx
    on public.opr_site_incoming_files(site_section_id, uploaded_at desc);

create or replace function public.set_opr_site_incoming_files_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_opr_site_incoming_files_updated_at on public.opr_site_incoming_files;
create trigger trg_opr_site_incoming_files_updated_at
before update on public.opr_site_incoming_files
for each row
execute function public.set_opr_site_incoming_files_updated_at();

alter table public.opr_site_incoming_files enable row level security;

drop policy if exists "opr_site_incoming_files_select" on public.opr_site_incoming_files;
create policy "opr_site_incoming_files_select"
on public.opr_site_incoming_files
for select
using (true);

drop policy if exists "opr_site_incoming_files_insert" on public.opr_site_incoming_files;
create policy "opr_site_incoming_files_insert"
on public.opr_site_incoming_files
for insert
with check (true);

drop policy if exists "opr_site_incoming_files_update" on public.opr_site_incoming_files;
create policy "opr_site_incoming_files_update"
on public.opr_site_incoming_files
for update
using (true)
with check (true);

-- N_207_gapa_action_history.sql
-- История действий ГАПА: скачивания с сайта, загрузки ГИПу, отмена загрузки.
-- Также расширяет допустимые статусы входящих файлов значением cancelled.

create extension if not exists pgcrypto;

create table if not exists public.opr_site_action_history (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    event_at timestamptz not null default now(),
    project_key text not null default 'opr_donetsk',
    action_type text not null,
    action_title text,
    actor_name text,
    actor_login text,
    actor_role text,
    site_section_id text,
    incoming_file_id text,
    document_card_id text,
    building_gp_no text,
    building_name text,
    stage text,
    section_code text,
    section_title text,
    target_area text,
    file_name text,
    file_size bigint,
    yandex_path text,
    file_url text,
    status text,
    decision text,
    comment text,
    details jsonb not null default '{}'::jsonb,
    active boolean not null default true
);

alter table public.opr_site_action_history
  add column if not exists event_at timestamptz not null default now(),
  add column if not exists project_key text not null default 'opr_donetsk',
  add column if not exists action_type text,
  add column if not exists action_title text,
  add column if not exists actor_name text,
  add column if not exists actor_login text,
  add column if not exists actor_role text,
  add column if not exists site_section_id text,
  add column if not exists incoming_file_id text,
  add column if not exists document_card_id text,
  add column if not exists building_gp_no text,
  add column if not exists building_name text,
  add column if not exists stage text,
  add column if not exists section_code text,
  add column if not exists section_title text,
  add column if not exists target_area text,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists yandex_path text,
  add column if not exists file_url text,
  add column if not exists status text,
  add column if not exists decision text,
  add column if not exists comment text,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists active boolean not null default true;

create index if not exists idx_opr_site_action_history_project_event
  on public.opr_site_action_history(project_key, event_at desc);

create index if not exists idx_opr_site_action_history_section
  on public.opr_site_action_history(site_section_id, event_at desc);

create index if not exists idx_opr_site_action_history_incoming
  on public.opr_site_action_history(incoming_file_id);

alter table public.opr_site_action_history enable row level security;

drop policy if exists "opr_site_action_history_select" on public.opr_site_action_history;
create policy "opr_site_action_history_select"
on public.opr_site_action_history
for select
using (true);

drop policy if exists "opr_site_action_history_insert" on public.opr_site_action_history;
create policy "opr_site_action_history_insert"
on public.opr_site_action_history
for insert
with check (true);

drop policy if exists "opr_site_action_history_update" on public.opr_site_action_history;
create policy "opr_site_action_history_update"
on public.opr_site_action_history
for update
using (true)
with check (true);

alter table public.opr_site_incoming_files
  drop constraint if exists opr_site_incoming_files_status_check;

alter table public.opr_site_incoming_files
  add constraint opr_site_incoming_files_status_check
  check (status in ('pending','viewed','processing','approved','rejected','done','error','cancelled'));

-- N_269. Complete norm-controller site migration and safe employees role check update.
-- This file replaces N_266/N_267/N_268 for autodeploy packages.
-- Idempotent migration; safe to run repeatedly.

create extension if not exists pgcrypto;

alter table public.opr_site_sections
  add column if not exists norm_control_ready boolean not null default false,
  add column if not exists norm_control_files jsonb not null default '[]'::jsonb,
  add column if not exists norm_control_updated_at text,
  add column if not exists norm_control_completed boolean not null default false,
  add column if not exists norm_control_completed_at text,
  add column if not exists norm_control_completed_by text;

create table if not exists public.opr_site_norm_control_files (
    id uuid primary key default gen_random_uuid(),
    project_key text not null default 'opr_donetsk',
    site_section_id text,
    section_id text,
    building_gp_no text,
    building_name text,
    stage text,
    section_code text,
    section_title text,
    file_name text not null,
    original_name text,
    yandex_disk_path text,
    yandex_path text,
    storage_path text,
    local_file_path text,
    file_size bigint,
    mime_type text,
    uploaded_by text,
    uploaded_by_email text,
    uploaded_at timestamptz not null default now(),
    comment text,
    status text not null default 'uploaded',
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.opr_site_norm_control_files
  add column if not exists project_key text not null default 'opr_donetsk',
  add column if not exists site_section_id text,
  add column if not exists section_id text,
  add column if not exists building_gp_no text,
  add column if not exists building_name text,
  add column if not exists stage text,
  add column if not exists section_code text,
  add column if not exists section_title text,
  add column if not exists file_name text,
  add column if not exists original_name text,
  add column if not exists yandex_disk_path text,
  add column if not exists yandex_path text,
  add column if not exists storage_path text,
  add column if not exists local_file_path text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text,
  add column if not exists uploaded_by text,
  add column if not exists uploaded_by_email text,
  add column if not exists uploaded_at timestamptz not null default now(),
  add column if not exists comment text,
  add column if not exists status text not null default 'uploaded',
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_opr_site_sections_norm_control
  on public.opr_site_sections(project_key, norm_control_ready, norm_control_completed, active);

create index if not exists idx_opr_site_norm_control_files_project_section
  on public.opr_site_norm_control_files(project_key, site_section_id, uploaded_at desc);

create index if not exists idx_opr_site_norm_control_files_active
  on public.opr_site_norm_control_files(project_key, active);

create or replace function public.set_opr_site_norm_control_files_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_opr_site_norm_control_files_updated_at on public.opr_site_norm_control_files;
create trigger trg_opr_site_norm_control_files_updated_at
before update on public.opr_site_norm_control_files
for each row
execute function public.set_opr_site_norm_control_files_updated_at();

alter table public.opr_site_norm_control_files enable row level security;

drop policy if exists "opr_site_norm_control_files_select" on public.opr_site_norm_control_files;
create policy "opr_site_norm_control_files_select"
on public.opr_site_norm_control_files
for select
using (true);

drop policy if exists "opr_site_norm_control_files_insert" on public.opr_site_norm_control_files;
create policy "opr_site_norm_control_files_insert"
on public.opr_site_norm_control_files
for insert
with check (true);

drop policy if exists "opr_site_norm_control_files_update" on public.opr_site_norm_control_files;
create policy "opr_site_norm_control_files_update"
on public.opr_site_norm_control_files
for update
using (true)
with check (true);

-- Allow files returned by norm-controller without breaking older incoming-file target values.
do $$
begin
    if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public' and table_name = 'opr_site_incoming_files'
    ) then
        alter table public.opr_site_incoming_files
          drop constraint if exists opr_site_incoming_files_target_area_check;
        alter table public.opr_site_incoming_files
          add constraint opr_site_incoming_files_target_area_check
          check (target_area in ('project_file','tz','source','remark','answer','norm_control_result'));
    end if;
end;
$$;

-- Add norm-controller role safely.
-- The previous N_267 migration used a fixed list and could fail if the real database
-- already contained a role not present in that list. This migration preserves all
-- existing role values and adds the norm-controller aliases needed by the site.
do $$
declare
    allowed_roles text[];
    allowed_sql text;
begin
    if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public' and table_name = 'employees'
    ) and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public' and table_name = 'employees' and column_name = 'role'
    ) then
        select array_agg(distinct role_value order by role_value)
        into allowed_roles
        from (
            select role::text as role_value
            from public.employees
            where role is not null
            union all select 'admin'
            union all select 'architect'
            union all select 'arhitect'
            union all select 'архитектор'
            union all select 'designer'
            union all select 'employee'
            union all select 'projectant'
            union all select 'proektant'
            union all select 'customer_service'
            union all select 'customer'
            union all select 'client'
            union all select 'zakazchik'
            union all select 'external'
            union all select 'external_people'
            union all select 'other'
            union all select 'guest'
            union all select 'norm_controller'
            union all select 'normcontrol'
            union all select 'norm_control'
            union all select 'normal_controller'
            union all select 'нормаконтролер'
            union all select 'нормоконтролер'
        ) roles
        where role_value is not null;

        select string_agg(quote_literal(role_value), ', ' order by role_value)
        into allowed_sql
        from unnest(allowed_roles) as role_value;

        execute 'alter table public.employees drop constraint if exists employees_role_check';
        execute 'alter table public.employees add constraint employees_role_check check (role is null or role::text in (' || allowed_sql || '))';
    end if;
end;
$$;

notify pgrst, 'reload schema';

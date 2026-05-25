
-- N_141. Table for document cards exported from local GIP program.
-- Run once in Supabase SQL Editor before "Синхронизировать карточки документов".

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.opr_site_section_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    project_key text,
    section_id text,
    site_section_id text,
    building_gp_no text,
    building_name text,
    stage text,
    section_code text,
    section_title text,
    document_type text,
    document_group text,
    file_name text,
    original_name text,
    file_url text,
    yandex_path text,
    yandex_disk_path text,
    storage_path text,
    local_file_path text,
    size_bytes bigint,
    modified_at text,
    registered_at text,
    registered_by text,
    uploaded_by text,
    comment text,
    status text DEFAULT 'registered',
    active boolean DEFAULT true,
    source_hash text,
    source_exists boolean DEFAULT true,
    source_updated_at text
);

ALTER TABLE public.opr_site_section_files
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS project_key text,
  ADD COLUMN IF NOT EXISTS site_section_id text,
  ADD COLUMN IF NOT EXISTS building_gp_no text,
  ADD COLUMN IF NOT EXISTS building_name text,
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS section_code text,
  ADD COLUMN IF NOT EXISTS section_title text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS document_group text,
  ADD COLUMN IF NOT EXISTS original_name text,
  ADD COLUMN IF NOT EXISTS yandex_disk_path text,
  ADD COLUMN IF NOT EXISTS local_file_path text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS modified_at text,
  ADD COLUMN IF NOT EXISTS registered_at text,
  ADD COLUMN IF NOT EXISTS registered_by text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'registered',
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS source_exists boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_updated_at text;

CREATE INDEX IF NOT EXISTS idx_opr_site_section_files_project_active
  ON public.opr_site_section_files (project_key, active);

CREATE INDEX IF NOT EXISTS idx_opr_site_section_files_section
  ON public.opr_site_section_files (section_id);

CREATE INDEX IF NOT EXISTS idx_opr_site_section_files_type
  ON public.opr_site_section_files (document_type);

-- N_138. Path-map fields for website directory.
-- Run once in Supabase SQL Editor before syncing from local program.

ALTER TABLE public.opr_site_sections
  ADD COLUMN IF NOT EXISTS project_files_yandex_path text,
  ADD COLUMN IF NOT EXISTS technical_task_yandex_path text,
  ADD COLUMN IF NOT EXISTS gip_base_yandex_path text,
  ADD COLUMN IF NOT EXISTS sources_yandex_path text,
  ADD COLUMN IF NOT EXISTS remarks_yandex_path text,
  ADD COLUMN IF NOT EXISTS answers_yandex_path text,
  ADD COLUMN IF NOT EXISTS common_yandex_path text,
  ADD COLUMN IF NOT EXISTS gip_yandex_path text,
  ADD COLUMN IF NOT EXISTS gip_local_path text,
  ADD COLUMN IF NOT EXISTS local_gip_sync_path text,
  ADD COLUMN IF NOT EXISTS path_map_updated_at text;

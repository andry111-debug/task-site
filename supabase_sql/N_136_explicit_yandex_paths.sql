-- N_135. Explicit Yandex.Disk paths exported by the local GIP program.
-- Run this once in Supabase SQL Editor before pressing "Синхронизировать разделы" in the local program.

ALTER TABLE public.opr_site_sections
  ADD COLUMN IF NOT EXISTS project_files_yandex_path text,
  ADD COLUMN IF NOT EXISTS technical_task_yandex_path text,
  ADD COLUMN IF NOT EXISTS gip_base_yandex_path text,
  ADD COLUMN IF NOT EXISTS sources_yandex_path text,
  ADD COLUMN IF NOT EXISTS remarks_yandex_path text,
  ADD COLUMN IF NOT EXISTS answers_yandex_path text;

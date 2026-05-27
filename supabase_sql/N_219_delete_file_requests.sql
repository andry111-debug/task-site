-- N_219_delete_file_requests.sql
-- Заявки сайта ГАПА на удаление файлов из карточки раздела.
-- Файл не удаляется автоматически: программа ГИПа после подтверждения переименовывает его с префиксом _Х_
-- и убирает запись из карточки раздела.

alter table public.opr_site_incoming_files
  add column if not exists request_type text not null default 'upload',
  add column if not exists document_card_id text,
  add column if not exists source_yandex_path text,
  add column if not exists source_local_path text,
  add column if not exists source_document_group text;

alter table public.opr_site_incoming_files
  drop constraint if exists opr_site_incoming_files_request_type_check;

alter table public.opr_site_incoming_files
  add constraint opr_site_incoming_files_request_type_check
  check (request_type in ('upload','delete_file'));

create index if not exists opr_site_incoming_files_request_type_idx
  on public.opr_site_incoming_files(project_key, request_type, status, uploaded_at desc);

alter table public.opr_site_action_history
  add column if not exists request_type text;

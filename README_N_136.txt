N_136_project_site_explicit_yandex_paths

Сайт больше не пытается самостоятельно строить пути исходников и замечаний.
Он сначала использует поля, выгруженные локальной программой:
- project_files_yandex_path
- technical_task_yandex_path
- sources_yandex_path
- remarks_yandex_path

Если этих полей еще нет или они пустые, оставлен старый fallback.
Перед полноценной проверкой выполните SQL из supabase_sql/N_136_explicit_yandex_paths.sql и синхронизируйте разделы локальной программой N_135.

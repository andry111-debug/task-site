N_142 project site - отображение карточек документов из локальной программы

Что изменено:
1. Версия сайта: N_142.
2. Блок "Зарегистрированные документы" читает карточки, выгруженные локальной программой N_141 в opr_site_section_files.
3. Скачивание работает по yandex_disk_path / yandex_path через Edge Function yandex-disk-readonly.
4. Поддерживаются document_type: project_file, tz/technical_task, source, remark. Ответы исполнителя отображаются в группе "Замечания".

Перед проверкой:
1. Выполнить SQL supabase_sql/N_142_document_cards.sql.
2. В локальной программе N_141 выполнить "Синхронизировать карточки документов".

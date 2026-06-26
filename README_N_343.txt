N_343_project_site_archive_download_query_route_fix

Исправление скачивания готового общего архива нормоконтроля.

Причина:
- В N_342 ссылка шла на /api/archive-download/<jobId>/<fileName>.
- На текущем Vercel nested/catch-all API route не отработал, поэтому Vercel показывал 404 NOT_FOUND.

Что изменено:
1. Добавлен простой явный route:
   /api/archive-download?jobId=...&fileName=...
2. Сайт теперь преобразует ссылку готового архива именно в этот формат.
3. GIP API менять не требуется, достаточно версии N_340 или новее.

Установка:
- В автодеплое выбрать этот архив.
- Галочку обновления GIP API выключить.
- SQL не включать.

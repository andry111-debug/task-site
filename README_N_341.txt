N_341_project_site_plus_gip_api_archive_download_proxy_fix

Назначение:
- Исправляет скачивание готового общего ZIP архива нормоконтроля.
- В N_340 архив формировался, но ссылка открывалась как обычная страница Vercel /archive-download/... и давала 404 NOT_FOUND.

Что изменено:
1. GIP API теперь отдаёт ссылку /api/archive-download/... вместо /archive-download/...
2. GIP API принимает скачивание архива по двум адресам:
   - /archive-download/:jobId/:fileName
   - /api/archive-download/:jobId/:fileName
3. Сайт нормализует ссылку архива и открывает её через свой GIP API proxy (/api/archive-download/...).
4. Фоновая сборка архива, прогресс-бар и нечувствительность путей к регистру сохранены.

SQL не нужен.
GIP API надо обновить обязательно.

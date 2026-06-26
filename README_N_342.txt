N_342 project site archive download explicit route fix

Исправление:
- Добавлен явный Vercel API route: api/archive-download/[...parts].js.
- Готовый архив нормоконтроля теперь скачивается через явный proxy route, а не через общий catch-all api/[...path].js.
- Это исправляет 404 NOT_FOUND от Vercel при нажатии «Скачать готовый архив».

SQL не требуется.
GIP API менять не требуется, достаточно установленного N_340/N_341.

N_166_project_site_vercel_explicit_api_routes

Исправление для Vercel:
- добавлены явные серверные маршруты:
  /api/health
  /api/yandex
  /api/supabase/query
- оставлен резервный catch-all /api/*;
- сайт продолжает использовать VITE_GIP_API_BASE_URL=/api;
- Vercel Environment Variables должны содержать:
  VITE_GIP_API_BASE_URL=/api
  GIP_API_UPSTREAM=http://IP_СЕРВЕРА:3100/api

После деплоя проверить:
1) https://task-site-iota.vercel.app/api/health
2) вход на сайт.

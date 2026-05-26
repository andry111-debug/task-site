N_165_project_site_vercel_api_proxy

Назначение:
- сайт работает на Vercel;
- браузер обращается к /api на том же домене Vercel;
- Vercel-прокси пересылает запросы на постоянный GIP API на Windows Server;
- прямые запросы браузера к Supabase не используются.

Что должно быть в Vercel Environment Variables:
1. VITE_GIP_API_BASE_URL=/api
2. GIP_API_UPSTREAM=http://IP_СЕРВЕРА:3100/api

IP_СЕРВЕРА заменить на фактический адрес Windows Server, где уже открывается:
http://IP_СЕРВЕРА:3100/api/health

После изменения переменных обязательно выполнить новый Deploy/Redeploy.

Проверка после деплоя:
1. Открыть https://task-site-iota.vercel.app/api/health
2. Должен открыться JSON с ok:true.
3. Открыть сайт и проверить загрузку данных.

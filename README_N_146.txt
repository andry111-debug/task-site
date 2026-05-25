N_146_project_site_archive_function_and_contrast_fix

Исправления:
1. Улучшена контрастность верхней части специализированного интерфейса архитектора.
2. Добавлена более понятная ошибка, если Edge Function yandex-disk-readonly не обновлена и не поддерживает action=content.
3. В архив включен актуальный код Edge Function: supabase/functions/yandex-disk-readonly/index.ts.

Важно:
Для работы кнопки "Скачать архивом" недостаточно обновить только сайт. Нужно также обновить Edge Function yandex-disk-readonly в Supabase Dashboard:
Edge Functions -> yandex-disk-readonly -> Code -> заменить весь код на код из supabase/functions/yandex-disk-readonly/index.ts -> Deploy.

SQL выполнять не нужно.

N_185_project_site_project_manager_role_db_fix

Назначение:
- исправляет проблему создания учетной записи с ролью "Руководитель проекта";
- добавлен SQL-файл supabase_sql/N_185_employees_project_manager_role_check.sql;
- в сообщениях админки добавлена понятная подсказка, если Supabase возвращает ошибку employees_role_check.

Причина ошибки:
- в таблице public.employees есть check constraint employees_role_check;
- в базе данных он еще не содержит значение project_manager;
- сайт уже отправляет роль project_manager, поэтому Supabase отклоняет новую строку.

Что сделать:
1. Открыть Supabase -> SQL Editor.
2. Выполнить файл supabase_sql/N_185_employees_project_manager_role_check.sql.
3. После этого снова добавить пользователя с ролью "Руководитель проекта".

Код сайта:
- основан на N_184_project_site_project_manager_role;
- GIP API менять не требуется;
- локальную программу менять не требуется.

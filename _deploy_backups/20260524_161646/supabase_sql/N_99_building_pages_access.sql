-- N_99: доступ к страницам зданий и переименование графиков
-- Выполнить в Supabase -> SQL Editor -> New query -> Run
-- Добавляет элемент доступа "buildings" существующим пользователям.

alter table public.employees
add column if not exists allowed_elements jsonb;

update public.employees
set allowed_elements = '["schedule","compact","ppt","buildings","accounts"]'::jsonb
where role = 'admin';

update public.employees
set allowed_elements = coalesce(allowed_elements, '[]'::jsonb) || '["buildings"]'::jsonb
where role in ('designer', 'customer_service', 'employee', 'external')
  and not (coalesce(allowed_elements, '[]'::jsonb) ? 'buildings');

update public.employees
set allowed_elements = '["schedule","compact","buildings"]'::jsonb
where allowed_elements is null
   or jsonb_typeof(allowed_elements) <> 'array'
   or jsonb_array_length(allowed_elements) = 0;

grant all on public.employees to anon, authenticated;

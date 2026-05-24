-- N_96: доступ к сокращенному графику
-- Выполнить в Supabase -> SQL Editor -> New query -> Run
-- Добавляет элемент "compact" в индивидуальные доступы пользователей.

alter table public.employees
add column if not exists allowed_elements jsonb;

update public.employees
set allowed_elements = '["schedule","ppt","compact","accounts"]'::jsonb
where role = 'admin';

update public.employees
set allowed_elements = (
    select jsonb_agg(distinct value)
    from jsonb_array_elements_text(coalesce(allowed_elements, '[]'::jsonb)) as value
)
where allowed_elements is not null;

update public.employees
set allowed_elements = coalesce(allowed_elements, '[]'::jsonb) || '["compact"]'::jsonb
where role in ('designer', 'customer_service', 'employee')
  and not (coalesce(allowed_elements, '[]'::jsonb) ? 'compact');

update public.employees
set allowed_elements = coalesce(allowed_elements, '[]'::jsonb) || '["compact"]'::jsonb
where role = 'external'
  and not (coalesce(allowed_elements, '[]'::jsonb) ? 'compact');

update public.employees
set allowed_elements = '["schedule","compact"]'::jsonb
where allowed_elements is null
   or jsonb_typeof(allowed_elements) <> 'array'
   or jsonb_array_length(allowed_elements) = 0;

grant all on public.employees to anon, authenticated;

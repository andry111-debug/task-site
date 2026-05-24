-- N_95: индивидуальные доступы пользователя к элементам сайта
-- Выполнить в Supabase -> SQL Editor -> New query -> Run
-- После выполнения в админке можно указывать доступные элементы для каждого пользователя.

alter table public.employees
add column if not exists allowed_elements jsonb;

update public.employees
set allowed_elements = '["schedule","ppt","accounts"]'::jsonb
where role = 'admin'
  and (allowed_elements is null or jsonb_typeof(allowed_elements) <> 'array');

update public.employees
set allowed_elements = '["schedule","ppt"]'::jsonb
where role in ('designer', 'employee')
  and (allowed_elements is null or jsonb_typeof(allowed_elements) <> 'array');

update public.employees
set allowed_elements = '["schedule","ppt"]'::jsonb
where role = 'customer_service'
  and (allowed_elements is null or jsonb_typeof(allowed_elements) <> 'array');

update public.employees
set allowed_elements = '["schedule"]'::jsonb
where role = 'external'
  and (allowed_elements is null or jsonb_typeof(allowed_elements) <> 'array');

update public.employees
set allowed_elements = '["schedule"]'::jsonb
where allowed_elements is null
   or jsonb_typeof(allowed_elements) <> 'array'
   or jsonb_array_length(allowed_elements) = 0;

grant all on public.employees to anon, authenticated;

-- N_85: роли пользователей для сайта графика проектирования
-- Выполнить один раз в Supabase -> SQL Editor -> New query -> Run
-- После выполнения можно применять архив сайта и делать деплой.

create extension if not exists pgcrypto;

create table if not exists employees (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    login text not null unique,
    pin_code text not null,
    role text not null default 'designer',
    active boolean not null default true,
    created_at timestamptz not null default now()
);

do $$
declare
    item record;
begin
    for item in
        select conname
        from pg_constraint
        where conrelid = 'employees'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%role%'
    loop
        execute format('alter table employees drop constraint %I', item.conname);
    end loop;
end $$;

alter table employees
add constraint employees_role_check
check (role in ('admin', 'designer', 'customer_service', 'external'));

update employees
set role = 'designer'
where role = 'employee';

insert into employees (name, login, pin_code, role, active)
values
    ('Администратор', 'admin', '1111', 'admin', true),
    ('Проектант', 'proektant', '2222', 'designer', true),
    ('Служба заказчика', 'zakazchik', '3333', 'customer_service', true),
    ('Внешний пользователь', 'external', '4444', 'external', true)
on conflict (login)
do update set
    name = excluded.name,
    pin_code = excluded.pin_code,
    role = excluded.role,
    active = true;

alter table employees enable row level security;

drop policy if exists "test_public_all_employees" on employees;
drop policy if exists "public_all_employees" on employees;

create policy "public_all_employees"
on employees
for all
to anon, authenticated
using (true)
with check (true);

grant usage on schema public to anon, authenticated;
grant all on employees to anon, authenticated;

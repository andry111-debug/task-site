-- N_93: окончательное исправление ролей employees
-- Выполнить в Supabase -> SQL Editor -> New query -> Run
-- Обязательно выполнить, если добавление пользователя выдаёт:
-- new row for relation "employees" violates check constraint "employees_role_check"

create extension if not exists pgcrypto;

create table if not exists public.employees (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    login text not null unique,
    pin_code text not null,
    role text not null default 'designer',
    active boolean not null default true,
    created_at timestamptz not null default now()
);

-- Удаляем все CHECK-ограничения таблицы employees.
-- Это безопаснее, чем искать только по тексту role, потому что старое ограничение могло иметь разный текст.
do $$
declare
    item record;
begin
    for item in
        select c.conname
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'employees'
          and c.contype = 'c'
    loop
        execute format('alter table public.employees drop constraint if exists %I', item.conname);
    end loop;
end $$;

-- Приводим старые роли к новой схеме.
update public.employees
set role = 'designer'
where role in ('employee', 'projectant', 'proektant', 'проектант', 'проектанты');

update public.employees
set role = 'customer_service'
where role in ('customer', 'client', 'zakazchik', 'служба заказчика', 'заказчик');

update public.employees
set role = 'external'
where role in ('other', 'guest', 'external_people', 'сторонние люди');

update public.employees
set role = 'designer'
where role not in ('admin', 'designer', 'customer_service', 'external');

-- Создаём новое правильное ограничение.
alter table public.employees
add constraint employees_role_check
check (role in ('admin', 'designer', 'customer_service', 'external'));

alter table public.employees enable row level security;

drop policy if exists "test_public_all_employees" on public.employees;
drop policy if exists "public_all_employees" on public.employees;

create policy "public_all_employees"
on public.employees
for all
to anon, authenticated
using (true)
with check (true);

grant usage on schema public to anon, authenticated;
grant all on public.employees to anon, authenticated;

insert into public.employees (name, login, pin_code, role, active)
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

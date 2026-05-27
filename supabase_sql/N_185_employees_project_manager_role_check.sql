-- N_185_employees_project_manager_role_check.sql
-- Исправление ограничения employees_role_check для новой роли "Руководитель проекта".
-- Выполнить один раз в Supabase SQL Editor.

alter table public.employees
  drop constraint if exists employees_role_check;

alter table public.employees
  add constraint employees_role_check
  check (
    role in (
      'admin',
      'employee',
      'designer',
      'architect',
      'project_manager',
      'customer_service',
      'external'
    )
  );

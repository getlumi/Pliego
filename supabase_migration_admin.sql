-- Pliego · Migración: campo is_admin en users
-- Pegar en Supabase → SQL Editor → Run

alter table public.users
  add column if not exists is_admin boolean not null default false;

-- Para marcar un usuario como admin (cambiar el número):
-- update public.users set is_admin = true where phone = 'TU_NUMERO';

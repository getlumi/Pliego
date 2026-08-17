-- =============================================
-- PLIEGO · Logo de papelería
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Reutiliza el bucket 'avatars' que ya existe (mismas políticas RLS —
-- cada dueño solo puede subir dentro de su propia carpeta {auth.uid()}/,
-- y el dueño de una papelería usa esa misma cuenta). No hace falta
-- bucket nuevo ni políticas nuevas — solo la columna para guardar la URL.
-- =============================================

alter table public.printshops add column if not exists logo_url text;

-- =============================================
-- PLIEGO · Fix: falta la política de DELETE en printshop_services
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Bug real, no de hoy: desde el commit original de "tipos de hoja
-- personalizados" solo existían políticas de select/insert/update para
-- printshop_services — nunca una de delete. Con RLS activado, eso
-- significa que TODO intento de borrar un tipo personalizado se
-- bloqueaba en silencio (Supabase no lanza error, solo no borra nada) —
-- por eso al eliminar, guardar, salir y volver, siempre reaparecía.
-- =============================================

drop policy if exists "services_delete_owner" on public.printshop_services;

create policy "services_delete_owner" on public.printshop_services for delete
  using (auth.uid() = (select owner_id from public.printshops where id = printshop_id));

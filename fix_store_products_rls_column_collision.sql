-- =============================================
-- PLIEGO · FIX REAL: las políticas de store-products comparaban contra
-- el NOMBRE DEL NEGOCIO en vez del nombre del archivo subido
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Causa exacta (confirmada viendo la política tal como quedó guardada):
-- "storage.foldername(name)" sin calificar la tabla — como el subquery
-- también usa una tabla "printshops" que TIENE su propia columna
-- "name" (el nombre del negocio, ej. "papetest"), Postgres resolvió el
-- nombre ambiguo contra la tabla MÁS CERCANA (printshops), no contra
-- storage.objects (el archivo real que se sube). Un nombre de negocio
-- nunca tiene forma de carpeta/UUID, así que esa condición nunca podía
-- ser verdadera para NADIE — por eso ninguna imagen de producto se
-- subió correctamente jamás, desde el primer día de Tienda.
--
-- Fix: calificar explícitamente "objects.name" (la tabla protegida por
-- la política) en vez de dejar el nombre sin calificar.
-- =============================================

drop policy if exists "store_products_insert_own" on storage.objects;
drop policy if exists "store_products_update_own" on storage.objects;
drop policy if exists "store_products_delete_own" on storage.objects;

create policy "store_products_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'store-products' and
    exists (
      select 1 from public.printshops p
      where p.id::text = (storage.foldername(objects.name))[1] and p.owner_id = auth.uid()
    )
  );

create policy "store_products_update_own" on storage.objects
  for update
  using (
    bucket_id = 'store-products' and
    exists (
      select 1 from public.printshops p
      where p.id::text = (storage.foldername(objects.name))[1] and p.owner_id = auth.uid()
    )
  );

create policy "store_products_delete_own" on storage.objects
  for delete
  using (
    bucket_id = 'store-products' and
    exists (
      select 1 from public.printshops p
      where p.id::text = (storage.foldername(objects.name))[1] and p.owner_id = auth.uid()
    )
  );

-- Verificación: esta vez with_check/qual debe decir
-- "storage.foldername(objects.name)", NO "storage.foldername(p.name)"
select policyname, cmd, qual, with_check
from pg_policies
where tablename = 'objects' and schemaname = 'storage' and policyname like 'store_products%';

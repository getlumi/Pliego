-- =============================================
-- PLIEGO · Archivos individuales por pedido — permiso de lectura para la papelería
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Contexto (12/10/2026): los pedidos con más de un archivo ahora suben cada
-- archivo por separado a la MISMA carpeta del pedido:
--     <user_id>/<order_id>/01_archivo.pdf, 02_foto.pdf, 03_carta.docx ...
-- además del PDF combinado de siempre (orders.file_url).
--
-- La política que ya existía ("documents_select_printshop_owner") solo deja
-- a la papelería leer el archivo EXACTO guardado en orders.file_url — los
-- archivos nuevos quedarían bloqueados. Esta política ADICIONAL (no
-- reemplaza a la anterior) le da lectura a todo lo que esté dentro de la
-- carpeta de un pedido que SÍ es de su papelería.
--
-- Cuidado aprendido (fix_store_products_rls_column_collision.sql): dentro
-- del subquery se califica "objects.name" — sin calificar, Postgres lo
-- resuelve contra printshops.name (el nombre del negocio) y la condición
-- nunca se cumpliría.
--
-- Seguro de correr varias veces. No toca datos, solo permisos.
-- =============================================

drop policy if exists "documents_select_printshop_order_folder" on storage.objects;

create policy "documents_select_printshop_order_folder" on storage.objects
  for select
  using (
    bucket_id = 'documents' and exists (
      select 1
      from public.orders o
      join public.printshops p on p.id = o.printshop_id
      where p.owner_id = auth.uid()
        and (storage.foldername(objects.name))[1] = o.user_id::text
        and (storage.foldername(objects.name))[2] = o.id::text
    )
  );

-- Verificación: debe devolver 1 fila con la política nueva
select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'documents_select_printshop_order_folder';

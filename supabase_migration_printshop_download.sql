-- Pliego · Migración: las papelerías pueden descargar los archivos
-- de los pedidos que les llegan (antes solo el cliente que subió
-- el archivo podía generar un enlace de descarga).
-- Pegar en Supabase → SQL Editor → Run

create policy "documents_select_printshop_owner" on storage.objects for select
using (
  bucket_id = 'documents' and exists (
    select 1 from public.orders o
    join public.printshops p on p.id = o.printshop_id
    where o.file_url = storage.objects.name and p.owner_id = auth.uid()
  )
);

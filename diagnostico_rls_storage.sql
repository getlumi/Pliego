-- =============================================
-- PLIEGO · Diagnóstico del error de RLS al subir imagen de producto
-- =============================================

-- 1) ¿Quién es el dueño real de esta papelería?
select id, name, owner_id from public.printshops
where id = '748d9ccd-1392-4c82-ad59-1f9c0782393d';

-- 2) ¿Las políticas del bucket store-products están realmente activas
-- tal como deberían? (revisa que with_check compare contra owner_id)
select policyname, cmd, qual, with_check
from pg_policies
where tablename = 'objects' and schemaname = 'storage' and policyname like 'store_products%';

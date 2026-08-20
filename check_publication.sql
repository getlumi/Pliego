-- =============================================
-- PLIEGO · Verificar que orders sigue en la publicación de Realtime
-- =============================================
-- Esto es distinto a RLS — es la lista de tablas que Postgres tiene
-- marcadas para siquiera EMPEZAR a mandar cambios a Realtime. Si
-- "orders" no aparece aquí, no importa nada más — nunca se manda nada.
-- =============================================

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime';

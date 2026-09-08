-- =============================================
-- PLIEGO · Idea 1: varias imágenes en un mismo pedido, cada una con su
-- propio tamaño y precio (2025-09-07)
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Mismo patrón exacto que ya usa store_items/store_total (Tienda) —
-- verificado en supabase_migration_store_products.sql antes de repetirlo
-- aquí. 100% aditivo: las columnas existentes (service_type,
-- estimated_cost, etc.) NO se tocan ni cambian de significado — un
-- pedido "clásico" (un solo documento/tipo) sigue funcionando exactamente
-- igual que hoy, sin usar esta columna nueva para nada.
--
-- image_items: null o vacío = pedido normal de siempre.
-- Con contenido = un arreglo de imágenes, cada una con su propio tamaño
-- (cuarto/medio/completa), material (bond/opalina) y precio ya congelado
-- al momento de armar el pedido (igual que store_items ya hace con sus
-- productos — un cambio de precio después no debe alterar pedidos ya
-- hechos).
--
-- Forma de cada elemento del arreglo (documentado aquí, no impuesto por
-- el motor — jsonb no fuerza estructura):
-- {
--   "frame": "cuarto" | "medio" | "completa",
--   "material": "bond" | "opalina",
--   "service_type": "color_imagen_cuarto" (el service_type real usado),
--   "price": 6.00  (precio congelado de ese servicio al momento del pedido)
-- }
-- =============================================

alter table public.orders add column if not exists image_items jsonb;

-- Verificación — debe salir null en pedidos existentes, confirmando que
-- no se alteró ningún dato:
select id, service_type, estimated_cost, image_items
from public.orders
order by created_at desc
limit 5;

-- Pliego · Migración: tipos de hoja personalizados por papelería
-- Pegar en Supabase → SQL Editor → Run

-- 1) printshop_services: service_type pasa de enum fijo a texto libre,
--    y se agrega 'label' para el nombre que la papelería le ponga
--    a sus tipos personalizados (los predefinidos usan label = NULL
--    y la app les pone el nombre bonito automáticamente).
alter table public.printshop_services
  alter column service_type type text using service_type::text;

alter table public.printshop_services
  add column if not exists label text;

-- 2) orders.service_type también pasa a texto (debe poder referenciar
--    tipos personalizados, no solo los 5 predefinidos).
alter table public.orders
  alter column service_type drop default;

alter table public.orders
  alter column service_type type text using service_type::text;

alter table public.orders
  alter column service_type set default 'bn_bond';

-- Nota: el tipo enum "service_type" queda sin uso pero no se elimina
-- (evita riesgo de romper dependencias); es inofensivo dejarlo.

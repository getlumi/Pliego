-- =============================================
-- PLIEGO · Columna "address" en printshops
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Hasta hoy solo se guardaban latitude/longitude (del GPS al momento del
-- registro) — no había ninguna dirección escrita por el dueño para poder
-- cruzarla y confirmar que el pin del mapa cae donde de verdad dice que
-- está su negocio. Esto ya había causado confusión antes (ver
-- BUGS_ENCONTRADOS: "shop.address no existe en la DB").
-- =============================================

alter table public.printshops add column if not exists address text;

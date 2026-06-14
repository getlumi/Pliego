-- Pliego · Migración: horarios por día con soporte de horario partido
-- Pegar en Supabase → SQL Editor → Run

alter table public.printshops
  add column if not exists hours jsonb not null default
  '{
    "sun": [{"open":"09:00","close":"21:00"}],
    "mon": [{"open":"09:00","close":"21:00"}],
    "tue": [{"open":"09:00","close":"21:00"}],
    "wed": [{"open":"09:00","close":"21:00"}],
    "thu": [{"open":"09:00","close":"21:00"}],
    "fri": [{"open":"09:00","close":"21:00"}],
    "sat": [{"open":"09:00","close":"21:00"}]
  }'::jsonb;

-- Las columnas opens_at / closes_at quedan sin uso (no se eliminan por
-- compatibilidad, pero la app ya no las lee ni las escribe).

-- =============================================
-- PLIEGO · Patch: fundadora = primeras 10 papelerías (no por fecha)
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Reemplaza la lógica de set_printshop_founding_status(): en vez de
-- comparar contra una fecha de corte en app_settings, cuenta cuántas
-- papelerías existen al momento del registro. Las primeras 10
-- (conteo 0-9 antes de insertar) son fundadoras (3 meses de gracia);
-- de la 11 en adelante son nuevas (1 mes de gracia).
-- La tabla app_settings se queda (no estorba) por si se usa para algo
-- más adelante, pero ya no participa en esta decisión.
-- =============================================

create or replace function set_printshop_founding_status()
returns trigger
language plpgsql
as $$
declare
  v_existing_count integer;
begin
  select count(*) into v_existing_count from public.printshops;

  if v_existing_count < 10 then
    new.is_founding := true;
    new.grace_period_ends_at := now() + interval '3 months';
  else
    new.is_founding := false;
    new.grace_period_ends_at := now() + interval '1 month';
  end if;

  new.subscription_status := 'gracia';
  return new;
end;
$$;
-- El trigger trg_printshop_founding_status ya existe y apunta a esta
-- función — no hace falta recrearlo, create or replace basta.

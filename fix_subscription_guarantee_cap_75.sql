-- =============================================
-- PLIEGO · Seguro del plan mensual: tope de $50 → $75 por pedido
-- Pegar en Supabase → SQL Editor → Run   (correr ANTES del git push)
-- =============================================
-- Un pedido de suscriptor queda cubierto por la garantía si cuesta $75 o
-- menos (antes $50). Los apartados ya existentes conservan su monto.
-- El monto de reactivación NO cambia ($50) — se decide aparte.
-- Resto de la función idéntico a supabase_migration_suspension.sql
-- (verificado contra la versión en producción el 20/10/2026).
-- =============================================
drop function if exists place_guarantee_hold_subscription(uuid, uuid, numeric);

create or replace function place_guarantee_hold_subscription(
  p_order_id       uuid,
  p_printshop_id   uuid,
  p_estimated_cost numeric
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_cap     numeric := 75;   -- antes 50
  v_covered boolean;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  v_covered := p_estimated_cost <= v_cap;

  if v_covered then
    insert into public.credit_holds
      (order_id, user_id, printshop_id, credits_held, hold_type, amount_mxn, status)
    values
      (p_order_id, v_user_id, p_printshop_id, 0, 'suscripcion', v_cap, 'reservado');
  end if;

  update public.orders
    set guarantee_covered = v_covered,
        guarantee_amount_mxn = case when v_covered then v_cap else null end
    where id = p_order_id;

  return jsonb_build_object('covered', v_covered, 'amount_mxn', case when v_covered then v_cap else null end);
end;
$$;

grant execute on function place_guarantee_hold_subscription(uuid, uuid, numeric) to authenticated;
revoke execute on function place_guarantee_hold_subscription(uuid, uuid, numeric) from public, anon;

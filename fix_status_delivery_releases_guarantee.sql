-- =============================================
-- PLIEGO · Fix: marcar "Entregar" desde el botón libera la garantía
-- Pegar en Supabase → SQL Editor → Run   (correr ANTES del git push)
-- =============================================
-- Antes: el botón manual marcaba "entregado" y la liberación de la
-- garantía la pedía el teléfono de la papelería en una llamada APARTE,
-- sin esperar respuesta. Si fallaba (internet, app cerrada), el pedido
-- quedaba entregado con los créditos apartados para siempre.
-- Ahora: la liberación ocurre dentro de la misma función, en una sola
-- operación — igual que ya hace deliver_order_by_qr.
-- release_guarantee_hold es segura de llamar siempre: si no hay hold
-- activo/reservado/vencido, no hace nada; y no se libera dos veces.
-- Resto de la función: idéntico a supabase_migration_security_hardening.sql
-- (verificado contra la versión en producción el 19/10/2026).
-- =============================================

drop function if exists update_order_status(uuid, text);
create or replace function update_order_status(p_order_id uuid, p_status text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_extra_ready     timestamptz;
  v_extra_delivered timestamptz;
  v_updated         boolean;
begin
  if p_status not in ('en_proceso', 'listo', 'entregado') then
    raise exception 'Estado inválido: %', p_status;
  end if;

  if p_status = 'listo'     then v_extra_ready := now();     end if;
  if p_status = 'entregado' then v_extra_delivered := now(); end if;

  update public.orders o
    set status = p_status::order_status,
        ready_at     = coalesce(v_extra_ready, o.ready_at),
        delivered_at = coalesce(v_extra_delivered, o.delivered_at)
    where o.id = p_order_id
      and o.printshop_id in (select id from public.printshops where owner_id = auth.uid());

  v_updated := found;

  -- NUEVO: liberar (o revertir) la garantía en la misma operación
  if v_updated and p_status = 'entregado' then
    perform public.release_guarantee_hold(p_order_id);
  end if;

  return v_updated;
end;
$$;
grant execute on function update_order_status(uuid, text) to authenticated;
revoke execute on function update_order_status(uuid, text) from public, anon;

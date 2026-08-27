-- =============================================
-- PLIEGO · Fix: la entrega por QR debe liberar la garantía también
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Bug real: deliver_order_by_qr() solo marcaba el pedido como
-- "entregado", pero nunca llamaba a release_guarantee_hold() —
-- a diferencia del botón manual (updateStatus en PrintshopPage.jsx),
-- que sí la llama por separado desde el cliente. Como el QR es hoy
-- el método de entrega global/principal, cualquier pedido entregado
-- por QR deja su crédito de garantía apartado para siempre.
-- =============================================

drop function if exists deliver_order_by_qr(uuid, uuid);

create or replace function deliver_order_by_qr(p_order_id uuid, p_pickup_code uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_updated boolean;
begin
  update public.orders o
    set status = 'entregado'::order_status,
        delivered_at = now()
    where o.id = p_order_id
      and o.pickup_code = p_pickup_code
      and o.status <> 'entregado'
      and o.printshop_id in (select id from public.printshops where owner_id = auth.uid());

  v_updated := found;

  -- Libera (o revierte) la garantía igual que el botón manual —
  -- release_guarantee_hold ya es seguro de llamar sin importar si
  -- el pedido tenía garantía o no (revisa por su cuenta si hay un
  -- hold activo/reservado/vencido; si no hay, simplemente no hace nada).
  if v_updated then
    perform public.release_guarantee_hold(p_order_id);
  end if;

  return v_updated;
end;
$$;

grant execute on function deliver_order_by_qr(uuid, uuid) to authenticated;
revoke execute on function deliver_order_by_qr(uuid, uuid) from public, anon;

-- =============================================
-- Limpieza de los créditos atorados existentes AHORA MISMO
-- (mismo patrón que release_stuck_credits.sql, generalizado)
-- =============================================
-- 1. Corre esto primero para ver qué hay atorado en TODAS las cuentas,
--    no solo Gio:
-- select ch.id, ch.order_id, ch.user_id, u.phone, ch.credits_held, ch.status, ch.created_at
-- from public.credit_holds ch
-- join public.users u on u.id = ch.user_id
-- where ch.status in ('activo', 'reservado', 'vencido')
-- order by ch.created_at desc;

-- 2. Para cada hold atorado que SÍ corresponda a un pedido ya
--    entregado (verifica en la tabla orders que status='entregado'),
--    puedes liberarlo llamando a la función ya existente en vez de
--    hacerlo a mano — pero como esta función revisa "printshop.owner_id
--    = auth.uid()", debe ejecutarse autenticado como esa papelería,
--    NO desde el SQL Editor (que corre como servicio). Por eso, para
--    limpieza manual desde el SQL Editor, usa el patrón directo:

-- update public.users set credits_held = credits_held - <N> where id = '<user_id>';
-- update public.credit_holds set status = 'entregado', resolved_at = now() where id in ('<hold_id_1>', '<hold_id_2>', ...);

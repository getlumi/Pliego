-- =============================================
-- PLIEGO · Entrega por código QR
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Cada pedido tiene un código único (UUID, prácticamente imposible de
-- adivinar) desde que se crea. El QR que ve el cliente combina
-- order_id + este código — un screenshot viejo o reenviado no sirve
-- para nada una vez que el pedido ya se marcó entregado (deja de
-- coincidir la condición de status), y nadie puede reclamar el pedido
-- de otra persona sin haber visto su QR real.
-- =============================================

alter table public.orders add column if not exists pickup_code uuid not null default gen_random_uuid();

-- Entrega verificada por QR: valida que el código coincida Y que el
-- pedido sea de una papelería que le pertenece al que llama — mismo
-- patrón de seguridad que update_order_status.
drop function if exists deliver_order_by_qr(uuid, uuid);
create or replace function deliver_order_by_qr(p_order_id uuid, p_pickup_code uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  update public.orders o
    set status = 'entregado'::order_status,
        delivered_at = now()
    where o.id = p_order_id
      and o.pickup_code = p_pickup_code
      and o.status <> 'entregado'
      and o.printshop_id in (select id from public.printshops where owner_id = auth.uid());
  return found;
end;
$$;
grant execute on function deliver_order_by_qr(uuid, uuid) to authenticated;
revoke execute on function deliver_order_by_qr(uuid, uuid) from public, anon;

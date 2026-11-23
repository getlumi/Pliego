-- =============================================
-- PLIEGO · Pagos de papelería: sin gracia por pago fallido (23/11/2026)
-- Pegar en Supabase → SQL Editor → Run   (correr ANTES de publicar las funciones)
-- =============================================
-- 1) record_printshop_subscription_payment: igual a la versión de producción
--    (verificada el 23/11/2026; incluye subscription_started_at, que no estaba
--    en el repo) + UNA cosa nueva: al pagar, si la papelería estaba bloqueada
--    (past_due / bloqueada / canceled) se vuelve a encender su disponibilidad,
--    que el bloqueo había apagado. Si estaba activa o en gracia, no la toca
--    (respeta que la haya puesto en "Ocupado" a propósito).
-- 2) Limpieza única: papelerías que ya están bloqueadas siguen visibles para
--    clientes; se apagan.
-- =============================================

create or replace function record_printshop_subscription_payment(
  p_printshop_id uuid,
  p_amount       numeric,
  p_payment_id   text,
  p_period_end   timestamptz
) returns boolean
language plpgsql
security definer
as $$
declare
  v_owner_id uuid;
  v_prev     text;
begin
  select owner_id into v_owner_id from public.printshops where id = p_printshop_id;
  if v_owner_id is null then
    return false;
  end if;

  insert into public.wallet_transactions
    (user_id, type, amount, credits, payment_method, payment_id, description)
  values
    (v_owner_id, 'ajuste', p_amount, 0, 'tarjeta', p_payment_id, 'Mensualidad papelería · Stripe')
  on conflict (payment_id) where payment_id is not null do nothing;

  if not found then
    return false; -- ya se había procesado este payment_id (reintento de Stripe)
  end if;

  select subscription_status into v_prev from public.printshops where id = p_printshop_id;

  update public.printshops
    set subscription_status = 'active',
        subscription_period_end = p_period_end,
        subscription_started_at = coalesce(subscription_started_at, now()),
        is_available = case
          when v_prev in ('past_due', 'bloqueada', 'canceled') then true
          else is_available
        end
    where id = p_printshop_id;

  return true;
end;
$$;

-- Limpieza única de las que ya están bloqueadas
update public.printshops
   set is_available = false
 where subscription_status in ('past_due', 'bloqueada', 'canceled')
   and is_available = true;

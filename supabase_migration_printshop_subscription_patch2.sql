-- =============================================
-- PLIEGO · Patch 2: registrar pago de mensualidad de papelería
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- record_printshop_subscription_payment — la llama stripe-webhook
-- (service_role) cuando llega invoice.paid de la suscripción de una
-- papelería. A diferencia de credit_wallet (clientes), esto NO toca
-- credits_balance/wallet_balance del dueño — es un ingreso del negocio,
-- no saldo personal del usuario. Usa el mismo índice único de
-- payment_id que ya protege contra duplicados en wallet_transactions.
-- =============================================

drop function if exists record_printshop_subscription_payment(uuid, numeric, text, timestamptz);

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

  update public.printshops
    set subscription_status = 'active',
        subscription_period_end = p_period_end
    where id = p_printshop_id;

  return true;
end;
$$;

grant execute on function record_printshop_subscription_payment(uuid, numeric, text, timestamptz) to service_role;
revoke execute on function record_printshop_subscription_payment(uuid, numeric, text, timestamptz) from public, anon, authenticated;

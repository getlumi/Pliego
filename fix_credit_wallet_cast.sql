-- =============================================
-- PLIEGO · FIX: credit_wallet le falta convertir p_method al tipo
-- correcto antes de insertarlo — bug real, no solo de tu prueba manual.
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Las otras funciones que insertan en wallet_transactions (deduct_credit,
-- refund_credit) usan un texto fijo directo ('sistema') en el INSERT,
-- y Postgres sí puede convertirlo solo porque es un valor literal. Pero
-- credit_wallet recibe p_method como PARÁMETRO ya tipado como texto —
-- ahí Postgres ya no lo convierte solo, hace falta el cast explícito.
--
-- Esto es EXACTAMENTE la misma llamada que hace stripe-webhook al
-- confirmar una recarga o una mensualidad — si esto fallaba aquí,
-- pudo haber estado fallando ahí también. Correr esto arregla ambos
-- casos, no solo el de agregar créditos de prueba.
-- =============================================

create or replace function credit_wallet(
  p_user_id     uuid,
  p_amount      numeric,
  p_payment_id  text,
  p_description text,
  p_method      text,
  p_credits     integer default null
) returns boolean
language plpgsql
security definer
as $$
declare
  already_exists boolean;
begin
  select exists(
    select 1 from public.wallet_transactions
    where payment_id = p_payment_id
  ) into already_exists;

  if already_exists then
    return false;
  end if;

  update public.users
    set wallet_balance  = wallet_balance + p_amount,
        credits_balance = credits_balance + coalesce(p_credits, 0)
    where id = p_user_id;

  insert into public.wallet_transactions
    (user_id, type, amount, credits, payment_method, payment_id, description)
  values
    (p_user_id, 'recarga', p_amount, p_credits, p_method::payment_method, p_payment_id, p_description);

  return true;
end;
$$;

grant execute on function credit_wallet(uuid, numeric, text, text, text, integer) to service_role;
revoke execute on function credit_wallet(uuid, numeric, text, text, text, integer) from public, anon, authenticated;

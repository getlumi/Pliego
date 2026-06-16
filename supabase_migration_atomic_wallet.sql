-- Pliego · Migración: función atómica para acreditar saldo
-- Evita que el webhook acredite el mismo pago dos veces
-- Pegar en Supabase → SQL Editor → Run

create or replace function credit_wallet(
  p_user_id     uuid,
  p_amount      numeric,
  p_payment_id  text,
  p_description text,
  p_method      text
) returns boolean
language plpgsql
security definer
as $$
declare
  already_exists boolean;
begin
  -- Verificar si ya se procesó este payment_id
  select exists(
    select 1 from public.wallet_transactions
    where payment_id = p_payment_id
  ) into already_exists;

  if already_exists then
    return false; -- ya procesado, no hacer nada
  end if;

  -- Acreditar saldo de forma atómica
  update public.users
    set wallet_balance = wallet_balance + p_amount
    where id = p_user_id;

  -- Registrar transacción
  insert into public.wallet_transactions
    (user_id, type, amount, payment_method, payment_id, description)
  values
    (p_user_id, 'recarga', p_amount, p_method, p_payment_id, p_description);

  return true;
end;
$$;

-- Solo el service_role puede llamar esta función
revoke execute on function credit_wallet from public, anon, authenticated;
grant execute on function credit_wallet to service_role;

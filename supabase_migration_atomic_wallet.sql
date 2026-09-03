-- Pliego · Migración: función atómica para acreditar saldo
-- Evita que el webhook acredite el mismo pago dos veces
-- Pegar en Supabase → SQL Editor → Run
--
-- ⚠️ SUPERADO — NO VOLVER A CORRER ESTE ARCHIVO ⚠️
-- Esta versión (5 parámetros) tenía un bug real: insertaba p_method sin
-- convertirlo al tipo payment_method, causando el error real de Stripe
-- webhook documentado en BUGS_ENCONTRADOS_20_08_2026.md (sección 3).
-- supabase_migration_credits.sql (20 agosto 2026) ya BORRÓ esta versión
-- de 5 parámetros y la reemplazó por una de 6 parámetros con el cast
-- correcto (p_method::payment_method). Si este archivo se vuelve a
-- correr, recrea la versión vieja y rota al lado de la buena — Postgres
-- permite funciones sobrecargadas por firma distinta, así que ambas
-- podrían coexistir y una llamada con 5 argumentos volvería a caer en
-- el bug. Se deja aquí solo como referencia histórica.

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

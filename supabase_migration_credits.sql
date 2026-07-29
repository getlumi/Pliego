-- =============================================
-- PLIEGO · Migración: sistema de créditos por paquete
-- Paquetes: $26 → 4 créditos, $55 → 10 créditos
-- 1 pedido = 1 crédito, sin importar de qué paquete vino
-- Pegar en Supabase → SQL Editor → Run
-- =============================================

-- 1) Nueva columna: saldo de créditos (separado de wallet_balance en pesos)
alter table public.users
  add column if not exists credits_balance integer not null default 0;

-- 2) Nueva columna en wallet_transactions para trazar créditos por separado
--    de los pesos reales (wallet_balance/amount siguen siendo pesos reales
--    cobrados por Stripe — el panel de Finanzas del Admin sigue funcionando
--    exactamente igual, sin cambios, porque ya filtra por type='recarga').
alter table public.wallet_transactions
  add column if not exists credits integer;

-- 3) Función credit_wallet actualizada: ahora también acredita créditos.
--    p_amount sigue siendo pesos reales (para Finanzas).
--    p_credits es nuevo y opcional — créditos a sumar (recargas y
--    crédito de bienvenida lo usan; otros movimientos no).
--    Primero borramos la versión vieja (firma de 5 argumentos) para que
--    no queden dos funciones "credit_wallet" ambiguas al mismo tiempo.
drop function if exists credit_wallet(uuid, numeric, text, text, text);

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
    (p_user_id, 'recarga', p_amount, p_credits, p_method, p_payment_id, p_description);

  return true;
end;
$$;

revoke execute on function credit_wallet(uuid, numeric, text, text, text, integer) from public, anon, authenticated;
grant execute on function credit_wallet(uuid, numeric, text, text, text, integer) to service_role;

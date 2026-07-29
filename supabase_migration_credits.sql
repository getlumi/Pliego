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

-- =============================================
-- 4) DESCUENTO ATÓMICO DE CRÉDITO (corrige race condition)
-- Antes: sendOrder.js leía credits_balance y luego escribía saldo-1 en dos
-- pasos separados sin chequear error — dos pedidos casi simultáneos podían
-- descontar solo 1 crédito entre ambos, o fallar en silencio sin cobrar.
-- Ahora: una sola operación atómica en la base de datos. Solo actúa sobre
-- auth.uid() (el propio usuario autenticado) — no se puede pasar el UUID
-- de otra persona para vaciarle el saldo.
-- =============================================
create or replace function deduct_credit(
  p_order_id   uuid,
  p_amount_mxn numeric default 5.50
) returns boolean
language plpgsql
security definer
as $$
declare
  updated_rows int;
  v_user_id    uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  update public.users
    set credits_balance = credits_balance - 1
    where id = v_user_id and credits_balance >= 1;

  get diagnostics updated_rows = row_count;

  if updated_rows = 0 then
    return false; -- saldo insuficiente, no se descontó nada
  end if;

  insert into public.wallet_transactions
    (user_id, type, amount, credits, payment_method, order_id)
  values
    (v_user_id, 'servicio', -p_amount_mxn, -1, 'sistema', p_order_id);

  return true;
end;
$$;

grant execute on function deduct_credit(uuid, numeric) to authenticated;
revoke execute on function deduct_credit(uuid, numeric) from public, anon;

-- Reembolso: solo si existe un cargo real de ese pedido y no se ha
-- reembolsado antes (evita doble reembolso). Se usa cuando el pedido se
-- cobró pero falló un paso posterior (subida de archivo o insert del
-- pedido), para no dejar a alguien pagando por un pedido que no se creó.
create or replace function refund_credit(
  p_order_id uuid
) returns boolean
language plpgsql
security definer
as $$
declare
  v_user_id          uuid := auth.uid();
  v_charge_exists    boolean;
  v_already_refunded boolean;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select exists(
    select 1 from public.wallet_transactions
    where order_id = p_order_id and user_id = v_user_id
      and type = 'servicio' and credits = -1
  ) into v_charge_exists;

  if not v_charge_exists then
    return false;
  end if;

  select exists(
    select 1 from public.wallet_transactions
    where order_id = p_order_id and user_id = v_user_id
      and type = 'reembolso'
  ) into v_already_refunded;

  if v_already_refunded then
    return false;
  end if;

  update public.users
    set credits_balance = credits_balance + 1
    where id = v_user_id;

  insert into public.wallet_transactions
    (user_id, type, amount, credits, payment_method, order_id, description)
  values
    (v_user_id, 'reembolso', 5.50, 1, 'sistema', p_order_id, 'Reembolso: no se pudo completar el pedido');

  return true;
end;
$$;

grant execute on function refund_credit(uuid) to authenticated;
revoke execute on function refund_credit(uuid) from public, anon;

-- =============================================
-- 5) Selector de lada / código de país
-- =============================================
alter table public.users
  add column if not exists country_code text not null default '52';

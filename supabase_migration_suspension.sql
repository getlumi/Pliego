-- =============================================
-- PLIEGO · Garantía anti-no-show para SUSCRIPTORES (plan $75/mes)
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Reglas del diseño (confirmadas en conversación):
-- 1) Un suscriptor puede mandar un documento con valor de hasta $50 MXN
--    y queda cubierto por la garantía (igual que un usuario de créditos,
--    pero con tope fijo en pesos en vez de créditos apartados).
-- 2) Si el pedido supera los $50: NO queda cubierto — la papelería no
--    debe imprimir hasta que el cliente esté físicamente presente
--    (mismo comportamiento/alerta que ya existe para créditos insuficientes).
-- 3) Mismo reloj de 24h desde "Listo", mismo aviso a las 6am, mismo botón
--    de extensión +2h — se reutiliza toda esa maquinaria sin cambios.
-- 4) Si vence el plazo sin que el cliente pase: NO se descuenta dinero
--    (no hay créditos que descontar). En vez de eso, la CUENTA se
--    suspende por completo (bloqueo total de la app).
-- 5) Para reactivar: el usuario debe pagar $50 MXN manualmente desde la
--    app (no es automático). Al pagar, la cuenta se reactiva de
--    inmediato con su plan normal.
-- 6) Mientras está suspendida, la suscripción de Stripe se PAUSA
--    (pause_collection) — no se le sigue cobrando el $75/mes.  Al pagar
--    los $50 y reactivar, se reanuda el cobro normal de Stripe.
-- 7) Si el cliente sí pasa después de vencido el plazo (tarde): se le
--    entrega su documento igual, pero la suspensión NO se revierte por
--    eso — solo se levanta pagando los $50. (A diferencia del caso de
--    créditos, aquí no hubo ningún cargo que revertir.)
-- =============================================


-- ─────────────────────────────────────────────
-- 1) Columnas nuevas
-- ─────────────────────────────────────────────
alter table public.users
  add column if not exists account_suspended boolean not null default false;

alter table public.users
  add column if not exists suspension_reason text;

alter table public.credit_holds
  add column if not exists hold_type text not null default 'credito';

alter table public.credit_holds
  add column if not exists amount_mxn numeric;

do $$ begin
  alter table public.credit_holds
    add constraint credit_holds_hold_type_check check (hold_type in ('credito', 'suscripcion'));
exception
  when duplicate_object then null;
end $$;

alter table public.orders
  add column if not exists guarantee_amount_mxn numeric;


-- ─────────────────────────────────────────────
-- 2) place_guarantee_hold_subscription — al mandar el pedido (suscriptor)
-- Equivalente a place_guarantee_hold, pero con tope fijo de $50 en vez
-- de créditos apartados (los suscriptores no tienen créditos).
-- ─────────────────────────────────────────────
drop function if exists place_guarantee_hold_subscription(uuid, uuid, numeric);

create or replace function place_guarantee_hold_subscription(
  p_order_id       uuid,
  p_printshop_id   uuid,
  p_estimated_cost numeric
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
  v_cap     numeric := 50;
  v_covered boolean;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  v_covered := p_estimated_cost <= v_cap;

  if v_covered then
    insert into public.credit_holds
      (order_id, user_id, printshop_id, credits_held, hold_type, amount_mxn, status)
    values
      (p_order_id, v_user_id, p_printshop_id, 0, 'suscripcion', v_cap, 'reservado');
  end if;

  update public.orders
    set guarantee_covered = v_covered,
        guarantee_amount_mxn = case when v_covered then v_cap else null end
    where id = p_order_id;

  return jsonb_build_object('covered', v_covered, 'amount_mxn', case when v_covered then v_cap else null end);
end;
$$;

grant execute on function place_guarantee_hold_subscription(uuid, uuid, numeric) to authenticated;
revoke execute on function place_guarantee_hold_subscription(uuid, uuid, numeric) from public, anon;


-- ─────────────────────────────────────────────
-- 3) release_guarantee_hold — se REEMPLAZA para soportar ambos tipos
-- (credito / suscripcion). start_guarantee_clock NO cambia — ya es
-- genérica, funciona igual para ambos tipos de hold.
-- ─────────────────────────────────────────────
drop function if exists release_guarantee_hold(uuid);

create or replace function release_guarantee_hold(p_order_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_caller uuid := auth.uid();
  v_hold   record;
begin
  select ch.* into v_hold
  from public.credit_holds ch
  join public.printshops p on p.id = ch.printshop_id
  where ch.order_id = p_order_id
    and ch.status in ('activo', 'reservado', 'vencido')
    and p.owner_id = v_caller;

  if not found then
    return false;
  end if;

  if v_hold.hold_type = 'suscripcion' then
    -- Plan mensual: no hay créditos que reversar. Si ya estaba 'vencido'
    -- (no pasó a tiempo), la cuenta queda suspendida de todas formas —
    -- eso solo se levanta pagando los $50 de reactivación, sin importar
    -- que ahora sí haya recogido el documento.
    update public.credit_holds
      set status = 'entregado', resolved_at = now()
      where order_id = p_order_id;
    return true;
  end if;

  -- hold_type = 'credito' (comportamiento original, sin cambios)
  if v_hold.status = 'vencido' then
    update public.users
      set credits_balance = credits_balance + v_hold.credits_held
      where id = v_hold.user_id;

    insert into public.wallet_transactions
      (user_id, type, amount, credits, payment_method, order_id, description)
    values
      (v_hold.user_id, 'reembolso', v_hold.credits_held * 5.50, v_hold.credits_held,
       'sistema', p_order_id, 'Reversión: sí pasó por su impresión');
  else
    update public.users
      set credits_held = credits_held - v_hold.credits_held
      where id = v_hold.user_id;
  end if;

  update public.credit_holds
    set status = 'entregado', resolved_at = now()
    where order_id = p_order_id;

  return true;
end;
$$;

grant execute on function release_guarantee_hold(uuid) to authenticated;
revoke execute on function release_guarantee_hold(uuid) from public, anon;


-- ─────────────────────────────────────────────
-- 4) execute_guarantee_expiry — se REEMPLAZA para soportar ambos tipos
-- Para suscripción: suspende la cuenta en vez de descontar dinero.
-- ─────────────────────────────────────────────
drop function if exists execute_guarantee_expiry(uuid);

create or replace function execute_guarantee_expiry(p_order_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_hold record;
begin
  select * into v_hold from public.credit_holds
    where order_id = p_order_id and status = 'activo';

  if not found then
    return false;
  end if;

  if v_hold.hold_type = 'suscripcion' then
    update public.users
      set account_suspended = true,
          suspension_reason = 'sin_recoger_documento'
      where id = v_hold.user_id;

    insert into public.wallet_transactions
      (user_id, type, amount, credits, payment_method, order_id, description)
    values
      (v_hold.user_id, 'ajuste', 0, 0, 'sistema', p_order_id,
       'Cuenta suspendida: no recogió su documento (plan mensual)');

    update public.credit_holds
      set status = 'vencido', resolved_at = now()
      where order_id = p_order_id;

    return true;
  end if;

  -- hold_type = 'credito' (comportamiento original, sin cambios)
  update public.users
    set credits_balance = credits_balance - v_hold.credits_held,
        credits_held    = credits_held - v_hold.credits_held
    where id = v_hold.user_id;

  insert into public.wallet_transactions
    (user_id, type, amount, credits, payment_method, order_id, description)
  values
    (v_hold.user_id, 'servicio', -(v_hold.credits_held * 5.50), -v_hold.credits_held,
     'sistema', p_order_id, 'Garantía anti-no-show: no pasó por su impresión');

  update public.credit_holds
    set status = 'vencido', resolved_at = now()
    where order_id = p_order_id;

  return true;
end;
$$;

grant execute on function execute_guarantee_expiry(uuid) to service_role;
revoke execute on function execute_guarantee_expiry(uuid) from public, anon, authenticated;


-- ─────────────────────────────────────────────
-- 5) resolve_suspension_payment — SOLO la llama stripe-webhook
-- (service_role) tras confirmar el pago de $50 de reactivación.
-- ─────────────────────────────────────────────
drop function if exists resolve_suspension_payment(uuid);

create or replace function resolve_suspension_payment(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.users
    set account_suspended = false,
        suspension_reason = null
    where id = p_user_id;

  insert into public.wallet_transactions
    (user_id, type, amount, credits, payment_method, description)
  values
    (p_user_id, 'ajuste', 50, 0, 'tarjeta', 'Pago de reactivación ($50) — cuenta desbloqueada');
end;
$$;

grant execute on function resolve_suspension_payment(uuid) to service_role;
revoke execute on function resolve_suspension_payment(uuid) from public, anon, authenticated;


-- ─────────────────────────────────────────────
-- 6) Vistas del cron — se REEMPLAZAN para incluir hold_type/amount_mxn
-- (el cron las necesita para decidir el mensaje y si debe pausar Stripe)
-- ─────────────────────────────────────────────
drop view if exists public.guarantee_holds_due_warning;
create view public.guarantee_holds_due_warning as
select ch.id, ch.order_id, ch.user_id, ch.credits_held, ch.deadline, ch.hold_type, ch.amount_mxn,
       u.phone, u.country_code
from public.credit_holds ch
join public.users u on u.id = ch.user_id
where ch.status = 'activo'
  and ch.ready_at is not null
  and ch.warned_at is null;

drop view if exists public.guarantee_holds_due_expiry;
create view public.guarantee_holds_due_expiry as
select ch.id, ch.order_id, ch.user_id, ch.credits_held, ch.hold_type, ch.amount_mxn
from public.credit_holds ch
where ch.status = 'activo'
  and ch.deadline is not null
  and ch.deadline <= now();

revoke all on public.guarantee_holds_due_warning from public, anon, authenticated;
revoke all on public.guarantee_holds_due_expiry  from public, anon, authenticated;
grant select on public.guarantee_holds_due_warning to service_role;
grant select on public.guarantee_holds_due_expiry  to service_role;

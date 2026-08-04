-- =============================================
-- PLIEGO · Garantía anti-no-show (apartado de créditos)
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Reglas del diseño (confirmadas en conversación):
-- 1) Nunca se imprime nada que supere el crédito disponible del cliente
--    (descontando lo ya apartado en otros pedidos activos). Si supera,
--    se avisa a cliente y papelería: no se imprime hasta que llegue.
-- 2) Si SÍ cabe, esos créditos quedan APARTADOS (no disponibles para
--    otro pedido) desde que se manda el pedido — evita que alguien
--    "cubra" varios pedidos a la vez con el mismo crédito.
-- 3) El reloj de 24h empieza cuando la papelería marca "Listo", no antes.
-- 4) Aviso fijo a las 6:00am (hora Cancún) del día siguiente A LA
--    SOLICITUD — si "Listo" aún no pasó a esa hora, el aviso se salta
--    (el reloj de 24h ni siquiera ha empezado todavía).
-- 5) Botón de extensión: +2 horas, una sola vez, lo activa el cliente.
-- 6) Al cumplirse el plazo sin extensión: descuento automático, sin
--    excepciones ni ventana de gracia extra.
-- 7) Si el cliente sí pasa después (aunque ya se haya descontado): se
--    revierte el descuento cuando la papelería marca "Entregar".
-- 8) Redondeo del crédito necesario: siempre hacia arriba.
-- 9) Admin puede ajustar créditos manualmente para casos especiales.
-- =============================================


-- ─────────────────────────────────────────────
-- 1) Columnas nuevas
-- ─────────────────────────────────────────────
alter table public.users
  add column if not exists credits_held integer not null default 0;

alter table public.orders
  add column if not exists guarantee_covered boolean,
  add column if not exists guarantee_credits integer;

-- Nuevo tipo de transacción para ajustes manuales del Admin
alter type transaction_type add value if not exists 'ajuste';


-- ─────────────────────────────────────────────
-- 2) Tabla de garantías (una fila por pedido cubierto)
-- ─────────────────────────────────────────────
do $$ begin
  create type guarantee_status as enum ('reservado', 'activo', 'entregado', 'vencido');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.credit_holds (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references public.orders(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  printshop_id   uuid not null references public.printshops(id) on delete cascade,
  credits_held   integer not null,
  status         guarantee_status not null default 'reservado',
  requested_at   timestamptz not null default now(), -- cuando se mandó el pedido
  ready_at       timestamptz,                         -- cuando se marcó "Listo"
  deadline       timestamptz,                         -- ready_at + 24h (+ extensión)
  extension_used boolean not null default false,
  warned_at      timestamptz,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists idx_credit_holds_status   on public.credit_holds (status);
create index if not exists idx_credit_holds_deadline on public.credit_holds (deadline);
create index if not exists idx_credit_holds_user     on public.credit_holds (user_id);

alter table public.credit_holds enable row level security;

drop policy if exists "credit_holds_select_own"      on public.credit_holds;
drop policy if exists "credit_holds_select_admin"     on public.credit_holds;
drop policy if exists "credit_holds_select_printshop" on public.credit_holds;

create policy "credit_holds_select_own" on public.credit_holds
  for select using (auth.uid() = user_id);

create policy "credit_holds_select_printshop" on public.credit_holds
  for select using (
    printshop_id in (select id from public.printshops where owner_id = auth.uid())
  );

create policy "credit_holds_select_admin" on public.credit_holds
  for select using (public.is_admin());


-- ─────────────────────────────────────────────
-- 3) place_guarantee_hold — al mandar el pedido
-- Decide si el pedido queda cubierto por la garantía y aparta los
-- créditos necesarios. Bloquea la fila del usuario (FOR UPDATE) para
-- que dos pedidos simultáneos no puedan "cubrirse" con el mismo crédito.
-- ─────────────────────────────────────────────
drop function if exists place_guarantee_hold(uuid, uuid, numeric);

create or replace function place_guarantee_hold(
  p_order_id       uuid,
  p_printshop_id   uuid,
  p_estimated_cost numeric
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id           uuid := auth.uid();
  v_credit_value       numeric := 5.50;
  v_available_credits  integer;
  v_needed_credits     integer;
  v_covered            boolean;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  v_needed_credits := ceil(p_estimated_cost / v_credit_value);

  select (credits_balance - credits_held) into v_available_credits
  from public.users where id = v_user_id
  for update;

  v_covered := v_available_credits >= v_needed_credits;

  if v_covered then
    update public.users
      set credits_held = credits_held + v_needed_credits
      where id = v_user_id;

    insert into public.credit_holds (order_id, user_id, printshop_id, credits_held, status)
    values (p_order_id, v_user_id, p_printshop_id, v_needed_credits, 'reservado');
  end if;

  update public.orders
    set guarantee_covered = v_covered,
        guarantee_credits = case when v_covered then v_needed_credits else null end
    where id = p_order_id;

  return jsonb_build_object('covered', v_covered, 'credits', v_needed_credits);
end;
$$;

grant execute on function place_guarantee_hold(uuid, uuid, numeric) to authenticated;
revoke execute on function place_guarantee_hold(uuid, uuid, numeric) from public, anon;


-- ─────────────────────────────────────────────
-- 4) start_guarantee_clock — al marcar "Listo" (lo llama la papelería)
-- Arranca el reloj de 24h. Verifica que quien llama sea dueño de esa
-- papelería, no el cliente.
-- ─────────────────────────────────────────────
drop function if exists start_guarantee_clock(uuid);

create or replace function start_guarantee_clock(p_order_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_caller uuid := auth.uid();
  v_found  boolean;
begin
  select true into v_found
  from public.credit_holds ch
  join public.printshops p on p.id = ch.printshop_id
  where ch.order_id = p_order_id
    and ch.status = 'reservado'
    and p.owner_id = v_caller;

  if not found then
    return false;
  end if;

  update public.credit_holds
    set status = 'activo', ready_at = now(), deadline = now() + interval '24 hours'
    where order_id = p_order_id;

  return true;
end;
$$;

grant execute on function start_guarantee_clock(uuid) to authenticated;
revoke execute on function start_guarantee_clock(uuid) from public, anon;


-- ─────────────────────────────────────────────
-- 5) release_guarantee_hold — al marcar "Entregar" (lo llama la papelería)
-- Cubre dos casos: (a) todavía apartado, nunca se descontó → solo
-- libera la reserva. (b) ya se había descontado por vencimiento →
-- reversa el cargo, regresa los créditos.
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

  if v_hold.status = 'vencido' then
    -- Ya se había descontado — reversión completa
    update public.users
      set credits_balance = credits_balance + v_hold.credits_held
      where id = v_hold.user_id;

    insert into public.wallet_transactions
      (user_id, type, amount, credits, payment_method, order_id, description)
    values
      (v_hold.user_id, 'reembolso', v_hold.credits_held * 5.50, v_hold.credits_held,
       'sistema', p_order_id, 'Reversión: sí pasó por su impresión');
  else
    -- Nunca se descontó — solo se libera la reserva
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
-- 6) extend_guarantee_deadline — botón "+2 horas" (lo llama el cliente)
-- Una sola vez por pedido.
-- ─────────────────────────────────────────────
drop function if exists extend_guarantee_deadline(uuid);

create or replace function extend_guarantee_deadline(p_order_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_user_id uuid := auth.uid();
begin
  update public.credit_holds
    set deadline = deadline + interval '2 hours', extension_used = true
    where order_id = p_order_id
      and user_id = v_user_id
      and status = 'activo'
      and extension_used = false;

  return found;
end;
$$;

grant execute on function extend_guarantee_deadline(uuid) to authenticated;
revoke execute on function extend_guarantee_deadline(uuid) from public, anon;


-- ─────────────────────────────────────────────
-- 7) execute_guarantee_expiry — SOLO la llama el cron (service_role)
-- Ejecuta el descuento cuando se cumple el plazo sin que el cliente
-- haya pasado ni pedido extensión útil.
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
-- 8) admin_adjust_credits — ajuste manual desde el panel de Admin
-- ─────────────────────────────────────────────
drop function if exists admin_adjust_credits(uuid, integer, text);

create or replace function admin_adjust_credits(
  p_user_id uuid,
  p_delta   integer,
  p_reason  text default null
) returns boolean
language plpgsql
security definer
as $$
begin
  if not coalesce((select is_admin from public.users where id = auth.uid()), false) then
    raise exception 'No autorizado';
  end if;

  update public.users
    set credits_balance = credits_balance + p_delta
    where id = p_user_id;

  insert into public.wallet_transactions
    (user_id, type, amount, credits, payment_method, description)
  values
    (p_user_id, 'ajuste', p_delta * 5.50, p_delta, 'admin',
     coalesce(p_reason, 'Ajuste manual de Admin'));

  return true;
end;
$$;

grant execute on function admin_adjust_credits(uuid, integer, text) to authenticated;
revoke execute on function admin_adjust_credits(uuid, integer, text) from public, anon;


-- ─────────────────────────────────────────────
-- 9) Vistas para que el cron sepa qué procesar (solo service_role)
-- ─────────────────────────────────────────────
create or replace view public.guarantee_holds_due_warning as
select ch.id, ch.order_id, ch.user_id, ch.credits_held, ch.deadline,
       u.phone, u.country_code
from public.credit_holds ch
join public.users u on u.id = ch.user_id
where ch.status = 'activo'
  and ch.ready_at is not null
  and ch.warned_at is null;

create or replace view public.guarantee_holds_due_expiry as
select ch.id, ch.order_id, ch.user_id, ch.credits_held
from public.credit_holds ch
where ch.status = 'activo'
  and ch.deadline is not null
  and ch.deadline <= now();

revoke all on public.guarantee_holds_due_warning from public, anon, authenticated;
revoke all on public.guarantee_holds_due_expiry  from public, anon, authenticated;
grant select on public.guarantee_holds_due_warning to service_role;
grant select on public.guarantee_holds_due_expiry  to service_role;

-- Función para que el cron marque un aviso como enviado
create or replace function mark_guarantee_warned(p_order_id uuid)
returns void language sql security definer as $$
  update public.credit_holds set warned_at = now() where order_id = p_order_id;
$$;
grant execute on function mark_guarantee_warned(uuid) to service_role;
revoke execute on function mark_guarantee_warned(uuid) from public, anon, authenticated;


-- ─────────────────────────────────────────────
-- 10) Automatización con pg_cron + pg_net
-- Corre cada hora. La Edge Function decide internamente si es la hora
-- 6am (Cancún) para mandar avisos, y siempre revisa vencimientos.
-- ─────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('pliego-guarantee-cron')
where exists (select 1 from cron.job where jobname = 'pliego-guarantee-cron');

-- IMPORTANTE: reemplaza TU_PROYECTO y TU_ANON_O_SERVICE_KEY antes de
-- correr esta parte — ver instrucciones después de este archivo.
select cron.schedule(
  'pliego-guarantee-cron',
  '0 * * * *', -- cada hora, en punto
  $$
  select net.http_post(
    url := 'https://hjrexcdtrzesdcfkhnpd.supabase.co/functions/v1/guarantee-cron',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

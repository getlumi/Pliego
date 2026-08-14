-- =============================================
-- PLIEGO · Suscripción de $75/mes para PAPELERÍAS
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Reglas del diseño (confirmadas en conversación del 13/08/2026):
-- 1) Las papelerías pagan la MISMA tarifa fija de $75/mes que los
--    clientes — sin comisión sobre sus ventas, nunca.
-- 2) Periodo de gracia antes de empezar a cobrar:
--    · Papelería "fundadora" (se registró antes de LAUNCH_CUTOFF_DATE,
--      ver sección 1 abajo): 3 meses gratis.
--    · Papelería nueva (se registra después del cutoff): 1 mes gratis.
--    Como todavía no hay ninguna papelería real registrada, el cutoff
--    se deja lejos en el futuro por default — AJÚSTALO a tu fecha real
--    de lanzamiento cuando la definas (ver sección 1).
-- 3) Avisos automáticos 7 días y 1 día antes de que se acabe la gracia.
-- 4) Si se acaba la gracia sin que hayan pagado: la papelería deja de
--    aparecer/recibir pedidos hasta que se suscriban (paywall, no
--    borra nada de su información).
-- =============================================


-- ─────────────────────────────────────────────
-- 1) Configuración: fecha de corte "fundadora vs nueva"
-- CAMBIA este valor por tu fecha real de lanzamiento cuando la tengas
-- decidida. Mientras tanto, cualquier papelería que se registre HOY
-- cuenta como fundadora (3 meses), porque el default está lejos en
-- el futuro.
-- ─────────────────────────────────────────────
create table if not exists public.app_settings (
  key   text primary key,
  value text
);

insert into public.app_settings (key, value)
values ('launch_cutoff_date', (now() + interval '90 days')::text)
on conflict (key) do nothing;


-- ─────────────────────────────────────────────
-- 2) Columnas nuevas en printshops
-- ─────────────────────────────────────────────
alter table public.printshops add column if not exists stripe_customer_id text;
alter table public.printshops add column if not exists subscription_status text not null default 'gracia';
alter table public.printshops add column if not exists subscription_id text;
alter table public.printshops add column if not exists subscription_period_end timestamptz;
alter table public.printshops add column if not exists is_founding boolean not null default false;
alter table public.printshops add column if not exists grace_period_ends_at timestamptz;
alter table public.printshops add column if not exists grace_warned_7d boolean not null default false;
alter table public.printshops add column if not exists grace_warned_1d boolean not null default false;

do $$ begin
  alter table public.printshops
    add constraint printshops_subscription_status_check
    check (subscription_status in ('gracia', 'active', 'past_due', 'canceled', 'bloqueada'));
exception
  when duplicate_object then null;
end $$;


-- ─────────────────────────────────────────────
-- 3) Trigger: al crear una papelería, decide si es "fundadora" y
-- calcula cuándo se le acaba la gracia. Corre tanto si se registra
-- sola (flujo normal) como si el Admin la crea con
-- admin_create_printshop.
-- ─────────────────────────────────────────────
create or replace function set_printshop_founding_status()
returns trigger
language plpgsql
as $$
declare
  v_cutoff timestamptz;
begin
  select value::timestamptz into v_cutoff
  from public.app_settings where key = 'launch_cutoff_date';

  if v_cutoff is null or now() <= v_cutoff then
    new.is_founding := true;
    new.grace_period_ends_at := now() + interval '3 months';
  else
    new.is_founding := false;
    new.grace_period_ends_at := now() + interval '1 month';
  end if;

  new.subscription_status := 'gracia';
  return new;
end;
$$;

drop trigger if exists trg_printshop_founding_status on public.printshops;
create trigger trg_printshop_founding_status
  before insert on public.printshops
  for each row execute function set_printshop_founding_status();


-- ─────────────────────────────────────────────
-- 4) Vistas para el cron (avisos + bloqueo por gracia vencida)
-- ─────────────────────────────────────────────
drop view if exists public.printshop_grace_due_warning_7d;
create view public.printshop_grace_due_warning_7d as
select p.id, p.name, p.owner_id, p.grace_period_ends_at, u.phone, u.country_code
from public.printshops p
join public.users u on u.id = p.owner_id
where p.subscription_status = 'gracia'
  and p.grace_warned_7d = false
  and p.grace_period_ends_at is not null
  and p.grace_period_ends_at <= now() + interval '7 days';

drop view if exists public.printshop_grace_due_warning_1d;
create view public.printshop_grace_due_warning_1d as
select p.id, p.name, p.owner_id, p.grace_period_ends_at, u.phone, u.country_code
from public.printshops p
join public.users u on u.id = p.owner_id
where p.subscription_status = 'gracia'
  and p.grace_warned_1d = false
  and p.grace_period_ends_at is not null
  and p.grace_period_ends_at <= now() + interval '1 day';

drop view if exists public.printshop_grace_expired;
create view public.printshop_grace_expired as
select p.id, p.name, p.owner_id
from public.printshops p
where p.subscription_status = 'gracia'
  and p.grace_period_ends_at is not null
  and p.grace_period_ends_at <= now();

revoke all on public.printshop_grace_due_warning_7d from public, anon, authenticated;
revoke all on public.printshop_grace_due_warning_1d from public, anon, authenticated;
revoke all on public.printshop_grace_expired        from public, anon, authenticated;
grant select on public.printshop_grace_due_warning_7d to service_role;
grant select on public.printshop_grace_due_warning_1d to service_role;
grant select on public.printshop_grace_expired        to service_role;

create or replace function mark_printshop_warned(p_printshop_id uuid, p_which text)
returns void language plpgsql security definer as $$
begin
  if p_which = '7d' then
    update public.printshops set grace_warned_7d = true where id = p_printshop_id;
  elsif p_which = '1d' then
    update public.printshops set grace_warned_1d = true where id = p_printshop_id;
  end if;
end;
$$;
grant execute on function mark_printshop_warned(uuid, text) to service_role;
revoke execute on function mark_printshop_warned(uuid, text) from public, anon, authenticated;

create or replace function block_printshop_for_unpaid_grace(p_printshop_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.printshops
    set subscription_status = 'bloqueada', is_available = false
    where id = p_printshop_id;
end;
$$;
grant execute on function block_printshop_for_unpaid_grace(uuid) to service_role;
revoke execute on function block_printshop_for_unpaid_grace(uuid) from public, anon, authenticated;

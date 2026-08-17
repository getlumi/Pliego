-- =============================================
-- PLIEGO · Datos para analítica de suscripciones en Admin
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- subscription_status por sí solo (activa/cancelada) no dice CUÁNDO
-- pasó eso — sin fecha no se puede contar "nuevas esta semana" ni
-- "canceladas este mes" de forma confiable. Se agregan las fechas para
-- ambos tipos de suscripción (clientes y papelerías).
--
-- city en printshops: campo nuevo, vacío por ahora — no hay ninguna
-- papelería con ciudad capturada todavía (Pliego opera en una sola
-- ciudad por ahora). Queda listo para cuando se capture al aprobar KYC
-- o al expandir a más ciudades — el desglose "por ciudad" en Admin
-- mostrará todo agrupado como "Sin ciudad" hasta entonces.
-- =============================================

alter table public.users add column if not exists subscription_started_at timestamptz;
alter table public.users add column if not exists subscription_canceled_at timestamptz;

alter table public.printshops add column if not exists subscription_started_at timestamptz;
alter table public.printshops add column if not exists subscription_canceled_at timestamptz;
alter table public.printshops add column if not exists city text;

-- record_printshop_subscription_payment se REEMPLAZA para además poner
-- subscription_started_at la primera vez (nunca se sobreescribe en
-- renovaciones — coalesce). El resto de la función no cambia.
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
        subscription_period_end = p_period_end,
        subscription_started_at = coalesce(subscription_started_at, now())
    where id = p_printshop_id;

  return true;
end;
$$;

grant execute on function record_printshop_subscription_payment(uuid, numeric, text, timestamptz) to service_role;
revoke execute on function record_printshop_subscription_payment(uuid, numeric, text, timestamptz) from public, anon, authenticated;


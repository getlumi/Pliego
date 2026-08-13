-- =============================================
-- PLIEGO · Suscripción mensual ilimitada + reprecio de créditos
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Reprecio: $26.5 → 2 créditos, $55 → 5 créditos (antes 4 y 10).
-- El reprecio en sí no requiere cambios de esquema — vive en el código
-- de las Edge Functions y el frontend. Este archivo es solo para la
-- infraestructura NUEVA: la suscripción de $75/mes ilimitada.
-- =============================================

alter table public.users
  add column if not exists stripe_customer_id      text,
  add column if not exists subscription_status     text not null default 'none',
  add column if not exists subscription_id         text,
  add column if not exists subscription_period_end timestamptz;

-- 'none' | 'active' | 'past_due' | 'canceled'
create index if not exists idx_users_subscription_status on public.users(subscription_status);
create unique index if not exists idx_users_stripe_customer on public.users(stripe_customer_id) where stripe_customer_id is not null;

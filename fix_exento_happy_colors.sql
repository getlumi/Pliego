-- =============================================
-- PLIEGO · Estado "exento" — papelerías que NUNCA van a pagar
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Por qué un estado nuevo y no reusar 'active': 'active' hace que la app
-- muestre "Suscripción activa · $75/mes" con un botón "Cancelar
-- suscripción" que llama a cancel-shop-subscription — una función pensada
-- para una suscripción REAL de Stripe. Happy Colors no tiene ninguna
-- suscripción de Stripe detrás, así que ese botón fallaría o haría algo
-- inesperado. 'exento' es honesto: nunca se les cobra, nunca ven un
-- precio, nunca ven un botón de cancelar que no aplica.
-- =============================================

do $$ begin
  alter table public.printshops drop constraint printshops_subscription_status_check;
exception
  when undefined_object then null;
end $$;

alter table public.printshops
  add constraint printshops_subscription_status_check
  check (subscription_status in ('gracia', 'active', 'past_due', 'canceled', 'bloqueada', 'exento'));

-- Aplica la excepción SOLO a Happy Colors (id confirmado). Ninguna otra
-- papelería se toca — todas las demás (incluidas las próximas 9
-- fundadoras) siguen el ciclo normal: 3 meses de gracia calculados desde
-- SU PROPIA fecha real de registro, luego $75/mes.
update public.printshops
  set subscription_status = 'exento',
      grace_period_ends_at = null
  where id = '60a49be8-962a-41d4-b0bf-4a1b116375db';

-- Verificar que quedó bien, y de paso confirmar por qué mostraba ~70 días
-- en vez de ~90 (para entender la causa, no solo el parche):
select id, name, created_at, subscription_status, is_founding, grace_period_ends_at
from public.printshops where id = '60a49be8-962a-41d4-b0bf-4a1b116375db';

-- =============================================
-- PLIEGO · Fix puntual: aplicar el trigger retroactivamente a papetest
-- (se registró antes de correr la migración de suscripción, así que
-- el trigger — que solo corre en INSERT — nunca la tocó)
-- Pegar en Supabase → SQL Editor → Run
-- =============================================

update public.printshops
set
  is_founding = true,
  grace_period_ends_at = now() + interval '3 months'
where id = '748d9ccd-1392-4c82-ad59-1f9c0782393d';

-- =============================================
-- PLIEGO · Patch 3: cron diario para printshop-grace-cron
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- IMPORTANTE: reemplaza TU_PROYECTO si es distinto antes de correr —
-- ya viene con la URL real de este proyecto (hjrexcdtrzesdcfkhnpd).
-- =============================================

select cron.unschedule('pliego-printshop-grace-cron')
where exists (select 1 from cron.job where jobname = 'pliego-printshop-grace-cron');

select cron.schedule(
  'pliego-printshop-grace-cron',
  '0 9 * * *', -- todos los días a las 9:00am (hora del servidor, UTC)
  $$
  select net.http_post(
    url := 'https://hjrexcdtrzesdcfkhnpd.supabase.co/functions/v1/printshop-grace-cron',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

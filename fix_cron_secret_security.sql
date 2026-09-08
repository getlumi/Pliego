-- =============================================
-- PLIEGO · Seguridad: proteger las funciones de cron con un secreto
-- compartido (07/09/2026)
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Hallazgo real: cleanup-expired-files, printshop-grace-cron y
-- guarantee-cron se despliegan con "Verify JWT" DESACTIVADO (necesario
-- porque pg_cron no tiene sesión de usuario) — pero eso significa que
-- cualquiera que supiera la URL podía dispararlas manualmente, sin
-- ninguna otra verificación (ej. forzar bloqueos de papelería o
-- descuentos de garantía antes de tiempo, o gastar cuota borrando
-- archivos a discreción).
--
-- Fix: cada función ahora exige un header x-cron-secret que coincida
-- con el secret CRON_SECRET configurado en Supabase. Este SQL actualiza
-- las 3 llamadas de pg_cron para que lo manden.
--
-- ⚠️ ANTES DE CORRER ESTO: ve a Edge Functions → Secrets y agrega:
--   Nombre: CRON_SECRET
--   Valor:  4132d4396429c85a307371f40435f8322d9222681f82e2c40ae4e76203df28d
-- (o genera tu propio valor aleatorio largo — con que coincida exacto
-- en el secret Y en este SQL, cualquiera funciona igual de bien)
-- =============================================

select cron.unschedule('pliego-cleanup-cron')
where exists (select 1 from cron.job where jobname = 'pliego-cleanup-cron');

select cron.schedule(
  'pliego-cleanup-cron',
  '0 */2 * * *',
  $$
  select net.http_post(
    url := 'https://hjrexcdtrzesdcfkhnpd.supabase.co/functions/v1/cleanup-expired-files',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '4132d4396429c85a307371f40435f8322d9222681f82e2c40ae4e76203df28d'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.unschedule('pliego-guarantee-cron')
where exists (select 1 from cron.job where jobname = 'pliego-guarantee-cron');

select cron.schedule(
  'pliego-guarantee-cron',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://hjrexcdtrzesdcfkhnpd.supabase.co/functions/v1/guarantee-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '4132d4396429c85a307371f40435f8322d9222681f82e2c40ae4e76203df28d'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Busca el nombre real del job de printshop-grace-cron antes de
-- reemplazarlo, por si no se llama exactamente así — ajusta el nombre
-- si el select de abajo devuelve algo distinto:
-- select jobname from cron.job;

select cron.unschedule('pliego-printshop-grace-cron')
where exists (select 1 from cron.job where jobname = 'pliego-printshop-grace-cron');

select cron.schedule(
  'pliego-printshop-grace-cron',
  '0 9 * * *', -- ajusta a la hora real que ya tenías configurada
  $$
  select net.http_post(
    url := 'https://hjrexcdtrzesdcfkhnpd.supabase.co/functions/v1/printshop-grace-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '4132d4396429c85a307371f40435f8322d9222681f82e2c40ae4e76203df28d'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verificar que los 3 jobs quedaron con el header nuevo:
select jobname, schedule, command from cron.job where jobname like 'pliego-%';

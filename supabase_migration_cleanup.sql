-- =============================================
-- PLIEGO · Borrado real de archivos vencidos + soporte para identificaciones
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Hallazgo: expires_at existía en orders y se usaba para OCULTAR pedidos
-- del historial, pero nada borraba de verdad el archivo de Storage ni la
-- fila. La promesa de "se borra en 3 días" (tutoriales, aviso de
-- privacidad) nunca se cumplió técnicamente. Esto lo corrige de raíz.
-- =============================================

-- 1) Columna para no reprocesar archivos ya borrados
alter table public.orders
  add column if not exists file_deleted boolean not null default false;

-- 2) Vista de lo que el cron debe limpiar (solo service_role la puede leer)
create or replace view public.orders_due_cleanup as
select id, file_url
from public.orders
where expires_at < now()
  and file_deleted = false
  and file_url is not null;

revoke all on public.orders_due_cleanup from public, anon, authenticated;
grant select on public.orders_due_cleanup to service_role;

-- 3) Función para que el cron marque un archivo como ya borrado
create or replace function mark_order_file_deleted(p_order_id uuid)
returns void language sql security definer as $$
  update public.orders set file_deleted = true where id = p_order_id;
$$;

grant execute on function mark_order_file_deleted(uuid) to service_role;
revoke execute on function mark_order_file_deleted(uuid) from public, anon, authenticated;

-- 4) Cron cada 2 horas — llama a la Edge Function cleanup-expired-files
select cron.unschedule('pliego-cleanup-cron')
where exists (select 1 from cron.job where jobname = 'pliego-cleanup-cron');

select cron.schedule(
  'pliego-cleanup-cron',
  '0 */2 * * *',
  $$
  select net.http_post(
    url := 'https://hjrexcdtrzesdcfkhnpd.supabase.co/functions/v1/cleanup-expired-files',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

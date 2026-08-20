-- =============================================
-- PLIEGO · Cambio de arquitectura: Realtime por Broadcast, no postgres_changes
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Después de horas de diagnóstico con evidencia real (canal de prueba
-- sin filtro SÍ recibía eventos, canal con 'UPDATE' específico + 2
-- listeners NUNCA disparaba su callback, ni con RLS completamente
-- desactivado), se encontró la explicación real en la documentación
-- oficial de Supabase: "postgres_changes... does not scale as well as
-- Broadcast" y, textual del repositorio oficial: "The server does not
-- guarantee that every message will be delivered to your clients."
--
-- No es un bug de nuestro código — es una limitación reconocida por la
-- propia plataforma. La solución real es usar el mecanismo que Supabase
-- mismo recomienda para esto: Broadcast desde la base de datos, vía
-- un trigger — mecanismo distinto, más confiable, menor latencia.
-- =============================================

-- Regla de autorización: cada quien solo puede escuchar SU PROPIO
-- canal de pedidos (order:<su-user-id>) o de saldo (wallet:<su-user-id>).
drop policy if exists "authenticated can receive own order broadcasts" on "realtime"."messages";
create policy "authenticated can receive own order broadcasts"
on "realtime"."messages"
for select
to authenticated
using (
  realtime.topic() = 'order:' || auth.uid()::text
  or realtime.topic() = 'wallet:' || auth.uid()::text
);

-- Trigger de orders — manda un mensaje de Broadcast cada vez que un
-- pedido cambia, al canal exclusivo de su dueño.
create or replace function public.broadcast_order_changes()
returns trigger
security definer set search_path = ''
language plpgsql
as $$
begin
  perform realtime.broadcast_changes(
    'order:' || coalesce(NEW.user_id, OLD.user_id)::text, -- topic
    TG_OP,                                                  -- event
    TG_OP,                                                  -- operation
    TG_TABLE_NAME,                                          -- table
    TG_TABLE_SCHEMA,                                        -- schema
    NEW,
    OLD
  );
  return NEW;
end;
$$;

drop trigger if exists trg_broadcast_order_changes on public.orders;
create trigger trg_broadcast_order_changes
  after insert or update on public.orders
  for each row execute function public.broadcast_order_changes();

-- Trigger de wallet_transactions — para refrescar el tab Saldo cuando
-- llega una recarga nueva.
create or replace function public.broadcast_wallet_changes()
returns trigger
security definer set search_path = ''
language plpgsql
as $$
begin
  perform realtime.broadcast_changes(
    'wallet:' || NEW.user_id::text,
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
  );
  return NEW;
end;
$$;

drop trigger if exists trg_broadcast_wallet_changes on public.wallet_transactions;
create trigger trg_broadcast_wallet_changes
  after insert on public.wallet_transactions
  for each row execute function public.broadcast_wallet_changes();

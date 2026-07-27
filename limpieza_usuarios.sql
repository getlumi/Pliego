-- =============================================
-- PLIEGO · Limpieza de usuarios de prueba
-- Conserva: admin (WhatsApp 9982168410) y el dueño de la papelería 'papetest'
-- Elimina: todo lo demás (usuarios, sus pedidos, wallet, reseñas, tickets,
-- push subscriptions vía CASCADE, y papelerías huérfanas que no sean papetest)
-- =============================================

-- ─────────────────────────────────────────────
-- PASO 1 — VISTA PREVIA (solo lectura, no borra nada)
-- Corre esto primero y revisa la lista con cuidado.
-- NO debe aparecer el admin ni el dueño de papetest.
-- ─────────────────────────────────────────────
select
  u.id,
  u.phone,
  u.name,
  u.is_admin,
  p.name as printshop_name
from public.users u
left join public.printshops p on p.owner_id = u.id
where u.phone <> '9982168410'
  and u.id <> (select owner_id from public.printshops where name = 'papetest' limit 1);


-- ─────────────────────────────────────────────
-- PASO 2 — BORRADO REAL
-- Solo corre esto después de revisar el PASO 1 y confirmar que la lista
-- es correcta. Esto es IRREVERSIBLE.
-- Borra de auth.users, lo cual hace CASCADE automático a:
-- public.users, orders, wallet_transactions, ratings, reports,
-- support_tickets, support_messages, push_subscriptions.
-- ─────────────────────────────────────────────
delete from auth.users
where id in (
  select u.id
  from public.users u
  where u.phone <> '9982168410'
    and u.id <> (select owner_id from public.printshops where name = 'papetest' limit 1)
);

-- ─────────────────────────────────────────────
-- PASO 3 — Limpiar papelerías huérfanas
-- Cualquier papelería que no sea 'papetest' pierde a su dueño en el paso
-- anterior (owner_id queda NULL) pero la fila de la papelería sobrevive.
-- Esto la elimina también para dejar todo limpio.
-- ─────────────────────────────────────────────
delete from public.printshops
where name <> 'papetest';

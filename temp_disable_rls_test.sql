-- =============================================
-- PLIEGO · PRUEBA TEMPORAL — NO dejar así, es solo diagnóstico
-- =============================================
-- Paso 1: correr esto, hacer la prueba de inmediato (marcar un pedido
-- como entregado con Historial abierto), ver si esta vez SÍ llega el
-- evento a la consola.
-- =============================================

alter table public.orders disable row level security;

-- =============================================
-- Paso 2 — EN CUANTO TERMINES LA PRUEBA, corre esto para reactivar
-- (sin importar el resultado, nunca dejar la tabla sin RLS):
-- =============================================

-- alter table public.orders enable row level security;

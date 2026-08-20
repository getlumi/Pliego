-- =============================================
-- PLIEGO · Diagnóstico de garantía — créditos disponibles reales
-- =============================================

select credits_balance, credits_held, (credits_balance - credits_held) as disponibles
from public.users where id = '1356b3b0-82d7-4335-97f8-dc2fed068366'; -- Gio

-- Ver si hay créditos "atorados" reservados de pedidos de pruebas
-- anteriores que nunca se liberaron:
select id, order_id, credits_held, status, created_at
from public.credit_holds
where user_id = '1356b3b0-82d7-4335-97f8-dc2fed068366'
order by created_at desc;

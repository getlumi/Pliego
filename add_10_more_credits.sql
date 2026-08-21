-- =============================================
-- PLIEGO · Agregar 10 créditos más de prueba
-- Pegar en Supabase → SQL Editor → Run
-- =============================================

select credit_wallet(
  p_user_id     => '1356b3b0-82d7-4335-97f8-dc2fed068366', -- Gio
  p_amount      => 0,
  p_payment_id  => null,
  p_description => 'Créditos de prueba (agregado manual)',
  p_method      => 'tarjeta',
  p_credits     => 10
);

-- Verificar:
select credits_balance, credits_held, (credits_balance - credits_held) as disponibles
from public.users where id = '1356b3b0-82d7-4335-97f8-dc2fed068366';

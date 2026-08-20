-- =============================================
-- PLIEGO · Agregar créditos de prueba (con UID exacto, sin ambigüedad)
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- UID confirmado directo desde Authentication → Users: cuenta "Gio",
-- correo 9999999999@pliego.com
-- =============================================

select credit_wallet(
  p_user_id     => '1356b3b0-82d7-4335-97f8-dc2fed068366',
  p_amount      => 0,
  p_payment_id  => null,
  p_description => 'Créditos de prueba (agregado manual)',
  p_method      => 'tarjeta',
  p_credits     => 10
);

-- Verificar que se aplicó:
select id, name, phone, credits_balance from public.users where id = '1356b3b0-82d7-4335-97f8-dc2fed068366';

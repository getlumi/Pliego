-- =============================================
-- PLIEGO · Agregar créditos de prueba manualmente
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Usa la función oficial credit_wallet (la misma que usa Stripe) en vez
-- de un UPDATE directo — con el trigger de seguridad de hoy, un UPDATE
-- directo a users.credits_balance ya no funcionaría de todas formas.
--
-- CAMBIA el número de WhatsApp de abajo por el de la cuenta que
-- quieres recargar.
-- =============================================

select credit_wallet(
  p_user_id     => (select id from public.users where phone = '9983941149'), -- 👈 cambia este número
  p_amount      => 0,   -- no fue un pago real, no debe sumar a Finanzas
  p_payment_id  => null,
  p_description => 'Créditos de prueba (agregado manual)',
  p_method      => 'tarjeta',
  p_credits     => 10
);

-- Verificar que se aplicó:
select phone, credits_balance from public.users where phone = '9983941149'; -- 👈 mismo número

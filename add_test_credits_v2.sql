-- =============================================
-- PLIEGO · Agregar créditos de prueba (corregido)
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- El correo de acceso (9999999999@pliego.com) y el campo phone de esa
-- cuenta quedaron con números distintos — el real en la tabla users es
-- 9990000003, por eso la búsqueda anterior no encontraba nada.
-- =============================================

select credit_wallet(
  p_user_id     => (select id from public.users where phone = '9990000003'),
  p_amount      => 0,
  p_payment_id  => null,
  p_description => 'Créditos de prueba (agregado manual)',
  p_method      => 'tarjeta',
  p_credits     => 10
);

-- Verificar que se aplicó:
select phone, credits_balance from public.users where phone = '9990000003';

-- =============================================
-- PLIEGO · Liberar los 6 créditos atorados de pedidos viejos
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Mismos 6 holds que compartiste, todos en 'reservado' (nunca se
-- llegaron a descontar de verdad, solo quedaron reservados) — se
-- liberan con la misma lógica exacta que usa release_guarantee_hold
-- para ese caso.
-- =============================================

-- Restar los 6 créditos reservados de credits_held (nunca se
-- descontaron del balance real, solo estaban "apartados")
update public.users
  set credits_held = credits_held - 6
  where id = '1356b3b0-82d7-4335-97f8-dc2fed068366';

-- Marcar los 6 holds como resueltos, para que no se puedan liberar dos veces
update public.credit_holds
  set status = 'entregado', resolved_at = now()
  where id in (
    'f0b99de0-7872-4aa7-9a4a-3caa26de3eaf',
    '4eee362f-12d8-4bb5-9319-61f75e437da4',
    'a4c0653a-96cf-4c74-b039-92be8299d91c',
    'a6c96bac-bc39-43c8-8793-d7a0af8a3265',
    '707e6cae-3c36-4471-a3fa-5588870610b0',
    'a3432459-59b6-4040-869f-5fdeb03f005f'
  );

-- Verificar que ya quedaron disponibles:
select credits_balance, credits_held, (credits_balance - credits_held) as disponibles
from public.users where id = '1356b3b0-82d7-4335-97f8-dc2fed068366';

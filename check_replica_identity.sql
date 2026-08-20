-- =============================================
-- PLIEGO · Verificar REPLICA IDENTITY de orders
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Si esto NO dice "f" (full), Realtime solo recibe el ID de la fila
-- que cambió, no el resto de columnas (incluyendo user_id) — y sin
-- user_id no puede verificar si te toca avisarte a ti, así que el
-- evento nunca se manda. Tus notas del proyecto decían que esto ya se
-- había puesto en FULL hace tiempo, pero hay que confirmarlo con la
-- base real, no con las notas.
-- =============================================

select relname, case relreplident
  when 'd' then 'default (solo primary key)'
  when 'n' then 'nothing'
  when 'f' then 'full (correcto)'
  when 'i' then 'index'
end as replica_identity
from pg_class
where relname in ('orders', 'users', 'printshops')
  and relnamespace = 'public'::regnamespace;

-- =============================================
-- PLIEGO · FIX CRÍTICO — Realtime nunca tuvo permiso de leer las tablas
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Causa raíz real (verificada contra documentación técnica, no supuesta):
-- Supabase Realtime corre como un rol interno separado
-- (`supabase_realtime`), distinto del rol del usuario que inicia sesión.
-- Antes de mandarte un aviso en tiempo real, ese rol interno necesita
-- poder LEER la fila para poder evaluar tu política de seguridad (RLS)
-- en tu nombre — "¿este usuario puede ver esta fila?". Sin un permiso
-- explícito de lectura para ese rol interno, esa evaluación falla en
-- silencio: no hay ningún error, Realtime simplemente nunca manda el
-- aviso. Por fuera, se siente exactamente como "está congelado, hay
-- que salir y entrar para que se actualice" — que es exactamente lo
-- que llevamos horas viendo.
--
-- Este permiso NUNCA existió en ningún migration de este proyecto.
-- Aplica a TODAS las tablas que usan tiempo real: orders, users,
-- printshops, support_tickets, support_messages.
-- =============================================

grant select on public.orders            to supabase_realtime;
grant select on public.users              to supabase_realtime;
grant select on public.printshops         to supabase_realtime;
grant select on public.support_tickets    to supabase_realtime;
grant select on public.support_messages   to supabase_realtime;

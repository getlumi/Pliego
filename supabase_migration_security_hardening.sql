-- =============================================
-- PLIEGO · SEGURIDAD — cierre de vulnerabilidades reales de RLS
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Contexto: Postgres RLS restringe QUÉ FILAS puedes tocar, no QUÉ
-- COLUMNAS. Varias políticas existentes decían "el dueño puede
-- actualizar su propia fila" sin restringir columnas — eso significa
-- que, con solo su propio token (ya visible en el navegador, como en
-- cualquier app Supabase), alguien podría llamar la API REST
-- directamente y cambiar campos que la app nunca le deja tocar desde
-- la interfaz: precio de su propio pedido, si su papelería ya está
-- verificada, si su suscripción ya está activa, etc.
--
-- Esto no es teórico — se verificó revisando el código real: se
-- identificaron los hallazgos de abajo, cada uno con su fix. El más
-- grave es el #0 (users) — sin ese fix, cualquier usuario logueado
-- podía en teoría ponerse is_admin=true a sí mismo.
--
-- IMPORTANTE — verifica esto ANTES de correr el resto del archivo:
-- los triggers de abajo confían en que las funciones de la app (todas
-- creadas desde el SQL Editor) son dueñas del rol "postgres" — así
-- distinguen "esto viene de una función de confianza ya existente" de
-- "esto es una llamada directa a la API". Corre esta consulta primero:
--
--   select proowner::regrole from pg_proc where proname = 'deduct_credit';
--
-- Si el resultado dice "postgres", todo lo de abajo funciona tal cual.
-- Si dice otra cosa, avísame ese nombre antes de seguir — hay que
-- ajustar el texto 'postgres' en los triggers por el rol correcto.
-- =============================================


-- ─────────────────────────────────────────────
-- 0) users — EL MÁS GRAVE. La política "el usuario puede actualizar su
-- propia fila" no restringía columnas — is_admin, credits_balance,
-- wallet_balance, account_suspended, subscription_status estaban ahí,
-- en la misma fila que el usuario sí puede tocar legítimamente (name,
-- avatar_url, onboarding_seen). Se bloquean con un trigger; los únicos
-- 3 campos que la app realmente necesita que el usuario edite quedan
-- libres, todo lo demás solo lo puede tocar el servidor (service_role).
-- ─────────────────────────────────────────────
create or replace function protect_users_sensitive_columns()
returns trigger
language plpgsql
as $$
begin
  -- Bloquea llamadas directas del cliente (current_user sería
  -- 'authenticated'/'anon'/'service_role' según su token) — pero deja
  -- pasar CUALQUIER función SECURITY DEFINER de confianza ya existente
  -- (deduct_credit, refund_credit, admin_adjust_credits, etc.), porque
  -- esas se ejecutan como el dueño de la función ("postgres"), sin
  -- necesidad de tocar ninguna de ellas para que sigan funcionando.
  if current_user <> 'postgres' and auth.role() <> 'service_role' then
    NEW.is_admin                 := OLD.is_admin;
    NEW.is_active                := OLD.is_active;
    NEW.wallet_balance            := OLD.wallet_balance;
    NEW.credits_balance           := OLD.credits_balance;
    NEW.credits_held               := OLD.credits_held;
    NEW.account_suspended         := OLD.account_suspended;
    NEW.suspension_reason         := OLD.suspension_reason;
    NEW.subscription_status       := OLD.subscription_status;
    NEW.subscription_id           := OLD.subscription_id;
    NEW.subscription_period_end   := OLD.subscription_period_end;
    NEW.subscription_started_at   := OLD.subscription_started_at;
    NEW.subscription_canceled_at  := OLD.subscription_canceled_at;
    NEW.stripe_customer_id        := OLD.stripe_customer_id;
    NEW.phone                     := OLD.phone;
    NEW.privacy_accepted_at       := OLD.privacy_accepted_at;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_users_sensitive on public.users;
create trigger trg_protect_users_sensitive
  before update on public.users
  for each row execute function protect_users_sensitive_columns();

-- El único uso real de "users_update_admin" en el código es Admin
-- activando/desactivando cuentas — se mueve a una función de
-- confianza, mismo patrón que ya usa admin_adjust_credits.
drop function if exists admin_toggle_user_active(uuid);
create or replace function admin_toggle_user_active(p_user_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  update public.users set is_active = not is_active where id = p_user_id;
  return found;
end;
$$;
grant execute on function admin_toggle_user_active(uuid) to authenticated;
revoke execute on function admin_toggle_user_active(uuid) from public, anon;

-- El mismo riesgo aplica al INSERT inicial (cuando se crea la fila por
-- primera vez) — App.jsx tiene un flujo de respaldo que inserta el
-- perfil si el registro normal (smart-task, con service_role) no
-- terminó a tiempo. Sin esto, alguien podría insertar su propia fila
-- con credits_balance/wallet_balance ya inflados desde el día uno.
create or replace function protect_users_sensitive_columns_insert()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'postgres' and auth.role() <> 'service_role' then
    NEW.is_admin          := false;
    NEW.is_active          := true;
    NEW.wallet_balance     := 0;
    NEW.credits_balance    := 0;
    NEW.credits_held       := 0;
    NEW.account_suspended  := false;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_users_sensitive_insert on public.users;
create trigger trg_protect_users_sensitive_insert
  before insert on public.users
  for each row execute function protect_users_sensitive_columns_insert();


-- ─────────────────────────────────────────────
-- 1) wallet_transactions — la política de insert directo del cliente
-- NO la usa ningún código real de la app (verificado). Todo insert
-- legítimo ya pasa por funciones SECURITY DEFINER (credit_wallet,
-- deduct_credit, etc.), que no necesitan esta política para funcionar.
-- Se elimina: cero función legítima perdida, cierra una puerta que
-- permitía insertar transacciones falsas (ej. una "recarga" de
-- $100,000 que nunca pasó por Stripe, contaminando Finanzas en Admin).
-- ─────────────────────────────────────────────
drop policy if exists "wallet_insert_own" on public.wallet_transactions;


-- ─────────────────────────────────────────────
-- 2) orders — las políticas de update permitían cambiar CUALQUIER
-- columna de un pedido propio (cliente) o de un pedido de su papelería
-- (negocio) — incluyendo estimated_cost, service_fee, etc. Se
-- eliminan ambas políticas de update directo y se reemplazan por dos
-- funciones angostas que solo hacen exactamente lo que la app
-- legítimamente necesita.
-- ─────────────────────────────────────────────
drop policy if exists "orders_update_user"      on public.orders;
drop policy if exists "orders_update_printshop" on public.orders;

-- Cliente: solo puede marcar SU PROPIO pedido como calificado.
drop function if exists mark_order_rated(uuid);
create or replace function mark_order_rated(p_order_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  update public.orders
    set rated = true
    where id = p_order_id and user_id = auth.uid();
  return found;
end;
$$;
grant execute on function mark_order_rated(uuid) to authenticated;
revoke execute on function mark_order_rated(uuid) from public, anon;

-- Papelería: solo puede cambiar el ESTADO de un pedido de SU propio
-- negocio, a uno de los 3 valores válidos — nada más.
drop function if exists update_order_status(uuid, text);
create or replace function update_order_status(p_order_id uuid, p_status text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_extra_ready     timestamptz;
  v_extra_delivered timestamptz;
begin
  if p_status not in ('en_proceso', 'listo', 'entregado') then
    raise exception 'Estado inválido: %', p_status;
  end if;

  if p_status = 'listo'     then v_extra_ready := now();     end if;
  if p_status = 'entregado' then v_extra_delivered := now(); end if;

  update public.orders o
    set status = p_status::order_status,
        ready_at     = coalesce(v_extra_ready, o.ready_at),
        delivered_at = coalesce(v_extra_delivered, o.delivered_at)
    where o.id = p_order_id
      and o.printshop_id in (select id from public.printshops where owner_id = auth.uid());

  return found;
end;
$$;
grant execute on function update_order_status(uuid, text) to authenticated;
revoke execute on function update_order_status(uuid, text) from public, anon;


-- ─────────────────────────────────────────────
-- 3) printshops — la política de update permitía a cualquier dueño
-- cambiar CUALQUIER columna de su propia papelería vía API directa,
-- incluyendo campos que solo Admin o Stripe deberían poder tocar:
-- verificación KYC, estado de suscripción, insignia de fundadora,
-- calificación, etc. Se agrega un trigger que revierte esos campos a
-- su valor anterior si el cambio no viene de un contexto de servidor
-- de confianza (service_role) — así la app sigue funcionando normal
-- para todo lo legítimo (nombre, horarios, ubicación, disponibilidad,
-- logo), pero los campos sensibles quedan blindados sin importar qué
-- se le mande directo a la API.
-- ─────────────────────────────────────────────
create or replace function protect_printshop_sensitive_columns()
returns trigger
language plpgsql
as $$
begin
  -- Mismo criterio que en users: deja pasar cualquier función
  -- SECURITY DEFINER de confianza (dueña de "postgres"), incluyendo
  -- el trigger update_printshop_rating y reset_printshop_kyc de abajo
  -- — sin tocar ninguna de ellas.
  if current_user <> 'postgres' and auth.role() <> 'service_role' then
    NEW.verified                 := OLD.verified;
    NEW.verification_status      := OLD.verification_status;
    NEW.doc_ine_status           := OLD.doc_ine_status;
    NEW.doc_selfie_status        := OLD.doc_selfie_status;
    NEW.doc_address_status       := OLD.doc_address_status;
    NEW.rejection_reason         := OLD.rejection_reason;
    NEW.subscription_status      := OLD.subscription_status;
    NEW.subscription_id          := OLD.subscription_id;
    NEW.subscription_period_end  := OLD.subscription_period_end;
    NEW.stripe_customer_id       := OLD.stripe_customer_id;
    NEW.is_founding              := OLD.is_founding;
    NEW.grace_period_ends_at     := OLD.grace_period_ends_at;
    NEW.grace_warned_7d          := OLD.grace_warned_7d;
    NEW.grace_warned_1d          := OLD.grace_warned_1d;
    NEW.rating_avg               := OLD.rating_avg;
    NEW.rating_count             := OLD.rating_count;
    NEW.latest_comment           := OLD.latest_comment;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_printshop_sensitive on public.printshops;
create trigger trg_protect_printshop_sensitive
  before update on public.printshops
  for each row execute function protect_printshop_sensitive_columns();

-- La app tenía UN flujo legítimo que sí necesitaba tocar un campo
-- ahora blindado: "volver a subir documentos" tras un rechazo de KYC
-- (resetea verification_status/doc_*_status a 'pending'). Se reemplaza
-- por una función de confianza que solo permite ESE reset específico,
-- nunca aprobarse a sí mismo.
drop function if exists reset_printshop_kyc(uuid);
create or replace function reset_printshop_kyc(p_printshop_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  update public.printshops
    set submitted_at        = null,
        verification_status = 'pending',
        ine_url              = null,
        selfie_url           = null,
        address_proof_url    = null,
        doc_ine_status       = 'pending',
        doc_selfie_status    = 'pending',
        doc_address_status   = 'pending'
    where id = p_printshop_id and owner_id = auth.uid();
  return found;
end;
$$;
grant execute on function reset_printshop_kyc(uuid) to authenticated;
revoke execute on function reset_printshop_kyc(uuid) from public, anon;

-- La aprobación/rechazo de KYC por Admin también era un update() directo
-- del cliente (no pasaba por ninguna función) — con el trigger nuevo
-- se hubiera bloqueado por accidente. Se convierte en función de
-- confianza, solo para admins reales (is_admin ya no se puede
-- auto-otorgar nadie, gracias al fix de la sección 0).
drop function if exists admin_review_printshop_kyc(uuid, boolean, text, text, text, text, text);
create or replace function admin_review_printshop_kyc(
  p_printshop_id     uuid,
  p_verified         boolean,
  p_verification_status text,
  p_rejection_reason text,
  p_doc_ine_status   text,
  p_doc_selfie_status text,
  p_doc_address_status text
) returns boolean
language plpgsql
security definer
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  update public.printshops
    set verified             = p_verified,
        verification_status  = p_verification_status,
        rejection_reason     = p_rejection_reason,
        doc_ine_status       = p_doc_ine_status,
        doc_selfie_status    = p_doc_selfie_status,
        doc_address_status   = p_doc_address_status,
        reviewed_at          = now()
    where id = p_printshop_id;

  return found;
end;
$$;
grant execute on function admin_review_printshop_kyc(uuid, boolean, text, text, text, text, text) to authenticated;
revoke execute on function admin_review_printshop_kyc(uuid, boolean, text, text, text, text, text) from public, anon;

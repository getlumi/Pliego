-- Pliego · Migración: suscripciones push para notificaciones
-- Pegar en Supabase → SQL Editor → Run

create table if not exists public.push_subscriptions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "push_sub_own" on public.push_subscriptions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin puede ver todas
create policy "push_sub_admin" on public.push_subscriptions
  for select using (public.is_admin());

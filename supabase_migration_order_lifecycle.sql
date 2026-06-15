-- Pliego · Migración: tiempos de ciclo + nombre del cliente en pedidos
-- Pegar en Supabase → SQL Editor → Run

alter table public.orders
  add column if not exists ready_at     timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists user_name    text;

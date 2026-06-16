-- Pliego · Migración: wallet_transactions para pagos de Mercado Pago
-- Pegar en Supabase → SQL Editor → Run

alter table public.wallet_transactions
  add column if not exists payment_id  text,
  add column if not exists description text;

-- Índice para evitar procesar el mismo pago dos veces
create unique index if not exists wallet_transactions_payment_id_idx
  on public.wallet_transactions (payment_id)
  where payment_id is not null;

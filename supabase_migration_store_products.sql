-- =============================================
-- PLIEGO · Productos de "Tienda" (Pliego Store)
-- Pegar en Supabase → SQL Editor → Run
-- =============================================
-- Cada papelería decide libremente qué productos adicionales vender
-- (café, snacks, artículos de oficina, lo que sea) — sin marca ni
-- categoría fija impuesta por Pliego. Los clientes solo ven esta
-- sección cuando ya eligieron esa papelería específica (oculta antes).
--
-- Los productos elegidos se unen al MISMO pedido de impresión — un solo
-- paquete, todo se paga junto en efectivo al llegar. Los productos NUNCA
-- cuentan para la garantía anti-no-show (esa solo cubre el costo de
-- imprimir) — se asume que son productos empaquetados sin merma si no
-- se recogen, a diferencia de algo hecho al momento.
-- =============================================

-- Guarda qué productos se eligieron para un pedido (snapshot de nombre/
-- precio al momento de pedir, no referencia viva al catálogo — así un
-- cambio de precio después no altera pedidos ya hechos).
alter table public.orders add column if not exists store_items jsonb;
alter table public.orders add column if not exists store_total numeric not null default 0;

create table if not exists public.printshop_products (
  id            uuid primary key default gen_random_uuid(),
  printshop_id  uuid not null references public.printshops(id) on delete cascade,
  name          text not null,
  price         numeric not null default 0,
  image_url     text,
  enabled       boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists printshop_products_printshop_id_idx
  on public.printshop_products(printshop_id);

alter table public.printshop_products enable row level security;

drop policy if exists "printshop_products_select_public" on public.printshop_products;
drop policy if exists "printshop_products_select_own"    on public.printshop_products;
drop policy if exists "printshop_products_insert_own"    on public.printshop_products;
drop policy if exists "printshop_products_update_own"    on public.printshop_products;
drop policy if exists "printshop_products_delete_own"    on public.printshop_products;

-- Cualquiera (incluso sin sesión) puede ver los productos ACTIVOS —
-- son parte de la información pública de la papelería, como sus precios.
create policy "printshop_products_select_public" on public.printshop_products
  for select using (enabled = true);

-- El dueño ve TODOS los suyos, incluidos los desactivados (para poder
-- reactivarlos sin perder el catálogo).
create policy "printshop_products_select_own" on public.printshop_products
  for select using (
    exists (select 1 from public.printshops p where p.id = printshop_id and p.owner_id = auth.uid())
  );

create policy "printshop_products_insert_own" on public.printshop_products
  for insert with check (
    exists (select 1 from public.printshops p where p.id = printshop_id and p.owner_id = auth.uid())
  );

create policy "printshop_products_update_own" on public.printshop_products
  for update using (
    exists (select 1 from public.printshops p where p.id = printshop_id and p.owner_id = auth.uid())
  );

create policy "printshop_products_delete_own" on public.printshop_products
  for delete using (
    exists (select 1 from public.printshops p where p.id = printshop_id and p.owner_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- Bucket de Storage para las fotos de producto — PÚBLICO para lectura
-- (igual que avatars), escritura restringida al dueño de esa papelería.
-- Carpeta: {printshop_id}/{archivo}
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('store-products', 'store-products', true)
on conflict (id) do nothing;

drop policy if exists "store_products_insert_own" on storage.objects;
drop policy if exists "store_products_update_own" on storage.objects;
drop policy if exists "store_products_delete_own" on storage.objects;
drop policy if exists "store_products_select_all" on storage.objects;

create policy "store_products_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'store-products' and
    exists (
      select 1 from public.printshops p
      where p.id::text = (storage.foldername(name))[1] and p.owner_id = auth.uid()
    )
  );

create policy "store_products_update_own" on storage.objects
  for update
  using (
    bucket_id = 'store-products' and
    exists (
      select 1 from public.printshops p
      where p.id::text = (storage.foldername(name))[1] and p.owner_id = auth.uid()
    )
  );

create policy "store_products_delete_own" on storage.objects
  for delete
  using (
    bucket_id = 'store-products' and
    exists (
      select 1 from public.printshops p
      where p.id::text = (storage.foldername(name))[1] and p.owner_id = auth.uid()
    )
  );

create policy "store_products_select_all" on storage.objects
  for select
  using (bucket_id = 'store-products');

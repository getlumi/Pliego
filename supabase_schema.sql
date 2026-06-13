-- =============================================
-- PLIEGO · Esquema de base de datos
-- Pegar en Supabase → SQL Editor → Run
-- =============================================

-- Extensión para UUIDs
create extension if not exists "uuid-ossp";

-- =============================================
-- USUARIOS
-- =============================================
create table public.users (
  id                  uuid primary key references auth.users(id) on delete cascade,
  name                text not null,
  phone               text unique not null,
  wallet_balance      numeric(10,2) not null default 0,
  privacy_accepted_at timestamptz,
  onboarding_seen     boolean not null default false,
  created_at          timestamptz not null default now()
);

-- =============================================
-- PAPELERÍAS
-- =============================================
create table public.printshops (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  latitude      double precision not null,
  longitude     double precision not null,
  whatsapp      text,
  opens_at      time not null default '09:00',
  closes_at     time not null default '21:00',
  is_available  boolean not null default true,
  rating_avg    numeric(3,2) not null default 0,
  rating_count  integer not null default 0,
  latest_comment text,
  owner_id      uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- =============================================
-- SERVICIOS DE CADA PAPELERÍA
-- =============================================
create type service_type as enum (
  'bn_bond',
  'color_bond',
  'opalina_bn',
  'opalina_color',
  'doble_carta'
);

create table public.printshop_services (
  id              uuid primary key default uuid_generate_v4(),
  printshop_id    uuid not null references public.printshops(id) on delete cascade,
  service_type    service_type not null,
  price_per_sheet numeric(8,2) not null,
  enabled         boolean not null default true,
  unique (printshop_id, service_type)
);

-- =============================================
-- PEDIDOS
-- =============================================
create type order_status as enum (
  'nuevo',
  'en_proceso',
  'listo',
  'entregado'
);

create type color_mode as enum ('bn', 'color');
create type paper_size as enum ('carta', 'oficio', 'doble_carta');
create type orientation as enum ('vertical', 'horizontal');

create table public.orders (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references public.users(id) on delete cascade,
  printshop_id         uuid not null references public.printshops(id) on delete cascade,
  status               order_status not null default 'nuevo',
  file_url             text not null,
  file_name            text,
  file_count           integer not null default 1,
  copies               integer not null default 1,
  orientation          orientation not null default 'vertical',
  paper_size           paper_size not null default 'carta',
  color_mode           color_mode not null default 'bn',
  service_type         service_type not null default 'bn_bond',
  special_instructions text,
  service_fee          numeric(8,2) not null default 2.00,
  estimated_cost       numeric(8,2),
  rated                boolean not null default false,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null default (now() + interval '3 days')
);

-- =============================================
-- CALIFICACIONES
-- =============================================
create table public.ratings (
  id           uuid primary key default uuid_generate_v4(),
  order_id     uuid not null unique references public.orders(id) on delete cascade,
  printshop_id uuid not null references public.printshops(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  stars        integer not null check (stars between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now()
);

-- Actualizar promedio de calificación automáticamente
create or replace function update_printshop_rating()
returns trigger as $$
begin
  update public.printshops
  set
    rating_avg   = (select round(avg(stars)::numeric, 2) from public.ratings where printshop_id = NEW.printshop_id),
    rating_count = (select count(*) from public.ratings where printshop_id = NEW.printshop_id),
    latest_comment = NEW.comment
  where id = NEW.printshop_id;
  return NEW;
end;
$$ language plpgsql;

create trigger on_new_rating
  after insert or update on public.ratings
  for each row execute function update_printshop_rating();

-- =============================================
-- REPORTES
-- =============================================
create type report_reason as enum (
  'cerrada_en_horario',
  'no_imprimio',
  'cobro_diferente',
  'calidad_deficiente',
  'trato_inadecuado',
  'otro'
);

create type report_status as enum ('pendiente', 'revisado', 'resuelto');

create table public.reports (
  id           uuid primary key default uuid_generate_v4(),
  printshop_id uuid not null references public.printshops(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  order_id     uuid references public.orders(id) on delete set null,
  reason       report_reason not null,
  comment      text,
  status       report_status not null default 'pendiente',
  created_at   timestamptz not null default now()
);

-- =============================================
-- TRANSACCIONES DE WALLET
-- =============================================
create type transaction_type as enum ('recarga', 'servicio', 'reembolso');
create type payment_method as enum ('tarjeta', 'oxxo', 'sistema');

create table public.wallet_transactions (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.users(id) on delete cascade,
  type              transaction_type not null,
  amount            numeric(10,2) not null,
  payment_method    payment_method,
  payment_reference text,
  order_id          uuid references public.orders(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
alter table public.users                enable row level security;
alter table public.printshops           enable row level security;
alter table public.printshop_services   enable row level security;
alter table public.orders               enable row level security;
alter table public.ratings              enable row level security;
alter table public.reports              enable row level security;
alter table public.wallet_transactions  enable row level security;

-- USERS: solo tu propio perfil
create policy "users_select_own" on public.users for select using (auth.uid() = id);
create policy "users_insert_own" on public.users for insert with check (auth.uid() = id);
create policy "users_update_own" on public.users for update using (auth.uid() = id);

-- PRINTSHOPS: todos pueden ver, solo el dueño edita
create policy "printshops_select_all"    on public.printshops for select using (true);
create policy "printshops_insert_owner"  on public.printshops for insert with check (auth.uid() = owner_id);
create policy "printshops_update_owner"  on public.printshops for update using (auth.uid() = owner_id);

-- PRINTSHOP_SERVICES: todos ven, dueño de la papelería edita
create policy "services_select_all"   on public.printshop_services for select using (true);
create policy "services_insert_owner" on public.printshop_services for insert
  with check (auth.uid() = (select owner_id from public.printshops where id = printshop_id));
create policy "services_update_owner" on public.printshop_services for update
  using (auth.uid() = (select owner_id from public.printshops where id = printshop_id));

-- ORDERS: usuario ve los suyos, papelería ve los que le llegan
create policy "orders_select_user"      on public.orders for select using (auth.uid() = user_id);
create policy "orders_insert_user"      on public.orders for insert with check (auth.uid() = user_id);
create policy "orders_update_user"      on public.orders for update using (auth.uid() = user_id);
create policy "orders_select_printshop" on public.orders for select
  using (auth.uid() = (select owner_id from public.printshops where id = printshop_id));
create policy "orders_update_printshop" on public.orders for update
  using (auth.uid() = (select owner_id from public.printshops where id = printshop_id));

-- RATINGS: todos ven, solo el autor inserta
create policy "ratings_select_all"    on public.ratings for select using (true);
create policy "ratings_insert_own"    on public.ratings for insert with check (auth.uid() = user_id);

-- REPORTS: solo el autor ve y crea el suyo
create policy "reports_select_own"  on public.reports for select using (auth.uid() = user_id);
create policy "reports_insert_own"  on public.reports for insert with check (auth.uid() = user_id);

-- WALLET: solo el dueño
create policy "wallet_select_own" on public.wallet_transactions for select using (auth.uid() = user_id);
create policy "wallet_insert_own" on public.wallet_transactions for insert with check (auth.uid() = user_id);

-- =============================================
-- STORAGE: bucket para documentos
-- =============================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  20971520, -- 20MB máximo por archivo
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp']
);

-- Solo el dueño puede subir y ver sus archivos
create policy "documents_insert_own" on storage.objects for insert
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "documents_select_own" on storage.objects for select
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "documents_delete_own" on storage.objects for delete
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================
-- ÍNDICES para consultas frecuentes
-- =============================================
create index idx_printshops_location   on public.printshops (latitude, longitude);
create index idx_printshops_available  on public.printshops (is_available);
create index idx_orders_user           on public.orders (user_id);
create index idx_orders_printshop      on public.orders (printshop_id);
create index idx_orders_expires        on public.orders (expires_at);
create index idx_orders_status         on public.orders (status);
create index idx_ratings_printshop     on public.ratings (printshop_id);
create index idx_reports_status        on public.reports (status);
create index idx_wallet_user           on public.wallet_transactions (user_id);

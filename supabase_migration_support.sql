-- Pliego · Migración: sistema de soporte
-- Pegar en Supabase → SQL Editor → Run

create table if not exists public.support_tickets (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references public.users(id) on delete cascade,
  from_type    text not null default 'user', -- 'user' o 'printshop'
  printshop_id uuid references public.printshops(id) on delete set null,
  subject      text,
  status       text not null default 'open', -- 'open' | 'in_review' | 'resolved'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.support_messages (
  id         uuid primary key default uuid_generate_v4(),
  ticket_id  uuid not null references public.support_tickets(id) on delete cascade,
  sender     text not null, -- 'user' o 'admin'
  body       text not null,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.support_tickets  enable row level security;
alter table public.support_messages enable row level security;

-- Usuario solo ve sus propios tickets
create policy "tickets_select_own" on public.support_tickets for select
  using (auth.uid() = user_id or public.is_admin());
create policy "tickets_insert_own" on public.support_tickets for insert
  with check (auth.uid() = user_id);
create policy "tickets_update_admin" on public.support_tickets for update
  using (public.is_admin());

-- Mensajes: usuario ve los de sus tickets, admin ve todos
create policy "messages_select_own" on public.support_messages for select
  using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
    or public.is_admin()
  );
create policy "messages_insert_own" on public.support_messages for insert
  with check (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid())
    or public.is_admin()
  );

-- Realtime
alter publication supabase_realtime add table public.support_tickets;
alter publication supabase_realtime add table public.support_messages;

-- Pliego · Migración: verificación KYC de papelerías
-- Pegar en Supabase → SQL Editor → Run

-- Estado de verificación
create type if not exists verification_status as enum (
  'pending', 'approved', 'rejected'
);

alter table public.printshops
  add column if not exists verified              boolean not null default false,
  add column if not exists verification_status  text not null default 'pending',
  add column if not exists rejection_reason     text,
  add column if not exists ine_url              text,
  add column if not exists selfie_url           text,
  add column if not exists address_proof_url    text,
  add column if not exists submitted_at         timestamptz,
  add column if not exists reviewed_at          timestamptz;

-- Bucket para documentos de verificación (privado)
insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

-- Solo el owner puede subir sus documentos
create policy "verification_docs_upload" on storage.objects for insert
with check (
  bucket_id = 'verification-docs' and
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Solo el owner puede ver sus propios documentos
create policy "verification_docs_select_owner" on storage.objects for select
using (
  bucket_id = 'verification-docs' and
  auth.uid()::text = (storage.foldername(name))[1]
);

-- El service_role puede ver todos (para el admin)
create policy "verification_docs_select_admin" on storage.objects for select
using (
  bucket_id = 'verification-docs'
);

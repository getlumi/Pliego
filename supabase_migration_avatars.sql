-- =============================================
-- PLIEGO · Foto de perfil (avatar)
-- Pegar en Supabase → SQL Editor → Run
-- =============================================

-- 1) Columna para la URL pública del avatar
alter table public.users
  add column if not exists avatar_url text;

-- 2) Bucket de Storage para avatares — PÚBLICO (a diferencia de
-- 'documents', las fotos de perfil sí deben poder mostrarse sin firma).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 3) Políticas: cada quien sube/actualiza/borra SOLO su propio avatar
-- (carpeta nombrada con su propio user_id), pero cualquiera puede VER
-- cualquier avatar (son públicos por diseño, como en cualquier app).
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;
drop policy if exists "avatars_select_all" on storage.objects;

create policy "avatars_insert_own" on storage.objects
  for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatars_update_own" on storage.objects
  for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatars_delete_own" on storage.objects
  for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatars_select_all" on storage.objects
  for select
  using (bucket_id = 'avatars');

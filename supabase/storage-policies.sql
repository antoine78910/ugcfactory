-- Storage RLS: chaque user n’accède qu’à son dossier (user_id = premier segment du path).
-- À exécuter dans Supabase SQL Editor après avoir créé le bucket « ugc-uploads ».
-- Si le bucket est public, ces policies s’appliquent quand on utilise la clé anon (ex. signed URLs).
-- L’upload via l’API utilise la service_role (bypass RLS) et enregistre sous user_id/filename.

-- Lecture : uniquement son dossier
drop policy if exists "ugc_uploads_select_own" on storage.objects;
create policy "ugc_uploads_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'ugc-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Insert : uniquement dans son dossier (pour usage direct client si besoin)
drop policy if exists "ugc_uploads_insert_own" on storage.objects;
create policy "ugc_uploads_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'ugc-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Update / Delete : uniquement son dossier
drop policy if exists "ugc_uploads_update_own" on storage.objects;
create policy "ugc_uploads_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'ugc-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "ugc_uploads_delete_own" on storage.objects;
create policy "ugc_uploads_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'ugc-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

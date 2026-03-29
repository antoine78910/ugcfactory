-- Bucket for archived studio outputs (images/videos from KIE / PiAPI).
-- Prevents reliance on short-lived provider CDNs (e.g. theapi.app ephemeral URLs).
--
-- 1) Supabase Dashboard → Storage → New bucket
--    Name: studio-media
--    Public bucket: ON (so getPublicUrl works for playback in app + admin)
--
-- 2) Run the policies below in SQL Editor (optional if you only use service_role uploads).

-- Authenticated users can read any object in studio-media (public bucket already allows anon read when "public").
-- Tighten later with path rules if you switch to private bucket + signed URLs.

drop policy if exists "studio_media_select_authenticated" on storage.objects;
create policy "studio_media_select_authenticated"
on storage.objects for select
to authenticated
using (bucket_id = 'studio-media');

drop policy if exists "studio_media_select_anon" on storage.objects;
create policy "studio_media_select_anon"
on storage.objects for select
to anon
using (bucket_id = 'studio-media');

-- Service role bypasses RLS; no insert policy needed for server uploads.

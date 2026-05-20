alter table public.careers_applications
  add column if not exists youtube_url text,
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text,
  add column if not exists creative_first_create text,
  add column if not exists creative_inspiration text;

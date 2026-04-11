-- Optional display hint for studio history (matches chosen image/video aspect in the UI).
-- Run in Supabase SQL Editor after deploying app code that sends aspect_ratio on insert.

alter table public.studio_generations
  add column if not exists aspect_ratio text;

comment on column public.studio_generations.aspect_ratio is
  'User-selected aspect label (e.g. 9:16, 16:9, 3:4, auto) for history card framing; not used by providers.';

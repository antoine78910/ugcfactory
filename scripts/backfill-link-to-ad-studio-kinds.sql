-- Run once in Supabase SQL editor (or psql) to fix rows created before dedicated L2A kinds.
-- Labels match LinkToAdUniverse registration (e.g. "Link to Ad · Angle 1", "Link to Ad · Nano 1/3").

UPDATE studio_generations
SET kind = 'link_to_ad_image'
WHERE kind = 'studio_image'
  AND label ILIKE 'Link to Ad%';

UPDATE studio_generations
SET kind = 'link_to_ad_video'
WHERE kind = 'studio_video'
  AND label ILIKE 'Link to Ad%';

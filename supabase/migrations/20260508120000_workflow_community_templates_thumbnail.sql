-- Add optional thumbnail_url column to workflow community templates.
-- Stores an HTTPS preview image URL extracted from the workflow before
-- ephemeral fields are sanitised on publish, so the template card in the
-- listing can show a meaningful preview even though outputPreviewUrl is
-- stripped from the project JSON.
alter table public.workflow_community_templates
  add column if not exists thumbnail_url text;

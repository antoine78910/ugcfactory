/**
 * `studio_generations.kind` values used by API + UI.
 * Link to Ad image jobs use their own kind so they do not appear in the Studio → Image tab history.
 */

/** Nano / Seedream / etc. from the Image studio tab */
export const STUDIO_GENERATION_KIND_STUDIO_IMAGE = "studio_image" as const;

/** Packshots / angles registered from Link to Ad — shown only in Projects studio library, not in Create → Image */
export const STUDIO_GENERATION_KIND_LINK_TO_AD_IMAGE = "link_to_ad_image" as const;

/** Kinds returned by GET `/api/studio/generations?all=1` (Projects library + background poll). */
export const STUDIO_LIBRARY_KINDS = [
  "avatar",
  STUDIO_GENERATION_KIND_STUDIO_IMAGE,
  STUDIO_GENERATION_KIND_LINK_TO_AD_IMAGE,
  "studio_video",
  "studio_upscale",
  "motion_control",
  "studio_watermark",
] as const;

/** Kinds shown in Create → Image history (excludes Link to Ad). */
export const STUDIO_IMAGE_TAB_KINDS = [STUDIO_GENERATION_KIND_STUDIO_IMAGE, "studio_upscale"] as const;

export type StudioLibraryKind = (typeof STUDIO_LIBRARY_KINDS)[number];

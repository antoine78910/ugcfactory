/**
 * `studio_generations.kind` values used by API + UI.
 * Link to Ad image jobs use their own kind so they do not appear in the Studio → Image tab history.
 */

/** Nano / Seedream / etc. from the Image studio tab */
export const STUDIO_GENERATION_KIND_STUDIO_IMAGE = "studio_image" as const;

/** Packshots / angles registered from Link to Ad — shown only in Projects studio library, not in Create → Image */
export const STUDIO_GENERATION_KIND_LINK_TO_AD_IMAGE = "link_to_ad_image" as const;

/** Link to Ad final videos (PiAPI/Kling) — Projects library only, not Create → Video */
export const STUDIO_GENERATION_KIND_LINK_TO_AD_VIDEO = "link_to_ad_video" as const;

/** Max rows returned per list/poll (per kind filter). Keeps older Studio items visible alongside Link to Ad. */
export const STUDIO_GENERATIONS_LIST_LIMIT = 250;

/** Kinds returned by GET `/api/studio/generations?all=1` (Projects library + background poll). */
export const STUDIO_LIBRARY_KINDS = [
  "avatar",
  STUDIO_GENERATION_KIND_STUDIO_IMAGE,
  STUDIO_GENERATION_KIND_LINK_TO_AD_IMAGE,
  "studio_video",
  STUDIO_GENERATION_KIND_LINK_TO_AD_VIDEO,
  "studio_upscale",
  "motion_control",
  "studio_watermark",
] as const;

/** Kinds shown in Create → Image history (excludes Link to Ad). */
export const STUDIO_IMAGE_TAB_KINDS = [STUDIO_GENERATION_KIND_STUDIO_IMAGE, "studio_upscale"] as const;

/** Kinds shown in Create → Video history (excludes Link to Ad). */
export const STUDIO_VIDEO_TAB_KINDS = ["studio_video", "studio_watermark"] as const;

export type StudioLibraryKind = (typeof STUDIO_LIBRARY_KINDS)[number];

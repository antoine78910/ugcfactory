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
/** Translate tab final videos (WaveSpeed) — kept separate from Motion Control history. */
export const STUDIO_GENERATION_KIND_STUDIO_TRANSLATE_VIDEO = "studio_translate_video" as const;

/** Voice change outputs (ElevenLabs) — separate from Translate history. */
export const STUDIO_GENERATION_KIND_VOICE_CHANGE = "studio_voice_change" as const;

/**
 * Max rows for Create tab list queries (`kind=avatar`, `studio_image,studio_upscale`, video kinds, etc.).
 * Single global ORDER+LIMIT was too small for heavy users.
 */
export const STUDIO_GENERATIONS_LIST_LIMIT = 2000;

/**
 * When listing `all=1` (Projects library), fetch this many rows **per kind**, then merge by date.
 * Avoids one hot kind (e.g. Link to Ad) crowding out avatars / studio images in a single LIMIT.
 */
export const STUDIO_GENERATIONS_ALL_PER_KIND_LIMIT = 500;

/** Cap after merging per-kind results for `all=1`. */
export const STUDIO_GENERATIONS_ALL_MERGED_MAX = 3000;

/** Kinds returned by GET `/api/studio/generations?all=1` (Projects library + background poll). */
export const STUDIO_LIBRARY_KINDS = [
  "avatar",
  STUDIO_GENERATION_KIND_STUDIO_IMAGE,
  STUDIO_GENERATION_KIND_LINK_TO_AD_IMAGE,
  "studio_video",
  STUDIO_GENERATION_KIND_LINK_TO_AD_VIDEO,
  "studio_audio",
  "studio_upscale",
  "motion_control",
  STUDIO_GENERATION_KIND_STUDIO_TRANSLATE_VIDEO,
  STUDIO_GENERATION_KIND_VOICE_CHANGE,
  "studio_watermark",
] as const;

/** Kinds shown in Create → Image history (excludes Link to Ad and Upscale). */
export const STUDIO_IMAGE_TAB_KINDS = [STUDIO_GENERATION_KIND_STUDIO_IMAGE] as const;

/** Kinds shown in Create → Video history (excludes Link to Ad). */
export const STUDIO_VIDEO_TAB_KINDS = ["studio_video", "studio_watermark"] as const;

export type StudioLibraryKind = (typeof STUDIO_LIBRARY_KINDS)[number];

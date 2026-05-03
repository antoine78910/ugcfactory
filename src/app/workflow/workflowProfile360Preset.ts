/**
 * Workflow “360° profile” image preset — same brief and API defaults as Studio → Avatar → 360° profile.
 * User prompt on the node is hidden; generation uses this fixed instruction only.
 */
export const WORKFLOW_AVATAR_360_PROFILE_PROMPT =
  "A professional character reference sheet of the exact same character from the reference image, plain white background. his name tag 'D. kieft' is clearly visible. Two rows: top row contains four equally sized close-up head shots side by side - front facing, left profile, right profile, and back of head. Bottom row contains three equally sized full body shots side by side - full body front, full body three-quarter side profile, and full body back. Replicate every detail exactly across all panels: facial structure, skin tone, natural blemishes, pore texture, hair color, hair texture and styling, eye color with realistic iris detail, natural moisture and catchlights. Exact same outfit and costume consistent across every single view. Soft neutral studio lighting, flat and even across all panels, no shadows, no color cast, no background elements. Every panel perfectly consistent in character, scale, and lighting. Shot on Hasselblad X2D 100C, photorealistic, ultra sharp micro detail, RAW photograph quality, character design sheet, turnaround sheet, model sheet, orthographic reference.";

/** @deprecated Use `WORKFLOW_AVATAR_360_PROFILE_PROMPT` (same string). */
export const PROFILE_360_IMAGE_PROMPT = WORKFLOW_AVATAR_360_PROFILE_PROMPT;

/** Matches Studio Avatar 360° profile `/api/studio/generations/start` payload. */
export const WORKFLOW_AVATAR_360_PROFILE_ASPECT = "16:9";

export const WORKFLOW_AVATAR_360_PROFILE_DEFAULT_MODEL = "gpt_image_2";

/** Studio Avatar 360° profile model picker (NanoBanana Pro vs GPT Image 2). */
export const WORKFLOW_AVATAR_360_PROFILE_ALLOWED_MODELS = ["gpt_image_2", "pro"] as const;

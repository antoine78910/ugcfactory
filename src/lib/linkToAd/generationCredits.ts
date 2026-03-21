/**
 * Display-only credit estimates for Link to Ad (billing not wired end-to-end).
 * Keep in sync with product pricing / {@link CREDITS_BY_MODEL} in StudioImagePanel.
 */

/** NanoBanana **Pro** per image (same as Studio image panel). */
export const CREDITS_NANO_PRO_PER_IMAGE = 2;

/** Regenerate all 3 reference frames (3 × Pro). */
export const CREDITS_LINK_TO_AD_THREE_REF_IMAGES = CREDITS_NANO_PRO_PER_IMAGE * 3;

/**
 * One Kling 3.0 image-to-video run as used in Link to Ad (~12s, std).
 * Adjust when your plan matches provider invoices.
 */
export const CREDITS_KLING_LINK_TO_AD_VIDEO = 10;

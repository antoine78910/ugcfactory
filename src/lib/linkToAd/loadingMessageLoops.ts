/**
 * Single minimal status line per Link to Ad loading phase (no rotating copy).
 */
export const LINK_TO_AD_LOADING_MESSAGES = {
  nano_three: "Generating your 3 reference images…",
  nano_prompts: "Writing image prompts…",
  nano_single_image: "Generating your image…",
  video_prompt: "Writing your video prompt…",
  kling_starting: "Starting video render…",
  kling_rendering: "Rendering your video…",
  server_pipeline: "Scanning your store and building your project…",
  scanning: "Scanning the store page…",
  finding_image: "Finding the best product images…",
  summarizing: "Writing your brand brief…",
  writing_scripts: "Writing your script angles…",
  working: "Working…",
} as const;

export type LinkToAdLoadingMessageKey = keyof typeof LINK_TO_AD_LOADING_MESSAGES;

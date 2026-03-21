/**
 * Rotating status lines for Link to Ad loading states (used with TextLoop).
 */
export const LINK_TO_AD_LOADING_LOOPS = {
  nano_three: [
    "Generating 3 images of your persona with your product…",
    "Compositing your product into each scene…",
    "Tuning lighting and brand-consistent details…",
  ],
  nano_prompts: [
    "Preparing image prompts…",
    "Drafting three on-brand scene directions…",
    "Aligning prompts with your script angle…",
  ],
  nano_single_image: [
    "Generating your image…",
    "Rendering from your prompt and product photo…",
    "Applying final touches…",
  ],
  video_prompt: [
    "Generating video prompt…",
    "Structuring motion, pacing, and beats…",
    "Locking shot flow and narration cues…",
  ],
  kling_starting: [
    "Starting video render…",
    "Queueing your clip on the renderer…",
    "Handing off your motion prompt…",
  ],
  kling_rendering: [
    "Generating your video…",
    "Rendering motion and frames…",
    "Encoding your final clip…",
  ],
  server_pipeline: [
    "Scanning the store — page, images, brand brief, and scripts.",
    "Pulling product details and visuals from the page…",
    "Building your brand brief and UGC angles…",
    "Saving as you go — safe to switch pages.",
  ],
  scanning: [
    "Checking for a saved project for this URL…",
    "Loading the store page and structure…",
    "Preparing the next extraction steps…",
  ],
  finding_image: [
    "Scanning images — collecting product photos…",
    "Picking the clearest product preview…",
    "Scoring shots for UGC quality…",
  ],
  summarizing: [
    "Reading the brand from what we found…",
    "Turning site copy into a concise brief…",
    "Sharpening benefits and positioning for ads…",
  ],
  writing_scripts: [
    "Writing 3 UGC script angles from the brief…",
    "Crafting hooks and angles you can test…",
    "Almost done — we'll save when scripts are ready.",
  ],
  working: ["Working…", "Still on it…", "Hang tight…"],
} as const;

export type LinkToAdLoadingLoopKey = keyof typeof LINK_TO_AD_LOADING_LOOPS;

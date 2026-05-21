/** Job slug for the smart short-form (TikTok / Reels) video editor role. */
export const SMART_SHORT_FORM_VIDEO_EDITOR_JOB_SLUG = "smart-video-editor";

/** @deprecated Alias */
export const SMART_VIDEO_EDITOR_JOB_SLUG = SMART_SHORT_FORM_VIDEO_EDITOR_JOB_SLUG;

/** Legacy slug from a brief rename — still accepted in API/admin. */
export const LONG_FORM_VIDEO_EDITOR_JOB_SLUG = "long-form-video-editor";

export const EXAMPLE_TIKTOK_ACCOUNTS = [
  {
    handle: "@pinecode.ai",
    url: "https://www.tiktok.com/@pinecode.ai",
  },
  {
    handle: "@buildyourstoreai",
    url: "https://www.tiktok.com/@buildyourstoreai",
  },
] as const;

export type SmartShortFormVideoEditorApplicationData = {
  full_name: string;
  phone_number: string;
  location: string;
  application_source: string;
  discord_username: string;
  english_fluency: number;
  editing_software: string;
  short_form_workflow: string;
  short_form_hook_priority: string;
  portfolio_social_url: string;
  daily_output_capacity: string;
  tiktok_trends_approach: string;
  loom_fit_video_url: string | null;
  application_date: string | null;
};

/** @deprecated */
export type LongFormVideoEditorApplicationData = SmartShortFormVideoEditorApplicationData;

export const APPLICATION_SOURCE_OPTIONS = [
  "TikTok",
  "Instagram",
  "YouTube",
  "Discord",
  "LinkedIn",
  "Referral / friend",
  "Youry website",
  "Other",
] as const;

export const EDITING_SOFTWARE_OPTIONS = [
  "Adobe Premiere Pro + After Effects",
  "Adobe Premiere Pro",
  "Adobe After Effects",
  "Final Cut Pro",
  "DaVinci Resolve",
  "CapCut",
  "Other",
] as const;

export const DAILY_OUTPUT_OPTIONS = [
  "Yes, 3+ TikTok/Reels ready edits per day",
  "Yes, around 2 per day consistently",
  "Not yet, but I can ramp up quickly",
] as const;

export const ENGLISH_FLUENCY_LABELS: Record<number, string> = {
  1: "1, Limited",
  2: "2, Fair",
  3: "3, Good",
  4: "4, Very good",
  5: "5, Native / fluent",
};

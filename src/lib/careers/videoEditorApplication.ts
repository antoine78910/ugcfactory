/** Job slug for the TikTok / trends mass-production video editor role. */
export const SMART_VIDEO_EDITOR_JOB_SLUG = "smart-video-editor";

export type SmartVideoEditorApplicationData = {
  age: number;
  country_timezone: string;
  discord_telegram: string;
  portfolio_link: string;
  editing_experience: string;
  editing_software: string[];
  worked_for_creators: string;
  best_edits_links: string;
  content_types: string[];
  videos_per_day: number;
  hours_per_day: number;
  fast_deadlines: string;
  viral_opinion: string;
  hook_first_3_seconds: string;
  why_join_youry: string;
  why_choose_you: string;
  available_immediately: string;
  editing_test: string;
  performance_payment_ok: string;
  long_term_collaboration: string;
  tiktok_trends_comfort: string;
  mass_production_3_per_day: string;
  saas_dropship_style_experience: string;
};

export const EDITING_EXPERIENCE_OPTIONS = [
  "Less than 6 months",
  "6-12 months",
  "1-2 years",
  "2-4 years",
  "More than 4 years",
] as const;

export const EDITING_SOFTWARE_OPTIONS = [
  "Adobe Premiere Pro",
  "Final Cut Pro",
  "DaVinci Resolve",
  "CapCut",
  "After Effects",
] as const;

export const CONTENT_TYPE_OPTIONS = [
  "UGC (User Generated Content)",
  "Shorts / Reels / TikTok",
  "Ads",
  "Storytelling",
  "Motion Design",
  "SaaS / ecommerce TikTok (dropship.io, pinecode style)",
] as const;

export const FAST_DEADLINE_OPTIONS = [
  "Yes, absolutely",
  "It depends on the project",
  "No, I prefer to take my time",
] as const;

export const PERFORMANCE_PAYMENT_OPTIONS = [
  "Yes, that's okay",
  "No, I'd prefer another system",
] as const;

export const LONG_TERM_OPTIONS = ["Yes", "No", "Depends on the growth"] as const;

export const TIKTOK_TRENDS_OPTIONS = [
  "Yes, I track trends daily",
  "Sometimes, when a brief asks for it",
  "No, I focus on evergreen edits",
] as const;

export const MASS_PRODUCTION_OPTIONS = [
  "Yes, 3+ TikTok-ready edits per day",
  "Yes, but closer to 2 per day",
  "Not yet, but I can ramp up",
] as const;

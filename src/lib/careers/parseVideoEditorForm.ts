import type { SmartShortFormVideoEditorApplicationData } from "./videoEditorApplication";
import {
  APPLICATION_SOURCE_OPTIONS,
  DAILY_OUTPUT_OPTIONS,
  EDITING_SOFTWARE_OPTIONS,
} from "./videoEditorApplication";

function str(form: FormData, key: string, max = 8000): string {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

function pickOne<T extends readonly string[]>(value: string, allowed: T): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

export type ParseSmartShortFormVideoEditorResult =
  | {
      ok: true;
      data: SmartShortFormVideoEditorApplicationData;
      firstName: string;
      lastName: string;
    }
  | { ok: false; error: string };

export function parseSmartShortFormVideoEditorApplicationForm(
  form: FormData,
): ParseSmartShortFormVideoEditorResult {
  const fullName = str(form, "full_name", 400);
  if (!fullName) return { ok: false, error: "Full name required" };

  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? fullName;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "—";

  const phone_number = str(form, "phone_number", 80);
  if (!phone_number) return { ok: false, error: "Phone number required" };

  const location = str(form, "location", 300);
  if (!location) return { ok: false, error: "Location required" };

  const application_source = str(form, "application_source", 120);
  if (!pickOne(application_source, APPLICATION_SOURCE_OPTIONS)) {
    return { ok: false, error: "Please select where you found this application" };
  }

  const discord_username = str(form, "discord_username", 200);
  if (!discord_username) return { ok: false, error: "Discord username required" };

  const englishRaw = str(form, "english_fluency", 4);
  const english_fluency = Number(englishRaw);
  if (!Number.isInteger(english_fluency) || english_fluency < 1 || english_fluency > 5) {
    return { ok: false, error: "Rate your English fluency (1–5)" };
  }

  const editing_software = str(form, "editing_software", 120);
  if (!pickOne(editing_software, EDITING_SOFTWARE_OPTIONS)) {
    return { ok: false, error: "Please select your editing software" };
  }

  const short_form_workflow = str(form, "short_form_workflow", 12000);
  if (!short_form_workflow) {
    return {
      ok: false,
      error: "Describe your short-form workflow (9:16, speed, captions, export)",
    };
  }

  const avg_monthly_income_usd = str(form, "avg_monthly_income_usd", 200);
  if (!avg_monthly_income_usd) {
    return { ok: false, error: "Average monthly income (last 3 months) required" };
  }

  const short_form_hook_priority = str(form, "short_form_hook_priority", 12000);
  if (!short_form_hook_priority) {
    return {
      ok: false,
      error: "Tell us what matters most when editing short-form / TikTok videos",
    };
  }

  const portfolio_social_url = str(form, "portfolio_social_url", 2000);
  if (!portfolio_social_url) {
    return { ok: false, error: "Portfolio or TikTok / Reels link required" };
  }

  const daily_output_capacity = str(form, "daily_output_capacity", 120);
  if (!pickOne(daily_output_capacity, DAILY_OUTPUT_OPTIONS)) {
    return { ok: false, error: "Please answer about daily short-form output" };
  }

  const tiktok_trends_approach = str(form, "tiktok_trends_approach", 12000);
  if (!tiktok_trends_approach) {
    return { ok: false, error: "Explain how you use TikTok trends for SaaS / ecommerce shorts" };
  }

  const loomRaw = str(form, "loom_fit_video_url", 2000);
  const loom_fit_video_url = loomRaw || null;
  const application_date = str(form, "application_date", 40) || null;

  return {
    ok: true,
    firstName,
    lastName,
    data: {
      full_name: fullName,
      phone_number,
      location,
      application_source,
      discord_username,
      english_fluency,
      editing_software,
      short_form_workflow,
      avg_monthly_income_usd,
      short_form_hook_priority,
      portfolio_social_url,
      daily_output_capacity,
      tiktok_trends_approach,
      loom_fit_video_url,
      application_date,
    },
  };
}

/** @deprecated */
export const parseLongFormVideoEditorApplicationForm =
  parseSmartShortFormVideoEditorApplicationForm;
export const parseVideoEditorApplicationForm = parseSmartShortFormVideoEditorApplicationForm;

import type { SmartVideoEditorApplicationData } from "./videoEditorApplication";
import {
  CONTENT_TYPE_OPTIONS,
  EDITING_EXPERIENCE_OPTIONS,
  EDITING_SOFTWARE_OPTIONS,
  FAST_DEADLINE_OPTIONS,
  LONG_TERM_OPTIONS,
  MASS_PRODUCTION_OPTIONS,
  PERFORMANCE_PAYMENT_OPTIONS,
  TIKTOK_TRENDS_OPTIONS,
} from "./videoEditorApplication";

function str(form: FormData, key: string, max = 8000): string {
  return String(form.get(key) ?? "").trim().slice(0, max);
}

function num(form: FormData, key: string, min: number, max: number): number | null {
  const raw = String(form.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function pickOne<T extends readonly string[]>(
  value: string,
  allowed: T,
): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

function pickMany(form: FormData, key: string, allowed: readonly string[]): string[] {
  const values = form.getAll(key).map((v) => String(v).trim());
  const other = str(form, `${key}_other`, 200);
  const picked = values.filter((v) => allowed.includes(v));
  if (values.includes("other") && other) picked.push(`Other: ${other}`);
  return picked;
}

export type ParseVideoEditorResult =
  | { ok: true; data: SmartVideoEditorApplicationData }
  | { ok: false; error: string };

export function parseVideoEditorApplicationForm(form: FormData): ParseVideoEditorResult {
  const age = num(form, "age", 16, 80);
  if (age === null) return { ok: false, error: "Valid age required (16–80)" };

  const country_timezone = str(form, "country_timezone", 300);
  if (!country_timezone) return { ok: false, error: "Country / time zone required" };

  const discord_telegram = str(form, "discord_telegram", 200);
  if (!discord_telegram) return { ok: false, error: "Discord or Telegram username required" };

  const portfolio_link = str(form, "portfolio_link", 2000);
  if (!portfolio_link) return { ok: false, error: "Portfolio or social link required" };

  const editing_experience = str(form, "editing_experience", 80);
  if (!pickOne(editing_experience, EDITING_EXPERIENCE_OPTIONS)) {
    return { ok: false, error: "Please select editing experience" };
  }

  const editing_software = pickMany(form, "editing_software", EDITING_SOFTWARE_OPTIONS);
  if (editing_software.length === 0) {
    return { ok: false, error: "Select at least one editing software" };
  }

  const worked_for_creators = str(form, "worked_for_creators", 10);
  if (!["Yes", "No"].includes(worked_for_creators)) {
    return { ok: false, error: "Please answer if you worked for creators or brands" };
  }

  const best_edits_links = str(form, "best_edits_links", 12000);
  if (!best_edits_links) return { ok: false, error: "Share links to your 3 best edits" };

  const content_types = pickMany(form, "content_types", CONTENT_TYPE_OPTIONS);
  if (content_types.length === 0) {
    return { ok: false, error: "Select at least one content type" };
  }

  const videos_per_day = num(form, "videos_per_day", 1, 30);
  if (videos_per_day === null) return { ok: false, error: "Videos per day required (1–30)" };

  const hours_per_day = num(form, "hours_per_day", 1, 16);
  if (hours_per_day === null) return { ok: false, error: "Hours per day required (1–16)" };

  const fast_deadlines = str(form, "fast_deadlines", 80);
  if (!pickOne(fast_deadlines, FAST_DEADLINE_OPTIONS)) {
    return { ok: false, error: "Please answer about fast deadlines" };
  }

  const viral_opinion = str(form, "viral_opinion", 12000);
  if (!viral_opinion) return { ok: false, error: "Tell us what makes a video go viral" };

  const hook_first_3_seconds = str(form, "hook_first_3_seconds", 12000);
  if (!hook_first_3_seconds) return { ok: false, error: "Tell us how you hook viewers in 3 seconds" };

  const why_join_youry = str(form, "why_join_youry", 12000);
  if (!why_join_youry) return { ok: false, error: "Tell us why you want to join Youry" };

  const why_choose_you = str(form, "why_choose_you", 12000);
  if (!why_choose_you) return { ok: false, error: "Tell us why we should choose you" };

  const available_immediately = str(form, "available_immediately", 10);
  if (!["Yes", "No"].includes(available_immediately)) {
    return { ok: false, error: "Please answer availability" };
  }

  const editing_test = str(form, "editing_test", 10);
  if (!["Yes", "No"].includes(editing_test)) {
    return { ok: false, error: "Please answer about the editing test" };
  }

  const performance_payment_ok = str(form, "performance_payment_ok", 80);
  if (!pickOne(performance_payment_ok, PERFORMANCE_PAYMENT_OPTIONS)) {
    return { ok: false, error: "Please answer about performance-based payment" };
  }

  const long_term_collaboration = str(form, "long_term_collaboration", 40);
  if (!pickOne(long_term_collaboration, LONG_TERM_OPTIONS)) {
    return { ok: false, error: "Please answer about long-term collaboration" };
  }

  const tiktok_trends_comfort = str(form, "tiktok_trends_comfort", 120);
  if (!pickOne(tiktok_trends_comfort, TIKTOK_TRENDS_OPTIONS)) {
    return { ok: false, error: "Please answer about TikTok trends" };
  }

  const mass_production_3_per_day = str(form, "mass_production_3_per_day", 120);
  if (!pickOne(mass_production_3_per_day, MASS_PRODUCTION_OPTIONS)) {
    return { ok: false, error: "Please answer about daily output (3+ videos)" };
  }

  const saas_dropship_style_experience = str(form, "saas_dropship_style_experience", 12000);
  if (!saas_dropship_style_experience) {
    return {
      ok: false,
      error: "Describe your experience with SaaS / ecommerce TikTok edits (dropship.io, pinecode style)",
    };
  }

  return {
    ok: true,
    data: {
      age,
      country_timezone,
      discord_telegram,
      portfolio_link,
      editing_experience,
      editing_software,
      worked_for_creators,
      best_edits_links,
      content_types,
      videos_per_day,
      hours_per_day,
      fast_deadlines,
      viral_opinion,
      hook_first_3_seconds,
      why_join_youry,
      why_choose_you,
      available_immediately,
      editing_test,
      performance_payment_ok,
      long_term_collaboration,
      tiktok_trends_comfort,
      mass_production_3_per_day,
      saas_dropship_style_experience,
    },
  };
}

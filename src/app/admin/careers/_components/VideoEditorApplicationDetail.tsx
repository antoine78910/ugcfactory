import type { SmartShortFormVideoEditorApplicationData } from "@/lib/careers/videoEditorApplication";
import {
  ENGLISH_FLUENCY_LABELS,
  SMART_SHORT_FORM_VIDEO_EDITOR_JOB_SLUG,
} from "@/lib/careers/videoEditorApplication";

function Field({
  label,
  value,
  pre,
}: {
  label: string;
  value: string | number | null | undefined;
  pre?: boolean;
}) {
  const display =
    value === null || value === undefined || value === ""
      ? "—"
      : String(value);
  return (
    <div className={pre ? "sm:col-span-2" : undefined}>
      <dt className="text-[10px] uppercase tracking-wide text-white/40">{label}</dt>
      <dd
        className={
          pre
            ? "mt-1 whitespace-pre-wrap text-white/75"
            : "mt-1 text-white/75"
        }
      >
        {display}
      </dd>
    </div>
  );
}

const VIDEO_EDITOR_SLUGS = new Set([
  SMART_SHORT_FORM_VIDEO_EDITOR_JOB_SLUG,
  "long-form-video-editor",
]);

type LegacyApplicationData = SmartShortFormVideoEditorApplicationData &
  Record<string, unknown>;

export function isVideoEditorApplication(
  jobSlug: string,
  data: unknown,
): data is LegacyApplicationData {
  return VIDEO_EDITOR_SLUGS.has(jobSlug) && data !== null && typeof data === "object";
}

export function VideoEditorApplicationDetail({ data }: { data: LegacyApplicationData }) {
  const fluency =
    data.english_fluency != null
      ? (ENGLISH_FLUENCY_LABELS[data.english_fluency] ?? String(data.english_fluency))
      : "—";

  return (
    <>
      <Field label="Full name" value={data.full_name} />
      <Field label="Phone" value={data.phone_number} />
      <Field label="Location" value={data.location} />
      <Field label="Found via" value={data.application_source} />
      <Field
        label="Discord"
        value={data.discord_username ?? (data.discord_telegram as string | undefined)}
      />
      <Field label="English fluency" value={fluency} />
      <Field label="Editing software" value={data.editing_software} />
      <Field
        label="Short-form workflow"
        value={
          data.short_form_workflow ?? (data.edit_4k_capability as string | undefined)
        }
        pre
      />
      <Field
        label="Short-form / hook priority"
        value={
          data.short_form_hook_priority ??
          (data.educational_video_editing_priority as string | undefined)
        }
        pre
      />
      <Field
        label="Daily output"
        value={
          data.daily_output_capacity ?? (data.mass_production_3_per_day as string | undefined)
        }
      />
      <Field
        label="TikTok trends approach"
        value={
          data.tiktok_trends_approach ?? (data.saas_dropship_style_experience as string | undefined)
        }
        pre
      />
      <Field
        label="Portfolio / social"
        value={
          data.portfolio_social_url ?? (data.portfolio_youtube_url as string | undefined)
        }
      />
      <Field label="Loom (optional)" value={data.loom_fit_video_url} />
      <Field label="Application date" value={data.application_date} />
    </>
  );
}

export function videoEditorSummary(data: LegacyApplicationData | null): string {
  if (!data) return "—";
  const discord =
    data.discord_username ?? (data.discord_telegram as string | undefined) ?? "—";
  const output =
    data.daily_output_capacity ??
    (data.videos_per_day != null ? `${data.videos_per_day}/day` : null) ??
    "—";
  return `${discord} · ${output}`;
}

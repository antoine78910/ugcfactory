import type { SmartVideoEditorApplicationData } from "@/lib/careers/videoEditorApplication";
import { SMART_VIDEO_EDITOR_JOB_SLUG } from "@/lib/careers/videoEditorApplication";

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

function ListField({ label, items }: { label: string; items: string[] | undefined }) {
  return (
    <div className="sm:col-span-2">
      <dt className="text-[10px] uppercase tracking-wide text-white/40">{label}</dt>
      <dd className="mt-1 text-white/75">
        {items && items.length > 0 ? (
          <ul className="list-inside list-disc space-y-0.5">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          "—"
        )}
      </dd>
    </div>
  );
}

export function isVideoEditorApplication(
  jobSlug: string,
  data: unknown,
): data is SmartVideoEditorApplicationData {
  return jobSlug === SMART_VIDEO_EDITOR_JOB_SLUG && data !== null && typeof data === "object";
}

export function VideoEditorApplicationDetail({ data }: { data: SmartVideoEditorApplicationData }) {
  return (
    <>
      <Field label="Age" value={data.age} />
      <Field label="Country / time zone" value={data.country_timezone} />
      <Field label="Discord / Telegram" value={data.discord_telegram} />
      <Field label="Portfolio link" value={data.portfolio_link} />
      <Field label="Editing experience" value={data.editing_experience} />
      <ListField label="Editing software" items={data.editing_software} />
      <Field label="Worked for creators/brands" value={data.worked_for_creators} />
      <Field label="Best edits (links)" value={data.best_edits_links} pre />
      <ListField label="Content types" items={data.content_types} />
      <Field
        label="SaaS / ecommerce TikTok experience"
        value={data.saas_dropship_style_experience}
        pre
      />
      <Field label="Videos per day" value={data.videos_per_day} />
      <Field label="Hours per day" value={data.hours_per_day} />
      <Field label="Mass production (3+/day)" value={data.mass_production_3_per_day} />
      <Field label="TikTok trends" value={data.tiktok_trends_comfort} />
      <Field label="Fast deadlines" value={data.fast_deadlines} />
      <Field label="What makes a video viral" value={data.viral_opinion} pre />
      <Field label="First 3 seconds hook" value={data.hook_first_3_seconds} pre />
      <Field label="Why join Youry" value={data.why_join_youry} pre />
      <Field label="Why choose you" value={data.why_choose_you} pre />
      <Field label="Available immediately" value={data.available_immediately} />
      <Field label="Editing test" value={data.editing_test} />
      <Field label="Performance pay ($1 / 1k views)" value={data.performance_payment_ok} />
      <Field label="Long-term collaboration" value={data.long_term_collaboration} />
    </>
  );
}

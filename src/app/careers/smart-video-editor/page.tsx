import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CareersJobMetaCard, CareersJobShell } from "../_components/CareersJobShell";
import { careersTheme } from "../_components/careersTheme";
import { JobPostingTabs } from "../_components/JobPostingTabs";
import { JobPostingViewTracker } from "../_components/JobPostingViewTracker";
import { SmartShortFormVideoEditorApplicationForm } from "../_components/SmartShortFormVideoEditorApplicationForm";
import {
  EXAMPLE_TIKTOK_ACCOUNTS,
  REFERENCE_EDIT_QUALITY_DRIVE_URL,
  SMART_SHORT_FORM_VIDEO_EDITOR_JOB_SLUG,
} from "@/lib/careers/videoEditorApplication";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Smart Short-Form Video Editor (TikTok & trends), Youry",
  description:
    "Edit high-volume TikTok / Reels for youry.io — SaaS & ecommerce short-form, $500 per 500k views, unlimited posts, 3+ edits/day.",
  openGraph: {
    title: "Smart Short-Form Video Editor, Youry",
    description:
      "Trend-native short-form editor on youry.io — performance pay with no volume cap.",
  },
};

export default async function SmartVideoEditorPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const initialTab = sp.tab === "application" ? "application" : "overview";

  const overview = (
    <div className="careers-job-prose">
      <h3>About Youry</h3>
      <p>
        We are building{" "}
        <a href="https://youry.io" target="_blank" rel="noopener noreferrer">
          Youry
        </a>
        , AI-powered UGC for teams who ship creative at performance-marketing
        speed — ecommerce and SaaS brands that test TikTok and Reels weekly.
      </p>

      <h3>The role</h3>
      <p>
        We are hiring a <strong>Smart Short-Form Video Editor</strong> — you
        live on TikTok trends and mass-produce edits that feel native to SaaS and
        ecommerce accounts. Study our reference style on{" "}
        {EXAMPLE_TIKTOK_ACCOUNTS.map((acc, i) => (
          <span key={acc.url}>
            {i > 0 ? " and " : null}
            <a href={acc.url} target="_blank" rel="noopener noreferrer">
              {acc.handle}
            </a>
          </span>
        ))}{" "}
        (BuildYourStore AI, Pinecode). Match the bar in our{" "}
        <a
          href={REFERENCE_EDIT_QUALITY_DRIVE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          reference edit folder
        </a>
        .
      </p>

      <h3>Compensation — high upside, no volume cap</h3>
      <p className="careers-job-prose--emphasis">
        <strong>$500 per 500,000 views</strong> on videos you edit. Post as often
        as you want — <strong>no limit on how many shorts you can ship</strong>.
        The faster and cleaner you edit, the more you can earn. This is a
        high-upside role for editors who love volume + taste.
      </p>

      <h3>What you get</h3>
      <ul>
        {[
          "Editor Kickstart+ community access.",
          "Coaching and full training from our team.",
          "Real briefs — TikTok-first SaaS / ecommerce shorts.",
          "Trial edit pathway via Discord.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>What success looks like</h3>
      <ul>
        {[
          "3+ TikTok-ready edits per day when briefs are clear.",
          "Hooks that stop the scroll in the first 3 seconds.",
          "Trend-fluent cuts — not stale or generic corporate edits.",
          "Flawless English in on-screen text.",
          "Fast Discord communication and turnaround.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>Hard requirements</h3>
      <ul>
        {[
          "Portfolio of real short-form work (TikTok, Reels, or similar).",
          "Strong written/spoken English.",
          "Honest answers on daily output and trend workflow.",
          "Adobe Premiere + After Effects preferred (CapCut OK if quality matches).",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <div className="pt-8">
        <Button asChild size="lg" className={careersTheme.btnPrimary}>
          <Link href="/careers/smart-video-editor?tab=application">
            Apply for this job
          </Link>
        </Button>
      </div>
    </div>
  );

  const application = (
    <SmartShortFormVideoEditorApplicationForm
      jobSlug={SMART_SHORT_FORM_VIDEO_EDITOR_JOB_SLUG}
    />
  );

  return (
    <>
      <JobPostingViewTracker jobSlug={SMART_SHORT_FORM_VIDEO_EDITOR_JOB_SLUG} />
      <CareersJobShell
        title="Smart Short-Form Video Editor"
        titleAside="(TikTok & trends)"
      >
        <div className="grid gap-10 lg:grid-cols-[minmax(0,220px)_1fr] lg:gap-16 xl:grid-cols-[minmax(0,260px)_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <CareersJobMetaCard
              items={[
                { title: "Location", value: "Remote · worldwide" },
                { title: "Employment type", value: "Contract / freelance" },
                { title: "Pay model", value: "$500 / 500k views" },
                { title: "Output target", value: "3+ shorts / day" },
                { title: "Department", value: "Youry, Creative" },
              ]}
            />
          </aside>

          <div className="min-w-0">
            <JobPostingTabs
              initialTab={initialTab}
              jobSlug={SMART_SHORT_FORM_VIDEO_EDITOR_JOB_SLUG}
              overview={overview}
              application={application}
            />
          </div>
        </div>
      </CareersJobShell>
    </>
  );
}

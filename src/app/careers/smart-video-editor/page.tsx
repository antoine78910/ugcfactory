import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CareersJobMetaCard, CareersJobShell } from "../_components/CareersJobShell";
import { careersTheme } from "../_components/careersTheme";
import { JobPostingTabs } from "../_components/JobPostingTabs";
import { JobPostingViewTracker } from "../_components/JobPostingViewTracker";
import { SmartVideoEditorApplicationForm } from "../_components/SmartVideoEditorApplicationForm";
import { SMART_VIDEO_EDITOR_JOB_SLUG } from "@/lib/careers/videoEditorApplication";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Smart Video Editor (TikTok & trends), Youry",
  description:
    "Trend-native TikTok editor for Youry: mass-produce SaaS and ecommerce shorts (dropship.io / pinecode style), 3+ edits per day, performance-driven creative.",
  openGraph: {
    title: "Smart Video Editor (TikTok & trends), Youry",
    description:
      "Join our content team on youry.io — fast hooks, trend fluency, and high-volume TikTok edits for performance brands.",
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
        , AI-powered UGC for teams who need scroll-stopping video at the speed of
        performance marketing — ecommerce, SaaS, and apps that test creative
        weekly, not quarterly.
      </p>

      <h3>The role</h3>
      <p>
        We are hiring a <strong>Smart Video Editor</strong> — not a generic
        “cutter,” but someone who lives on TikTok trends and can mass-produce
        edits that feel native to SaaS and ecommerce accounts (think{" "}
        <a
          href="https://dropship.io"
          target="_blank"
          rel="noopener noreferrer"
        >
          dropship.io
        </a>
        , pinecode, and similar performance brands). You turn raw footage and
        briefs into hook-first, trend-aware shorts that ship fast.
      </p>

      <h3>What success looks like</h3>
      <ul>
        {[
          "You deliver at least 3 TikTok-ready edits per day, consistently, without sacrificing hook quality.",
          "You spot and adapt trends before they feel stale — captions, pacing, sound, and framing.",
          "Your edits feel like they belong on high-velocity SaaS / ecommerce TikTok, not corporate slideshows.",
          "You are comfortable with performance-based compensation tied to views.",
          "You communicate clearly on Discord or Telegram and hit fast turnarounds.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>What you will do</h3>
      <ul>
        {[
          "Edit TikTok / Reels / Shorts for Youry and partner brands — UGC, ads, and product-demo style cuts.",
          "Follow trend cycles daily: hooks, text overlays, jump cuts, native sounds, and pacing.",
          "Mass-produce variants and iterations for testing (3+ finished edits per day target).",
          "Work from briefs and raw clips — CapCut, Premiere, DaVinci, or your stack of choice.",
          "Collaborate async with founders and growth — tight feedback loops, minimal layers.",
          "Optionally complete an editing test to prove speed + taste on a SaaS-style brief.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>You are</h3>
      <ul>
        {[
          "Experienced with short-form social (TikTok first) — you know what stops the scroll.",
          "Fast and reliable — you have shipped high volume before or can prove you can ramp.",
          "Trend-fluent — you study what works in ecommerce / SaaS TikTok, not only entertainment.",
          "Comfortable with CapCut or pro NLEs; AI-assisted workflows are a plus.",
          "Okay with performance pay: $1 per 1,000 views generated (see application form).",
          "Available for a long-term collaboration if the fit is mutual.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>Hard requirements</h3>
      <p className="careers-job-prose--muted">
        If any of these is a no, please do not apply.
      </p>
      <ul>
        {[
          "Portfolio with real short-form work (TikTok, Reels, or links to edits).",
          "Ability to sustain 3+ polished TikTok-ready edits per day when briefs are clear.",
          "Comfort with fast deadlines and async communication (Discord / Telegram).",
          "Honest answers on trend fluency and SaaS / ecommerce-style editing experience.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>What we offer</h3>
      <ul>
        {[
          "Performance-based pay: $1 per 1,000 views on work you produce for us.",
          "High-volume, real briefs — build a reel and rhythm on live performance creative.",
          "Remote-first, EU-friendly hours, small team with direct founder access.",
          "Long-term path if output and taste stay strong.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <p className="careers-job-prose--emphasis">
        Show us your best TikTok edits. Show us you can move at trend speed.
      </p>

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
    <SmartVideoEditorApplicationForm jobSlug={SMART_VIDEO_EDITOR_JOB_SLUG} />
  );

  return (
    <>
      <JobPostingViewTracker jobSlug={SMART_VIDEO_EDITOR_JOB_SLUG} />
      <CareersJobShell
        title="Smart Video Editor"
        titleAside="(TikTok & trends)"
      >
        <div className="grid gap-10 lg:grid-cols-[minmax(0,220px)_1fr] lg:gap-16 xl:grid-cols-[minmax(0,260px)_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <CareersJobMetaCard
              items={[
                { title: "Location", value: "Remote · EU-friendly hours" },
                { title: "Employment type", value: "Contract / full time" },
                { title: "Location type", value: "Remote-first" },
                { title: "Department", value: "Youry, Creative" },
                {
                  title: "Output target",
                  value: "3+ TikTok-ready edits / day",
                },
              ]}
            />
          </aside>

          <div className="min-w-0">
            <JobPostingTabs
              initialTab={initialTab}
              jobSlug={SMART_VIDEO_EDITOR_JOB_SLUG}
              overview={overview}
              application={application}
            />
          </div>
        </div>
      </CareersJobShell>
    </>
  );
}

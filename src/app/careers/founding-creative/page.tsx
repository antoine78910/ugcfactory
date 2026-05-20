import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CareersJobMetaCard, CareersJobShell } from "../_components/CareersJobShell";
import { careersTheme } from "../_components/careersTheme";
import { FoundingCreativeApplicationForm } from "../_components/FoundingCreativeApplicationForm";
import { JobPostingTabs } from "../_components/JobPostingTabs";
import { JobPostingViewTracker } from "../_components/JobPostingViewTracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Founding Creative (content & video), Youry",
  description:
    "Own visual storytelling for Youry: cinematic product and UGC launches, social-first content, and a motion language that makes performance creative feel undeniable.",
  openGraph: {
    title: "Founding Creative (content & video), Youry",
    description:
      "Craft-led role: shoot, edit, animate, and ship content that stops the scroll for an AI UGC brand.",
  },
};

export default async function FoundingCreativePage({
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
        , AI-powered UGC for teams who need scroll-stopping video, ecommerce,
        SaaS, and apps that test creative weekly, not quarterly. We are a small
        team obsessed with craft, velocity, and proof in market.
      </p>

      <h3>The role</h3>
      <p>
        We are looking for a Founding Creative (content &amp; video), the
        person who defines how Youry shows up in motion. You shoot, edit,
        animate, and ship work that makes people stop scrolling. You have taste.
        You know what a tight product launch film feels like. You know how to
        make a 45–60 second story feel like a trailer, not a slide deck. This is
        a craft role: you make beautiful things, fast, on brand for a company
        that sells creative speed to others.
      </p>

      <h3>Your work will be a success if</h3>
      <ul>
        {[
          "The best operators want to work with us because our content made them feel the ambition behind the product.",
          "People discover us through a film, a clip, or a build log, not only through paid polish.",
          "“How did you make that?” becomes a frequent question, because the bar is obvious.",
          "Storytelling fuels growth: it builds trust, clarifies the product, and feeds distribution.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>What you will do</h3>
      <ul>
        {[
          "Create launch-worthy films for product milestones, every important ship deserves a crisp, energetic story.",
          "Produce weekly content that shows who we are: product, people, momentum, and vision.",
          "Turn long-form conversations (podcasts, interviews, deep dives) into sharp short-form clips across platforms.",
          "Build the visual language of Youry in motion, what we look and feel like when we move.",
          "Shoot and produce team moments, behind the scenes, building in public, the energy of an early company.",
          "Design social-first pieces tuned for X, TikTok, Instagram, YouTube Shorts, and LinkedIn, with taste, not gimmicks.",
          "Use AI tools to move faster: ideation, variants, cleanup, and smarter iteration cycles, without outsourcing taste.",
          "Lead a consistent “build in public” thread that documents how we grow.",
          "Push a signature style that people associate with Youry, confident, modern, and human.",
          "Capture documentary-style slices of day-to-day work where it serves the story.",
          "Work directly with founders, minimal layers, fast decisions.",
          "Help define creative culture from day one.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>Tools and approach</h3>
      <p>
        This is a modern creative role: we cannot ship one polished hero video a
        quarter and disappear. We need someone who integrates AI deeply into
        production, not to cut corners on taste, but to raise ambition and
        output. Motion models, image tools, audio cleanup, assistive editing, use what is best-in-class tomorrow. We expect you to stay at the edge of
        what AI can do for visual storytelling while keeping brand and clarity
        intact.
      </p>

      <h3>You are</h3>
      <ul>
        {[
          "A creative with taste, your work looks beautiful and feels alive.",
          "A maker, not a manager, you shoot, edit, animate, and deliver.",
          "Someone who sets the vibe, you do not only execute briefs, you shape how things should look and feel.",
          "Fast, you can turn around a polished piece in days when the story is clear.",
          "Comfortable with ambiguity, fewer templates, more instinct and iteration.",
          "AI-augmented, you already use intelligent tools in your workflow.",
          "Builder over employee mindset.",
          "Taste over rigid process when they conflict.",
          "Speed over perfection when the goal is learning in public.",
          "Impact over title.",
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
          "You have a portfolio or reel with genuinely beautiful work, not only functional, beautiful.",
          "You can shoot, edit, and deliver a cinematic piece end-to-end by yourself.",
          "You use AI tools to accelerate creative work (generative video or image, assistive editing, or equivalent).",
          "You understand what makes content spread, you have studied it, shipped it, or both.",
          "You can work primarily remote with reliable overlap on EU-friendly hours, and travel occasionally when we ship something big together.",
          "You can show real outcomes: your reel, links, metrics, or qualitative proof that your work moved people.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>Big add-ons (nice to have)</h3>
      <ul>
        {[
          "Active on X, YouTube, or Instagram, you share process or finished work.",
          "You study launch and brand films from product-led companies you admire.",
          "Experience creating for B2B SaaS, developer tools, or ecommerce at speed.",
          "Motion design and animation beyond basic cuts.",
          "Experience with build-in-public or authentic behind-the-scenes formats.",
          "Previous early-stage startup experience.",
          "Launch videos, product films, or brand stories that earned real traction.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>What we offer</h3>
      <ul>
        {[
          "Competitive cash compensation for stage and role.",
          "Meaningful equity for full-time founding roles.",
          "High-velocity environment with visible creative ownership.",
          "Small team and direct access to founders.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>Employment options</h3>
      <ul>
        {[
          "Full time (preferred), remote-first with EU-friendly hours; help build the creative function from zero.",
          "Fractional / contract, if you are exceptional and available immediately, we can start with a scoped engagement and expand.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <h3>What this is not</h3>
      <ul>
        {[
          "Not a social media scheduling role, you create the work; distribution can collaborate with you.",
          "Not corporate safe-audio / stock-footage sludge, we want cinematic clarity with personality.",
          "Not a role where you wait for a creative brief, you help define direction with founders.",
          "Not async-only isolation, we move in tight feedback loops when it matters.",
          "Not for people who think AI creative tooling is a gimmick.",
          "Not for people who do not ship.",
        ].map((item) => (
          <li key={item}>
            <p>{item}</p>
          </li>
        ))}
      </ul>

      <p className="careers-job-prose--emphasis">
        Show us your best work. Show us the piece you are still proud of six
        months later.
      </p>
      <p className="careers-job-prose--muted">
        No degree required, obviously. We care about what we can watch and
        measure.
      </p>

      <div className="pt-8">
        <Button asChild size="lg" className={careersTheme.btnPrimary}>
          <Link href="/careers/founding-creative?tab=application">
            Apply for this job
          </Link>
        </Button>
      </div>
    </div>
  );

  const application = (
    <FoundingCreativeApplicationForm jobSlug="founding-creative" />
  );

  return (
    <>
      <JobPostingViewTracker jobSlug="founding-creative" />
      <CareersJobShell
        title="Founding Creative"
        titleAside="(content & video)"
      >
        <div className="grid gap-10 lg:grid-cols-[minmax(0,220px)_1fr] lg:gap-16 xl:grid-cols-[minmax(0,260px)_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <CareersJobMetaCard
              items={[
                { title: "Location", value: "Remote · EU-friendly hours" },
                { title: "Employment type", value: "Full time" },
                { title: "Location type", value: "Remote-first" },
                { title: "Department", value: "Youry, Creative" },
              ]}
            />
          </aside>

          <div className="min-w-0">
            <JobPostingTabs
              initialTab={initialTab}
              jobSlug="founding-creative"
              overview={overview}
              application={application}
            />
          </div>
        </div>
      </CareersJobShell>
    </>
  );
}

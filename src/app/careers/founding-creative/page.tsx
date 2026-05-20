import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Instrument_Serif } from "next/font/google";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FoundingCreativeApplicationForm } from "../_components/FoundingCreativeApplicationForm";
import { JobPostingTabs } from "../_components/JobPostingTabs";
import { JobPostingViewTracker } from "../_components/JobPostingViewTracker";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Founding Creative (content & video) — Youry",
  description:
    "Own visual storytelling for Youry: cinematic product and UGC launches, social-first content, and a motion language that makes performance creative feel undeniable.",
  openGraph: {
    title: "Founding Creative (content & video) — Youry",
    description:
      "Craft-led role: shoot, edit, animate, and ship content that stops the scroll for an AI UGC brand.",
  },
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-border py-5 first:pt-0 last:border-b-0">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground sm:text-base">
      {items.map((item) => (
        <li key={item}>
          <p className="min-h-[1.5em]">{item}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function FoundingCreativePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const initialTab = sp.tab === "application" ? "application" : "overview";

  const overview = (
    <div className="space-y-2 text-sm leading-relaxed text-foreground sm:text-base">
      <h3 className={`text-lg font-semibold ${instrumentSerif.className}`}>
        About Youry
      </h3>
      <p className="min-h-[1.5em]">
        We are building{" "}
        <a
          href="https://youry.io"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-4 transition-colors hover:decoration-foreground"
        >
          Youry
        </a>
        , AI-powered UGC for teams who need scroll-stopping video — ecommerce,
        SaaS, and apps that test creative weekly, not quarterly. We are a small
        team obsessed with craft, velocity, and proof in market.
      </p>

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        The role
      </h3>
      <p className="min-h-[1.5em]">
        We are looking for a Founding Creative (content &amp; video) — the
        person who defines how Youry shows up in motion. You shoot, edit,
        animate, and ship work that makes people stop scrolling. You have taste.
        You know what a tight product launch film feels like. You know how to
        make a 45–60 second story feel like a trailer, not a slide deck. This is
        a craft role: you make beautiful things, fast — on brand for a company
        that sells creative speed to others.
      </p>

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        Your work will be a success if
      </h3>
      <List
        items={[
          "The best operators want to work with us because our content made them feel the ambition behind the product.",
          "People discover us through a film, a clip, or a build log — not only through paid polish.",
          "“How did you make that?” becomes a frequent question — because the bar is obvious.",
          "Storytelling fuels growth: it builds trust, clarifies the product, and feeds distribution.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        What you will do
      </h3>
      <List
        items={[
          "Create launch-worthy films for product milestones — every important ship deserves a crisp, energetic story.",
          "Produce weekly content that shows who we are: product, people, momentum, and vision.",
          "Turn long-form conversations (podcasts, interviews, deep dives) into sharp short-form clips across platforms.",
          "Build the visual language of Youry in motion — what we look and feel like when we move.",
          "Shoot and produce team moments — behind the scenes, building in public, the energy of an early company.",
          "Design social-first pieces tuned for X, TikTok, Instagram, YouTube Shorts, and LinkedIn — with taste, not gimmicks.",
          "Use AI tools to move faster: ideation, variants, cleanup, and smarter iteration cycles — without outsourcing taste.",
          "Lead a consistent “build in public” thread that documents how we grow.",
          "Push a signature style that people associate with Youry — confident, modern, and human.",
          "Capture documentary-style slices of day-to-day work where it serves the story.",
          "Work directly with founders — minimal layers, fast decisions.",
          "Help define creative culture from day one.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        Tools and approach
      </h3>
      <p className="min-h-[1.5em]">
        This is a modern creative role: we cannot ship one polished hero video a
        quarter and disappear. We need someone who integrates AI deeply into
        production — not to cut corners on taste, but to raise ambition and
        output. Motion models, image tools, audio cleanup, assistive editing —
        use what is best-in-class tomorrow. We expect you to stay at the edge of
        what AI can do for visual storytelling while keeping brand and clarity
        intact.
      </p>

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        You are
      </h3>
      <List
        items={[
          "A creative with taste — your work looks beautiful and feels alive.",
          "A maker, not a manager — you shoot, edit, animate, and deliver.",
          "Someone who sets the vibe — you do not only execute briefs, you shape how things should look and feel.",
          "Fast — you can turn around a polished piece in days when the story is clear.",
          "Comfortable with ambiguity — fewer templates, more instinct and iteration.",
          "AI-augmented — you already use intelligent tools in your workflow.",
          "Builder over employee mindset.",
          "Taste over rigid process when they conflict.",
          "Speed over perfection when the goal is learning in public.",
          "Impact over title.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        Hard requirements
      </h3>
      <p className="min-h-[1.5em] text-muted-foreground">
        If any of these is a no — please do not apply.
      </p>
      <List
        items={[
          "You have a portfolio or reel with genuinely beautiful work — not only functional, beautiful.",
          "You can shoot, edit, and deliver a cinematic piece end-to-end by yourself.",
          "You use AI tools to accelerate creative work (generative video or image, assistive editing, or equivalent).",
          "You understand what makes content spread — you have studied it, shipped it, or both.",
          "You can work primarily remote with reliable overlap on EU-friendly hours, and travel occasionally when we ship something big together.",
          "You can show real outcomes: your reel, links, metrics, or qualitative proof that your work moved people.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        Big add-ons (nice to have)
      </h3>
      <List
        items={[
          "Active on X, YouTube, or Instagram — you share process or finished work.",
          "You study launch and brand films from product-led companies you admire.",
          "Experience creating for B2B SaaS, developer tools, or ecommerce at speed.",
          "Motion design and animation beyond basic cuts.",
          "Experience with build-in-public or authentic behind-the-scenes formats.",
          "Previous early-stage startup experience.",
          "Launch videos, product films, or brand stories that earned real traction.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        What we offer
      </h3>
      <List
        items={[
          "Competitive cash compensation for stage and role.",
          "Meaningful equity for full-time founding roles.",
          "High-velocity environment with visible creative ownership.",
          "Small team and direct access to founders.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        Employment options
      </h3>
      <List
        items={[
          "Full time (preferred) — remote-first with EU-friendly hours; help build the creative function from zero.",
          "Fractional / contract — if you are exceptional and available immediately, we can start with a scoped engagement and expand.",
        ]}
      />

      <h3 className={`mt-10 text-lg font-semibold ${instrumentSerif.className}`}>
        What this is not
      </h3>
      <List
        items={[
          "Not a social media scheduling role — you create the work; distribution can collaborate with you.",
          "Not corporate safe-audio / stock-footage sludge — we want cinematic clarity with personality.",
          "Not a role where you wait for a creative brief — you help define direction with founders.",
          "Not async-only isolation — we move in tight feedback loops when it matters.",
          "Not for people who think AI creative tooling is a gimmick.",
          "Not for people who do not ship.",
        ]}
      />

      <p className="mt-10 min-h-[1.5em] font-medium">
        Show us your best work. Show us the piece you are still proud of six
        months later.
      </p>
      <p className="min-h-[1.5em] text-muted-foreground">
        No degree required — obviously. We care about what we can watch and
        measure.
      </p>

      <div className="pt-8">
        <Button asChild size="lg" className="w-full rounded-xl sm:w-auto">
          <Link href="/careers/founding-creative?tab=application">
            Apply for this job
          </Link>
        </Button>
      </div>
    </div>
  );

  const application = (
    <FoundingCreativeApplicationForm
      jobSlug="founding-creative"
      headingClassName={instrumentSerif.className}
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <JobPostingViewTracker jobSlug="founding-creative" />
      <nav
        className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-md"
        aria-label="Job posting navigation"
      >
        <ul className="mx-auto flex max-w-6xl list-none items-center gap-1 px-4 py-3 sm:gap-3 sm:px-6">
          <li>
            <Link href="/" className="inline-flex items-center">
              <Image
                src="/youry-logo.png"
                alt="Youry"
                width={174}
                height={52}
                className="h-7 w-auto opacity-90 sm:h-8"
                priority
              />
            </Link>
          </li>
          <li>
            <Link
              href="/careers"
              aria-label="Back to Youry's job listings"
              className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-5 -translate-x-px" aria-hidden />
            </Link>
          </li>
        </ul>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-14">
        <h1
          className={`mb-10 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl ${instrumentSerif.className}`}
        >
          Founding Creative{" "}
          <span className="font-normal italic text-muted-foreground">
            (content &amp; video)
          </span>
        </h1>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,220px)_1fr] lg:gap-16 xl:grid-cols-[minmax(0,260px)_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-border bg-card p-1">
              <Section title="Location">Remote · EU-friendly hours</Section>
              <Section title="Employment type">Full time</Section>
              <Section title="Location type">Remote-first</Section>
              <Section title="Department">Youry — Creative</Section>
            </div>
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
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Youry.{" "}
            <Link
              href="/careers"
              className="underline underline-offset-4 hover:text-foreground"
            >
              All openings
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

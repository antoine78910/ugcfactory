import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeroVideoCarousel3D } from "./HeroVideoCarousel3D";
import { LandingRevealCarousel } from "./LandingRevealCarousel";
import { LandingFaq } from "./LandingFaq";
import { ArrowRight, Sparkles } from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Paste your product URL",
    description:
      "Drop in a product or landing page URL and we instantly extract the assets and product context needed to create ad concepts.",
    mediaImage: "/steps/step-link-input.png",
    mediaAlt: "Product URL input field",
  },
  {
    number: "02",
    title: "Pick the angle and script",
    description:
      "Select the message you want to test and refine the hook, pain point, benefits, and CTA before generating.",
    mediaImage: "/steps/step-pick-angle-script.png",
    mediaAlt: "Product and angle selection",
  },
  {
    number: "03",
    title: "Generate ad-ready videos",
    description:
      "Launch generation in one click and get ready-to-test creatives you can iterate fast for your paid social campaigns.",
    mediaImage: "/steps/step-generate-video.png",
    mediaAlt: "Generated ad video preview",
  },
];

/** Hero 3D ring only (`public/studio/`). */
const HERO_STUDIO_VIDEOS = [
  "/studio/0328(1).mp4",
  "/studio/0328(2).mp4",
  "/studio/0328(3).mp4",
  "/studio/0328(4).mp4",
  "/studio/0328(5).mp4",
  "/studio/0328(6).mp4",
  "/studio/0328(7).mp4",
  "/studio/0328(8).mp4",
  "/studio/0328(9).mp4",
  "/studio/0328(10).mp4",
] as const;
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050507] text-white selection:bg-violet-500/30">
      {/* ── Sticky header: Nano Banana bar + nav (no hero texture here) ── */}
      <header className="sticky top-0 z-50 bg-transparent backdrop-blur-xl">
        <div className="relative border-b-[4px] border-[#0b0912] bg-[#987eee] px-4 py-1.5 text-center">
          <p className="text-[11px] font-semibold text-[#0b0912]/90 sm:text-xs">
            Nano Banana 2 UNLIMITED. Kling 3.0 & Motion Control Available.
            Special 73% OFF
          </p>
          <button
            type="button"
            aria-label="Close announcement"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0b0912]/55 transition-colors hover:text-[#0b0912]"
          >
            ×
          </button>
        </div>
        <div className="mx-auto flex max-w-6xl items-center px-5 py-4">
          <Link
            href="/"
            className="flex items-center flex-shrink-0"
          >
            <Image
              src="/youry-logo.png"
              alt="Youry"
              width={174}
              height={52}
              className="h-9 w-auto sm:h-10"
              priority
            />
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-white/60 hover:text-white hover:bg-white/5"
            >
              <Link href="/signin">Log in</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="rounded-2xl bg-violet-400 px-5 text-black font-semibold border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]"
            >
              <Link href="/signup">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Get started
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero (texture behind headline: Turn any product / AI Reels…) ── */}
      <section className="relative min-h-[min(92svh,880px)] overflow-hidden">
        <Image
          src="/hero-bg-texture.png"
          alt=""
          fill
          priority
          fetchPriority="high"
          sizes="100vw"
          className="pointer-events-none z-0 object-cover"
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-b from-[#050507]/60 via-[#050507]/25 via-40% to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-8 bg-gradient-to-b from-transparent to-[#050507]" />
        <div className="pointer-events-none absolute left-1/2 top-0 z-[3] -translate-x-1/2 h-[700px] w-[1000px] rounded-full bg-violet-600/[0.12] blur-[140px]" />

        <div className="relative z-10 mx-auto w-full max-w-5xl px-5 pt-4 pb-0 text-center sm:pt-6 md:pt-8">
          <div className="mb-3 flex items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/35 bg-violet-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-200">
              Seedance Pro 2.0 now available !
              <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-100 shadow-[0_0_16px_rgba(16,185,129,0.18)]">
                NEW
              </span>
            </span>
          </div>
          <h1 className="mx-auto max-w-4xl px-3 sm:px-6 text-4xl font-extrabold tracking-tight leading-[1.12] sm:text-5xl md:text-6xl">
            Realistic AI UGC for{' '}
            <span className="whitespace-nowrap">
              <span className="text-violet-400">high-converting</span>
              &nbsp;ads
            </span>
          </h1>

          <div className="mx-auto mt-5 max-w-xl sm:mt-6">
            <p className="mb-2 text-sm text-white/55">
              Discover winning angles and generate authentic videos at scale.
            </p>
            <div className="relative">
              <div className="pointer-events-none absolute -inset-6 rounded-full bg-violet-600/20 blur-2xl" />
              <div className="relative flex items-center gap-2 overflow-hidden rounded-full bg-white/[0.05] px-2 py-1.5 ring-1 ring-violet-500/40 shadow-[0_0_70px_rgba(139,92,246,0.22)] transition-all duration-300 ease-out focus-within:ring-2 focus-within:ring-violet-400 focus-within:shadow-[0_0_90px_rgba(139,92,246,0.55)]">
              <Input
                type="url"
                placeholder="https://your-product-page.com"
                className="h-11 flex-1 border-0 bg-transparent px-4 text-sm text-white placeholder:text-white/25 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button
                asChild
                className="h-10 shrink-0 rounded-2xl bg-violet-400 px-6 text-sm font-semibold text-black border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]"
              >
                <Link href="/signup">
                  <Sparkles className="mr-1 h-4 w-4" />
                  Generate
                </Link>
              </Button>
            </div>
            </div>
          </div>
        </div>

        {/* 3D video cylinder: nudged up toward the Generate row (was visually too low vs flex-end scene) */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[min(460px,56svh)] -translate-y-px overflow-visible sm:h-[min(530px,60svh)] sm:-translate-y-2 lg:h-[min(640px,66svh)] lg:-translate-y-3"
          aria-hidden
        >
          <HeroVideoCarousel3D srcs={HERO_STUDIO_VIDEOS} />
        </div>
      </section>

      {/* ── 3 Steps ── */}
      <section className="mx-auto max-w-6xl px-5 py-24 bg-gradient-to-b from-transparent via-[#0c0a14]/25 to-[#0c0a14]/35">
        <div className="mb-14 text-center">
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Create Your AI Video Ad in 3 Easy Steps
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6 transition-all duration-300 hover:border-violet-500/25 hover:shadow-[0_0_40px_rgba(139,92,246,0.06)]"
            >
              <div className="relative mb-6 aspect-video overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent">
                <Image
                  src={step.mediaImage}
                  alt={step.mediaAlt}
                  fill
                  loading={step.number === "01" ? "eager" : "lazy"}
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  sizes="(max-width: 768px) 90vw, 360px"
                />
              </div>

              <span className="text-xs font-bold text-violet-500">
                {step.number}
              </span>
              <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/45">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Carousel: Product → Electric Band → UGC (pulled up toward hero 3D strip) ── */}
      <LandingRevealCarousel />

      {/* ── CTA text + button ── */}
      <section className="mx-auto max-w-4xl px-5 pt-10 pb-18 text-center">
        <p className="mx-auto max-w-3xl text-lg leading-relaxed text-white/55 sm:text-xl">
          Instantly turn flat product shots into dynamic video ads with AI
          avatars and voiceovers that demand attention and drive sales.
        </p>
        <Button
          asChild
          className="mt-7 h-12 rounded-2xl bg-violet-400 px-8 text-base font-semibold text-black border border-violet-200/40 shadow-[0_7px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_9px_0_0_rgba(76,29,149,0.9)] active:translate-y-[7px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]"
        >
          <Link href="/signup">
            <Sparkles className="mr-2 h-4 w-4" />
            Try it yourself
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </section>

      {/* ── Bottom banner ── */}
      <section className="mx-auto max-w-5xl px-5 py-10">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-[#0c0c16] via-[#100a1e] to-[#0c0c16] px-8 py-20 text-center">
          <div className="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-violet-600/10 blur-[80px]" />
          <div className="pointer-events-none absolute -left-16 top-8 h-48 w-48 rounded-full bg-violet-600/8 blur-[60px]" />

          <h2 className="relative text-3xl font-extrabold italic tracking-tight sm:text-4xl md:text-5xl">
            YOUR NEXT UGC IS ONE CLICK AWAY
          </h2>
          <p className="relative mx-auto mt-5 max-w-lg text-sm text-white/45 sm:text-base">
            Turn your product page into your next best-performing UGC. Right now.
            What are you waiting for?
          </p>
          <Button
            asChild
            className="relative mt-8 h-11 rounded-2xl bg-violet-400 px-7 text-sm font-semibold text-black border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]"
          >
            <Link href="/signup">
              <Sparkles className="mr-1.5 h-4 w-4" />
              Generate your ad
            </Link>
          </Button>
        </div>
      </section>

      {/* ── FAQ ── */}
      <LandingFaq />

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="inline-flex items-center"
          >
            <Image
              src="/youry-logo.png"
              alt="Youry"
              width={174}
              height={52}
              className="h-8 w-auto opacity-90"
            />
          </Link>
          <p className="text-xs text-white/25">
            &copy; {new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeroVideoCarousel3D } from "./HeroVideoCarousel3D";
import { LandingSeedanceTopButton } from "./LandingSeedanceTopButton";
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
    <div className="min-h-screen overflow-x-clip bg-[#050507] text-white selection:bg-violet-500/30">
      {/*
        Sticky nav must be a direct child of the full-page column so it stays pinned for the whole
        scroll (not only the hero). Hero art stays in a sibling wrapper; overflow-x clip stays on the art layer.
      */}
      <header className="sticky top-0 z-50 overflow-hidden border-b border-white/[0.08] bg-[#050507]/85 backdrop-blur-md supports-[backdrop-filter]:bg-[#050507]/20">
        <div className="mx-auto flex min-w-0 max-w-6xl items-center gap-3 px-5 py-5 sm:gap-4 sm:px-6 sm:py-6">
          <Link href="/" className="flex flex-shrink-0 items-center">
            <Image
              src="/youry-logo.png"
              alt="Youry"
              width={174}
              height={52}
              className="h-10 w-auto sm:h-11 md:h-12"
              priority
            />
          </Link>

          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-9 px-4 text-sm text-white/70 hover:bg-white/10 hover:text-white sm:h-10 sm:px-5"
            >
              <Link href="/signin">Log in</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="h-9 rounded-2xl border border-violet-200/40 bg-violet-400 px-4 text-sm font-semibold text-black shadow-[0_6px_0_0_rgba(76,29,149,0.9)] ring-offset-0 transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9),0_0_28px_rgba(167,139,250,0.5)] focus-visible:border-violet-400/45 focus-visible:ring-violet-400/55 focus-visible:ring-[3px] active:translate-y-[6px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)] sm:h-10 sm:px-6 sm:text-base"
            >
              <Link href="/signup">
                <Sparkles className="mr-1 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Get started
                <ArrowRight className="ml-1 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[min(100svh,1040px)] overflow-x-hidden">
          <Image
            src="/hero-bg-texture.png"
            alt=""
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            className="object-cover object-top"
            aria-hidden
          />
          <div className="absolute inset-0 z-[3] bg-gradient-to-b from-[#050507]/55 via-[#050507]/22 via-40% to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-[3] h-8 bg-gradient-to-b from-transparent to-[#050507]" />
          <div className="absolute left-1/2 top-0 z-[3] h-[700px] w-[1000px] -translate-x-1/2 rounded-full bg-violet-600/[0.12] blur-[140px]" />
        </div>

        {/* ── Hero: headline + 3D strip (texture is the absolute layer above) ── */}
        <section className="relative z-10 min-h-[min(100svh,1040px)]">
        <div className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-20 pt-5 text-center sm:px-6 sm:pb-24 sm:pt-7 md:pb-28 md:pt-8">
          <LandingSeedanceTopButton />
          <h1 className="mx-auto max-w-4xl px-3 sm:px-6 text-[2.35rem] font-extrabold tracking-tight leading-[1.12] sm:text-5xl md:text-6xl lg:text-[3.5rem] lg:leading-[1.08]">
            <span className="block">
              Realistic AI UGC for{' '}
              <span className="whitespace-nowrap">
                <span className="text-violet-400">high-converting</span>
                &nbsp;ads
              </span>
            </span>
          </h1>

          <div className="mx-auto mt-7 max-w-xl sm:mt-9">
            <p className="mb-2 text-sm text-white/55 sm:text-base">
              Stop guessing what works. Paste your URL and get UGC that actually sells.
            </p>
            <div className="relative">
              <div className="pointer-events-none absolute -inset-6 rounded-full bg-violet-600/20 blur-2xl" />
              <div className="relative flex flex-col gap-2 overflow-hidden rounded-2xl bg-white/[0.05] p-2 ring-1 ring-violet-500/40 shadow-[0_0_70px_rgba(139,92,246,0.22)] transition-all duration-300 ease-out focus-within:ring-2 focus-within:ring-violet-400 focus-within:shadow-[0_0_90px_rgba(139,92,246,0.55)] sm:flex-row sm:items-center sm:gap-2 sm:rounded-full sm:py-1.5">
              <Input
                type="url"
                placeholder="https://your-product-page.com"
                className="h-11 flex-1 border-0 bg-transparent px-4 text-sm text-white placeholder:text-white/25 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button
                asChild
                className="h-auto min-h-10 shrink-0 rounded-xl bg-violet-400 px-3 py-2.5 text-center text-[11px] font-semibold leading-snug text-black border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] ring-offset-0 transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9),0_0_32px_rgba(167,139,250,0.55)] focus-visible:border-violet-400/45 focus-visible:ring-violet-400/55 focus-visible:ring-[3px] active:translate-y-[6px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)] sm:rounded-2xl sm:px-5 sm:py-2.5 sm:text-xs md:text-sm"
              >
                <Link href="/signup" className="inline-flex items-center justify-center gap-1.5">
                  <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                  <span>Generate</span>
                </Link>
              </Button>
            </div>
            </div>
          </div>
        </div>

        {/* 3D video cylinder — less translate-y = sits higher vs bottom anchor */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[min(460px,56svh)] translate-y-8 overflow-hidden sm:h-[min(530px,60svh)] sm:translate-y-6 lg:h-[min(640px,66svh)] lg:translate-y-5"
          aria-hidden
        >
          <HeroVideoCarousel3D srcs={HERO_STUDIO_VIDEOS} />
        </div>
      </section>
      </div>

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
          className="mt-7 h-12 rounded-2xl bg-violet-400 px-8 text-base font-semibold text-black border border-violet-200/40 shadow-[0_7px_0_0_rgba(76,29,149,0.9)] ring-offset-0 transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_9px_0_0_rgba(76,29,149,0.9),0_0_36px_rgba(167,139,250,0.55)] focus-visible:border-violet-400/45 focus-visible:ring-violet-400/55 focus-visible:ring-[3px] active:translate-y-[7px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]"
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
            className="relative mt-8 h-11 rounded-2xl bg-violet-400 px-7 text-sm font-semibold text-black border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] ring-offset-0 transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9),0_0_30px_rgba(167,139,250,0.5)] focus-visible:border-violet-400/45 focus-visible:ring-violet-400/55 focus-visible:ring-[3px] active:translate-y-[6px] active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]"
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

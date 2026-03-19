"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RotatingText from "./RotatingText";
import ShapeGrid from "./ShapeGrid";
import { ArrowRight, ChevronDown, Play, Sparkles } from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Add Your Product Link",
    description:
      "Paste the URL to your product page. Our AI will automatically scan and extract all your product images, descriptions, logo, and brand colors.",
    mediaSrc: "/steps/step-1.mp4",
  },
  {
    number: "02",
    title: "Choose Your Ad Style",
    description:
      "Select a high-performing template from our preset library. Instantly add an engaging AI avatar, and pick a caption style that fits your campaign.",
    mediaSrc: "/steps/step-2.mp4",
  },
  {
    number: "03",
    title: "Generate Your Video",
    description:
      'Click "Generate" and our Click to Ad Generator assembles your assets, script, and avatar into a high-impact video ad.',
    mediaSrc: "/steps/step-3.mp4",
  },
];

const PRODUCTS = [
  { src: "/carousel/product-1.png", alt: "Roast & Ritual Coffee" },
  { src: "/carousel/product-2.png", alt: "Lumina Radiance Elixir" },
  { src: "/carousel/product-3.png", alt: "Aqua Luxe Bottle" },
  { src: "/carousel/product-4.png", alt: "Aurelion Luminous Serum" },
  { src: "/carousel/product-5.png", alt: "Designer Perfume" },
  { src: "/carousel/product-6.png", alt: "Volcanic Heat Chips" },
  { src: "/carousel/product-7.png", alt: "Pure Serum" },
];

const UGC_SLIDES = [
  { src: "/carousel/slide-1.mp4" },
  { src: "/carousel/slide-2.mp4" },
  { src: "/carousel/slide-3.mp4" },
  { src: "/carousel/slide-4.mp4" },
  { src: "/carousel/slide-5.mp4" },
  { src: "/carousel/slide-6.mp4" },
  { src: "/carousel/slide-7.mp4" },
];

const PAIRED_CAROUSEL_ITEMS = PRODUCTS.map((product, index) => ({
  product,
  slide: UGC_SLIDES[index],
}));

const FAQ_ITEMS = [
  {
    q: "What kind of products work best?",
    a: "Youry works with any e-commerce product — skincare, supplements, fashion, electronics, home goods, and more. If it has a product page, we can turn it into a video ad.",
  },
  {
    q: "Do I need to provide my own video footage?",
    a: "No! Youry generates everything from your product images and page content. Our AI creates the script, selects an avatar, and produces a complete video ad automatically.",
  },
  {
    q: "How long does it take to generate a video?",
    a: "Most videos are ready in under 5 minutes. Simply paste your URL, choose your style, and click generate.",
  },
  {
    q: "Can I customize the generated ads?",
    a: "Absolutely. You can adjust the script, change the avatar, modify the style template, and regenerate as many times as you want.",
  },
  {
    q: "What platforms are the videos optimized for?",
    a: "All videos are generated in 9:16 vertical format, optimized for TikTok, Instagram Reels, YouTube Shorts, and Facebook Stories.",
  },
];

function RevealSlide({
  imageSrc,
  videoSrc,
  imageAlt,
}: {
  imageSrc: string;
  videoSrc: string;
  imageAlt: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    function update() {
      const card = cardRef.current;
      const overlay = videoRef.current;
      if (card && overlay) {
        const rect = card.getBoundingClientRect();
        const viewportCenter = window.innerWidth / 2;
        // % of card to the LEFT of the center line = image. The rest = video.
        const splitPct = Math.max(
          0,
          Math.min(100, ((viewportCenter - rect.left) / rect.width) * 100)
        );
        overlay.style.clipPath = `inset(0 0 0 ${splitPct}%)`;
      }
      rafId = requestAnimationFrame(update);
    }
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      ref={cardRef}
      className="relative shrink-0 overflow-hidden rounded-3xl"
      style={{ width: "min(90vw, 25rem)", aspectRatio: "0.64" }}
    >
      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        className="object-cover"
        sizes="(max-width:768px) 90vw, 400px"
      />
      <div
        ref={videoRef}
        className="absolute inset-0"
        style={{ clipPath: "inset(0 0 0 100%)" }}
      >
        <video
          src={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#050507] text-white selection:bg-violet-500/30">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#050507]/80 backdrop-blur-xl">
        <div className="relative border-b border-white/10 bg-[#0f0f14] px-4 py-1.5 text-center">
          <p className="text-[11px] font-medium text-white/80 sm:text-xs">
            Nano Banana 2 UNLIMITED. Kling 3.0 & Motion Control Available.
            Special 73% OFF
          </p>
          <button
            type="button"
            aria-label="Close announcement"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 transition-colors hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link
            href="/"
            className="flex items-center"
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

          <div className="flex items-center gap-3">
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
              className="rounded-2xl bg-violet-400 px-5 text-black font-semibold border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)]"
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

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-70">
          <ShapeGrid
            speed={0.5}
            squareSize={40}
            direction="diagonal"
            borderColor="#271E37"
            hoverFillColor="#222222"
            shape="square"
            hoverTrailAmount={0}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#050507]/30 via-[#050507]/55 to-[#050507]" />
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-[700px] w-[1000px] rounded-full bg-violet-600/[0.12] blur-[140px]" />

        <div className="relative z-10 mx-auto max-w-4xl px-5 pt-28 pb-24 text-center">
          <h1 className="mx-auto max-w-3xl px-4 sm:px-8 text-3xl font-extrabold tracking-tight leading-[1.12] sm:text-5xl md:text-6xl">
            Turn any product
            <br />
            into realistic
            <br />
            <span className="text-white">AI</span>{" "}
            <RotatingText
              texts={["Ads", "Ugc", "Reels", "Stories"]}
              mainClassName="mx-2 inline-flex bg-violet-500/90 text-black overflow-hidden px-2 sm:px-2 md:px-3 py-1 sm:py-1.5 justify-center rounded-xl shadow-[0_0_22px_rgba(139,92,246,0.35)]"
              staggerFrom={"last"}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-120%" }}
              staggerDuration={0.025}
              splitLevelClassName="overflow-hidden pb-0.5 sm:pb-1"
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              rotationInterval={2000}
            />
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-white/55 sm:text-lg leading-relaxed">
            Paste a product URL and we&apos;ll create a scroll-stopping video ad
            with AI avatars and voiceover in minutes.
          </p>

          <div className="mx-auto mt-10 max-w-xl">
            <p className="mb-3 text-sm text-white/55">
              We analyze your site like a top-tier media buyer, and turn it into
              high-converting ads 👇
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
                className="h-10 shrink-0 rounded-2xl bg-violet-400 px-6 text-sm font-semibold text-black border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)]"
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
      </section>

      {/* ── 3 Steps ── */}
      <section className="mx-auto max-w-6xl px-5 py-24 bg-gradient-to-b from-transparent via-[#0c0a14]/25 to-[#0c0a14]/35">
        <div className="mb-14 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            How it works
          </p>
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
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-600/15 text-violet-400 transition-colors group-hover:bg-violet-600/25">
                    <Play className="h-5 w-5" />
                  </div>
                </div>
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

      {/* ── Carousel: Product → Electric Band → UGC ── */}
      <section className="overflow-hidden -mt-8 pt-24 pb-10 bg-gradient-to-b from-[#0c0a14]/35 via-[#09080f]/20 to-transparent">
        <div className="mx-auto max-w-6xl px-5 mb-14 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            MAKE YOUR PRODUCTS{" "}
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-500 bg-clip-text text-transparent">
              UNSKIPPABLE
            </span>
          </h2>
        </div>

        {/* Scrolling reveal carousel: image → video wipe per card */}
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-16 bg-gradient-to-r from-[#050507] to-transparent sm:w-28" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-16 bg-gradient-to-l from-[#050507] to-transparent sm:w-28" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-[3px] -translate-x-1/2 bg-violet-400/90 shadow-[0_0_14px_4px_rgba(139,92,246,0.95)]" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-14 -translate-x-1/2 bg-gradient-to-r from-transparent via-violet-500/25 to-transparent blur-md" />

          <div
            className="flex animate-marquee-right items-center gap-4 px-4 py-2 md:gap-8"
            style={{ width: "max-content" }}
          >
            {[...PAIRED_CAROUSEL_ITEMS, ...PAIRED_CAROUSEL_ITEMS].map(
              (item, i) => (
                <RevealSlide
                  key={`reveal-${i}`}
                  imageSrc={item.product.src}
                  videoSrc={item.slide.src}
                  imageAlt={item.product.alt}
                />
              )
            )}
          </div>
        </div>
      </section>

      {/* ── CTA text + button ── */}
      <section className="mx-auto max-w-4xl px-5 pt-10 pb-18 text-center">
        <p className="mx-auto max-w-3xl text-lg leading-relaxed text-white/55 sm:text-xl">
          Instantly turn flat product shots into dynamic video ads with AI
          avatars and voiceovers that demand attention and drive sales.
        </p>
        <Button
          asChild
          className="mt-7 h-12 rounded-2xl bg-violet-400 px-8 text-base font-semibold text-black border border-violet-200/40 shadow-[0_7px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_9px_0_0_rgba(76,29,149,0.9)]"
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
            YOUR NEXT AD IS ONE CLICK AWAY
          </h2>
          <p className="relative mx-auto mt-5 max-w-lg text-sm text-white/45 sm:text-base">
            Turn your product page into your next best-performing ad. Right now.
            What are you waiting for?
          </p>
          <Button
            asChild
            className="relative mt-8 h-11 rounded-2xl bg-violet-400 px-7 text-sm font-semibold text-black border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)]"
          >
            <Link href="/signup">
              <Sparkles className="mr-1.5 h-4 w-4" />
              Generate your ad
            </Link>
          </Button>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto max-w-3xl px-5 py-24">
        <div className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015] transition-colors hover:border-white/[0.1]"
            >
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium cursor-pointer"
              >
                <span>{item.q}</span>
                <ChevronDown
                  className={`ml-4 h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${
                    openFaq === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                className={`grid transition-all duration-200 ${
                  openFaq === i
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-4 text-sm leading-relaxed text-white/45">
                    {item.a}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm font-bold tracking-tight text-white/50"
          >
            Youry
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500" />
          </Link>
          <p className="text-xs text-white/25">
            &copy; {new Date().getFullYear()} Youry. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

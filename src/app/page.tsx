"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Play } from "lucide-react";

type CarouselItem = {
  id: number;
  label: string;
  productCaption: string;
  adCaption: string;
};

const CAROUSEL_ITEMS: CarouselItem[] = [
  {
    id: 1,
    label: "Skincare product page → UGC ad",
    productCaption: "We pull your hero product shots and key claims.",
    adCaption: "We turn them into a vertical UGC ad ready for TikTok / Reels.",
  },
  {
    id: 2,
    label: "Supplement product page → Story ad",
    productCaption: "We detect pains, promises and guarantees on your page.",
    adCaption: "We build a short story-driven video script around those angles.",
  },
  {
    id: 3,
    label: "Beauty landing page → Multi-scene ad",
    productCaption: "We map your sections: hero, benefits, social proof.",
    adCaption: "We assemble them into a cinematic multi-shot video ad.",
  },
];

export default function LandingPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = CAROUSEL_ITEMS[activeIndex] ?? CAROUSEL_ITEMS[0];

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-lime-400 text-black text-xs font-bold">
              UGC
            </div>
            <span className="text-white/80">
              Factory<span className="text-white/40">.ai</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-white/50 md:inline">
              Already have an account?
            </span>
            <Button asChild size="sm" variant="secondary">
              <Link href="/auth">
                Go to app
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 md:py-20 space-y-16">
        {/* Hero */}
        <section className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-center">
          <div className="space-y-6">
            <p className="inline-flex items-center rounded-full bg-lime-400/10 px-3 py-1 text-xs font-medium text-lime-300 ring-1 ring-lime-400/40">
              Go from product URL to video ad in one click
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Create Real Winning Ads with AI in few clicks
            </h1>
            <p className="max-w-xl text-sm text-white/70 sm:text-base">
              We analyze your site like a top-tier media buyer — and turn it into high-converting ads.{" "}
              <span className="ml-1 inline-block align-middle">👉</span>
            </p>

            <div className="space-y-2">
              <div className="relative flex items-center gap-2 overflow-hidden rounded-full bg-white/5 px-2 py-1 ring-2 ring-lime-400/70 shadow-[0_0_40px_rgba(190,242,100,0.25)]">
                <Input
                  type="url"
                  placeholder="https://your-product-page.com"
                  className="h-11 flex-1 border-0 bg-transparent px-4 text-sm text-white placeholder:text-white/40 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 shrink-0 rounded-full bg-lime-400 px-4 text-xs font-semibold text-black hover:bg-lime-300"
                >
                  Generate My Ads
                </Button>
              </div>
              <p className="text-xs text-white/50">
                Paste a product URL — we scrape the page, detect angles and assets, and build your ad kit automatically.
              </p>
            </div>

            <div className="grid gap-4 text-xs text-white/60 sm:grid-cols-3">
              <div>
                <p className="font-semibold text-white">Intelligent website analysis</p>
                <p>Extract product images, benefits, promises, guarantees and brand voice from your page.</p>
              </div>
              <div>
                <p className="font-semibold text-white">Angle‑driven scripts</p>
                <p>We turn that analysis into UGC scripts and hooks tailored to your persona.</p>
              </div>
              <div>
                <p className="font-semibold text-white">One‑click video generation</p>
                <p>Send everything to Kling 3.0 / KIE in a few clicks — no editing timeline required.</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-5 shadow-[0_0_80px_rgba(15,23,42,0.9)]">
              <div className="mb-4 flex items-center justify-between text-xs text-white/50">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Live preview
                </span>
                <span className="text-white/40">URL → Ad kit</span>
              </div>
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-lime-300">INTELLIGENT WEBSITE ANALYSIS</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    GO FROM PRODUCT URL TO VIDEO AD IN ONE CLICK
                  </p>
                  <p className="mt-2 text-[11px] text-white/60">
                    We automatically scan your site, pull assets, and build a ready-to-run ad kit in seconds.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-[1.1fr_minmax(0,1fr)]">
                  <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/50">Product</p>
                    <div className="relative h-32 rounded-lg bg-gradient-to-tr from-lime-300/30 via-emerald-400/40 to-sky-500/20" />
                  </div>
                  <div className="rounded-xl border border-lime-400/50 bg-black/70 p-3">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-lime-300">Video ad</p>
                    <div className="relative h-32 overflow-hidden rounded-lg bg-slate-900">
                      <div className="absolute inset-0 bg-gradient-to-tr from-lime-400/40 via-transparent to-emerald-500/30" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <button
                          type="button"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white shadow-lg ring-2 ring-lime-400/70"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-white/60">
                      Angle‑driven UGC script + Kling 3.0 ready settings, generated for you.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Carousel: product → ad */}
        <section className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-lime-300">
                FROM URL TO READY‑TO‑RUN ADS
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                See how your product turns into a video ad
              </h2>
            </div>
            <div className="flex gap-2 text-[11px] text-white/60">
              {CAROUSEL_ITEMS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`rounded-full px-3 py-1 transition ${
                    index === activeIndex
                      ? "bg-lime-400 text-black text-xs font-semibold"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1.1fr)] items-center">
            {/* Product side */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/50">
                PRODUCT INPUT
              </p>
              <p className="mt-1 text-sm font-semibold text-white">Your product page</p>
              <p className="mt-2 text-xs text-white/60">{active.productCaption}</p>
              <div className="mt-4 h-40 rounded-xl border border-dashed border-white/15 bg-gradient-to-tr from-slate-800 to-slate-900" />
            </div>

            {/* Divider */}
            <div className="hidden h-48 w-px bg-gradient-to-b from-transparent via-lime-400 to-transparent md:block" />

            {/* Ad side */}
            <div className="rounded-2xl border border-lime-400/40 bg-black/80 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-lime-300">
                GENERATED AD
              </p>
              <p className="mt-1 text-sm font-semibold text-white">High‑performing UGC video</p>
              <p className="mt-2 text-xs text-white/60">{active.adCaption}</p>
              <div className="mt-4 relative h-40 overflow-hidden rounded-xl bg-slate-900">
                <div className="absolute inset-0 bg-gradient-to-tr from-lime-400/40 via-transparent to-emerald-500/30" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white shadow-lg ring-2 ring-lime-400/70"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-white/60">{active.label}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-16 border-t border-white/10 bg-black/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3 text-sm text-white/70">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/40">
              BUILT FOR PERFORMANCE TEAMS
            </p>
            <p className="text-base font-semibold text-white">
              Turn any product page into a testing‑ready ad kit in minutes.
            </p>
            <p className="text-xs text-white/60">
              URL analysis → angles → image prompt → video prompt → Kling 3.0 settings — all in one streamlined
              workflow.
            </p>
          </div>
          <div className="relative h-32 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900 md:h-36 md:w-80">
            {/* Put your 3rd reference image as /public/lp-footer.png */}
            <Image
              src="/lp-footer.png"
              alt="Example of product-to-video ad workflow"
              fill
              className="object-cover"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}


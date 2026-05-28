import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SiteContactLinks } from "@/app/_components/SiteContactLinks";
import { CLIPPING_TOOLS_PATH } from "@/lib/clippingPaths";

export const metadata: Metadata = {
  title: "Clipping — Create content that converts",
  description:
    "Film hooks, study winning Link to Ad runs, and reverse-engineer pro workflows with Youry clipping.",
  robots: { index: true, follow: true },
};

export default function ClippingLandingPage() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#06050a] via-[#0a0612] to-[#050307] text-white">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#050507]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3">
          <Link
            href="/"
            className="flex shrink-0 items-center outline-none transition-opacity hover:opacity-95"
          >
            <Image
              src="/youry-logo.png"
              alt="Youry"
              width={174}
              height={52}
              className="h-8 w-auto sm:h-9"
              priority
            />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col items-center px-5 pb-16 pt-14 text-center sm:pt-20">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-300/80">
          Clipping
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Clip faster. Study what wins.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-white/55 sm:text-base">
          Template recording, Link to Ad replays, and workflow breakdowns — built for creators who
          ship daily.
        </p>
        <Link
          href={CLIPPING_TOOLS_PATH}
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_28px_rgba(139,92,246,0.25)] transition hover:bg-violet-400"
        >
          Open clipping tools
          <ArrowRight className="size-4 opacity-80" aria-hidden />
        </Link>
      </main>

      <footer className="border-t border-white/[0.06] py-6">
        <div className="mx-auto flex max-w-6xl justify-center px-4">
          <SiteContactLinks />
        </div>
      </footer>
    </div>
  );
}

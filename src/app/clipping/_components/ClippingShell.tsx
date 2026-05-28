"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight, Menu, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CLIPPING_TOOLS_PATH } from "@/lib/clippingPaths";
import {
  clippingBtnPrimarySm,
  clippingEyebrowClassName,
  clippingHeaderClassName,
  clippingNavLinkClassName,
  clippingPageClassName,
} from "@/lib/clippingUi";
import { studioAppPath } from "@/lib/studioAppOrigin";
import { cn } from "@/lib/utils";

export type ClippingNavActive = "program" | "tools";

function ClippingAmbient() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute left-1/2 top-0 h-[min(600px,70vh)] w-[min(900px,120vw)] -translate-x-1/2 rounded-full bg-violet-600/[0.1] blur-[120px]" />
      <div className="absolute bottom-1/4 right-0 h-[360px] w-[360px] rounded-full bg-violet-900/[0.08] blur-[100px]" />
    </div>
  );
}

export function ClippingHeader({ active = "program" }: { active?: ClippingNavActive }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className={clippingHeaderClassName}>
      <div className="mx-auto flex min-w-0 max-w-6xl items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-3.5">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center outline-none transition-opacity hover:opacity-95 focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-violet-400/50"
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

        <nav className="ml-6 hidden items-center gap-8 md:flex" aria-label="Clipping">
          <Link href="/clipping" className={clippingNavLinkClassName(active === "program")}>
            Program
          </Link>
          <Link href={CLIPPING_TOOLS_PATH} className={clippingNavLinkClassName(active === "tools")}>
            Tools
          </Link>
        </nav>

        <div className="ml-auto hidden shrink-0 items-center gap-2 sm:gap-4 md:flex">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-9 px-3 text-xs text-white/70 hover:bg-white/10 hover:text-white sm:h-10 sm:px-5 sm:text-sm"
          >
            <Link href={studioAppPath("/signin")} prefetch={false}>
              Log in
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="h-9 rounded-2xl border border-violet-200/40 bg-violet-400 px-3 text-xs font-semibold text-black shadow-[0_6px_0_0_rgba(76,29,149,0.9)] ring-offset-0 transition-all hover:-translate-y-px hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9),0_0_28px_rgba(167,139,250,0.5)] focus-visible:border-violet-400/45 focus-visible:ring-violet-400/55 focus-visible:ring-[3px] active:translate-y-1.5 active:shadow-[0_0_0_0_rgba(76,29,149,0.9)] sm:h-10 sm:px-6 sm:text-base"
          >
            <Link href="/start/clipping" prefetch={false} className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
              Get started
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            </Link>
          </Button>
        </div>

        <button
          type="button"
          className="ml-auto inline-flex p-2 text-white/90 md:hidden"
          onClick={() => setMobileOpen((o) => !o)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/[0.08] bg-[#050507]/95 px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3" aria-label="Clipping mobile">
            <Link
              href="/clipping"
              className={clippingNavLinkClassName(active === "program")}
              onClick={() => setMobileOpen(false)}
            >
              Program
            </Link>
            <Link
              href={CLIPPING_TOOLS_PATH}
              className={clippingNavLinkClassName(active === "tools")}
              onClick={() => setMobileOpen(false)}
            >
              Tools
            </Link>
            <Link
              href={studioAppPath("/signin")}
              className="rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-center text-sm font-medium text-white/85"
              onClick={() => setMobileOpen(false)}
            >
              Log in
            </Link>
            <Link
              href="/start/clipping"
              className={cn("inline-flex items-center justify-center gap-1.5 text-center", clippingBtnPrimarySm)}
              onClick={() => setMobileOpen(false)}
            >
              <Sparkles className="size-3.5" aria-hidden />
              Get started
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function ClippingPageShell({
  children,
  active = "program",
  className,
  mainClassName,
}: {
  children: ReactNode;
  active?: ClippingNavActive;
  className?: string;
  mainClassName?: string;
}) {
  return (
    <div className={cn(clippingPageClassName, className)}>
      <ClippingAmbient />
      <ClippingHeader active={active} />
      <div className={cn("relative z-10", mainClassName)}>{children}</div>
    </div>
  );
}

export function ClippingSubpage({
  children,
  active = "tools",
  eyebrow,
  title,
  description,
  maxWidth = "max-w-6xl",
}: {
  children: ReactNode;
  active?: ClippingNavActive;
  eyebrow?: string;
  title?: string;
  description?: string;
  maxWidth?: string;
}) {
  return (
    <ClippingPageShell active={active} mainClassName={cn("mx-auto px-4 py-8 sm:px-6 sm:py-10", maxWidth)}>
      {(eyebrow || title || description) && (
        <header className="mb-8 space-y-2">
          {eyebrow ? <p className={clippingEyebrowClassName}>{eyebrow}</p> : null}
          {title ? (
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          ) : null}
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">{description}</p>
          ) : null}
        </header>
      )}
      {children}
    </ClippingPageShell>
  );
}

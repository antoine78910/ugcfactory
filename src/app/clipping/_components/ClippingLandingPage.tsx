"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Calendar,
  DollarSign,
  Layers,
  Menu,
  MessageCircle,
  Palette,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UserPlus,
  Video,
  X,
  Zap,
} from "lucide-react";

import { DiscordIcon } from "@/app/_components/DiscordIcon";
import { DISCORD_INVITE_URL, SiteContactLinks } from "@/app/_components/SiteContactLinks";
import { CLIPPING_TOOLS_PATH } from "@/lib/clippingPaths";
import { studioAppPath } from "@/lib/studioAppOrigin";
import { cn } from "@/lib/utils";

import styles from "../clipping-landing.module.css";

const DELAY_CLASS = [
  "",
  styles.revealDelay1,
  styles.revealDelay2,
  styles.revealDelay3,
  styles.revealDelay4,
  styles.revealDelay5,
] as const;

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: 0 | 1 | 2 | 3 | 4 | 5;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        styles.reveal,
        DELAY_CLASS[delay],
        inView && styles.revealInView,
        className,
      )}
    >
      {children}
    </div>
  );
}

const STEPS = [
  {
    step: "01",
    title: "Onboarding",
    description:
      "Join our Discord community and open Clipping Tools on Youry. Get access to Template 1, Link to Ad replays, and workflow references.",
    icon: Layers,
  },
  {
    step: "02",
    title: "Account creation",
    description:
      "Set up TikTok, Instagram, and YouTube accounts for your niche. Use Youry templates and brand kits to stay consistent.",
    icon: UserPlus,
  },
  {
    step: "03",
    title: "Warm up",
    description:
      "Spend a few days engaging naturally — scroll, like, comment, follow. Start posting once your accounts look active.",
    icon: Zap,
  },
  {
    step: "04",
    title: "Create content",
    description:
      "Record with Clipping Studio (hook + split-screen), study Link to Ad templates, or reverse-engineer pro workflows — no heavy editing required.",
    icon: Video,
  },
  {
    step: "05",
    title: "Grow & earn",
    description:
      "Post consistently, track what hits, and scale winning formats. Top clippers in the program compound views month over month.",
    icon: DollarSign,
  },
] as const;

const TIPS = [
  {
    icon: Calendar,
    title: "Stay consistent",
    description: "Stick to a posting schedule. Consistency beats one-off virality.",
  },
  {
    icon: MessageCircle,
    title: "Engage daily",
    description: "Interact with accounts in your niche — algorithms reward active creators.",
  },
  {
    icon: Palette,
    title: "Style matters",
    description: "A tight visual brand plus consistent hooks raise your viral ceiling.",
  },
  {
    icon: RefreshCw,
    title: "Mix it up",
    description: "Rotate angles and hooks so your audience stays fresh on your feed.",
  },
  {
    icon: Sparkles,
    title: "Use Youry hooks",
    description: "Generate scroll-stopping hooks and captions with Youry before you hit publish.",
  },
  {
    icon: TrendingUp,
    title: "Track results",
    description: "Double down on formats that win; cut what underperforms after a fair test.",
  },
] as const;

const TIERS = [
  {
    label: "Beginner",
    amount: "$500",
    sub: "~1M views / month",
    detail: "30 min/day · 1 account",
    highlight: false,
  },
  {
    label: "Intermediate",
    amount: "$2,500",
    sub: "~5M views / month",
    detail: "30 min/day · 3 accounts",
    highlight: true,
    badge: "Most common",
  },
  {
    label: "Top earner",
    amount: "$10,000+",
    sub: "20M+ views / month",
    detail: "1 hr/day · 5+ accounts",
    highlight: false,
    accent: true,
  },
] as const;

function DiscordCta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={DISCORD_INVITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}

export function ClippingLandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#0a0a0a] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div
          className={cn(
            "absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-[#8b5cf6]/[0.07] blur-[120px]",
            styles.pulseGlow,
          )}
        />
        <div className="absolute bottom-1/4 right-0 h-[400px] w-[400px] rounded-full bg-[#6d28d9]/[0.05] blur-[100px]" />
      </div>

      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex shrink-0 items-center">
              <Image
                src="/youry-logo.png"
                alt="Youry"
                width={174}
                height={52}
                className="h-8 w-auto sm:h-9"
                priority
              />
            </Link>

            <div className="hidden items-center gap-10 md:flex">
              <Link href="/" className="text-sm font-medium text-white/80 transition hover:text-white">
                Home
              </Link>
              <Link
                href={CLIPPING_TOOLS_PATH}
                className="text-sm font-medium text-white/80 transition hover:text-white"
              >
                Clipping tools
              </Link>
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <Link
                href={studioAppPath("/signin")}
                className="min-w-[90px] rounded-lg border border-white/15 px-4 py-2 text-center text-sm font-medium text-white/80 transition hover:border-white/25 hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/start/clipping"
                className="min-w-[90px] rounded-lg bg-white px-4 py-2 text-center text-sm font-medium text-black transition hover:bg-white/90"
              >
                Sign up
              </Link>
              <Link
                href={CLIPPING_TOOLS_PATH}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
              >
                Open tools
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>

            <button
              type="button"
              className="p-2 text-white md:hidden"
              onClick={() => setMobileOpen((o) => !o)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-white/5 bg-[#0a0a0a]/95 px-4 py-4 md:hidden">
            <div className="flex flex-col gap-3">
              <Link href="/" className="text-sm font-medium text-white/80" onClick={() => setMobileOpen(false)}>
                Home
              </Link>
              <Link
                href={CLIPPING_TOOLS_PATH}
                className="text-sm font-medium text-white/80"
                onClick={() => setMobileOpen(false)}
              >
                Clipping tools
              </Link>
              <Link
                href={studioAppPath("/signin")}
                className="rounded-lg border border-white/15 px-4 py-2 text-center text-sm font-medium"
                onClick={() => setMobileOpen(false)}
              >
                Log in
              </Link>
              <Link
                href="/start/clipping"
                className="rounded-lg bg-white px-4 py-2 text-center text-sm font-medium text-black"
                onClick={() => setMobileOpen(false)}
              >
                Sign up
              </Link>
            </div>
          </div>
        ) : null}
      </nav>

      <section className="relative z-10 px-4 pb-12 pt-32 sm:px-6 sm:pb-20 sm:pt-40">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#8b5cf6]/20 bg-[#8b5cf6]/10 px-4 py-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#8b5cf6] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8b5cf6]" />
              </span>
              <span className="text-sm font-medium text-[#c4b5fd]">Clipping program — now open</span>
            </div>
          </Reveal>

          <Reveal delay={1}>
            <h1 className="text-[2.25rem] font-bold leading-[1.05] tracking-tight sm:text-[3.25rem] md:text-[4.25rem]">
              <span className={cn(styles.shimmerText, "whitespace-nowrap")}>Earn money clipping</span>
              <br />
              for Youry
            </h1>
          </Reveal>

          <Reveal delay={2}>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/50 sm:text-lg md:text-xl">
              Join the Youry clipping program. Create faceless short-form content, grow your accounts,
              and build predictable income — in as little as{" "}
              <span className="font-medium text-white">30 minutes a day</span>.
            </p>
          </Reveal>

          <Reveal delay={3} className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <DiscordCta className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#8b5cf6] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#8b5cf6]/25 transition-all hover:scale-105 hover:bg-[#7c3aed] active:scale-100">
              Join the program
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </DiscordCta>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-8 py-4 text-base font-medium text-white/70 transition-all hover:border-white/20 hover:text-white"
            >
              See how it works
            </a>
          </Reveal>

          <Reveal delay={4} className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-10">
            <p className="text-sm text-white/60">
              <span className="font-semibold text-white">10,000+</span> clippers worldwide
            </p>
            <div className="hidden h-6 w-px bg-white/10 sm:block" aria-hidden />
            <div className="flex items-center gap-1.5">
              <span className="text-yellow-400" aria-hidden>
                ★★★★★
              </span>
              <span className="text-sm text-white/60">Rated by our community</span>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative z-10 px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <div className="grid grid-cols-3 gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 sm:gap-8 sm:rounded-3xl sm:p-10">
              <div className="text-center">
                <div className="text-2xl font-bold text-white sm:text-4xl md:text-5xl">$500</div>
                <p className="mt-1.5 text-xs text-white/40 sm:text-sm">per 1M views</p>
              </div>
              <div className="border-x border-white/[0.06] text-center">
                <div className="text-2xl font-bold text-white sm:text-4xl md:text-5xl">10K+</div>
                <p className="mt-1.5 text-xs text-white/40 sm:text-sm">active clippers</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[#c4b5fd] sm:text-4xl md:text-5xl">$10K+</div>
                <p className="mt-1.5 text-xs text-white/40 sm:text-sm">top monthly earner</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="how-it-works" className="relative z-10 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-14 text-center sm:mb-20">
            <Reveal>
              <span className="mb-6 inline-block rounded-full border border-[#8b5cf6]/20 bg-[#8b5cf6]/5 px-5 py-2 text-sm font-semibold uppercase tracking-wider text-[#c4b5fd]">
                How it works
              </span>
            </Reveal>
            <Reveal delay={1}>
              <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl">5 steps to start earning</h2>
            </Reveal>
            <Reveal delay={2}>
              <p className="mx-auto mt-4 max-w-xl text-base text-white/40 sm:text-lg">
                From zero to your first payout — follow this proven system with Youry
              </p>
            </Reveal>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
            {STEPS.map((item, i) => {
              const Icon = item.icon;
              return (
                <Reveal key={item.step} delay={Math.min(i + 1, 5) as 1 | 2 | 3 | 4 | 5}>
                  <div className={cn(styles.stepCard, "rounded-2xl p-6 sm:p-8")}>
                    <div className="flex items-start gap-5">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#8b5cf6]/20 bg-[#8b5cf6]/10 text-[#a78bfa]">
                        <Icon className="size-6" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs tracking-wider text-[#8b5cf6]/50">
                          STEP {item.step}
                        </span>
                        <h3 className="mb-2 mt-1 text-lg font-semibold text-white sm:text-xl">
                          {item.title}
                        </h3>
                        <p className="text-sm leading-relaxed text-white/40 sm:text-[15px]">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal className="mt-8 text-center">
            <Link
              href={CLIPPING_TOOLS_PATH}
              className="inline-flex items-center gap-2 text-sm font-medium text-violet-300/90 transition hover:text-violet-200"
            >
              Open clipping tools
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="relative z-10 px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <div
              className="relative overflow-hidden rounded-3xl p-8 sm:p-14"
              style={{
                background:
                  "linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(109, 40, 217, 0.08) 50%, rgba(139, 92, 246, 0.12) 100%)",
                border: "1px solid rgba(139, 92, 246, 0.15)",
              }}
            >
              <div className={cn("absolute inset-0", styles.ctaPattern)} aria-hidden />
              <div className="relative z-10 text-center">
                <h3 className="mb-4 text-2xl font-bold sm:text-3xl md:text-4xl">Ready to start earning?</h3>
                <p className="mx-auto mb-8 max-w-lg text-base text-white/50 sm:text-lg">
                  Join Discord, explore{" "}
                  <Link href={CLIPPING_TOOLS_PATH} className="text-violet-300/90 hover:text-violet-200">
                    clipping tools
                  </Link>
                  , and post your first clip today.
                </p>
                <DiscordCta className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#8b5cf6] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#8b5cf6]/25 transition-all hover:scale-105 hover:bg-[#7c3aed] active:scale-100">
                  <DiscordIcon className="size-5" />
                  Join Discord
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </DiscordCta>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative z-10 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center sm:mb-16">
            <Reveal>
              <span className="mb-6 inline-block rounded-full border border-[#8b5cf6]/20 bg-[#8b5cf6]/5 px-5 py-2 text-sm font-semibold uppercase tracking-wider text-[#c4b5fd]">
                Pro tips
              </span>
            </Reveal>
            <Reveal delay={1}>
              <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl">Tips for success</h2>
            </Reveal>
            <Reveal delay={2}>
              <p className="mx-auto mt-4 max-w-xl text-base text-white/40 sm:text-lg">
                Maximize views, engagement, and earnings with these strategies
              </p>
            </Reveal>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TIPS.map((tip, i) => {
              const Icon = tip.icon;
              return (
                <Reveal key={tip.title} delay={Math.min(i + 1, 5) as 1 | 2 | 3 | 4 | 5}>
                  <div className={cn(styles.tipCard, "rounded-2xl p-6")}>
                    <Icon className="mb-3 size-6 text-violet-300/80" aria-hidden />
                    <h3 className="mb-1.5 text-base font-semibold text-white">{tip.title}</h3>
                    <p className="text-sm leading-relaxed text-white/40">{tip.description}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center sm:mb-16">
            <Reveal>
              <span className="mb-6 inline-block rounded-full border border-[#8b5cf6]/20 bg-[#8b5cf6]/5 px-5 py-2 text-sm font-semibold uppercase tracking-wider text-[#c4b5fd]">
                Earning potential
              </span>
            </Reveal>
            <Reveal delay={1}>
              <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl">What you can earn</h2>
            </Reveal>
          </div>

          <Reveal delay={2}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
              {TIERS.map((tier) => (
                <div
                  key={tier.label}
                  className={cn(
                    "relative rounded-2xl p-6 text-center sm:p-8",
                    tier.highlight
                      ? "border border-[#8b5cf6]/25"
                      : "border border-white/[0.06] bg-white/[0.02]",
                  )}
                  style={
                    tier.highlight
                      ? {
                          background:
                            "linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(139, 92, 246, 0.04) 100%)",
                        }
                      : undefined
                  }
                >
                  {tier.highlight && "badge" in tier ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#8b5cf6] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">
                      {tier.badge}
                    </div>
                  ) : null}
                  <p
                    className={cn(
                      "mb-2 text-sm",
                      tier.highlight ? "text-[#c4b5fd]" : "text-white/40",
                    )}
                  >
                    {tier.label}
                  </p>
                  <p
                    className={cn(
                      "text-3xl font-bold sm:text-4xl",
                      "accent" in tier && tier.accent ? "text-[#c4b5fd]" : "text-white",
                    )}
                  >
                    {tier.amount}
                  </p>
                  <p className="mt-2 text-xs text-white/30">{tier.sub}</p>
                  <div
                    className={cn(
                      "mt-4 border-t pt-4",
                      tier.highlight ? "border-[#8b5cf6]/15" : "border-white/[0.06]",
                    )}
                  >
                    <p className="text-xs text-white/40">{tier.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative z-10 px-4 py-20 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold leading-tight sm:text-4xl md:text-5xl lg:text-6xl">
              Start earning with
              <br />
              <span className={styles.shimmerText}>Youry today</span>
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-base text-white/40 sm:text-lg">
              Join thousands of clippers using Youry to ship faster. Your next winning clip could be
              one session away.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <DiscordCta className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#8b5cf6] px-10 py-5 text-lg font-semibold text-white shadow-lg shadow-[#8b5cf6]/25 transition-all hover:scale-105 hover:bg-[#7c3aed] active:scale-100">
                <DiscordIcon className="size-5" />
                Join the program
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </DiscordCta>
              <Link
                href={CLIPPING_TOOLS_PATH}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-8 py-5 text-base font-medium text-white/70 transition hover:border-white/20 hover:text-white"
              >
                Open clipping tools
              </Link>
            </div>
            <p className="mt-6 text-sm text-white/25">
              Free to join · No experience needed · Get started in 5 minutes
            </p>
          </Reveal>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/5 px-4 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <Image src="/youry-logo.png" alt="Youry" width={120} height={36} className="h-7 w-auto opacity-80" />
          <p className="text-sm text-white/25">© {new Date().getFullYear()} Youry. All rights reserved.</p>
          <SiteContactLinks />
        </div>
      </footer>
    </main>
  );
}

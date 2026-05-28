"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Calendar,
  DollarSign,
  Layers,
  MessageCircle,
  Palette,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UserPlus,
  Video,
  Zap,
} from "lucide-react";

import { DiscordIcon } from "@/app/_components/DiscordIcon";
import { DISCORD_INVITE_URL, SiteContactLinks } from "@/app/_components/SiteContactLinks";
import { CLIPPING_TOOLS_PATH } from "@/lib/clippingPaths";
import {
  clippingBadgeClassName,
  clippingBtnOutline,
  clippingBtnPrimary,
  clippingCardClassName,
  clippingEyebrowClassName,
  clippingSectionTitle,
} from "@/lib/clippingUi";
import { cn } from "@/lib/utils";

import { ClippingPageShell } from "./ClippingShell";
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
  return (
    <ClippingPageShell active="program">
      <main>
      <section className="relative px-4 pb-12 pt-10 sm:px-6 sm:pb-20 sm:pt-16">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal>
            <div className={cn("mb-8 inline-flex items-center gap-2 px-4 py-2", clippingBadgeClassName)}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
              </span>
              <span className="normal-case tracking-normal text-sm font-medium text-violet-200/95">
                Clipping program — now open
              </span>
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
            <DiscordCta className={cn("group px-8 py-4 text-base", clippingBtnPrimary)}>
              Join the program
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </DiscordCta>
            <a href="#how-it-works" className={cn("px-8 py-4 text-base", clippingBtnOutline)}>
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
            <div className={cn("grid grid-cols-3 gap-4 p-6 sm:gap-8 sm:rounded-3xl sm:p-10", clippingCardClassName)}>
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
              <span className={cn("mb-6 inline-block px-5 py-2", clippingEyebrowClassName)}>How it works</span>
            </Reveal>
            <Reveal delay={1}>
              <h2 className={clippingSectionTitle()}>5 steps to start earning</h2>
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
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/10 text-violet-300">
                        <Icon className="size-6" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs tracking-wider text-violet-400/50">
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
              className={cn(
                "relative overflow-hidden rounded-3xl border border-violet-500/20 bg-violet-500/[0.06] p-8 sm:p-14",
                clippingCardClassName,
              )}
            >
              <div className="relative z-10 text-center">
                <h3 className="mb-4 text-2xl font-bold sm:text-3xl md:text-4xl">Ready to start earning?</h3>
                <p className="mx-auto mb-8 max-w-lg text-base text-white/50 sm:text-lg">
                  Join Discord, explore{" "}
                  <Link href={CLIPPING_TOOLS_PATH} className="text-violet-300/90 hover:text-violet-200">
                    clipping tools
                  </Link>
                  , and post your first clip today.
                </p>
                <DiscordCta className={cn("group px-8 py-4 text-base", clippingBtnPrimary)}>
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
              <span className={cn("mb-6 inline-block px-5 py-2", clippingEyebrowClassName)}>Pro tips</span>
            </Reveal>
            <Reveal delay={1}>
              <h2 className={clippingSectionTitle()}>Tips for success</h2>
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
              <span className={cn("mb-6 inline-block px-5 py-2", clippingEyebrowClassName)}>
                Earning potential
              </span>
            </Reveal>
            <Reveal delay={1}>
              <h2 className={clippingSectionTitle()}>What you can earn</h2>
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
                      ? "border border-violet-500/25 bg-violet-500/[0.06]"
                      : cn(clippingCardClassName, "bg-white/[0.02]"),
                  )}
                >
                  {tier.highlight && "badge" in tier ? (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-black">
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
            <h2 className={cn(clippingSectionTitle(), "leading-tight lg:text-6xl")}>
              Start earning with
              <br />
              <span className={styles.shimmerText}>Youry today</span>
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-base text-white/40 sm:text-lg">
              Join thousands of clippers using Youry to ship faster. Your next winning clip could be
              one session away.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <DiscordCta className={cn("group px-10 py-5 text-lg", clippingBtnPrimary)}>
                <DiscordIcon className="size-5" />
                Join the program
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </DiscordCta>
              <Link href={CLIPPING_TOOLS_PATH} className={cn("px-8 py-5 text-base", clippingBtnOutline)}>
                Open clipping tools
              </Link>
            </div>
            <p className="mt-6 text-sm text-white/25">
              Free to join · No experience needed · Get started in 5 minutes
            </p>
          </Reveal>
        </div>
      </section>

      <footer className="relative border-t border-white/[0.08] px-4 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <Image src="/youry-logo.png" alt="Youry" width={120} height={36} className="h-7 w-auto opacity-80" />
          <p className="text-sm text-white/30">© {new Date().getFullYear()} Youry. All rights reserved.</p>
          <SiteContactLinks />
        </div>
      </footer>
      </main>
    </ClippingPageShell>
  );
}

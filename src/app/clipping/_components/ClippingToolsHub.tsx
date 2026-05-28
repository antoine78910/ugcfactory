"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Clapperboard, GitBranch, Link2 } from "lucide-react";

import { SiteContactLinks } from "@/app/_components/SiteContactLinks";
import { CLIPPING_TOOLS_PATH } from "@/lib/clippingPaths";
import {
  clippingBadgeClassName,
  clippingBtnOutlineSm,
  clippingBtnPrimarySm,
  clippingCardClassName,
  clippingEyebrowClassName,
} from "@/lib/clippingUi";
import { studioAppPath, studioBrowserApiUrl } from "@/lib/studioAppOrigin";
import { cn } from "@/lib/utils";

import { ClippingPageShell } from "./ClippingShell";

const ClippingLinkToAdSignupDialog = dynamic(
  () =>
    import("./ClippingLinkToAdSignupDialog").then((m) => m.ClippingLinkToAdSignupDialog),
  { ssr: false },
);

function TemplateOneDiagram() {
  return (
    <div
      className="relative mx-auto aspect-[9/14] w-full max-w-[140px] overflow-hidden rounded-xl border border-violet-400/25 bg-black/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
      aria-hidden
    >
      <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-violet-500/20 to-black/40">
        <div className="absolute left-1/2 top-[38%] h-7 w-7 -translate-x-1/2 rounded-full border border-white/20 bg-white/10" />
        <span className="absolute left-2 top-2 rounded bg-violet-500/80 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-black">
          Hook
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[58%] border-t border-white/10 bg-gradient-to-t from-emerald-500/10 to-black/30">
        <div className="absolute inset-2 rounded-md border border-dashed border-white/15 bg-white/[0.04]" />
        <span className="absolute bottom-2 left-2 rounded bg-white/10 px-1.5 py-0.5 text-[8px] font-semibold text-white/80">
          Template
        </span>
      </div>
      <div className="absolute left-1/2 top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-violet-500 text-[9px] font-bold text-black shadow-lg">
        1
      </div>
    </div>
  );
}

function LinkToAdDiagram() {
  return (
    <div className="relative mx-auto w-full max-w-[180px]" aria-hidden>
      <div className="flex items-center gap-1.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-400/30 bg-violet-500/10">
          <Link2 className="h-3.5 w-3.5 text-violet-300" />
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-violet-400/50 to-transparent" />
        <div className="h-12 w-10 shrink-0 overflow-hidden rounded-md border border-white/15 bg-white/[0.06]">
          <div className="h-1/2 bg-white/10" />
          <div className="h-1/2 bg-white/[0.04]" />
        </div>
      </div>
      <div className="mx-auto my-2 h-4 w-px bg-white/15" />
      <div className="space-y-1.5 rounded-lg border border-white/[0.08] bg-black/30 p-2">
        {["Product", "Angles", "Scripts"].map((step, i) => (
          <div
            key={step}
            className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-500/25 text-[8px] font-bold text-violet-200">
              {i + 1}
            </span>
            <span className="text-[9px] font-medium text-white/75">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowDiagram() {
  const nodes = [
    { x: "left-[8%] top-[18%]", label: "Ref" },
    { x: "left-[38%] top-[8%]", label: "Prompt" },
    { x: "left-[68%] top-[22%]", label: "Gen" },
    { x: "left-[28%] top-[58%]", label: "Edit" },
    { x: "left-[62%] top-[62%]", label: "Export" },
  ];
  return (
    <div
      className="relative mx-auto aspect-[4/3] w-full max-w-[180px] overflow-hidden rounded-xl border border-violet-400/20 bg-black/40"
      aria-hidden
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 180 120">
        <path
          d="M 24 32 L 72 18 L 120 38 M 72 18 L 54 72 M 120 38 L 108 78"
          fill="none"
          stroke="rgba(167,139,250,0.35)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      </svg>
      {nodes.map((n) => (
        <div
          key={n.label}
          className={`absolute ${n.x} flex h-7 min-w-[2.25rem] items-center justify-center rounded-md border border-violet-400/25 bg-violet-500/15 px-1 text-[8px] font-semibold text-violet-100`}
        >
          {n.label}
        </div>
      ))}
      <div className="absolute bottom-1.5 right-1.5 rounded bg-emerald-500/20 px-1 py-0.5 text-[7px] font-bold uppercase tracking-wide text-emerald-200">
        ↓ media
      </div>
    </div>
  );
}

const TOOLS = [
  {
    id: "template-1",
    badge: "Film",
    badgeClass: clippingBadgeClassName,
    accent: "from-violet-600/15 via-violet-500/5 to-transparent",
    icon: Clapperboard,
    title: "Template 1",
    tagline: "One take. Hook + split-screen. Auto export.",
    description:
      "Record your hook on webcam, react on top of a proven template video, and ship a ready-to-post clip in minutes.",
    steps: ["Webcam hook", "Split-screen react", "Merged export"],
    href: `${CLIPPING_TOOLS_PATH}/template-1`,
    cta: "Start recording",
    ctaPrimary: true,
    diagram: TemplateOneDiagram,
    requiresAuth: false,
  },
  {
    id: "link-to-ad",
    badge: "Study",
    badgeClass: clippingBadgeClassName,
    accent: "from-violet-600/15 via-violet-500/5 to-transparent",
    icon: Link2,
    title: "Link to Ad",
    tagline: "Replay winning ad setups step by step.",
    description:
      "Open published Link to Ad templates from My Projects and follow the exact flow — products, angles, and scripts — without guessing.",
    steps: ["Pick a brand", "Walk the pipeline", "Mirror on camera"],
    cta: "Browse templates",
    ctaPrimary: false,
    diagram: LinkToAdDiagram,
    requiresAuth: true,
  },
  {
    id: "workflow",
    badge: "Learn",
    badgeClass: cn(clippingBadgeClassName, "border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-200/95"),
    accent: "from-fuchsia-600/15 via-fuchsia-500/5 to-transparent",
    icon: GitBranch,
    title: "Workflow",
    tagline: "See how the pros built it. Download assets.",
    description:
      "Explore read-only workflow templates, understand each generation step, and grab reference images or videos to recreate the style.",
    steps: ["View the graph", "Read each step", "Download media"],
    href: `${CLIPPING_TOOLS_PATH}/workflow`,
    cta: "Open workflows",
    ctaPrimary: false,
    diagram: WorkflowDiagram,
    requiresAuth: false,
  },
] as const;

async function fetchHasStudioSession(): Promise<boolean> {
  try {
    const res = await fetch(studioBrowserApiUrl("/api/me/subscription"), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function ClippingToolsHub() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ltaSignupOpen, setLtaSignupOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (searchParams.get("linkToAd") === "signup") {
      setLtaSignupOpen(true);
    }
  }, [searchParams]);

  const openLinkToAdSignup = useCallback(() => {
    setLtaSignupOpen(true);
  }, []);

  const onLinkToAdClick = useCallback(() => {
    void (async () => {
      const signedIn = await fetchHasStudioSession();
      if (signedIn) {
        router.push(studioAppPath("/link-to-ad"));
        return;
      }
      openLinkToAdSignup();
    })();
  }, [openLinkToAdSignup, router]);

  return (
    <>
      <ClippingPageShell active="tools" mainClassName="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mx-auto mb-10 max-w-2xl space-y-4 text-center">
          <p className={clippingEyebrowClassName}>Clipping studio</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Three ways to create content that converts
          </h1>
          <p className="text-sm leading-relaxed text-white/55 sm:text-base">
            Film fast with Template 1, study proven Link to Ad runs, or reverse-engineer full
            workflows — everything you need to clip with confidence.
          </p>
        </header>

        <section className="grid gap-5 lg:grid-cols-3">
          {TOOLS.map((tool) => {
            const Diagram = tool.diagram;
            const Icon = tool.icon;
            const ctaClassName = tool.ctaPrimary ? clippingBtnPrimarySm : clippingBtnOutlineSm;

            return (
              <article
                key={tool.title}
                className={cn("group flex flex-col overflow-hidden p-0", clippingCardClassName)}
              >
                <div
                  className={`relative flex min-h-[168px] items-center justify-center bg-gradient-to-b ${tool.accent} px-4 py-6`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.05),transparent_60%)]" />
                  <Diagram />
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className={tool.badgeClass}>{tool.badge}</span>
                    <Icon className="h-3.5 w-3.5 text-white/35" aria-hidden />
                  </div>

                  <h2 className="text-lg font-semibold tracking-tight text-white">{tool.title}</h2>
                  <p className="mt-1 text-xs font-medium text-white/45">{tool.tagline}</p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-white/60">
                    {tool.description}
                  </p>

                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {tool.steps.map((step) => (
                      <li
                        key={step}
                        className="rounded-md border border-white/[0.08] bg-black/25 px-2 py-1 text-[10px] font-medium text-white/50"
                      >
                        {step}
                      </li>
                    ))}
                  </ul>

                  {tool.requiresAuth ? (
                    <button type="button" onClick={onLinkToAdClick} className={cn("mt-5 w-full", ctaClassName)}>
                      {tool.cta}
                      <ArrowRight className="h-3.5 w-3.5 opacity-70 transition group-hover:translate-x-0.5" />
                    </button>
                  ) : (
                    <Link href={tool.href} className={cn("mt-5 w-full", ctaClassName)}>
                      {tool.cta}
                      <ArrowRight className="h-3.5 w-3.5 opacity-70 transition group-hover:translate-x-0.5" />
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <p className="mt-10 text-center text-xs text-white/40">
          New here?{" "}
          <button
            type="button"
            onClick={openLinkToAdSignup}
            className="font-medium text-violet-300/90 underline-offset-2 hover:text-violet-200 hover:underline"
          >
            Start for free
          </button>{" "}
          to get Link to Ad template access.
        </p>

        <footer className="mt-12 border-t border-white/[0.08] pt-6">
          <div className="flex justify-center">
            <SiteContactLinks />
          </div>
        </footer>
      </ClippingPageShell>

      {mounted ? (
        <ClippingLinkToAdSignupDialog
          open={ltaSignupOpen}
          onClose={() => setLtaSignupOpen(false)}
        />
      ) : null}
    </>
  );
}

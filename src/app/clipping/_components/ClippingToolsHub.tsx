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

const CLIPPING_TOOL_VIDEOS = {
  template1: "/clipping/tools/template-1.mp4",
  linkToAd: "/clipping/tools/link-to-ad.mp4",
  workflow: "/clipping/tools/workflow.mp4",
} as const;

function ToolPreviewVideo({ src, label }: { src: string; label: string }) {
  return (
    <div className="relative mx-auto w-full max-w-[220px] overflow-hidden rounded-xl border border-white/[0.08] bg-black/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(139,92,246,0.18),transparent_60%)]" />
      <video
        key={src}
        src={src}
        className="relative aspect-[9/16] w-full object-cover"
        muted
        playsInline
        loop
        autoPlay
        preload="metadata"
        aria-label={label}
      />
    </div>
  );
}

const TOOLS = [
  {
    id: "template-1",
    accent: "from-violet-600/15 via-violet-500/5 to-transparent",
    icon: Clapperboard,
    title: "Template 1",
    tagline: "One take, hook, split-screen, auto export.",
    description:
      "Record your hook on webcam, react on top of a proven template video, ship a ready to post clip in minutes.",
    href: `${CLIPPING_TOOLS_PATH}/template-1`,
    cta: "Start recording",
    videoSrc: CLIPPING_TOOL_VIDEOS.template1,
    requiresAuth: false,
  },
  {
    id: "link-to-ad",
    accent: "from-violet-600/15 via-violet-500/5 to-transparent",
    icon: Link2,
    title: "Link to Ad",
    tagline: "Replay winning ad setups, step by step.",
    description:
      "Open published Link to Ad templates and follow the exact flow.",
    cta: "Browse templates",
    videoSrc: CLIPPING_TOOL_VIDEOS.linkToAd,
    requiresAuth: true,
  },
  {
    id: "workflow",
    accent: "from-fuchsia-600/15 via-fuchsia-500/5 to-transparent",
    icon: GitBranch,
    title: "Workflow",
    tagline: "Record winning workflow",
    description:
      "Record ready workflow templates from various topics, clone avatar, ecom brand static workflows, and more, to generate views for the product.",
    href: `${CLIPPING_TOOLS_PATH}/workflow`,
    cta: "Open workflows",
    videoSrc: CLIPPING_TOOL_VIDEOS.workflow,
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
            Record fast with Template 1, replay proven Link to Ad runs, record winning workflows, everything you need to clip with confidence.
          </p>
        </header>

        <section className="grid gap-5 lg:grid-cols-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const ctaClassName = clippingBtnPrimarySm;

            return (
              <article
                key={tool.title}
                className={cn("group flex flex-col overflow-hidden p-0", clippingCardClassName)}
              >
                <div
                  className={`relative flex min-h-[168px] items-center justify-center bg-gradient-to-b ${tool.accent} px-4 py-6`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.05),transparent_60%)]" />
                  <ToolPreviewVideo src={tool.videoSrc} label={`${tool.title} preview`} />
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-white/35" aria-hidden />
                  </div>

                  <h2 className="text-lg font-semibold tracking-tight text-white">{tool.title}</h2>
                  <p className="mt-1 text-xs font-medium text-white/45">{tool.tagline}</p>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-white/60">
                    {tool.description}
                  </p>

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

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Clapperboard, GitBranch, Link2, Maximize2, X } from "lucide-react";

import { SiteContactLinks } from "@/app/_components/SiteContactLinks";
import { CLIPPING_TOOLS_PATH } from "@/lib/clippingPaths";
import {
  clippingCardClassName,
  clippingEyebrowClassName,
  clippingStudioBtnPrimary,
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

type ToolFullscreenPreview = { src: string; label: string } | null;

function ToolFullscreenPlayer({
  preview,
  onClose,
}: {
  preview: ToolFullscreenPreview;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, preview]);

  if (!preview || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex flex-col items-center justify-center bg-black/92 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Tool video fullscreen preview"
      onClick={onClose}
    >
      <div className="absolute left-4 right-16 top-4 z-10">
        <p className="truncate text-sm font-semibold text-white">{preview.label}</p>
        <p className="mt-0.5 text-[11px] text-white/50">Hover previews are muted, fullscreen has controls</p>
      </div>
      <button
        type="button"
        className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-lg transition hover:bg-black/85"
        title="Close preview"
        aria-label="Close preview"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <video
        key={preview.src}
        src={preview.src}
        className="max-h-[82vh] w-full max-w-[min(96vw,520px)] object-contain"
        controls
        autoPlay
        playsInline
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

function ToolPreviewVideo({
  src,
  label,
  onFullscreen,
}: {
  src: string;
  label: string;
  onFullscreen: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const stop = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.pause();
      v.currentTime = 0;
    } catch {
      /* ignore */
    }
  }, []);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.currentTime = 0;
      v.muted = true;
      void v.play();
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div
      className="relative mx-auto aspect-[9/16] h-full max-h-full w-auto max-w-[min(82%,280px)] overflow-hidden rounded-lg border border-white/[0.08] bg-black/40 shadow-[0_16px_40px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(255,255,255,0.06)]"
      onPointerEnter={play}
      onPointerLeave={stop}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(139,92,246,0.18),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-12 bg-gradient-to-b from-transparent to-black/55" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onFullscreen();
        }}
        className="absolute right-1.5 top-1.5 z-[3] inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/90 opacity-0 backdrop-blur-sm transition hover:bg-black/70 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="Open fullscreen preview"
        title="Fullscreen"
      >
        <Maximize2 className="h-4 w-4" aria-hidden />
      </button>
      <video
        src={src}
        ref={videoRef}
        className="relative h-full w-full object-cover"
        muted
        playsInline
        loop
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
  const [fullscreenPreview, setFullscreenPreview] = useState<ToolFullscreenPreview>(null);

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
      <ClippingPageShell
        active="tools"
        mainClassName="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-6xl flex-col px-3 py-3 sm:px-4 sm:py-4"
      >
        <header className="mb-3 shrink-0 text-center">
          <p className={cn(clippingEyebrowClassName, "text-[10px]")}>Clipping studio</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            Three ways to create content that converts
          </h1>
        </header>

        <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3 lg:items-stretch lg:content-start">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const ctaClassName = cn(clippingStudioBtnPrimary, "w-full");

            return (
              <article
                key={tool.title}
                className={cn(
                  "group flex h-full min-h-0 flex-col overflow-hidden p-0 shadow-[0_24px_80px_rgba(0,0,0,0.35)]",
                  clippingCardClassName,
                )}
              >
                <div
                  className={`relative flex min-h-[min(42vh,300px)] flex-1 items-center justify-center bg-gradient-to-b px-2 py-2 sm:px-3 ${tool.accent}`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.05),transparent_60%)]" />
                  <ToolPreviewVideo
                    src={tool.videoSrc}
                    label={`${tool.title} preview`}
                    onFullscreen={() =>
                      setFullscreenPreview({ src: tool.videoSrc, label: `${tool.title} preview` })
                    }
                  />
                </div>

                <div className="flex shrink-0 flex-col px-3 pb-2 pt-2 sm:px-3.5">
                  <div className="mb-1 flex items-center gap-2">
                    <Icon className="h-3 w-3 text-white/35" aria-hidden />
                    <h2 className="text-sm font-semibold tracking-tight text-white sm:text-base">
                      {tool.title}
                    </h2>
                  </div>
                  <p className="text-[11px] font-medium leading-snug text-white/45">{tool.tagline}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/55 sm:text-xs">
                    {tool.description}
                  </p>

                  {tool.requiresAuth ? (
                    <button
                      type="button"
                      onClick={onLinkToAdClick}
                      className={cn("mt-2 w-full shrink-0", ctaClassName)}
                    >
                      {tool.cta}
                      <ArrowRight className="h-3.5 w-3.5 opacity-70 transition group-hover:translate-x-0.5" />
                    </button>
                  ) : (
                    <Link href={tool.href} className={cn("mt-2 w-full shrink-0", ctaClassName)}>
                      {tool.cta}
                      <ArrowRight className="h-3.5 w-3.5 opacity-70 transition group-hover:translate-x-0.5" />
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <p className="mt-2 shrink-0 text-center text-[10px] text-white/40">
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

        <footer className="mt-2 shrink-0 border-t border-white/[0.08] pt-2">
          <div className="flex justify-center">
            <SiteContactLinks />
          </div>
        </footer>
      </ClippingPageShell>

      <ToolFullscreenPlayer preview={fullscreenPreview} onClose={() => setFullscreenPreview(null)} />

      {mounted ? (
        <ClippingLinkToAdSignupDialog
          open={ltaSignupOpen}
          onClose={() => setLtaSignupOpen(false)}
        />
      ) : null}
    </>
  );
}

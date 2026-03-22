"use client";

import type { ReactNode } from "react";
import { Clapperboard, ImageIcon, Sparkles, Video } from "lucide-react";

type StudioEmptyVariant = "image" | "video" | "motion";

const VARIANTS: Record<
  StudioEmptyVariant,
  { title: string; subtitle: string; examples: { icon: typeof ImageIcon; label: string; hint: string }[] }
> = {
  image: {
    title: "Your images will show here",
    subtitle: "Set your prompt and options on the left, then hit Generate.",
    examples: [
      { icon: ImageIcon, label: "Product shots", hint: "Clean backgrounds, brand-ready frames" },
      { icon: Sparkles, label: "Creative scenes", hint: "Nano Banana & Pro styles" },
      { icon: ImageIcon, label: "With references", hint: "Upload refs to match look & pose" },
    ],
  },
  video: {
    title: "Your videos will show here",
    subtitle: "Pick a model, frames and prompt on the left — outputs stack on this side.",
    examples: [
      { icon: Video, label: "Kling & Seedance", hint: "Text or image-to-video workflows" },
      { icon: Sparkles, label: "Veo 3", hint: "Optional start / end frames" },
      { icon: Clapperboard, label: "9:16 UGC", hint: "Ideal for social vertical formats" },
    ],
  },
  motion: {
    title: "Motion control output",
    subtitle: "Add a reference clip + character on the left — the generated video appears here.",
    examples: [
      { icon: Video, label: "Drive motion from video", hint: "Copy movement onto your character" },
      { icon: ImageIcon, label: "Character image", hint: "Clear face & body for best match" },
      { icon: Sparkles, label: "Kling 3.0 MC", hint: "Model & quality from the left panel" },
    ],
  },
};

export function StudioEmptyExamples({ variant }: { variant: StudioEmptyVariant }) {
  const v = VARIANTS[variant];
  return (
    <div className="flex h-full min-h-[280px] flex-col justify-center gap-6 py-4">
      <div className="text-center lg:text-left">
        <p className="text-sm font-semibold text-white/90">{v.title}</p>
        <p className="mt-1 text-xs text-white/45">{v.subtitle}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {v.examples.map((ex) => {
          const Icon = ex.icon;
          return (
            <div
              key={ex.label}
              className="rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/[0.08] to-transparent p-4 text-left"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-400/25 bg-violet-500/15 text-violet-200">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-3 text-xs font-semibold text-white/85">{ex.label}</p>
              <p className="mt-1 text-[11px] leading-snug text-white/45">{ex.hint}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StudioOutputPane({
  title,
  hasOutput,
  output,
  empty,
}: {
  title: string;
  hasOutput: boolean;
  output: ReactNode;
  empty: ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-white/10 bg-[#08080c]/90 p-4 lg:min-h-[min(560px,calc(100vh-12rem))]">
      {title ? (
        <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/45">{title}</p>
      ) : null}
      <div className={title ? "mt-3 min-h-0 flex-1 overflow-y-auto" : "min-h-0 flex-1 overflow-y-auto"}>
        {hasOutput ? output : empty}
      </div>
    </div>
  );
}

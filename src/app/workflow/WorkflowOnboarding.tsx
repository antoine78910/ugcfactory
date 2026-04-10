"use client";

import { motion } from "framer-motion";
import { FolderOpen, ImageIcon, Search, Sparkles, Video, X } from "lucide-react";

import { cn } from "@/lib/utils";

import type { AdAssetNodeType } from "./nodes/AdAssetNode";

export type WorkflowStarterKind = "stock" | "media" | "image_gen" | "video_gen" | "assistant";

type Props = {
  onChoose: (kind: WorkflowStarterKind) => void;
  onSkip: () => void;
};

const cards: {
  kind: WorkflowStarterKind;
  label: string;
  icon: typeof Search;
  iconWrap: string;
}[] = [
  { kind: "stock", label: "Stock", icon: Search, iconWrap: "bg-zinc-800/90 ring-1 ring-white/10" },
  { kind: "media", label: "Media", icon: FolderOpen, iconWrap: "bg-zinc-800/90 ring-1 ring-white/10" },
  {
    kind: "image_gen",
    label: "Image Generator",
    icon: ImageIcon,
    iconWrap: "bg-cyan-500/25 ring-1 ring-cyan-400/35",
  },
  {
    kind: "video_gen",
    label: "Video Generator",
    icon: Video,
    iconWrap: "bg-violet-600/40 ring-1 ring-violet-400/40",
  },
  {
    kind: "assistant",
    label: "Assistant",
    icon: Sparkles,
    iconWrap: "bg-violet-500/20 ring-1 ring-cyan-400/25",
  },
];

export function starterNodeForKind(kind: WorkflowStarterKind): AdAssetNodeType {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `n-${Date.now()}`;
  const position = { x: 320, y: 240 };
  switch (kind) {
    case "stock":
      return {
        id,
        type: "adAsset",
        position,
        data: { kind: "image", label: "Stock" },
      };
    case "media":
      return {
        id,
        type: "adAsset",
        position,
        data: { kind: "video", label: "Media" },
      };
    case "image_gen":
      return {
        id,
        type: "adAsset",
        position,
        data: { kind: "image", label: "Image Generator" },
      };
    case "video_gen":
      return {
        id,
        type: "adAsset",
        position,
        data: { kind: "video", label: "Video Generator" },
      };
    case "assistant":
      return {
        id,
        type: "adAsset",
        position,
        data: { kind: "variation", label: "Assistant" },
      };
    default:
      return {
        id,
        type: "adAsset",
        position,
        data: { kind: "image", label: "Node" },
      };
  }
}

export function WorkflowOnboarding({ onChoose, onSkip }: Props) {
  return (
    <motion.div
      className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#06070d] px-4 py-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 45%, rgba(255,255,255,0.14) 0.5px, transparent 0.5px)`,
          backgroundSize: "18px 18px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 72%)",
        }}
        aria-hidden
      />

      <motion.button
        type="button"
        onClick={onSkip}
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/50 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.35 }}
        aria-label="Skip and start with empty canvas"
      >
        <X className="h-4 w-4" />
      </motion.button>

      <motion.div
        className="relative z-[1] mx-auto w-full max-w-4xl text-center"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">Your space is ready</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-white/45 sm:text-base">
          Choose your first node and start creating
        </p>
      </motion.div>

      <motion.ul
        className="relative z-[1] mt-10 flex w-full max-w-5xl flex-wrap items-stretch justify-center gap-3 sm:gap-4"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: {
            transition: { staggerChildren: 0.07, delayChildren: 0.2 },
          },
        }}
      >
        {cards.map(({ kind, label, icon: Icon, iconWrap }) => (
          <motion.li
            key={kind}
            variants={{
              hidden: { opacity: 0, y: 22, scale: 0.96 },
              show: {
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
              },
            }}
            className="w-[calc(50%-0.375rem)] min-w-[140px] max-w-[160px] sm:w-[150px]"
          >
            <button
              type="button"
              onClick={() => onChoose(kind)}
              className={cn(
                "flex h-full w-full flex-col items-center gap-3 rounded-2xl border border-white/[0.1] bg-[#0b0912]/95 px-3 py-4 text-center shadow-[0_12px_40px_rgba(0,0,0,0.45)] transition",
                "hover:border-white/20 hover:bg-[#0b0912] hover:shadow-[0_16px_48px_rgba(0,0,0,0.55)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40",
              )}
            >
              <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", iconWrap)}>
                <Icon className="h-5 w-5 text-white" strokeWidth={2} />
              </span>
              <span className="text-[13px] font-semibold leading-tight text-white">{label}</span>
            </button>
          </motion.li>
        ))}
      </motion.ul>

      <motion.p
        className="relative z-[1] mt-10 text-[13px] text-white/35"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.65, duration: 0.4 }}
      >
        <button type="button" onClick={onSkip} className="underline-offset-4 hover:text-white/55 hover:underline">
          Start with an empty canvas
        </button>
      </motion.p>
    </motion.div>
  );
}

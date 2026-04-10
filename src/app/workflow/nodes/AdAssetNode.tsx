"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Clapperboard, ImageIcon, Sparkles } from "lucide-react";

export type AdAssetNodeData = {
  label: string;
  kind: "image" | "video" | "variation";
};

export type AdAssetNodeType = Node<AdAssetNodeData, "adAsset">;

const kindConfig = {
  image: {
    icon: ImageIcon,
    border: "border-violet-400/40",
    glow: "shadow-[0_0_24px_rgba(167,139,250,0.14)]",
    chip: "bg-violet-400/18 text-violet-100/90",
  },
  video: {
    icon: Clapperboard,
    border: "border-violet-600/40",
    glow: "shadow-[0_0_24px_rgba(139,92,246,0.14)]",
    chip: "bg-violet-600/18 text-violet-100/90",
  },
  variation: {
    icon: Sparkles,
    border: "border-violet-300/35",
    glow: "shadow-[0_0_28px_rgba(196,181,253,0.12)]",
    chip: "bg-violet-300/15 text-violet-50/95",
  },
} as const;

export function AdAssetNode({ data, selected }: NodeProps<AdAssetNodeType>) {
  const cfg = kindConfig[data.kind];
  const Icon = cfg.icon;
  const showTarget = data.kind === "variation";

  return (
    <div
      className={[
        "min-w-[200px] max-w-[240px] rounded-2xl border bg-[#0b0912]/95 px-3 py-2.5 backdrop-blur-md",
        cfg.border,
        cfg.glow,
        selected ? "ring-2 ring-violet-400/50" : "",
      ].join(" ")}
    >
      {showTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-violet-400/55 !bg-[#06070d]"
        />
      ) : null}
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
          <Icon className="h-4 w-4 text-white/80" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <span className={["inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", cfg.chip].join(" ")}>
            {data.kind}
          </span>
          <p className="mt-1 truncate text-[13px] font-medium leading-snug text-white/90">{data.label}</p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-violet-400/50 !bg-[#06070d]"
      />
    </div>
  );
}

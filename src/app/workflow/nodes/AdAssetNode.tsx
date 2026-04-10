"use client";

import { Handle, Position, useStore, type Node, type NodeProps } from "@xyflow/react";
import { Clapperboard, ImageIcon, Loader2, Minus, Play, Plus, Settings, Sparkles, Wand2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { useWorkflowNodePatch } from "../workflowNodePatchContext";

export type AdAssetNodeData = {
  label: string;
  kind: "image" | "video" | "variation";
  /** Generation prompt */
  prompt?: string;
  /** Model id (workflow-local; studio wiring later) */
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  /** Image / variation batch count */
  quantity?: number;
};

export type AdAssetNodeType = Node<AdAssetNodeData, "adAsset">;

const kindConfig = {
  image: {
    icon: ImageIcon,
    border: "border-violet-400/40",
    glow: "shadow-[0_0_24px_rgba(167,139,250,0.14)]",
    chip: "bg-violet-400/18 text-violet-100/90",
    title: "Image Generator",
    promptPlaceholder: "Describe the image you want to generate…",
  },
  video: {
    icon: Clapperboard,
    border: "border-violet-600/40",
    glow: "shadow-[0_0_24px_rgba(139,92,246,0.14)]",
    chip: "bg-violet-600/18 text-violet-100/90",
    title: "Video Generator",
    promptPlaceholder: "Describe the video motion, subject, and style…",
  },
  variation: {
    icon: Sparkles,
    border: "border-violet-300/35",
    glow: "shadow-[0_0_28px_rgba(196,181,253,0.12)]",
    chip: "bg-violet-300/15 text-violet-50/95",
    title: "Variation",
    promptPlaceholder: "Describe how you want this ad to vary…",
  },
} as const;

const IMAGE_MODELS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "nano_banana", label: "Nano Banana" },
  { value: "seedream", label: "Seedream" },
  { value: "flux", label: "Flux" },
];

const VIDEO_MODELS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "kling", label: "Kling" },
  { value: "sora", label: "Sora" },
  { value: "veo", label: "Veo" },
];

const VARIATION_MODELS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "creative", label: "Creative" },
  { value: "faithful", label: "Faithful" },
];

const IMAGE_ASPECTS = ["1:1", "4:5", "9:16", "16:9", "3:2"] as const;
const VIDEO_ASPECTS = ["9:16", "16:9", "1:1"] as const;
const VARIATION_ASPECTS = ["1:1", "4:5", "9:16", "16:9"] as const;

const IMAGE_RESOLUTIONS = ["1024", "1536", "2K"] as const;
const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;
const VARIATION_RESOLUTIONS = ["1024", "1536", "2K"] as const;

const selectTriggerClass =
  "nodrag nopan h-8 max-h-8 min-h-8 shrink-0 border-white/15 bg-white/[0.06] text-[11px] font-medium text-white shadow-none hover:bg-white/[0.09] focus:ring-1 focus:ring-violet-500/40 data-[size=default]:h-8 px-2 gap-1";

const selectContentClass = "max-h-[min(240px,50vh)] border-white/12 bg-[#12101a] text-white";

function aspectIcon(ratio: string) {
  const [a, b] = ratio.split(":").map(Number);
  if (!a || !b) return "□";
  if (Math.abs(a / b - 1) < 0.05) return "□";
  if (a < b) return "▯";
  return "▭";
}

/** Parse "16:9" → { w: 16, h: 9 } for layout math. */
function parseAspectParts(ratio: string): { w: number; h: number } {
  const [a, b] = ratio.split(":").map(Number);
  if (!a || !b || !Number.isFinite(a) || !Number.isFinite(b)) return { w: 1, h: 1 };
  return { w: a, h: b };
}

/**
 * Preview frame size (px) matching the chosen format, capped so the node stays usable.
 */
function previewFrameSize(ratio: string): { width: number; height: number } {
  const { w: rw, h: rh } = parseAspectParts(ratio);
  const isLandscape = rw >= rh;
  const base = 118;
  let pw: number;
  let ph: number;
  if (isLandscape) {
    ph = base;
    pw = base * (rw / rh);
  } else {
    pw = base;
    ph = base * (rh / rw);
  }
  const maxW = 280;
  const maxH = 200;
  const scale = Math.min(1, maxW / pw, maxH / ph);
  return { width: Math.round(pw * scale), height: Math.round(ph * scale) };
}

function cardWidthClassForRatio(ratio: string): string {
  const { w, h } = parseAspectParts(ratio);
  const ar = w / h;
  if (ar > 1.2) return "min-w-[300px] max-w-[min(100%,400px)] w-[min(100%,380px)]";
  if (ar < 0.9) return "min-w-[228px] max-w-[min(100%,288px)] w-[min(100%,272px)]";
  return "min-w-[276px] max-w-[min(100%,328px)] w-[min(100%,308px)]";
}

export function AdAssetNode({ id, data, selected }: NodeProps<AdAssetNodeType>) {
  const patch = useWorkflowNodePatch();
  const cfg = kindConfig[data.kind];
  const Icon = cfg.icon;
  const showTarget = data.kind === "variation";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantDescribe, setAssistantDescribe] = useState("");
  const [assistantResult, setAssistantResult] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);

  const prompt = data.prompt ?? "";
  const defaultAspect = data.kind === "video" ? "9:16" : "1:1";
  const aspectRatio = data.aspectRatio ?? defaultAspect;

  const closeAssistant = () => {
    setAssistantOpen(false);
    setAssistantDescribe("");
    setAssistantResult("");
    setAssistantLoading(false);
  };

  const runPromptAssistant = async () => {
    const q = assistantDescribe.trim();
    if (!q || assistantLoading) return;
    setAssistantLoading(true);
    setAssistantResult("");
    try {
      const res = await fetch("/api/gpt/workflow-prompt-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: data.kind,
          description: q,
          existingPrompt: prompt.trim() || undefined,
          aspectRatio: aspectRatio || undefined,
        }),
      });
      const json = (await res.json()) as { prompt?: string; error?: string };
      if (res.status === 401) {
        toast.error("Sign in required", { description: "Use the assistant after signing in to Youry." });
        return;
      }
      if (!res.ok || !json.prompt?.trim()) {
        throw new Error(json.error || "Generation failed");
      }
      setAssistantResult(json.prompt.trim());
      toast.success("Prompt ready");
    } catch (e) {
      toast.error("Assistant failed", {
        description: e instanceof Error ? e.message : "Try again in a moment.",
      });
    } finally {
      setAssistantLoading(false);
    }
  };

  const displayIndex = useStore((s) => {
    const same = s.nodes.filter(
      (n) => n.type === "adAsset" && (n.data as AdAssetNodeData).kind === data.kind,
    );
    const i = same.findIndex((n) => n.id === id);
    return i < 0 ? 1 : i + 1;
  });

  const model = data.model ?? "auto";
  const previewSize = useMemo(() => previewFrameSize(aspectRatio), [aspectRatio]);
  const cardWidthClass = useMemo(() => cardWidthClassForRatio(aspectRatio), [aspectRatio]);
  const defaultRes = data.kind === "video" ? "720p" : "1024";
  const resolution = data.resolution ?? defaultRes;
  const quantity = Math.min(4, Math.max(1, data.quantity ?? 1));

  const models = useMemo(() => {
    if (data.kind === "video") return VIDEO_MODELS;
    if (data.kind === "variation") return VARIATION_MODELS;
    return IMAGE_MODELS;
  }, [data.kind]);

  const aspects = useMemo(() => {
    if (data.kind === "video") return VIDEO_ASPECTS;
    if (data.kind === "variation") return VARIATION_ASPECTS;
    return IMAGE_ASPECTS;
  }, [data.kind]);

  const resolutions = useMemo(() => {
    if (data.kind === "video") return VIDEO_RESOLUTIONS;
    if (data.kind === "variation") return VARIATION_RESOLUTIONS;
    return IMAGE_RESOLUTIONS;
  }, [data.kind]);

  const showQuantity = data.kind === "image" || data.kind === "variation";

  const onGenerate = () => {
    toast.message("Generate", {
      description:
        "Your prompt and settings are saved on the canvas. End-to-end workflow runs from here will be available soon.",
    });
  };

  return (
    <div className="relative flex items-start gap-1">
      {/* Side tools (reference) */}
      <div
        className="nodrag nopan flex shrink-0 flex-col gap-1 pt-9"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title="Reference text (soon)"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-[#0b0912]/90 text-[11px] font-bold text-white/70 transition hover:border-violet-400/35 hover:text-white"
          onClick={() => toast.message("Coming soon", { description: "Attach reference text to this node." })}
        >
          T
        </button>
        <button
          type="button"
          title="Reference image (soon)"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-[#0b0912]/90 text-white/70 transition hover:border-violet-400/35 hover:text-white"
          onClick={() => toast.message("Coming soon", { description: "Attach a reference image to this node." })}
        >
          <ImageIcon className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      <div
        className={cn(
          "relative rounded-2xl border bg-[#0b0912]/95 px-3 pb-2.5 pt-2.5 backdrop-blur-md transition-[min-width,max-width,width] duration-200 ease-out",
          cardWidthClass,
          cfg.border,
          cfg.glow,
          selected ? "ring-2 ring-violet-400/50" : "",
        )}
      >
        {showTarget ? (
          <Handle
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-violet-400/55 !bg-[#06070d]"
          />
        ) : null}

        <div className="flex items-start gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
            <Icon className="h-4 w-4 text-white/80" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <span
              className={cn(
                "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                cfg.chip,
              )}
            >
              {data.kind}
            </span>
            <p className="mt-1 text-[13px] font-semibold leading-snug text-white/95">
              {cfg.title} #{displayIndex}
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex w-full justify-center" aria-hidden>
          <div
            className="rounded-xl border border-white/15 bg-gradient-to-br from-violet-500/[0.12] via-white/[0.03] to-black/30 shadow-inner transition-[width,height] duration-200 ease-out"
            style={{ width: previewSize.width, height: previewSize.height }}
          />
        </div>

        <div className="nodrag nopan relative mt-2.5" onPointerDown={(e) => e.stopPropagation()}>
          <textarea
            value={prompt}
            onChange={(e) => patch(id, { prompt: e.target.value })}
            placeholder={cfg.promptPlaceholder}
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/35 px-3 py-2 pr-9 text-[12px] leading-relaxed text-white/90 placeholder:text-white/35 outline-none focus:border-violet-500/35 focus:ring-1 focus:ring-violet-500/25"
          />
          <button
            type="button"
            title="Prompt assistant — describe what you want"
            className="absolute bottom-2 right-2 rounded-md p-1 text-violet-300/80 transition hover:bg-violet-500/15 hover:text-violet-100"
            onClick={() => {
              setAssistantOpen(true);
              setAssistantResult("");
            }}
          >
            <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        {assistantOpen ? (
          <div
            className="nodrag nopan absolute inset-0 z-30 flex max-h-[min(440px,72vh)] flex-col overflow-hidden rounded-2xl border border-violet-500/40 bg-[#0a0812] shadow-[0_12px_48px_rgba(0,0,0,0.65)] backdrop-blur-md"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
              <span className="text-[12px] font-semibold text-white">Prompt assistant</span>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Close assistant"
                onClick={closeAssistant}
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
              <p className="text-[11px] leading-snug text-white/50">
                Describe your idea in your own words. We turn it into a ready-to-use prompt for this{" "}
                {data.kind === "image" ? "image" : data.kind === "video" ? "video" : "variation"} node.
              </p>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                What you want
              </label>
              <textarea
                value={assistantDescribe}
                onChange={(e) => setAssistantDescribe(e.target.value)}
                placeholder="e.g. A creator in a bright kitchen showing the product, natural light, authentic UGC vibe…"
                rows={4}
                disabled={assistantLoading}
                className="min-h-[88px] w-full resize-y rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-violet-500/35 disabled:opacity-60"
              />
              <button
                type="button"
                disabled={assistantLoading || !assistantDescribe.trim()}
                onClick={() => void runPromptAssistant()}
                className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 py-2 text-[12px] font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {assistantLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Generating…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Generate prompt
                  </>
                )}
              </button>

              {assistantResult ? (
                <div className="mt-1 flex min-h-0 flex-col gap-2 border-t border-white/[0.08] pt-3">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                    Suggested prompt
                  </label>
                  <textarea
                    value={assistantResult}
                    onChange={(e) => setAssistantResult(e.target.value)}
                    rows={5}
                    className="min-h-[100px] w-full resize-y rounded-xl border border-white/12 bg-black/35 px-3 py-2 text-[12px] leading-relaxed text-white/90 outline-none focus:border-violet-500/35"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="flex-1 rounded-lg bg-white py-2 text-[12px] font-semibold text-zinc-900 transition hover:bg-white/90"
                      onClick={() => {
                        patch(id, { prompt: assistantResult.trim() });
                        toast.success("Prompt updated");
                        closeAssistant();
                      }}
                    >
                      Replace prompt
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-lg border border-white/15 bg-white/[0.06] py-2 text-[12px] font-semibold text-white/90 transition hover:bg-white/[0.1]"
                      onClick={() => {
                        const next = prompt.trim()
                          ? `${prompt.trim()}\n\n${assistantResult.trim()}`
                          : assistantResult.trim();
                        patch(id, { prompt: next });
                        toast.success("Appended to prompt");
                        closeAssistant();
                      }}
                    >
                      Append
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div
          className="nodrag nopan mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/[0.07] pt-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {showQuantity ? (
            <div className="flex h-8 items-center gap-0.5 rounded-full border border-white/12 bg-black/30 px-1 text-[11px] font-semibold text-white/85">
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.08] hover:text-white"
                aria-label="Decrease count"
                onClick={() => patch(id, { quantity: Math.max(1, quantity - 1) })}
              >
                <Minus className="h-3 w-3" strokeWidth={2.5} />
              </button>
              <span className="min-w-[2.25rem] text-center tabular-nums">×{quantity}</span>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.08] hover:text-white"
                aria-label="Increase count"
                onClick={() => patch(id, { quantity: Math.min(4, quantity + 1) })}
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </div>
          ) : null}

          <Select value={model} onValueChange={(v) => patch(id, { model: v })}>
            <SelectTrigger size="sm" className={cn(selectTriggerClass, "min-w-[4.5rem] max-w-[7rem]")}>
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent className={selectContentClass} position="popper">
              {models.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-[12px] focus:bg-violet-500/20">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={aspectRatio} onValueChange={(v) => patch(id, { aspectRatio: v })}>
            <SelectTrigger size="sm" className={cn(selectTriggerClass, "min-w-[4.25rem]")}>
              <span className="mr-0.5 text-[10px] text-white/50" aria-hidden>
                {aspectIcon(aspectRatio)}
              </span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentClass} position="popper">
              {aspects.map((r) => (
                <SelectItem key={r} value={r} className="text-[12px] focus:bg-violet-500/20">
                  {aspectIcon(r)} {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative" ref={settingsRef}>
            <button
              type="button"
              title="Resolution & output"
              aria-expanded={settingsOpen}
              className={cn(
                "nodrag nopan flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-white/70 transition hover:border-violet-400/30 hover:text-white",
                settingsOpen && "border-violet-400/35 bg-violet-500/15 text-violet-100",
              )}
              onClick={() => setSettingsOpen((o) => !o)}
            >
              <Settings className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            {settingsOpen ? (
              <div className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-[200px] rounded-xl border border-white/12 bg-[#12101a] p-2.5 shadow-xl">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">Resolution</p>
                <Select value={resolution} onValueChange={(v) => patch(id, { resolution: v })}>
                  <SelectTrigger size="sm" className={cn(selectTriggerClass, "h-9 w-full max-w-none")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass} position="popper">
                    {resolutions.map((r) => (
                      <SelectItem key={r} value={r} className="text-[12px] focus:bg-violet-500/20">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  className="mt-2 w-full rounded-lg py-1.5 text-[11px] text-white/45 hover:bg-white/[0.05] hover:text-white/70"
                  onClick={() => setSettingsOpen(false)}
                >
                  Close
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            title="Generate"
            className="nodrag nopan ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white shadow-[0_4px_14px_rgba(139,92,246,0.35)] transition hover:bg-violet-400"
            onClick={onGenerate}
          >
            <Play className="ml-0.5 h-4 w-4 fill-white text-white" strokeWidth={0} />
          </button>
        </div>

        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-violet-400/50 !bg-[#06070d]"
        />
      </div>

      <div
        className="nodrag nopan flex shrink-0 flex-col gap-1 pt-9"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title="Reference image (soon)"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-[#0b0912]/90 text-white/70 transition hover:border-violet-400/35 hover:text-white"
          onClick={() => toast.message("Coming soon", { description: "Attach a reference image to this node." })}
        >
          <ImageIcon className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

"use client";

import { Handle, Position, useReactFlow, useStore, type Node, type NodeProps } from "@xyflow/react";
import {
  Clapperboard,
  FilePenLine,
  ImageIcon,
  ImageUpscale,
  Loader2,
  Minus,
  Play,
  Plus,
  Settings,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getPersonalApiKey,
  getPersonalPiapiApiKey,
  isPlatformCreditBypassActive,
  useCreditsPlan,
} from "@/app/_components/CreditsPlanContext";
import { userMessageFromCaughtError } from "@/lib/generationUserMessage";
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { useWorkflowNodePatch } from "../workflowNodePatchContext";
import {
  collectLinkedImageUrl,
  collectLinkedPromptTexts,
  composeWorkflowPrompt,
  runWorkflowImageJob,
  runWorkflowVideoJob,
  workflowImageChargeCredits,
  workflowVideoChargeCredits,
} from "../workflowNodeRun";
import { WorkflowNodeContextToolbar } from "./WorkflowNodeContextToolbar";

export type AdAssetNodeData = {
  label: string;
  kind: "image" | "video" | "variation" | "assistant" | "upscale";
  /** Generation prompt */
  prompt?: string;
  /** Model id (workflow-local; studio wiring later) */
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  /** Image / variation batch count */
  quantity?: number;
  /** width ÷ height — when set, module frame matches this exact shape */
  intrinsicAspect?: number;
  /** Object URL or remote URL shown inside the preview */
  referencePreviewUrl?: string;
  referenceSource?: "upload" | "avatar";
  referenceMediaKind?: "image" | "video";
  /** Last successful Run output (shown in preview; reference stays in data for i2i). */
  outputPreviewUrl?: string;
  outputMediaKind?: "image" | "video";
};

export type AdAssetNodeType = Node<AdAssetNodeData, "adAsset">;

const kindConfig = {
  image: {
    icon: ImageIcon,
    previewTint: "from-violet-500/[0.08] via-transparent to-black/40",
    title: "Image Generator",
    promptPlaceholder: "Describe the image you want to generate…",
  },
  video: {
    icon: Clapperboard,
    previewTint: "from-violet-600/[0.08] via-transparent to-black/40",
    title: "Video Generator",
    promptPlaceholder: "Describe the video motion, subject, and style…",
  },
  variation: {
    icon: Sparkles,
    previewTint: "from-violet-300/[0.07] via-transparent to-black/40",
    title: "Variation",
    promptPlaceholder: "Describe how you want this ad to vary…",
  },
  assistant: {
    icon: Sparkles,
    previewTint: "from-emerald-500/[0.08] via-transparent to-black/40",
    title: "Assistant",
    promptPlaceholder: "Describe the creative direction…",
  },
  upscale: {
    icon: ImageUpscale,
    previewTint: "from-violet-500/[0.08] via-transparent to-black/40",
    title: "Image Upscaler",
    promptPlaceholder: "Describe how to upscale or refine the image…",
  },
} as const;

const IMAGE_MODELS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "pro", label: "NanoBanana Pro" },
  { value: "nano", label: "NanoBanana 2" },
  { value: "seedream_45", label: "Seedream 4.5" },
  { value: "seedream_50_lite", label: "Seedream 5.0 Lite" },
  { value: "google_nano_banana", label: "Google Nano Banana" },
];

const VIDEO_MODELS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "kling-3.0/video", label: "Kling 3.0" },
  { value: "kling-2.6/video", label: "Kling 2.6" },
  { value: "openai/sora-2", label: "Sora 2" },
  { value: "openai/sora-2-pro", label: "Sora 2 Pro" },
  { value: "bytedance/seedance-2-preview", label: "Seedance 2 Preview" },
  { value: "bytedance/seedance-2-fast-preview", label: "Seedance 2 Fast Preview" },
  { value: "bytedance/seedance-2", label: "Seedance 2" },
  { value: "bytedance/seedance-2-fast", label: "Seedance 2 Fast" },
  { value: "veo3_lite", label: "Veo 3.1 Lite" },
  { value: "veo3_fast", label: "Veo 3.1 Fast" },
  { value: "veo3", label: "Veo 3.1 Quality" },
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
  "nodrag nopan h-8 max-h-8 min-h-8 shrink-0 rounded-full border-white/12 bg-[#1c1c1f] text-[11px] font-medium text-white/90 shadow-none hover:bg-[#252528] focus:ring-1 focus:ring-violet-500/35 data-[size=default]:h-8 px-2.5 gap-1";

const selectContentClass = "max-h-[min(240px,50vh)] border-white/10 bg-[#1a1a1c] text-white";

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

/** Longest side of the output preview (px); module shape follows aspect ratio. */
const OUTPUT_FRAME_MAX_LONG = 276;
/** Horizontal padding from `px-3` on the card (left + right). */
const CARD_PAD_X_PX = 24;

/**
 * Preview frame size in px: exact aspect ratio, longest side = OUTPUT_FRAME_MAX_LONG.
 */
function outputFrameDimensions(ratio: string, intrinsicAspect?: number): { width: number; height: number } {
  if (intrinsicAspect != null && Number.isFinite(intrinsicAspect) && intrinsicAspect > 0) {
    const ar = intrinsicAspect;
    if (ar >= 1) {
      const width = OUTPUT_FRAME_MAX_LONG;
      const height = Math.max(80, Math.round(OUTPUT_FRAME_MAX_LONG / ar));
      return { width, height };
    }
    const height = OUTPUT_FRAME_MAX_LONG;
    const width = Math.max(80, Math.round(OUTPUT_FRAME_MAX_LONG * ar));
    return { width, height };
  }
  const { w: rw, h: rh } = parseAspectParts(ratio);
  const ar = rw / rh;
  if (!Number.isFinite(ar) || ar <= 0) return { width: OUTPUT_FRAME_MAX_LONG, height: OUTPUT_FRAME_MAX_LONG };
  if (ar >= 1) {
    const width = OUTPUT_FRAME_MAX_LONG;
    const height = Math.max(80, Math.round(OUTPUT_FRAME_MAX_LONG / ar));
    return { width, height };
  }
  const height = OUTPUT_FRAME_MAX_LONG;
  const width = Math.max(80, Math.round(OUTPUT_FRAME_MAX_LONG * ar));
  return { width, height };
}

export function AdAssetNode({ id, data, selected }: NodeProps<AdAssetNodeType>) {
  const patch = useWorkflowNodePatch();
  const { getNodes, getEdges } = useReactFlow();
  const { planId, current: creditsBalance, spendCredits, grantCredits } = useCreditsPlan();
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;
  const cfg = kindConfig[data.kind];
  const Icon = cfg.icon;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantDescribe, setAssistantDescribe] = useState("");
  const [assistantResult, setAssistantResult] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [cardHovered, setCardHovered] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const [promptFocused, setPromptFocused] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelMenuOpenRef = useRef(false);
  const aspectMenuOpenRef = useRef(false);
  const settingsOpenRef = useRef(false);
  const assistantOpenRef = useRef(false);
  const promptFocusedRef = useRef(false);

  const clearHoverLeaveTimer = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  useEffect(() => () => clearHoverLeaveTimer(), []);

  modelMenuOpenRef.current = modelMenuOpen;
  aspectMenuOpenRef.current = aspectMenuOpen;
  settingsOpenRef.current = settingsOpen;
  assistantOpenRef.current = assistantOpen;
  promptFocusedRef.current = promptFocused;

  useEffect(() => {
    if (modelMenuOpen || aspectMenuOpen || settingsOpen) clearHoverLeaveTimer();
  }, [modelMenuOpen, aspectMenuOpen, settingsOpen]);

  const showEditLayer =
    cardHovered ||
    modelMenuOpen ||
    aspectMenuOpen ||
    settingsOpen ||
    assistantOpen ||
    promptFocused;

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
          kind:
            data.kind === "assistant" ? "variation" : data.kind === "upscale" ? "image" : data.kind,
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

  const frame = useMemo(
    () => outputFrameDimensions(aspectRatio, data.intrinsicAspect),
    [aspectRatio, data.intrinsicAspect],
  );
  const previewUrl = data.outputPreviewUrl ?? data.referencePreviewUrl;
  const previewMediaKind = data.outputMediaKind ?? data.referenceMediaKind;
  const hasPreviewMedia = Boolean(previewUrl);
  /** Card width matches preview width + padding so the module hugs every aspect ratio (no side gutters). */
  const cardWidthPx = frame.width + CARD_PAD_X_PX;
  const aspectLocked =
    data.intrinsicAspect != null && Number.isFinite(data.intrinsicAspect) && data.intrinsicAspect > 0;
  const defaultRes = data.kind === "video" ? "720p" : "1024";
  const resolution = data.resolution ?? defaultRes;
  const quantity = Math.min(4, Math.max(1, data.quantity ?? 1));

  const models = useMemo(() => {
    if (data.kind === "video") return VIDEO_MODELS;
    if (data.kind === "variation" || data.kind === "assistant") return VARIATION_MODELS;
    return IMAGE_MODELS;
  }, [data.kind]);

  const rawModel = data.model ?? "auto";
  const model = models.some((m) => m.value === rawModel) ? rawModel : "auto";

  const aspects = useMemo(() => {
    if (data.kind === "video") return VIDEO_ASPECTS;
    if (data.kind === "variation" || data.kind === "assistant") return VARIATION_ASPECTS;
    return IMAGE_ASPECTS;
  }, [data.kind]);

  const resolutions = useMemo(() => {
    if (data.kind === "video") return VIDEO_RESOLUTIONS;
    if (data.kind === "variation" || data.kind === "assistant") return VARIATION_RESOLUTIONS;
    return IMAGE_RESOLUTIONS;
  }, [data.kind]);

  const showQuantity =
    data.kind === "image" || data.kind === "variation" || data.kind === "assistant" || data.kind === "upscale";

  const onGenerate = useCallback(async () => {
    if (data.kind !== "image" && data.kind !== "video") {
      toast.message("Coming soon", { description: "Run is available for Image and Video generators." });
      return;
    }
    if (generating) return;

    const nodes = getNodes();
    const edges = getEdges();
    const linkedPrompts = collectLinkedPromptTexts(nodes, edges, id);
    const effectivePrompt = composeWorkflowPrompt(prompt, linkedPrompts);
    if (!effectivePrompt.trim()) {
      toast.error("Add a prompt", {
        description: linkedPrompts.length
          ? "Linked nodes had no text. Type a prompt or connect a sticky note with content."
          : "Type a prompt in this module or connect a text / sticky note node.",
      });
      return;
    }

    const personalKey = getPersonalApiKey()?.trim() || undefined;
    const piapiKey = getPersonalPiapiApiKey()?.trim() || undefined;
    const creditBypass = isPlatformCreditBypassActive();
    const linkedImageUrl = collectLinkedImageUrl(nodes, edges, id);
    const refUrl = data.referencePreviewUrl?.trim();
    const refImageForImageGen =
      data.referenceMediaKind !== "video" && refUrl ? refUrl : undefined;

    if (data.kind === "image") {
      const charge = workflowImageChargeCredits({
        model,
        resolution,
        quantity,
      });
      if (!creditBypass && creditsRef.current < charge) {
        toast.error("Not enough credits", { description: `You need ${charge} credits for this run.` });
        return;
      }
      const platformCharge = creditBypass ? 0 : charge;
      if (!creditBypass && platformCharge > 0) {
        spendCredits(platformCharge);
        creditsRef.current = Math.max(0, creditsRef.current - platformCharge);
      }
      setGenerating(true);
      try {
        const { imageUrl } = await runWorkflowImageJob({
          planId,
          personalApiKey: personalKey,
          prompt: effectivePrompt,
          model,
          aspectRatio,
          resolution,
          quantity,
          referenceImageUrls: refImageForImageGen ? [refImageForImageGen] : undefined,
        });
        patch(id, {
          outputPreviewUrl: imageUrl,
          outputMediaKind: "image",
        });
        toast.success("Image ready");
      } catch (e) {
        const msg = userMessageFromCaughtError(e, "Image generation failed. Try again.");
        refundPlatformCredits(platformCharge, grantCredits, creditsRef);
        toast.error(msg);
      } finally {
        setGenerating(false);
      }
      return;
    }

    /* video */
    const vCharge = workflowVideoChargeCredits({ model, resolution });
    if (!creditBypass && creditsRef.current < vCharge) {
      toast.error("Not enough credits", { description: `You need ${vCharge} credits for this run.` });
      return;
    }
    const vPlatformCharge = creditBypass ? 0 : vCharge;
    if (!creditBypass && vPlatformCharge > 0) {
      spendCredits(vPlatformCharge);
      creditsRef.current = Math.max(0, creditsRef.current - vPlatformCharge);
    }
    setGenerating(true);
    try {
      const { videoUrl } = await runWorkflowVideoJob({
        planId,
        personalApiKey: personalKey,
        piapiApiKey: piapiKey,
        prompt: effectivePrompt,
        model,
        aspectRatio,
        resolution,
        linkedImageUrl,
        referenceImageUrl:
          data.referenceMediaKind === "image" ? data.referencePreviewUrl?.trim() : undefined,
      });
      patch(id, {
        outputPreviewUrl: videoUrl,
        outputMediaKind: "video",
      });
      toast.success("Video ready");
    } catch (e) {
      const msg = userMessageFromCaughtError(e, "Video generation failed. Try again.");
      refundPlatformCredits(vPlatformCharge, grantCredits, creditsRef);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }, [
    data.kind,
    data.referenceMediaKind,
    data.referencePreviewUrl,
    generating,
    getEdges,
    getNodes,
    grantCredits,
    id,
    model,
    aspectRatio,
    resolution,
    quantity,
    patch,
    planId,
    prompt,
    spendCredits,
  ]);

  return (
    <>
      <WorkflowNodeContextToolbar nodeId={id} onRun={() => void onGenerate()} />
      <div className="relative flex items-start gap-1">
      {/* Side tools (reference) */}
      <div
        className="nodrag nopan flex shrink-0 flex-col gap-1 pt-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title="Reference text (soon)"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-[#1a1a1c]/95 text-[11px] font-bold text-white/65 transition hover:border-violet-500/35 hover:text-white"
          onClick={() => toast.message("Coming soon", { description: "Attach reference text to this node." })}
        >
          T
        </button>
        <button
          type="button"
          title="Reference image (soon)"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-[#1a1a1c]/95 text-white/65 transition hover:border-violet-500/35 hover:text-white"
          onClick={() => toast.message("Coming soon", { description: "Attach a reference image to this node." })}
        >
          <ImageIcon className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      <div
        className={cn(generating ? "workflow-generator-glow-wrap" : "contents")}
        data-workflow-generating={generating ? "true" : undefined}
      >
      <div
        className={cn(
          "group/card relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121212]/98 px-3 pb-3 pt-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-[width] duration-200 ease-out",
          selected ? "ring-2 ring-violet-500/85 ring-offset-2 ring-offset-[#06070d]" : "",
        )}
        style={{ width: cardWidthPx }}
        onMouseEnter={() => {
          clearHoverLeaveTimer();
          setCardHovered(true);
        }}
        onMouseLeave={() => {
          clearHoverLeaveTimer();
          leaveTimerRef.current = setTimeout(() => {
            if (
              !modelMenuOpenRef.current &&
              !aspectMenuOpenRef.current &&
              !settingsOpenRef.current &&
              !assistantOpenRef.current &&
              !promptFocusedRef.current
            ) {
              setCardHovered(false);
            }
          }, 220);
        }}
      >
        <Handle
          id="in"
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-violet-500/45 !bg-[#06070d]"
        />

        {!hasPreviewMedia ? (
          <div className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 shrink-0 text-white/75" strokeWidth={2} aria-hidden />
            <p className="min-w-0 truncate text-[13px] font-semibold tracking-tight text-white">
              {cfg.title} #{displayIndex}
            </p>
          </div>
        ) : null}

        <div
          className={cn(
            "relative w-full overflow-hidden rounded-xl",
            hasPreviewMedia ? "mt-1.5" : "mt-2.5",
          )}
          style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
        >
          {!hasPreviewMedia ? (
            <>
              <div
                className={cn(
                  "absolute inset-0 bg-gradient-to-br shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                  cfg.previewTint,
                )}
              />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(255,255,255,0.06),transparent_55%)]" />
            </>
          ) : (
            <div className="absolute inset-0 bg-black" aria-hidden />
          )}
          {previewUrl ? (
            previewMediaKind === "video" ||
            (data.kind === "video" && previewMediaKind !== "image") ? (
              <video
                src={previewUrl}
                className="absolute inset-0 z-[1] h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
                aria-hidden
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt=""
                className="absolute inset-0 z-[1] h-full w-full object-cover"
              />
            )
          ) : null}

          {hasPreviewMedia ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex items-center gap-2 px-2.5 pb-10 pt-2">
              <div
                className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/85 via-black/45 to-transparent"
                aria-hidden
              />
              <Icon
                className="relative h-4 w-4 shrink-0 text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
                strokeWidth={2}
                aria-hidden
              />
              <p className="relative min-w-0 truncate text-[13px] font-semibold tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                {cfg.title} #{displayIndex}
              </p>
            </div>
          ) : null}

          <p
            className={cn(
              "pointer-events-none absolute bottom-3 left-2 right-2 text-center text-[10px] leading-snug text-white/22 transition-opacity duration-200",
              showEditLayer && "opacity-0",
            )}
          >
            Hover to edit prompt &amp; settings
          </p>

          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-[5] rounded-b-[10px] px-2 pb-2 pt-10 transition-opacity duration-200",
              "bg-gradient-to-t from-[#0c0c0c] via-[#0c0c0c]/92 to-transparent",
              showEditLayer ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div className="nodrag nopan relative" onPointerDown={(e) => e.stopPropagation()}>
              <textarea
                value={prompt}
                onChange={(e) => patch(id, { prompt: e.target.value })}
                placeholder={cfg.promptPlaceholder}
                rows={2}
                onFocus={() => setPromptFocused(true)}
                onBlur={() => setPromptFocused(false)}
                className="min-h-[42px] w-full resize-none rounded-lg border border-white/10 bg-black/55 px-2 py-1.5 pr-8 text-[11px] leading-snug text-white/88 placeholder:text-white/26 outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/25"
              />
              <button
                type="button"
                title="Prompt assistant — describe what you want"
                className="absolute bottom-1.5 right-1 rounded-md p-1 text-violet-300/85 transition hover:bg-violet-500/15 hover:text-violet-100"
                onClick={() => {
                  setAssistantOpen(true);
                  setAssistantResult("");
                }}
              >
                <Wand2 className="h-3 w-3" strokeWidth={2} />
              </button>
            </div>

            <div
              className="nodrag nopan mt-1.5 flex min-w-0 w-full flex-wrap items-center gap-1"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {showQuantity ? (
                <div className="flex h-8 items-center gap-0.5 rounded-full border border-white/12 bg-[#1c1c1f] px-1 text-[11px] font-semibold text-white/88">
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-white/55 hover:bg-white/[0.08] hover:text-white"
                    aria-label="Decrease count"
                    onClick={() => patch(id, { quantity: Math.max(1, quantity - 1) })}
                  >
                    <Minus className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                  <span className="min-w-[2.25rem] text-center tabular-nums">×{quantity}</span>
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-white/55 hover:bg-white/[0.08] hover:text-white"
                    aria-label="Increase count"
                    onClick={() => patch(id, { quantity: Math.min(4, quantity + 1) })}
                  >
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </div>
              ) : null}

              <Select
                value={model}
                onValueChange={(v) => patch(id, { model: v })}
                onOpenChange={setModelMenuOpen}
              >
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

              {aspectLocked ? (
                <div
                  className={cn(
                    selectTriggerClass,
                    "pointer-events-none min-w-[4.25rem] cursor-default opacity-95",
                  )}
                  title="Aspect follows uploaded or avatar media"
                >
                  <span className="mr-0.5 text-[10px] text-white/45" aria-hidden>
                    {aspectIcon(aspectRatio)}
                  </span>
                  <span className="truncate text-[10px] text-white/75">{aspectRatio}</span>
                </div>
              ) : (
                <Select
                  value={aspectRatio}
                  onValueChange={(v) => patch(id, { aspectRatio: v })}
                  onOpenChange={setAspectMenuOpen}
                >
                  <SelectTrigger size="sm" className={cn(selectTriggerClass, "min-w-[4.25rem]")}>
                    <span className="mr-0.5 text-[10px] text-white/45" aria-hidden>
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
              )}

              <div className="relative" ref={settingsRef}>
                <button
                  type="button"
                  title="Resolution & output"
                  aria-expanded={settingsOpen}
                  className={cn(
                    "nodrag nopan flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-[#1c1c1f] text-white/65 transition hover:bg-[#252528] hover:text-white",
                    settingsOpen && "border-violet-500/35 bg-violet-500/10 text-violet-100",
                  )}
                  onClick={() => setSettingsOpen((o) => !o)}
                >
                  <Settings className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                {settingsOpen ? (
                  <div className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-[200px] rounded-xl border border-white/10 bg-[#1a1a1c] p-2.5 shadow-xl">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                      Resolution
                    </p>
                    <Select value={resolution} onValueChange={(v) => patch(id, { resolution: v })}>
                      <SelectTrigger size="sm" className={cn(selectTriggerClass, "h-9 w-full max-w-none rounded-lg")}>
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
                title={generating ? "Generating…" : "Generate"}
                disabled={generating}
                className="nodrag nopan ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 shadow-md transition hover:bg-white/95 disabled:cursor-not-allowed disabled:opacity-55"
                onClick={() => void onGenerate()}
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-900" aria-hidden />
                ) : (
                  <Play className="ml-0.5 h-4 w-4 fill-zinc-900 text-zinc-900" strokeWidth={0} />
                )}
              </button>
            </div>
          </div>
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
                {data.kind === "image" || data.kind === "upscale"
                  ? "image"
                  : data.kind === "video"
                    ? "video"
                    : "variation"}{" "}
                node.
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

        <Handle
          id="out"
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-violet-500/45 !bg-[#06070d]"
        />
      </div>
      </div>

      <div
        className="nodrag nopan flex shrink-0 flex-col gap-1 pt-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title="Edit copy (soon)"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-[#1a1a1c]/95 text-white/65 transition hover:border-violet-500/35 hover:text-white"
          onClick={() => toast.message("Coming soon", { description: "Edit on-canvas copy for this module." })}
        >
          <FilePenLine className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          title="Reference image (soon)"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-[#1a1a1c]/95 text-white/65 transition hover:border-violet-500/35 hover:text-white"
          onClick={() => toast.message("Coming soon", { description: "Attach a reference image to this node." })}
        >
          <ImageIcon className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      </div>
    </>
  );
}

"use client";

import {
  Handle,
  Position,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  Clapperboard,
  ImageIcon,
  Images,
  ImageUpscale,
  Loader2,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getPersonalApiKey,
  getPersonalPiapiApiKey,
  isPlatformCreditBypassActive,
  useCreditsPlan,
} from "@/app/_components/CreditsPlanContext";
import { userMessageFromCaughtError } from "@/lib/generationUserMessage";
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";
import { studioVideoDurationSecOptions } from "@/lib/studioVideoModelCapabilities";

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
  collectLinkedImageUrlsForHandles,
  collectLinkedPromptTexts,
  collectLinkedPromptTextsForHandles,
  composeWorkflowPrompt,
  coerceWorkflowVideoDurationSec,
  resolveWorkflowVideoModelId,
  runWorkflowImageJob,
  runWorkflowVideoJob,
  workflowImageChargeCredits,
  workflowVideoChargeCredits,
  WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX,
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
  /** Assistant node model selector. */
  assistantModel?: "claude-sonnet-4-5" | "gpt-5o";
  /** Assistant node last response text. */
  assistantOutput?: string;
  /** Assistant tab state. */
  assistantMode?: "input" | "output";
  /** Video-specific selected start/end frames. */
  videoStartImageUrl?: string;
  videoEndImageUrl?: string;
  /** Video: clip length in seconds (per model). */
  videoDurationSec?: number;
  /** Video: Seedance 2 Preview / Fast Preview queue tier (doubles credits when VIP). */
  videoPriority?: "normal" | "vip";
  /**
   * JPEG data URLs of the output video’s first / last frame (grabbed from the preview).
   * When this module’s `out` is wired to another video’s `startImage` / `endImage`, these are used as stills (last frame preferred for continuations).
   */
  videoExtractedFirstFrameUrl?: string;
  videoExtractedLastFrameUrl?: string;
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

const ASSISTANT_MODELS: Array<{ value: "claude-sonnet-4-5" | "gpt-5o"; label: string }> = [
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { value: "gpt-5o", label: "GPT 5o" },
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

const WORKFLOW_SEEDANCE_PREVIEW_PRIORITY_INFO =
  "VIP uses faster PiAPI queue and costs 2× credits vs Normal for Seedance Preview / Fast Preview.";

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
/** Max longest side when encoding an extracted video frame (keeps workflow JSON smaller). */
const VIDEO_FRAME_EXTRACT_MAX_LONG = 1280;

async function waitVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration) && video.duration > 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video metadata timed out"));
    }, 12_000);
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onErr);
    };
    const onMeta = () => {
      cleanup();
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        reject(new Error("Video has no duration"));
        return;
      }
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Video failed to load"));
    };
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });
}

async function extractVideoFrameJpegDataUrl(video: HTMLVideoElement, end: boolean): Promise<string> {
  await waitVideoMetadata(video);
  const duration = video.duration;
  const targetT = end ? Math.max(0, duration - 1 / 30) : 0;

  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      reject(new Error("Seek failed"));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onErr, { once: true });
    if (Math.abs(video.currentTime - targetT) < 0.001) {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
      queueMicrotask(resolve);
      return;
    }
    video.currentTime = targetT;
  });

  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Video has no frame size");

  let tw = vw;
  let th = vh;
  const long = Math.max(vw, vh);
  if (long > VIDEO_FRAME_EXTRACT_MAX_LONG) {
    if (vw >= vh) {
      tw = VIDEO_FRAME_EXTRACT_MAX_LONG;
      th = Math.max(1, Math.round((vh / vw) * VIDEO_FRAME_EXTRACT_MAX_LONG));
    } else {
      th = VIDEO_FRAME_EXTRACT_MAX_LONG;
      tw = Math.max(1, Math.round((vw / vh) * VIDEO_FRAME_EXTRACT_MAX_LONG));
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read frame");

  ctx.drawImage(video, 0, 0, tw, th);
  return canvas.toDataURL("image/jpeg", 0.88);
}
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
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
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
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.label || cfg.title);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelMenuOpenRef = useRef(false);
  const aspectMenuOpenRef = useRef(false);
  const settingsOpenRef = useRef(false);
  const assistantOpenRef = useRef(false);
  const promptFocusedRef = useRef(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [frameExtractBusy, setFrameExtractBusy] = useState<null | "first" | "last">(null);

  const clearHoverLeaveTimer = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  const openInputCreatePicker = useCallback(
    (
      targetHandle: "text" | "references" | "startImage" | "endImage",
      targetEl: HTMLElement,
      opts?: { screenX?: number; screenY?: number; forceIntent?: "text-or-image" },
    ) => {
      const rect = targetEl.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent("workflow:open-input-picker", {
          detail: {
            targetNodeId: id,
            targetHandleId: targetHandle,
            screenX: Math.round(opts?.screenX ?? rect.left + rect.width + 10),
            screenY: Math.round(opts?.screenY ?? rect.top + rect.height / 2),
            forceIntent: opts?.forceIntent,
            usePointerFlow: Boolean(opts?.forceIntent),
          },
        }),
      );
    },
    [id],
  );

  const handleInputBubblePointerDown = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      targetHandle: "text" | "references" | "startImage" | "endImage",
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const el = event.currentTarget;
      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;
      let longPress = false;
      const timer = window.setTimeout(() => {
        longPress = true;
      }, 280);

      // Preview marker follows the pointer while you drag this bubble.
      window.dispatchEvent(
        new CustomEvent("workflow:input-bubble-preview", {
          detail: {
            targetNodeId: id,
            targetHandleId: targetHandle,
            screenX: Math.round(startX),
            screenY: Math.round(startY),
          },
        }),
      );

      const cleanup = () => {
        window.clearTimeout(timer);
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onCancel, true);

        window.dispatchEvent(
          new CustomEvent("workflow:input-bubble-preview", {
            detail: { active: false },
          }),
        );
      };
      const onMove = (ev: PointerEvent) => {
        if (Math.abs(ev.clientX - startX) > 2 || Math.abs(ev.clientY - startY) > 2) moved = true;
        window.dispatchEvent(
          new CustomEvent("workflow:input-bubble-preview", {
            detail: {
              targetNodeId: id,
              targetHandleId: targetHandle,
              screenX: Math.round(ev.clientX),
              screenY: Math.round(ev.clientY),
            },
          }),
        );
      };
      const onCancel = () => cleanup();
      const onUp = (ev: PointerEvent) => {
        cleanup();

        // If you dragged the bubble, create the next node immediately.
        // - text handle → create a canvas note (sticky) wired to the prompt port
        // - image handles → create an Image generator node
        if (longPress || moved) {
          window.dispatchEvent(
            new CustomEvent("workflow:input-bubble-drop", {
              detail: {
                targetNodeId: id,
                targetHandleId: targetHandle,
                screenX: Math.round(ev.clientX),
                screenY: Math.round(ev.clientY),
              },
            }),
          );
          return;
        }

        // Simple click: keep the old behavior (open the picker).
        if (!moved) openInputCreatePicker(targetHandle, el);
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onCancel, true);
    },
    [openInputCreatePicker],
  );

  const onExtractVideoFrame = useCallback(
    async (which: "first" | "last") => {
      const v = previewVideoRef.current;
      if (!v?.src) {
        toast.error("No video", { description: "Wait until the preview is ready." });
        return;
      }
      setFrameExtractBusy(which);
      try {
        const dataUrl = await extractVideoFrameJpegDataUrl(v, which === "last");
        if (which === "first") {
          patch(id, { videoExtractedFirstFrameUrl: dataUrl });
          toast.success("First frame saved", {
            description: "Wire this module’s output to another video’s start or end port.",
          });
        } else {
          patch(id, { videoExtractedLastFrameUrl: dataUrl });
          toast.success("Last frame saved", {
            description: "Best for continuing into the next clip (start port on the next generator).",
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Try again.";
        const cors =
          /taint|securityerror|insecure/i.test(msg) ||
          (e instanceof DOMException && e.name === "SecurityError");
        toast.error("Could not grab frame", {
          description: cors
            ? "This video can’t be exported from the canvas (CORS). It may still play in the preview."
            : msg,
        });
      } finally {
        setFrameExtractBusy(null);
      }
    },
    [id, patch],
  );

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
    promptFocused ||
    promptEditorOpen ||
    titleEditing;

  const prompt = data.prompt ?? "";
  const defaultAspect = data.kind === "video" ? "9:16" : "1:1";
  const aspectRatio = data.aspectRatio ?? defaultAspect;

  const closeAssistant = () => {
    setAssistantOpen(false);
    setAssistantDescribe("");
    setAssistantResult("");
    setAssistantLoading(false);
  };

  useEffect(() => {
    if (titleEditing) return;
    setTitleDraft(data.label || cfg.title);
  }, [cfg.title, data.label, titleEditing]);

  const commitTitle = useCallback(() => {
    const next = titleDraft.trim();
    patch(id, { label: next || cfg.title });
    setTitleEditing(false);
  }, [cfg.title, id, patch, titleDraft]);

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

  /** Incoming wires counted like `collectLinkedImageUrlsForHandles(..., ["references","in"])`. */
  const imageReferenceWireCount = useStore(
    useCallback(
      (s) => {
        if (data.kind !== "image") return 0;
        return s.edges.filter((e) => {
          if (e.target !== id) return false;
          const h = e.targetHandle ?? "in";
          return h === "references" || h === "in";
        }).length;
      },
      [data.kind, id],
    ),
  );

  const displayTitle = useMemo(() => {
    const base = (data.label || cfg.title).trim();
    // Avoid double-numbering if the label already ends with " #<number>".
    return /#\d+$/.test(base) ? base : `${base} #${displayIndex}`;
  }, [cfg.title, data.label, displayIndex]);

  const frame = useMemo(
    () => outputFrameDimensions(aspectRatio, data.intrinsicAspect),
    [aspectRatio, data.intrinsicAspect],
  );
  const previewUrl = data.outputPreviewUrl ?? data.referencePreviewUrl;
  const previewMediaKind = data.outputMediaKind ?? data.referenceMediaKind;
  const hasPreviewMedia = Boolean(previewUrl);
  const showImageGeneratedChainBubble = useMemo(() => {
    if (data.kind !== "image" || generating) return false;
    const out = data.outputPreviewUrl?.trim();
    if (!out) return false;
    // Prefer explicit kind; still show if missing (older saves) as long as output exists.
    const kind = data.outputMediaKind;
    if (kind === "video") return false;
    return true;
  }, [data.kind, data.outputMediaKind, data.outputPreviewUrl, generating]);

  const showVideoOutputBubbles = useMemo(
    () =>
      data.kind === "video" &&
      Boolean(data.outputPreviewUrl?.trim()) &&
      data.outputMediaKind !== "image" &&
      !generating,
    [data.kind, data.outputMediaKind, data.outputPreviewUrl, generating],
  );
  /** Card width matches preview width + padding so the module hugs every aspect ratio (no side gutters). */
  const cardWidthPx = frame.width + CARD_PAD_X_PX;

  /**
   * Cover the port shell (a plain `div`, not a `<button>`) so React Flow's handle bounds match the visible circle.
   * Native buttons can report inconsistent layout/offset sizes for absolutely positioned children.
   * Override `.react-flow__handle-left` transforms so positioning stays a simple inset box.
   */
  /** Fixed 32×32 so `offsetHeight`/`offsetWidth` always match the bubble (RF uses them for the anchor). Avoid `min-h-0` which can collapse in some layouts. */
  const workflowPortTargetHandleClass =
    "nodrag nopan !absolute !left-0 !top-0 !box-border !h-8 !w-8 !min-h-8 !min-w-8 !max-h-8 !max-w-8 !rounded-full !border-0 !bg-transparent opacity-0 !transform-none";

  /** Outer ring for input ports — `Handle` stays out of `<button>` for correct measurement. */
  const workflowPortBubbleShellClass =
    "relative h-8 w-8 shrink-0 rounded-full border border-white/12 bg-[#1a1a1c]/95 transition hover:border-violet-500/35";

  const workflowPortBubbleHitClass =
    "nodrag nopan absolute inset-0 z-[1] flex cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 shadow-none outline-none ring-0";

  /** Invisible full-bubble overlay for source ports on the right column (ids: `generated`, `videoFirst`, `videoLast`). */
  const workflowPortSourceBubbleHandleClass =
    "nodrag nopan !absolute !inset-0 !z-[2] !box-border !h-8 !w-8 !min-h-8 !min-w-8 !max-h-8 !max-w-8 !rounded-full !border-0 !bg-transparent opacity-0 !transform-none";

  useLayoutEffect(() => {
    if (data.kind === "assistant") return;
    updateNodeInternals(id);
    // Second pass after layout/paint — avoids stale handle bounds when flex/card size settles.
    const t = requestAnimationFrame(() => updateNodeInternals(id));
    return () => cancelAnimationFrame(t);
  }, [
    id,
    updateNodeInternals,
    data.kind,
    cardWidthPx,
    aspectRatio,
    frame.width,
    frame.height,
    hasPreviewMedia,
    showImageGeneratedChainBubble,
    showVideoOutputBubbles,
  ]);

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

  const videoDurationOptions = useMemo(() => {
    if (data.kind !== "video") return [] as string[];
    return studioVideoDurationSecOptions(resolveWorkflowVideoModelId(model));
  }, [data.kind, model]);

  const resolvedVideoModelId = useMemo(
    () => (data.kind === "video" ? resolveWorkflowVideoModelId(model) : ""),
    [data.kind, model],
  );

  const showWorkflowSeedancePreviewPriority =
    data.kind === "video" &&
    (resolvedVideoModelId === "bytedance/seedance-2-preview" ||
      resolvedVideoModelId === "bytedance/seedance-2-fast-preview");

  const videoPriorityEffective: "normal" | "vip" =
    data.kind === "video" && data.videoPriority === "vip" ? "vip" : "normal";

  const estimatedCredits = useMemo(() => {
    if (data.kind === "image") {
      return workflowImageChargeCredits({ model, resolution, quantity });
    }
    if (data.kind === "video") {
      return workflowVideoChargeCredits({
        model,
        resolution,
        durationSec: data.videoDurationSec,
        seedancePriority: videoPriorityEffective,
      });
    }
    return 0;
  }, [
    data.kind,
    data.videoDurationSec,
    data.videoPriority,
    model,
    quantity,
    resolution,
    videoPriorityEffective,
  ]);

  useEffect(() => {
    if (data.kind !== "video") return;
    if (data.videoDurationSec === undefined) return;
    const coerced = coerceWorkflowVideoDurationSec(model, data.videoDurationSec);
    if (data.videoDurationSec !== coerced) {
      patch(id, { videoDurationSec: coerced });
    }
  }, [data.kind, data.videoDurationSec, id, model, patch]);

  const assistantModel = data.assistantModel ?? "claude-sonnet-4-5";
  const assistantMode = data.assistantMode ?? "input";
  const assistantOutput = data.assistantOutput ?? "";
  const onGenerate = useCallback(async () => {
    if (generating) return;

    const nodes = getNodes();
    const edges = getEdges();
    const linkedPrompts =
      data.kind === "image" || data.kind === "video"
        ? collectLinkedPromptTextsForHandles(nodes, edges, id, ["text"])
        : collectLinkedPromptTexts(nodes, edges, id);
    const effectivePrompt = composeWorkflowPrompt(prompt, linkedPrompts);
    if (!effectivePrompt.trim()) {
      toast.error("Add a prompt", {
        description: linkedPrompts.length
          ? "Linked nodes had no usable text. Type a prompt in the module or put text in the connected canvas note."
          : "Type the prompt inside the module, or connect the T (prompt) port to a canvas note whose text should be included.",
      });
      return;
    }

    if (data.kind === "assistant") {
      setGenerating(true);
      try {
        const res = await fetch("/api/gpt/workflow-assistant-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: effectivePrompt,
            model: assistantModel,
          }),
        });
        const json = (await res.json()) as { output?: string; error?: string };
        if (!res.ok || !json.output?.trim()) {
          throw new Error(json.error || "Assistant failed");
        }
        patch(id, {
          assistantOutput: json.output.trim(),
          assistantMode: "output",
        });
        toast.success("Assistant response ready");
      } catch (e) {
        toast.error("Assistant failed", {
          description: e instanceof Error ? e.message : "Try again.",
        });
      } finally {
        setGenerating(false);
      }
      return;
    }

    if (data.kind !== "image" && data.kind !== "video") {
      toast.message("Coming soon", { description: "Run is available for Image and Video generators." });
      return;
    }

    const personalKey = getPersonalApiKey()?.trim() || undefined;
    const piapiKey = getPersonalPiapiApiKey()?.trim() || undefined;
    const creditBypass = isPlatformCreditBypassActive();
    const refUrl = data.referencePreviewUrl?.trim();
    const refImageForImageGen =
      data.referenceMediaKind !== "video" && refUrl ? refUrl : undefined;

    if (data.kind === "image") {
      const linkedImageReferences = collectLinkedImageUrlsForHandles(nodes, edges, id, ["references", "in"]);
      const mergedImageReferences = Array.from(
        new Set([...(refImageForImageGen ? [refImageForImageGen] : []), ...linkedImageReferences]),
      );
      let refsForJob = mergedImageReferences;
      if (refsForJob.length > WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX) {
        toast.message("Reference limit", {
          description: `Using the first ${WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX} of ${refsForJob.length} reference images.`,
        });
        refsForJob = refsForJob.slice(0, WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX);
      }
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
          referenceImageUrls: refsForJob.length ? refsForJob : undefined,
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
    const vCharge = workflowVideoChargeCredits({
      model,
      resolution,
      durationSec: data.videoDurationSec,
      seedancePriority: data.videoPriority === "vip" ? "vip" : "normal",
    });
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
      const linkedFromStartPort = collectLinkedImageUrlsForHandles(nodes, edges, id, ["startImage"]);
      const linkedFromEndPort = collectLinkedImageUrlsForHandles(nodes, edges, id, ["endImage"]);
      const linkedFromReferencesPort = collectLinkedImageUrlsForHandles(nodes, edges, id, ["references"]);
      const nodeRefUrl =
        data.referenceMediaKind === "image" && data.referencePreviewUrl?.trim()
          ? data.referencePreviewUrl.trim()
          : "";
      const startFrame =
        (data.videoStartImageUrl?.trim() || linkedFromStartPort[0] || nodeRefUrl || "").trim() || undefined;
      const endFrame = (data.videoEndImageUrl?.trim() || linkedFromEndPort[0] || "").trim() || undefined;
      const referencePool = [...linkedFromReferencesPort];
      if (nodeRefUrl && startFrame !== nodeRefUrl && !referencePool.includes(nodeRefUrl)) {
        referencePool.push(nodeRefUrl);
      }
      const referenceOnly = Array.from(new Set(referencePool.filter(Boolean))).filter(
        (u) => u !== startFrame && u !== endFrame,
      );

      const { videoUrl } = await runWorkflowVideoJob({
        planId,
        personalApiKey: personalKey,
        piapiApiKey: piapiKey,
        prompt: effectivePrompt,
        model,
        aspectRatio,
        resolution,
        durationSec: data.videoDurationSec,
        seedancePriority: data.videoPriority === "vip" ? "vip" : "normal",
        linkedImageUrl: startFrame,
        referenceImageUrl: undefined,
        endImageUrl: endFrame,
        referenceImageUrls: referenceOnly.length ? referenceOnly : undefined,
      });
      patch(id, {
        outputPreviewUrl: videoUrl,
        outputMediaKind: "video",
        videoExtractedFirstFrameUrl: undefined,
        videoExtractedLastFrameUrl: undefined,
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
    data.videoDurationSec,
    data.videoPriority,
    data.videoStartImageUrl,
    data.videoEndImageUrl,
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
    assistantModel,
  ]);

  if (data.kind === "assistant") {
    const assistantCardWidth = Math.max(cardWidthPx, 520);
    return (
      <>
        <WorkflowNodeContextToolbar nodeId={id} onRun={() => void onGenerate()} />
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121212]/98 px-3 pb-3 pt-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm",
            selected ? "ring-2 ring-violet-500/85 ring-offset-2 ring-offset-[#06070d]" : "",
          )}
          style={{ width: assistantCardWidth }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => window.dispatchEvent(new CustomEvent("workflow:hover-node", { detail: { nodeId: id } }))}
          onMouseLeave={() => window.dispatchEvent(new CustomEvent("workflow:unhover-node"))}
        >
          <Handle
            id="in"
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-violet-500/45 !bg-[#06070d]"
          />
          <Handle
            id="out"
            type="source"
            position={Position.Right}
            className="!h-3 !w-3 !border-2 !border-violet-500/45 !bg-[#06070d]"
          />

          <div className="mb-2 flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-white/75" strokeWidth={2} aria-hidden />
            <p className="min-w-0 truncate text-[13px] font-semibold tracking-tight text-white">
              Assistant #{displayIndex}
            </p>
          </div>

          <div className="mb-2 flex items-center gap-1 rounded-xl border border-white/10 bg-[#0d0d10] p-1">
            <button
              type="button"
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-[12px] font-medium transition",
                assistantMode === "input" ? "bg-white text-zinc-900" : "text-white/75 hover:bg-white/[0.08]",
              )}
              onClick={() => patch(id, { assistantMode: "input" })}
            >
              Input
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-[12px] font-medium transition",
                assistantMode === "output" ? "bg-white text-zinc-900" : "text-white/75 hover:bg-white/[0.08]",
              )}
              onClick={() => patch(id, { assistantMode: "output" })}
            >
              Result
            </button>
          </div>

          {assistantMode === "input" ? (
            <textarea
              value={prompt}
              onChange={(e) => patch(id, { prompt: e.target.value })}
              placeholder="Type your prompt for the assistant..."
              rows={10}
              onFocus={() => setPromptFocused(true)}
              onBlur={() => setPromptFocused(false)}
              className="nodrag nopan min-h-[240px] w-full resize-y rounded-xl border border-white/12 bg-black/35 px-3 py-2 text-[14px] leading-relaxed text-white/92 placeholder:text-white/30 outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/25"
            />
          ) : (
            <div className="nodrag nopan min-h-[240px] w-full overflow-auto rounded-xl border border-white/12 bg-black/35 px-3 py-2 text-[14px] leading-relaxed text-white/88">
              {assistantOutput.trim() ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed text-white/88">
                  {assistantOutput}
                </pre>
              ) : (
                <p className="text-white/35">No result yet. Switch to Input and run the assistant.</p>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <Select
              value={assistantModel}
              onValueChange={(v) => patch(id, { assistantModel: v as AdAssetNodeData["assistantModel"] })}
            >
              <SelectTrigger size="sm" className={cn(selectTriggerClass, "min-w-[12.5rem]")}>
                <SelectValue placeholder="Assistant model" />
              </SelectTrigger>
              <SelectContent className={selectContentClass} position="popper">
                {ASSISTANT_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-[12px] focus:bg-violet-500/20">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              title={generating ? "Running assistant…" : "Run assistant"}
              disabled={generating}
              className="nodrag nopan ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 shadow-md transition hover:bg-white/95 disabled:cursor-not-allowed disabled:opacity-55"
              onClick={() => void onGenerate()}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-900" aria-hidden />
              ) : (
                <RotateCcw className="h-4 w-4 text-zinc-900" strokeWidth={2.25} />
              )}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <WorkflowNodeContextToolbar nodeId={id} onRun={() => void onGenerate()} />
      <div
        className="relative flex gap-1 items-stretch"
        onMouseEnter={() => window.dispatchEvent(new CustomEvent("workflow:hover-node", { detail: { nodeId: id } }))}
        onMouseLeave={() => window.dispatchEvent(new CustomEvent("workflow:unhover-node"))}
      >
      <div className="flex min-w-0 flex-1 items-end gap-1">
      {/* Side tools (reference) */}
      {data.kind === "video" ? (
        <div className="nodrag nopan flex shrink-0 flex-col gap-1 pb-3">
          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
            <Handle
              id="text"
              type="target"
              position={Position.Left}
              className={workflowPortTargetHandleClass}
              aria-label="Prompt text input port"
            />
            <button
              type="button"
              onPointerDown={(e) => handleInputBubblePointerDown(e, "text")}
              title="Prompt text — one incoming wire; compose the main prompt inside the module."
              className={cn(
                workflowPortBubbleHitClass,
                "text-[12px] font-bold leading-none text-white/65 hover:text-white",
              )}
            >
              T
            </button>
          </div>

          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
            <Handle
              id="startImage"
              type="target"
              position={Position.Left}
              className={workflowPortTargetHandleClass}
              aria-label="Start frame image input"
            />
            <button
              type="button"
              onPointerDown={(e) => handleInputBubblePointerDown(e, "startImage")}
              title="Start frame image — one incoming image (first frame / primary reference)."
              className={cn(workflowPortBubbleHitClass, "text-white/65 hover:text-white")}
            >
              <ImageIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
            <Handle
              id="endImage"
              type="target"
              position={Position.Left}
              className={workflowPortTargetHandleClass}
              aria-label="End frame image input"
            />
            <button
              type="button"
              onPointerDown={(e) => handleInputBubblePointerDown(e, "endImage")}
              title="End frame image — one incoming image (last frame when the model supports it)."
              className={cn(workflowPortBubbleHitClass, "text-white/65 hover:text-white")}
            >
              <ImageIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
            <Handle
              id="references"
              type="target"
              position={Position.Left}
              className={workflowPortTargetHandleClass}
              aria-label="Reference images input"
            />
            <button
              type="button"
              onPointerDown={(e) => handleInputBubblePointerDown(e, "references")}
              title="Reference images — unlimited incoming images for models that use extra references."
              className={cn(workflowPortBubbleHitClass, "text-white/65 hover:text-white")}
            >
              <Images className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : data.kind === "image" ? (
        <div className="nodrag nopan flex shrink-0 flex-col gap-1 pb-3">
          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
            <Handle
              id="text"
              type="target"
              position={Position.Left}
              className={workflowPortTargetHandleClass}
              aria-label="Prompt text input port"
            />
            <button
              type="button"
              onPointerDown={(e) => handleInputBubblePointerDown(e, "text")}
              title="Prompt text — one incoming wire; compose the main prompt inside the module."
              className={cn(
                workflowPortBubbleHitClass,
                "text-[12px] font-bold leading-none text-white/65 hover:text-white",
              )}
            >
              T
            </button>
          </div>

          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan relative")}>
            <Handle
              id="references"
              type="target"
              position={Position.Left}
              className={workflowPortTargetHandleClass}
              aria-label="Reference images input"
            />
            <button
              type="button"
              onPointerDown={(e) => handleInputBubblePointerDown(e, "references")}
              title={`Reference images — ${imageReferenceWireCount}/${WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX} connected (max ${WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX} for this job).`}
              className={cn(workflowPortBubbleHitClass, "text-white/65 hover:text-white")}
            >
              <Images className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
            <span
              className="pointer-events-none absolute -right-0.5 -top-1 rounded px-[3px] py-px text-[8px] font-bold tabular-nums leading-none text-white/70 shadow-[0_1px_6px_rgba(0,0,0,0.65)] ring-1 ring-white/12"
              style={{
                background:
                  imageReferenceWireCount >= WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX
                    ? "rgba(251,113,133,0.35)"
                    : "rgba(24,24,27,0.92)",
              }}
              aria-hidden
            >
              {imageReferenceWireCount}/{WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX}
            </span>
          </div>
        </div>
      ) : (
        <div className="nodrag nopan flex shrink-0 flex-col gap-1 pb-3">
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
      )}

      <div
        className="contents"
        data-workflow-generating={
          generating && (data.kind === "image" || data.kind === "video") ? "true" : undefined
        }
      >
      <div className="relative pt-5" style={{ width: cardWidthPx }}>
        <div className="nodrag nopan absolute left-0 top-0 z-[6] flex min-w-0 items-center gap-2.5 pr-2" onPointerDown={(e) => e.stopPropagation()}>
          <Icon className="h-4 w-4 shrink-0 text-white/75" strokeWidth={2} aria-hidden />
          {titleEditing ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setTitleDraft(data.label || cfg.title);
                  setTitleEditing(false);
                }
              }}
              autoFocus
              className="nodrag nopan min-w-0 flex-1 rounded border border-white/20 bg-black/35 px-2 py-0.5 text-[12px] font-semibold tracking-tight text-white outline-none focus:border-violet-400/60"
            />
          ) : (
            <button
              type="button"
              className="nodrag nopan min-w-0 truncate text-left text-[13px] font-semibold tracking-tight text-white"
              onClick={(e) => {
                e.stopPropagation();
                setTitleEditing(true);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setTitleEditing(true);
              }}
              title="Rename"
            >
              {displayTitle}
            </button>
          )}
        </div>
      <div
        className={cn(
          "group/card relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121212]/98 px-3 pb-3 pt-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-[width,border-color] duration-200 ease-out",
          selected ? "ring-2 ring-violet-500/85 ring-offset-2 ring-offset-[#06070d]" : "",
          generating && (data.kind === "image" || data.kind === "video") && "workflow-generator-card--busy",
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
        {data.kind === "image" || data.kind === "video" ? null : (
          <Handle
            id="in"
            type="target"
            position={Position.Left}
            className="!h-3 !w-3 !border-2 !border-violet-500/45 !bg-[#06070d]"
          />
        )}

        <div
          className={cn(
            "relative w-full overflow-hidden rounded-xl",
            hasPreviewMedia ? "mt-0" : "mt-2",
            generating && (data.kind === "image" || data.kind === "video") && "workflow-generator-preview--busy",
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
                ref={previewVideoRef}
                key={previewUrl}
                src={previewUrl}
                className="nodrag nopan absolute inset-0 z-[1] h-full w-full object-cover"
                controls
                playsInline
                preload="metadata"
                title="Generated video preview"
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

          {generating && (data.kind === "image" || data.kind === "video") ? (
            <div
              className="nodrag nopan absolute inset-0 z-[9] flex flex-col items-center justify-center gap-3 bg-black/42 backdrop-blur-[2.5px] transition-[opacity,backdrop-filter] duration-300 ease-out motion-reduce:transition-none"
              aria-live="polite"
              aria-busy="true"
              aria-label={data.kind === "video" ? "Rendering video" : "Generating image"}
            >
              <div className="flex flex-col items-center gap-2.5">
                <div className="relative h-10 w-10" aria-hidden>
                  <span className="absolute inset-0 rounded-full border border-white/[0.09]" />
                  <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-violet-400/88 border-r-violet-400/22 [animation-duration:1.15s] motion-reduce:animate-none" />
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
                  {data.kind === "video" ? "Rendering" : "Generating"}
                </p>
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              "pointer-events-none absolute right-2 top-2 z-[2] rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white/80 transition-opacity duration-300",
              generating && (data.kind === "image" || data.kind === "video") && "opacity-35",
            )}
          >
            {frame.width} × {frame.height}
          </div>

          {hasPreviewMedia ? (
            <button
              type="button"
              className="nodrag nopan absolute inset-x-2 bottom-14 z-[4] rounded-lg border border-white/15 bg-black/35 px-2.5 py-2 text-left text-[12px] leading-snug text-white/92 backdrop-blur-sm transition hover:border-violet-400/45 hover:bg-black/50"
              onClick={() => setPromptEditorOpen(true)}
              onPointerDown={(e) => e.stopPropagation()}
              title="Click to edit prompt"
            >
              <span className="line-clamp-2 whitespace-pre-wrap">
                {prompt.trim() || "Click to write the prompt for this generation"}
              </span>
            </button>
          ) : (
            <p
              className={cn(
                "pointer-events-none absolute bottom-3 left-2 right-2 text-center text-[10px] leading-snug text-white/22 transition-opacity duration-200",
                showEditLayer && "opacity-0",
              )}
            >
              Hover to edit prompt &amp; settings
            </p>
          )}

          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-[5] rounded-b-[10px] px-2 pb-2 pt-10 transition-opacity duration-200",
              "bg-gradient-to-t from-[#0c0c0c] via-[#0c0c0c]/92 to-transparent",
              showEditLayer ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div className="nodrag nopan relative" onPointerDown={(e) => e.stopPropagation()}>
              {!hasPreviewMedia ? (
                <textarea
                  value={prompt}
                  onChange={(e) => patch(id, { prompt: e.target.value })}
                  placeholder={cfg.promptPlaceholder}
                  rows={2}
                  onFocus={() => setPromptFocused(true)}
                  onBlur={() => setPromptFocused(false)}
                  className="min-h-[42px] w-full resize-none rounded-lg border border-white/10 bg-black/55 px-2 py-1.5 pr-8 text-[11px] leading-snug text-white/88 placeholder:text-white/26 outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/25"
                />
              ) : null}
              <button
                type="button"
                title="Prompt assistant — describe what you want"
                className={cn(
                  "rounded-md p-1 text-violet-300/85 transition hover:bg-violet-500/15 hover:text-violet-100",
                  hasPreviewMedia ? "absolute right-1 top-1" : "absolute bottom-1.5 right-1",
                )}
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
                  <div className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-[min(240px,calc(100vw-2rem))] max-h-[min(70vh,26rem)] overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a1c] p-2.5 shadow-xl">
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
                    {data.kind === "video" && videoDurationOptions.length > 0 ? (
                      <>
                        <p className="mb-1.5 mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                          Duration
                        </p>
                        <Select
                          value={String(coerceWorkflowVideoDurationSec(model, data.videoDurationSec))}
                          onValueChange={(v) => patch(id, { videoDurationSec: Number(v) })}
                        >
                          <SelectTrigger size="sm" className={cn(selectTriggerClass, "h-9 w-full max-w-none rounded-lg")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className={selectContentClass} position="popper">
                            {videoDurationOptions.map((r) => (
                              <SelectItem key={r} value={r} className="text-[12px] focus:bg-violet-500/20">
                                {r}s
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    ) : data.kind === "video" && videoDurationOptions.length === 0 ? (
                      <p className="mt-2.5 text-[10px] leading-snug text-white/40">
                        Veo uses a fixed clip length on the provider (~8s). Duration is not adjustable here.
                      </p>
                    ) : null}
                    {showWorkflowSeedancePreviewPriority ? (
                      <div className="mt-2.5 space-y-1">
                        <div className="flex items-center gap-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Priority</p>
                          <span
                            className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-white/18 text-[9px] font-bold text-white/45"
                            title={WORKFLOW_SEEDANCE_PREVIEW_PRIORITY_INFO}
                          >
                            ?
                          </span>
                        </div>
                        <div className="flex gap-1 rounded-lg border border-white/10 bg-black/25 p-1">
                          {(["normal", "vip"] as const).map((tier) => (
                            <button
                              key={tier}
                              type="button"
                              onClick={() => patch(id, { videoPriority: tier })}
                              className={cn(
                                "nodrag nopan flex-1 rounded-md px-2 py-1 text-[10px] font-semibold transition",
                                (data.videoPriority ?? "normal") === tier
                                  ? "border border-violet-400/55 bg-violet-500/15 text-white"
                                  : "border border-white/8 bg-black/20 text-white/55 hover:text-white/75",
                              )}
                            >
                              {tier === "vip" ? "VIP" : "Normal"}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
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

              <div className={cn("nodrag nopan group/run ml-auto flex shrink-0 items-center gap-1.5", hasPreviewMedia && "absolute bottom-2 right-2 z-20 ml-0")}>
                {estimatedCredits > 0 ? (
                  <span className={cn("rounded-md border border-white/10 bg-[#1a1a1c] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white/65 shadow-sm", hasPreviewMedia && "border-white/15 bg-[#0f0f13]/90 backdrop-blur-sm")}>
                    {estimatedCredits} cr
                  </span>
                ) : null}
                <button
                  type="button"
                  title={generating ? "Generating…" : hasPreviewMedia ? "Regenerate" : "Generate"}
                  disabled={generating}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-900 shadow-md transition hover:bg-white/95 disabled:cursor-not-allowed disabled:opacity-55"
                  onClick={() => void onGenerate()}
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-900" aria-hidden />
                  ) : hasPreviewMedia ? (
                    <RotateCcw className="h-4 w-4 text-zinc-900" strokeWidth={2.25} />
                  ) : (
                    <Play className="h-4 w-4 text-zinc-900" strokeWidth={2.25} fill="currentColor" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {promptEditorOpen ? (
            <div
              className="nodrag nopan absolute inset-0 z-[24] flex flex-col justify-end bg-black/35 backdrop-blur-md"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="rounded-t-xl border-t border-white/20 bg-[#111116]/88 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/65">Edit prompt</p>
                  <button
                    type="button"
                    onClick={() => setPromptEditorOpen(false)}
                    className="rounded-md px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    Done
                  </button>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => patch(id, { prompt: e.target.value })}
                  placeholder={cfg.promptPlaceholder}
                  rows={7}
                  onFocus={() => setPromptFocused(true)}
                  onBlur={() => setPromptFocused(false)}
                  className="min-h-[160px] w-full resize-y rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-[13px] leading-relaxed text-white/92 placeholder:text-white/35 outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/25"
                />
              </div>
            </div>
          ) : null}
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
      </div>
      </div>
      {showVideoOutputBubbles || showImageGeneratedChainBubble ? (
        <div className="nodrag nopan relative z-[5] flex shrink-0 flex-col gap-1 self-start pt-5">
          {showVideoOutputBubbles ? (
            <>
              <div
                className={cn(
                  workflowPortBubbleShellClass,
                  "nodrag nopan relative",
                  data.videoExtractedFirstFrameUrl && "border-emerald-400/35",
                )}
              >
                <Handle
                  id="videoFirst"
                  type="source"
                  position={Position.Right}
                  className={workflowPortSourceBubbleHandleClass}
                  aria-label="First frame output"
                  title="First frame — double-click to capture from this video, drag to connect"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    void onExtractVideoFrame("first");
                  }}
                />
                <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/65">
                  {frameExtractBusy === "first" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  )}
                </span>
              </div>
              <div
                className={cn(
                  workflowPortBubbleShellClass,
                  "nodrag nopan relative",
                  data.videoExtractedLastFrameUrl && "border-emerald-400/35",
                )}
              >
                <Handle
                  id="videoLast"
                  type="source"
                  position={Position.Right}
                  className={workflowPortSourceBubbleHandleClass}
                  aria-label="Last frame output"
                  title="Last frame — double-click to capture, drag to the next clip’s start port"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    void onExtractVideoFrame("last");
                  }}
                />
                <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/65">
                  {frameExtractBusy === "last" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  )}
                </span>
              </div>
            </>
          ) : null}
          {showImageGeneratedChainBubble ? (
            <div
              className={cn(workflowPortBubbleShellClass, "nodrag nopan relative border-violet-400/35")}
              title="Generated image — drag to connect another module"
            >
              <Handle
                id="generated"
                type="source"
                position={Position.Right}
                className={workflowPortSourceBubbleHandleClass}
                aria-label="Generated image output"
              />
              <span className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-0.5 px-0.5 text-center">
                <ImageIcon className="h-3 w-3 text-violet-200/90" strokeWidth={2} aria-hidden />
                <span className="max-w-[2.1rem] text-[7px] font-semibold uppercase leading-[1.05] tracking-wide text-violet-200/75">
                  Gen
                </span>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      </div>
    </>
  );
}

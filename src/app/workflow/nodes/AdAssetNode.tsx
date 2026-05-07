"use client";

import {
  Handle,
  Position,
  useReactFlow,
  useStore,
  useStoreApi,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertTriangle,
  Coins,
  ArrowRight,
  Clapperboard,
  ImageIcon,
  Images,
  ImageUpscale,
  Loader2,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Globe2,
  Maximize2,
  Download,
  Type,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HoverCard } from "radix-ui";
import { toast } from "sonner";

import {
  getPersonalApiKey,
  getPersonalPiapiApiKey,
  isPlatformCreditBypassActive,
  useCreditsPlan,
} from "@/app/_components/CreditsPlanContext";
import { WorkflowMediaTrimDialog } from "../WorkflowMediaTrimDialog";
import {
  detailedMessageFromCaughtError,
  userFacingProviderErrorOrDefault,
  userMessageFromCaughtError,
} from "@/lib/generationUserMessage";
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";
import { studioVideoDurationSecOptions } from "@/lib/studioVideoModelCapabilities";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { parseWorkflowRunCorrelationFromLabel } from "@/lib/workflowRunCorrelation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { useWorkflowNodePatch } from "../workflowNodePatchContext";
import { buildWorkflow360ProfileBranch, buildWorkflowProjectPipelineFromRun } from "../workflowProjectPipeline";
import {
  WORKFLOW_AVATAR_360_PROFILE_ALLOWED_MODELS,
  WORKFLOW_AVATAR_360_PROFILE_ASPECT,
  WORKFLOW_AVATAR_360_PROFILE_DEFAULT_MODEL,
  WORKFLOW_AVATAR_360_PROFILE_PROMPT,
} from "../workflowProfile360Preset";
import { keepWheelInsideScrollable } from "../workflowWheelScroll";
import type { WorkflowCanvasNode } from "../workflowFlowTypes";
import {
  collectWorkflowBatchPrompts,
  collectLinkedImageUrlsForHandles,
  collectLinkedVideoUrlsForHandles,
  collectLinkedPromptTexts,
  collectLinkedPromptTextsForHandles,
  composeWorkflowPrompt,
  coerceWorkflowVideoDurationSec,
  resolveWorkflowVideoModelId,
  runWorkflowImageJob,
  runWorkflowMotionControlJob,
  probeWorkflowVideoDurationSec,
  runWorkflowVideoJob,
  estimateWorkflowAdAssetRunCredits,
  workflowImageChargeCredits,
  workflowMotionControlChargeCredits,
  workflowVideoChargeCredits,
  workflowVideoModelHasStartFrame,
  workflowVideoModelHasEndFrame,
  workflowVideoModelHasReferences,
  workflowVideoModelSupportsElements,
  WORKFLOW_SEEDANCE_2_PRO_VIDEO_FILE_ACCEPT,
  WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX,
  splitAssistantOutputToListLines,
  primeRemoteMediaForDisplay,
} from "../workflowNodeRun";
import { workflowVideoExportPixelDimensions } from "../workflowVideoExportDimensions";
import { WorkflowNodeContextToolbar } from "./WorkflowNodeContextToolbar";
import type { ImageRefNodeData } from "./ImageRefNode";
import { buildPromptListNode } from "../workflowNodeFactory";
import { buildImageRefNode } from "../workflowNodeFactory";
import { linkToAdProductPhotoPickerUrls, readUniverseFromExtracted, splitAllScriptOptions } from "@/lib/linkToAdUniverse";

export type AdAssetNodeData = {
  label: string;
  kind: "image" | "video" | "motion" | "variation" | "assistant" | "upscale" | "website";
  /** Generation prompt */
  prompt?: string;
  /** Last prompt text actually used on run (includes linked inputs composition). */
  lastRunPrompt?: string;
  /** Model id (workflow-local; studio wiring later) */
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  /** Image / variation batch count */
  quantity?: number;
  /** Image/Video batch output behavior. */
  generatorExportMode?: "list" | "modules";
  /** width ÷ height, when set, module frame matches this exact shape */
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
  /** Assistant run export behavior. */
  assistantExportMode?: "text" | "list";
  /** When set, `/api/gpt/workflow-assistant-chat` uses vision + preset developer copy. */
  assistantVisionPreset?: "image_to_json";
  /** Website module URL input. */
  websiteUrl?: string;
  /** Website module output behavior after run. */
  websiteOutputMode?: "product_images" | "angles" | "full_flow" | "profile_360";
  /** Image-only preset workflows (canvas hides text prompt). */
  imageWorkflowPreset?: "profile_360";
  /** Product image nodes to emit when `websiteOutputMode=product_images`. */
  websiteProductImageCount?: 1 | 3 | 5;
  /** Website module has successfully run at least once. */
  websiteLastRunAt?: string;
  /** Video-specific selected start/end frames. */
  videoStartImageUrl?: string;
  videoEndImageUrl?: string;
  /** Video: clip length in seconds (per model). */
  videoDurationSec?: number;
  /** Video: Seedance 2 Preview / Fast Preview queue tier (doubles credits when VIP). */
  videoPriority?: "normal" | "vip";
  /** Video node born from video-output chaining flow (restrict picker models). */
  videoInputMode?: "seedance_only";
  /** Motion Control params (mirrors Studio Motion Control). */
  motionAutoSettings?: boolean;
  motionBackgroundSource?: "input_video" | "input_image";
  /** Last detected duration from the connected Motion Control video input. */
  motionInputDurationSec?: number;
  /**
   * JPEG data URLs of the output video’s first / last frame (grabbed from the preview).
   * When this module’s `out` is wired to another video’s `startImage` / `endImage`, these are used as stills (last frame preferred for continuations).
   */
  videoExtractedFirstFrameUrl?: string;
  videoExtractedLastFrameUrl?: string;
  /**
   * Durable in-flight run metadata so image/video runs can resume after reload/navigation.
   */
  pendingWorkflowRun?: {
    mediaKind: "image" | "video";
    taskIds: string[];
    progressListId?: string | null;
    listLabel?: string;
    updatedAt: number;
    /** Binds `/api/studio/generations/poll` rows to this run only (critical for simultaneous runs). */
    correlationId?: string;
  };
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
  motion: {
    icon: Clapperboard,
    previewTint: "from-violet-600/[0.08] via-transparent to-black/40",
    title: "Motion Control",
    promptPlaceholder: "Describe the scene/background details while motion follows the reference clip…",
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
  website: {
    icon: Globe2,
    previewTint: "from-cyan-500/[0.08] via-transparent to-black/40",
    title: "Website",
    promptPlaceholder: "Paste a product URL to extract Link-to-Ad assets…",
  },
} as const;

const IMAGE_MODELS: { value: string; label: string }[] = [
  { value: "pro", label: "NanoBanana Pro" },
  { value: "nano", label: "NanoBanana 2" },
  { value: "seedream_45", label: "Seedream 4.5" },
  { value: "seedream_50_lite", label: "Seedream 5.0 Lite" },
  { value: "google_nano_banana", label: "Google Nano Banana" },
  { value: "gpt_image_2", label: "GPT Image 2" },
];

const VIDEO_MODELS: { value: string; label: string }[] = [
  { value: "kling-3.0/video", label: "Kling 3.0" },
  { value: "kling-2.5-turbo/video", label: "Kling 2.5 Turbo" },
  { value: "kling-2.6/video", label: "Kling 2.6" },
  { value: "openai/sora-2", label: "Sora 2" },
  { value: "openai/sora-2-pro", label: "Sora 2 Pro" },
  { value: "bytedance/seedance-2", label: "Seedance 2.0" },
  { value: "bytedance/seedance-2-fast", label: "Seedance 2.0 Fast" },
  { value: "veo3_lite", label: "Veo 3.1 Lite" },
  { value: "veo3_fast", label: "Veo 3.1 Fast" },
  { value: "veo3", label: "Veo 3.1 Quality" },
];
const VIDEO_CHAIN_SEEDANCE_MODELS: { value: string; label: string }[] = [
  { value: "bytedance/seedance-2-fast", label: "Seedance 2.0 Fast" },
  { value: "bytedance/seedance-2", label: "Seedance 2.0" },
];

const MOTION_CONTROL_MODELS: { value: string; label: string }[] = [
  { value: "kling-3.0", label: "Kling 3.0 Motion Control" },
  { value: "kling-2.6", label: "Kling 2.6 Motion Control" },
];

const ASSISTANT_MODELS: Array<{ value: "claude-sonnet-4-5" | "gpt-5o"; label: string }> = [
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { value: "gpt-5o", label: "GPT 5o" },
];

const ASSISTANT_EXPORT_MODES: Array<{ value: "text" | "list"; label: string }> = [
  { value: "text", label: "Export as Text" },
  { value: "list", label: "Export as List" },
];

const WEBSITE_OUTPUT_MODES: Array<{
  value: "product_images" | "angles" | "full_flow" | "profile_360";
  label: string;
  hint: string;
}> = [
  { value: "full_flow", label: "Build full flow", hint: "Creates a full Link-to-Ad workflow branch." },
  { value: "angles", label: "Extract 3 angles", hint: "Exports script angles into a List node." },
  { value: "product_images", label: "Extract product images", hint: "Creates media nodes from product photos." },
  {
    value: "profile_360",
    label: "360° profile",
    hint: "Adds a preset Image Generator; you wire the source image (avatar, upload, or canvas image).",
  },
];

const VARIATION_MODELS: { value: string; label: string }[] = [
  { value: "creative", label: "Creative" },
  { value: "faithful", label: "Faithful" },
];

const IMAGE_ASPECTS = ["1:1", "4:5", "9:16", "16:9", "3:2"] as const;
const VIDEO_ASPECTS = ["9:16", "16:9", "1:1"] as const;
const VARIATION_ASPECTS = ["1:1", "4:5", "9:16", "16:9"] as const;

const IMAGE_RESOLUTIONS = ["1K", "2K", "4K"] as const;
const VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;
const VARIATION_RESOLUTIONS = ["1024", "1536", "2K"] as const;

const WORKFLOW_ASSISTANT_CREDITS_BY_MODEL: Record<"claude-sonnet-4-5" | "gpt-5o", number> = {
  "claude-sonnet-4-5": 2,
  "gpt-5o": 0,
};
/** Match Video Generator sidebar text ports only (legacy center `in` handle removed). */
const WORKFLOW_TEXT_INPUT_HANDLES = ["text", "inText"] as const;
const WORKFLOW_PENDING_MEDIA_PREFIX = "__workflow_pending_media__:";
const WORKFLOW_ERROR_MEDIA_PREFIX = "__workflow_error_media__:";
const WORKFLOW_PENDING_POLL_MS = 3500;

type WorkflowPollHistoryItem = {
  externalTaskId?: string;
  status?: "ready" | "failed" | "generating";
  mediaUrl?: string;
  errorMessage?: string;
  studioGenerationKind?: string;
  createdAt?: number;
  label?: string;
  workflowRunCorrelation?: string;
};

function workflowMediaErrorToken(params: {
  nodeId: string;
  prompt: string;
  kind: "image" | "video";
  message: string;
}): string {
  try {
    const payload = JSON.stringify({
      nodeId: params.nodeId,
      prompt: params.prompt,
      kind: params.kind,
      message: params.message,
    });
    return `${WORKFLOW_ERROR_MEDIA_PREFIX}${encodeURIComponent(payload)}`;
  } catch {
    const fallback = encodeURIComponent(params.message || `${params.kind} generation failed`);
    return `${WORKFLOW_ERROR_MEDIA_PREFIX}${fallback}`;
  }
}

function isWorkflowResolvedMediaLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith(WORKFLOW_PENDING_MEDIA_PREFIX)) return false;
  if (t.startsWith(WORKFLOW_ERROR_MEDIA_PREFIX)) return false;
  return true;
}

/** Race window (ms) within which a freshly-started run is allowed to adopt a server-side workflow row that was created without a synced task id. */
const WORKFLOW_RACE_RECOVERY_WINDOW_MS = 90_000;

/**
 * List node already wired from this generator's media output (Assistant reuses text lists the same way).
 */
function findLinkedWorkflowMediaResultsListId(
  nodes: Node[],
  edges: Edge[],
  sourceId: string,
  media: "image" | "video",
): string | null {
  const targetHandle = media === "image" ? "inImage" : "inVideo";
  const linkedId = edges
    .filter((e) => {
      if (e.source !== sourceId || e.targetHandle !== targetHandle) return false;
      const sh = e.sourceHandle ?? "out";
      if (media === "image") {
        return sh === "generated" || sh === "out";
      }
      return sh === "out";
    })
    .map((e) => e.target)
    .find((tid) => nodes.some((n) => n.id === tid && n.type === "promptList"));
  return linkedId ?? null;
}

const selectTriggerClass =
  "nodrag nopan h-6 max-h-6 min-h-6 shrink-0 rounded-full border-white/12 bg-[#1c1c1f] text-[9px] font-medium text-white/90 shadow-none hover:bg-[#252528] focus:ring-1 focus:ring-violet-500/35 data-[size=default]:h-6 data-[size=sm]:h-6 px-1.5 gap-0.5 [&>svg:last-of-type]:h-3 [&>svg:last-of-type]:w-3 [&>svg:last-of-type]:opacity-45";

/** Tighter selects in the image/video generator bottom strip (single-line layout). */
const generatorSelectTriggerExtras =
  "[&_[data-slot=select-value]]:max-w-[4.25rem] [&_[data-slot=select-value]]:truncate [&_[data-slot=select-value]]:text-left";

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

function triggerMediaDownload(url: string, fallbackName: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  const a = document.createElement("a");
  if (/^blob:|^data:/i.test(trimmed)) {
    a.href = trimmed;
    a.download = fallbackName;
  } else {
    a.href = `/api/download?url=${encodeURIComponent(trimmed)}`;
  }
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
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
  const VIDEO_FRAME_MIN_EDGE = 300;
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
  const minEdge = Math.min(tw, th);
  if (minEdge < VIDEO_FRAME_MIN_EDGE) {
    const upScale = VIDEO_FRAME_MIN_EDGE / minEdge;
    tw = Math.max(VIDEO_FRAME_MIN_EDGE, Math.round(tw * upScale));
    th = Math.max(VIDEO_FRAME_MIN_EDGE, Math.round(th * upScale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read frame");

  ctx.drawImage(video, 0, 0, tw, th);
  return canvas.toDataURL("image/jpeg", 0.88);
}

/**
 * Load a video URL in a detached element and capture a JPEG frame.
 *
 * Remote video CDNs (Kling / PiAPI / Veo) typically don't return
 * `Access-Control-Allow-Origin: *`, so loading them directly in a `<video>`
 * with `crossOrigin="anonymous"` taints the canvas and `canvas.toDataURL()`
 * throws. Going through the authenticated `/api/download` proxy turns the
 * fetch into a same-origin Blob, so the resulting object URL is never
 * tainted and the extraction works for any supported video provider.
 */
async function extractVideoFrameJpegDataUrlFromUrl(videoUrl: string, end: boolean): Promise<string> {
  const trimmed = videoUrl.trim();
  if (!trimmed) throw new Error("Missing video URL");

  let blob: Blob | null = null;
  if (/^blob:|^data:/i.test(trimmed)) {
    const r = await fetch(trimmed, { cache: "no-store" });
    if (!r.ok) throw new Error(`Could not read video (${r.status})`);
    blob = await r.blob();
  } else {
    try {
      const r = await fetch(`/api/download?url=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      if (r.ok) blob = await r.blob();
    } catch {
      // proxy unreachable — fall through to direct CORS attempt
    }
    if (!blob) {
      const r = await fetch(trimmed, { mode: "cors", cache: "no-store" });
      if (!r.ok) throw new Error(`Could not download video (${r.status})`);
      blob = await r.blob();
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const v = document.createElement("video");
  v.preload = "auto";
  v.muted = true;
  v.playsInline = true;
  v.src = objectUrl;
  try {
    return await extractVideoFrameJpegDataUrl(v, end);
  } finally {
    v.pause();
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(objectUrl);
  }
}
/** Horizontal padding from `px-3` on the card (left + right). */
const CARD_PAD_X_PX = 0;

/**
 * Preview frame size in px: exact aspect ratio, with 1:1 as the minimum base size.
 * Wider/taller ratios expand the other side instead of shrinking.
 */
function outputFrameDimensions(ratio: string, intrinsicAspect?: number): { width: number; height: number } {
  if (intrinsicAspect != null && Number.isFinite(intrinsicAspect) && intrinsicAspect > 0) {
    const ar = intrinsicAspect;
    if (ar >= 1) {
      const height = OUTPUT_FRAME_MAX_LONG;
      const width = Math.max(80, Math.round(OUTPUT_FRAME_MAX_LONG * ar));
      return { width, height };
    }
    const width = OUTPUT_FRAME_MAX_LONG;
    const height = Math.max(80, Math.round(OUTPUT_FRAME_MAX_LONG / ar));
    return { width, height };
  }
  const { w: rw, h: rh } = parseAspectParts(ratio);
  const ar = rw / rh;
  if (!Number.isFinite(ar) || ar <= 0) return { width: OUTPUT_FRAME_MAX_LONG, height: OUTPUT_FRAME_MAX_LONG };
  if (ar >= 1) {
    const height = OUTPUT_FRAME_MAX_LONG;
    const width = Math.max(80, Math.round(OUTPUT_FRAME_MAX_LONG * ar));
    return { width, height };
  }
  const width = OUTPUT_FRAME_MAX_LONG;
  const height = Math.max(80, Math.round(OUTPUT_FRAME_MAX_LONG / ar));
  return { width, height };
}

export function AdAssetNode({ id, data, selected }: NodeProps<AdAssetNodeType>) {
  const patch = useWorkflowNodePatch();
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  const storeApi = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();
  const { planId, current: creditsBalance, spendCredits, grantCredits } = useCreditsPlan();
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;
  const cfg = kindConfig[data.kind];
  const Icon = cfg.icon;
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantDescribe, setAssistantDescribe] = useState("");
  const [assistantResult, setAssistantResult] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [runChoiceOpen, setRunChoiceOpen] = useState(false);
  const [cardHovered, setCardHovered] = useState(false);
  const [generating, setGenerating] = useState(false);
  /**
   * Last user-facing error from an image/video run on this node. Sticks in the UI
   * (overlay + toast already shown) so the user actually sees what went wrong with
   * piapi / provider failures instead of just a silently dropped “processing” state.
   * Cleared at the start of every new run and when a successful media URL arrives.
   */
  const [lastGenerationError, setLastGenerationError] = useState<string | null>(null);
  const [lastGenerationErrorDetails, setLastGenerationErrorDetails] = useState<string | null>(null);
  const [errorDetailsOpen, setErrorDetailsOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const [promptFocused, setPromptFocused] = useState(false);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [promptEditorDraft, setPromptEditorDraft] = useState("");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.label || cfg.title);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelMenuOpenRef = useRef(false);
  const aspectMenuOpenRef = useRef(false);
  const assistantOpenRef = useRef(false);
  const promptFocusedRef = useRef(false);
  const promptEditorOpenRef = useRef(false);
  const promptEditorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const compactPromptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const seedanceProVideoFileInputRef = useRef<HTMLInputElement>(null);
  const [seedanceProVideoUploadBusy, setSeedanceProVideoUploadBusy] = useState(false);
  const [seedanceProVideoTrimFile, setSeedanceProVideoTrimFile] = useState<File | null>(null);
  const [frameExtractBusy, setFrameExtractBusy] = useState<null | "first" | "last">(null);
  const [outputPreviewLightbox, setOutputPreviewLightbox] = useState(false);
  const [motionDetectedInputDurationSec, setMotionDetectedInputDurationSec] = useState<number | null>(
    typeof data.motionInputDurationSec === "number" && Number.isFinite(data.motionInputDurationSec)
      ? data.motionInputDurationSec
      : null,
  );
  const previousReferenceSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (data.kind !== "image" && data.kind !== "video" && data.kind !== "motion") return;
    const currentSignature = [
      data.referencePreviewUrl ?? "",
      data.referenceMediaKind ?? "",
      data.referenceSource ?? "",
      data.videoStartImageUrl ?? "",
      data.videoEndImageUrl ?? "",
    ].join("|");
    const previous = previousReferenceSignatureRef.current;
    if (previous == null) {
      previousReferenceSignatureRef.current = currentSignature;
      return;
    }
    if (previous === currentSignature) return;
    previousReferenceSignatureRef.current = currentSignature;
    // Only invalidate the generated preview when the node had a meaningful set
    // of references and the user changed them. On reload, we can briefly see an
    // "empty" signature (e.g. local state) before the cloud-synced state lands.
    // That transition must not wipe the user's output preview.
    const hasAny = (sig: string) => sig.split("|").some((s) => Boolean(s && s.trim()));
    if (!hasAny(previous) || !hasAny(currentSignature)) return;
    if (!data.outputPreviewUrl?.trim()) return;
    patch(id, {
      outputPreviewUrl: undefined,
      outputMediaKind: undefined,
      videoExtractedFirstFrameUrl: undefined,
      videoExtractedLastFrameUrl: undefined,
    });
  }, [
    data.kind,
    data.outputPreviewUrl,
    data.referencePreviewUrl,
    data.referenceMediaKind,
    data.referenceSource,
    data.videoStartImageUrl,
    data.videoEndImageUrl,
    id,
    patch,
  ]);

  const clearHoverLeaveTimer = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  };

  const openInputCreatePicker = useCallback(
    (
      targetHandle: "text" | "references" | "startImage" | "endImage" | "inVideo",
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
      event: React.PointerEvent<HTMLElement>,
      targetHandle: "text" | "references" | "startImage" | "endImage" | "inVideo",
    ) => {
      // While dragging a connector, let React Flow own pointer handling so edges snap correctly.
      if (storeApi.getState().connection.inProgress) return;
      const el = event.currentTarget;
      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;
      let longPress = false;
      const timer = window.setTimeout(() => {
        longPress = true;
      }, 280);

      const cleanup = () => {
        window.clearTimeout(timer);
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onCancel, true);
      };
      const onMove = (ev: PointerEvent) => {
        if (Math.abs(ev.clientX - startX) > 2 || Math.abs(ev.clientY - startY) > 2) moved = true;
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
    [id, openInputCreatePicker, storeApi],
  );

  const onExtractVideoFrame = useCallback(
    async (which: "first" | "last") => {
      const fallbackVideoUrl = (data.outputPreviewUrl ?? data.referencePreviewUrl ?? "").trim();
      const v = previewVideoRef.current;
      setFrameExtractBusy(which);
      try {
        let dataUrl: string;
        if (v?.src) {
          try {
            dataUrl = await extractVideoFrameJpegDataUrl(v, which === "last");
          } catch {
            if (!fallbackVideoUrl) throw new Error("Preview frame capture failed and no video URL is available.");
            dataUrl = await extractVideoFrameJpegDataUrlFromUrl(fallbackVideoUrl, which === "last");
          }
        } else if (fallbackVideoUrl) {
          dataUrl = await extractVideoFrameJpegDataUrlFromUrl(fallbackVideoUrl, which === "last");
        } else {
          toast.error("No video", { description: "Wait until the preview is ready or generate a clip first." });
          return;
        }
        if (which === "first") {
          patch(id, { videoExtractedFirstFrameUrl: dataUrl });
          toast.success("First frame saved", {
            description: "Thumbnail on the S bubble; wire S or use references with this module.",
          });
        } else {
          patch(id, { videoExtractedLastFrameUrl: dataUrl });
          toast.success("Last frame saved", {
            description: "Thumbnail on the E bubble; wire E into the next clip’s start or references.",
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
    [data.outputPreviewUrl, data.referencePreviewUrl, id, patch],
  );
  const openOutputPreviewLightbox = useCallback(() => {
    const outputUrl = (data.outputPreviewUrl ?? data.referencePreviewUrl ?? "").trim();
    if (!outputUrl) return;
    setOutputPreviewLightbox(true);
  }, [data.outputPreviewUrl, data.referencePreviewUrl]);
  const downloadPreviewMedia = useCallback(() => {
    const outputUrl = (data.outputPreviewUrl ?? data.referencePreviewUrl ?? "").trim();
    if (!outputUrl) return;
    const fallbackName = data.kind === "video" ? "workflow-video.mp4" : "workflow-image.jpg";
    triggerMediaDownload(outputUrl, fallbackName);
  }, [data.kind, data.outputPreviewUrl, data.referencePreviewUrl]);

  const attachSeedanceProReferenceVideoFile = useCallback(
    async (file: File) => {
      setSeedanceProVideoUploadBusy(true);
      try {
        const hostedUrl = await uploadFileToCdn(file, { kind: "video" });
        patch(id, {
          referencePreviewUrl: hostedUrl,
          referenceMediaKind: "video",
          referenceSource: "upload",
        });
        toast.success("Reference video attached");
      } catch {
        toast.error("Could not upload video", { description: "Try MP4 or MOV under the size limit." });
      } finally {
        setSeedanceProVideoUploadBusy(false);
      }
    },
    [id, patch],
  );

  const onSeedanceProReferenceVideoSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const objectUrl = URL.createObjectURL(file);
        try {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.src = objectUrl;
          const duration = await new Promise<number>((resolve, reject) => {
            v.onloadedmetadata = () => resolve(Number(v.duration || 0));
            v.onerror = () => reject(new Error("Could not read video duration."));
          });
          if (Number.isFinite(duration) && duration > 15.01) {
            setSeedanceProVideoTrimFile(file);
            return;
          }
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        // If metadata fails, fall through and attempt upload (server may still accept it).
      }
      await attachSeedanceProReferenceVideoFile(file);
    },
    [attachSeedanceProReferenceVideoFile],
  );
  const normalizeCompletedMediaLines = useCallback((lines: string[]): string[] => {
    return lines
      .map((x) => x.trim())
      .filter((x) => x.length > 0 && !x.startsWith(WORKFLOW_PENDING_MEDIA_PREFIX));
  }, []);
  const finalizeProgressMediaList = useCallback(
    (listId: string, preferredLines?: string[], label?: string) => {
      const fromNode = getNodes().find((n) => n.id === listId);
      const currentLines = Array.isArray(fromNode?.data?.lines)
        ? (fromNode?.data?.lines as string[])
        : [];
      const cleaned = normalizeCompletedMediaLines(preferredLines ?? currentLines);
      patch(listId, {
        ...(label?.trim() ? { label: label.trim() } : {}),
        lines: cleaned,
        mode: "results",
        contentKind: "media",
      });
    },
    [getNodes, normalizeCompletedMediaLines, patch],
  );
  const setPendingWorkflowRun = useCallback(
    (
      run: {
        mediaKind: "image" | "video";
        taskIds: string[];
        progressListId?: string | null;
        listLabel?: string;
        correlationId?: string | null;
      } | null,
    ) => {
      if (!run) {
        patch(id, { pendingWorkflowRun: undefined });
        return;
      }
      const corr = run.correlationId?.trim();
      patch(id, {
        pendingWorkflowRun: {
          mediaKind: run.mediaKind,
          /** Keep placeholder slots (`""`) so parallel batch prompts map deterministically onto rows. */
          taskIds: run.taskIds.map((t) => (typeof t === "string" ? t.trim() : "")),
          progressListId: run.progressListId ?? null,
          listLabel: run.listLabel,
          ...(corr ? { correlationId: corr } : {}),
          updatedAt: Date.now(),
        },
      });
    },
    [id, patch],
  );

  useEffect(() => () => clearHoverLeaveTimer(), []);
  modelMenuOpenRef.current = modelMenuOpen;
  aspectMenuOpenRef.current = aspectMenuOpen;
  assistantOpenRef.current = assistantOpen;
  promptFocusedRef.current = promptFocused;
  promptEditorOpenRef.current = promptEditorOpen;

  useEffect(() => {
    if (modelMenuOpen || aspectMenuOpen) clearHoverLeaveTimer();
  }, [modelMenuOpen, aspectMenuOpen]);

  const showEditLayer =
    cardHovered ||
    modelMenuOpen ||
    aspectMenuOpen ||
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
  const hasDownstreamModules = useStore(
    useCallback((s) => s.edges.some((e) => e.source === id), [id]),
  );

  /** Incoming image wires (360° preset: references only — no dedicated start-frame row). */
  const imageReferenceWireCount = useStore(
    useCallback(
      (s) => {
        if (data.kind !== "image") return 0;
        const profile360 = data.imageWorkflowPreset === "profile_360";
        return s.edges.filter((e) => {
          if (e.target !== id) return false;
          const h = e.targetHandle ?? "";
          if (profile360) return h === "references" || h === "inImage";
          return h === "references" || h === "startImage" || h === "inImage";
        }).length;
      },
      [data.kind, data.imageWorkflowPreset, id],
    ),
  );
  /** Assistant: image wires on reference ports (`references`/`inImage`; Image → JSON skips `startImage`). */
  const assistantReferenceWireCount = useStore(
    useCallback(
      (s) => {
        if (data.kind !== "assistant") return 0;
        const imageToJsonOnlyRefs = data.assistantVisionPreset === "image_to_json";
        return s.edges.filter((e) => {
          if (e.target !== id) return false;
          const h = e.targetHandle ?? "";
          if (imageToJsonOnlyRefs) return h === "references" || h === "inImage";
          return h === "references" || h === "startImage" || h === "inImage";
        }).length;
      },
      [data.assistantVisionPreset, data.kind, id],
    ),
  );
  /** Assistant: number of text wires connected to prompt handles (`text` / `inText`). */
  const assistantTextInputWireCount = useStore(
    useCallback(
      (s) => {
        if (data.kind !== "assistant") return 0;
        return s.edges.filter((e) => {
          if (e.target !== id) return false;
          const h = e.targetHandle ?? "";
          return WORKFLOW_TEXT_INPUT_HANDLES.includes(h as (typeof WORKFLOW_TEXT_INPUT_HANDLES)[number]);
        }).length;
      },
      [data.kind, id],
    ),
  );
  /** Assistant: linked reference image URLs (for visual preview in card header). */
  const assistantLinkedReferencePreviewUrls = useStore(
    useCallback(
      (s) => {
        if (data.kind !== "assistant") return [] as string[];
        const imageToJsonOnlyRefs = data.assistantVisionPreset === "image_to_json";
        const byId = new Map(s.nodes.map((n) => [n.id, n]));
        const out: string[] = [];
        const seen = new Set<string>();
        for (const e of s.edges) {
          if (e.target !== id) continue;
          const h = e.targetHandle ?? "";
          if (imageToJsonOnlyRefs) {
            if (h !== "references" && h !== "inImage") continue;
          } else if (h !== "references" && h !== "startImage" && h !== "inImage") {
            continue;
          }
          const src = byId.get(e.source);
          if (!src) continue;
          if (src.type === "imageRef") {
            const d = src.data as ImageRefNodeData;
            if (d.mediaKind === "video") continue;
            const u = (d.imageUrl ?? "").trim();
            if (!u || seen.has(u)) continue;
            seen.add(u);
            out.push(u);
            continue;
          }
          if (src.type === "adAsset") {
            const d = src.data as AdAssetNodeData;
            const k = d.outputMediaKind ?? d.referenceMediaKind;
            if (k === "video") continue;
            const u = (d.outputPreviewUrl ?? d.referencePreviewUrl ?? "").trim();
            if (!u || seen.has(u)) continue;
            seen.add(u);
            out.push(u);
          }
        }
        return out;
      },
      [data.assistantVisionPreset, data.kind, id],
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
  const previewLightboxIsVideo =
    previewMediaKind === "video" ||
    (data.kind === "video" && previewMediaKind !== "image");

  useEffect(() => {
    if (!previewUrl) setOutputPreviewLightbox(false);
  }, [previewUrl]);

  useEffect(() => {
    if (!outputPreviewLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOutputPreviewLightbox(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [outputPreviewLightbox]);

  const emitRunFinished = useCallback(
    (ok: boolean) => {
      window.dispatchEvent(new CustomEvent("workflow:node-run-finished", { detail: { nodeId: id, success: ok } }));
    },
    [id],
  );
  const emitRunLog = useCallback(
    (level: "info" | "error" | "success", message: string) => {
      const nodeLabel = ((data.label || cfg.title || data.kind || "Node").trim() || "Node");
      window.dispatchEvent(
        new CustomEvent("workflow:run-log", {
          detail: {
            ts: Date.now(),
            nodeId: id,
            nodeLabel,
            level,
            message,
          },
        }),
      );
    },
    [cfg.title, data.kind, data.label, id],
  );

  const pendingPollAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (data.kind !== "image" && data.kind !== "video" && data.kind !== "motion") return;
    const pending = data.pendingWorkflowRun;
    if (!pending) return;
    const correl = pending.correlationId?.trim() ?? "";
    const rawSlotTaskIds = (pending.taskIds ?? []).map((t) => String(t ?? "").trim());
    const resolvedIds = rawSlotTaskIds.filter((t) => t.length > 0);
    const pendingMediaKind = pending.mediaKind ?? (data.kind === "video" || data.kind === "motion" ? "video" : "image");
    const updatedAt = pending.updatedAt ?? 0;
    const fresh = updatedAt > 0 && Date.now() - updatedAt < WORKFLOW_RACE_RECOVERY_WINDOW_MS;
    const slotCount = rawSlotTaskIds.length;
    /** Empty placeholder slots imply we are still awaiting provider task ids (must not widen poll matching loosely). */
    const hasResolvedTasks = resolvedIds.length > 0;
    if (!hasResolvedTasks && !fresh) return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let trackedTaskIds = slotCount > 0 ? [...rawSlotTaskIds] : [...resolvedIds];
    const expectedKindForMedia = pendingMediaKind === "video" ? "workflow_video" : "workflow_image";
    setGenerating(true);

    const poll = async () => {
      let done = false;
      try {
        pendingPollAbortRef.current?.abort();
        const controller = new AbortController();
        pendingPollAbortRef.current = controller;
        const res = await fetch("/api/studio/generations/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            kind: "workflow",
            personalApiKey: getPersonalApiKey()?.trim() || undefined,
            piapiApiKey: getPersonalPiapiApiKey()?.trim() || undefined,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          data?: WorkflowPollHistoryItem[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!alive) return;

        const items = json.data ?? [];
        const byTask = new Map<string, WorkflowPollHistoryItem>();
        for (const item of items) {
          const tid = (item.externalTaskId ?? "").trim();
          if (!tid) continue;
          byTask.set(tid, item);
        }

        const missingEveryTaskId = trackedTaskIds.length === 0 || trackedTaskIds.every((tid) => !tid.trim());
        if (missingEveryTaskId) {
          // Race recovery: pendingWorkflowRun sometimes persists before `/start` attaches task ids — or parallel
          // batch placeholders remain `""` until server rows exist. Must never merge another run’s rows (simultaneous
          // generators / tabs / spaces), so when `correlationId` exists we require a label match.
          const candidates = items.filter((it) => {
            if (it.studioGenerationKind !== expectedKindForMedia) return false;
            if (!it.externalTaskId?.trim()) return false;
            if (it.status !== "generating" && it.status !== "ready" && it.status !== "failed") return false;
            const created = typeof it.createdAt === "number" ? it.createdAt : NaN;
            if (!Number.isFinite(created)) return false;
            return created >= updatedAt - 5_000 && created <= updatedAt + WORKFLOW_RACE_RECOVERY_WINDOW_MS;
          });
          const narrowed = correl
            ? candidates.filter((it) => {
                const cid =
                  typeof it.workflowRunCorrelation === "string" && it.workflowRunCorrelation.trim()
                    ? it.workflowRunCorrelation.trim()
                    : parseWorkflowRunCorrelationFromLabel(it.label);
                return Boolean(cid && cid === correl);
              })
            : candidates;
          const pool = narrowed;
          if (pool.length === 0) {
            // Keep recovering for the full race-recovery window. Providers can
            // acknowledge task ids late, so aborting after a fixed small poll
            // count creates false "lost request" failures.
            if (Date.now() - updatedAt > WORKFLOW_RACE_RECOVERY_WINDOW_MS) {
              setPendingWorkflowRun(null);
              setGenerating(false);
              const lostMsg =
                pendingMediaKind === "video"
                  ? "Video generation request was lost (no provider task id). Try regenerating."
                  : "Image generation request was lost (no provider task id). Try regenerating.";
              setLastGenerationError(lostMsg);
              setLastGenerationErrorDetails(null);
              setErrorDetailsOpen(false);
              toast.error(lostMsg);
              emitRunLog("error", lostMsg);
              window.dispatchEvent(
                new CustomEvent("workflow:node-run-finished", {
                  detail: { nodeId: id, success: false },
                }),
              );
              done = true;
              return;
            }
            return;
          }
          const matched = pool
            .sort((a, b) =>
              correl
                ? (a.createdAt ?? 0) - (b.createdAt ?? 0)
                : Math.abs((a.createdAt ?? 0) - updatedAt) - Math.abs((b.createdAt ?? 0) - updatedAt),
            )
            .map((c) => (c.externalTaskId ?? "").trim())
            .filter(Boolean) as string[];
          if (!matched.length) return;
          if (slotCount > 0 && trackedTaskIds.every((tid) => !tid.trim())) {
            trackedTaskIds = trackedTaskIds.map((_, idx) => matched[idx] ?? "");
          } else if (trackedTaskIds.length === 0) {
            trackedTaskIds = [...matched];
          } else {
            trackedTaskIds = trackedTaskIds.map((tid, idx) => (tid.trim() ? tid.trim() : matched[idx] ?? ""));
          }
          setPendingWorkflowRun({
            mediaKind: pendingMediaKind,
            taskIds: trackedTaskIds,
            progressListId: pending.progressListId ?? null,
            listLabel: pending.listLabel,
            ...(correl ? { correlationId: correl } : {}),
          });
        }

        const taskIdsForPoll = trackedTaskIds;
        const orderedUrls = taskIdsForPoll.map((tid) => byTask.get(tid)?.mediaUrl?.trim() || "");
        const completedUrls = orderedUrls.filter(Boolean);
        const statuses = taskIdsForPoll.map((tid) => byTask.get(tid)?.status ?? "generating");
        const allTerminalByStatus = statuses.every((s) => s === "ready" || s === "failed");
        const allResolvedByUrl = orderedUrls.length > 0 && orderedUrls.every((u) => Boolean(u));
        const allTerminal = allTerminalByStatus || allResolvedByUrl;

        if (pending.progressListId) {
          patch(pending.progressListId, {
            ...(pending.listLabel?.trim() ? { label: pending.listLabel.trim() } : {}),
            lines: taskIdsForPoll.map((_, idx) => orderedUrls[idx] || `${WORKFLOW_PENDING_MEDIA_PREFIX}${idx}`),
            mode: "results",
            contentKind: "media",
          });
          if (allTerminal) {
            finalizeProgressMediaList(
              pending.progressListId,
              completedUrls,
              pending.listLabel,
            );
          }
        }

        if (allTerminal) {
          if (completedUrls.length) {
            const last = completedUrls.at(-1) ?? "";
            patch(id, {
              outputPreviewUrl: last,
              outputMediaKind: pendingMediaKind,
              ...(pendingMediaKind === "video"
                ? { videoExtractedFirstFrameUrl: undefined, videoExtractedLastFrameUrl: undefined }
                : {}),
            });
            setLastGenerationError(null);
            setLastGenerationErrorDetails(null);
            setErrorDetailsOpen(false);
          }
          /**
           * Surface provider failures (Kling, PiAPI / Seedance, Veo, NanoBanana…) that came
           * back during background polling so the workflow node stops looking like it’s still
           * processing and the user actually sees what went wrong.
           */
          const failedItems = taskIdsForPoll
            .map((tid) => byTask.get(tid))
            .filter((it): it is WorkflowPollHistoryItem => Boolean(it && it.status === "failed"));
          if (failedItems.length > 0) {
            const rawMessages = failedItems
              .map((it) => (it.errorMessage ?? "").trim())
              .filter((m) => m.length > 0);
            const baseMsg = rawMessages[0] ?? "";
            const fallback =
              pendingMediaKind === "video"
                ? "Video generation failed. Try again or change model / inputs."
                : "Image generation failed. Try again or change model / inputs.";
            const friendly = userFacingProviderErrorOrDefault(baseMsg, fallback);
            const summary =
              failedItems.length === taskIdsForPoll.length
                ? friendly
                : `${failedItems.length}/${taskIdsForPoll.length} ${
                    pendingMediaKind === "video" ? "videos" : "images"
                  } failed: ${friendly}`;
            setLastGenerationError(summary);
            setLastGenerationErrorDetails(baseMsg && baseMsg !== summary ? baseMsg : null);
            setErrorDetailsOpen(false);
            toast.error(summary, baseMsg && baseMsg !== summary ? { description: baseMsg } : undefined);
            emitRunLog("error", `Generation failed: ${summary}${baseMsg && baseMsg !== summary ? ` — ${baseMsg}` : ""}`);
          }
          setPendingWorkflowRun(null);
          setGenerating(false);
          window.dispatchEvent(
            new CustomEvent("workflow:node-run-finished", {
              detail: { nodeId: id, success: completedUrls.length > 0 },
            }),
          );
          done = true;
          return;
        }
      } catch {
        // Keep trying while task metadata exists; transient errors should not break resume.
      } finally {
        if (alive && !done) timer = setTimeout(poll, WORKFLOW_PENDING_POLL_MS);
      }
    };

    void poll();
    return () => {
      alive = false;
      pendingPollAbortRef.current?.abort();
      pendingPollAbortRef.current = null;
      if (timer) clearTimeout(timer);
    };
  }, [
    data.kind,
    data.pendingWorkflowRun,
    emitRunLog,
    finalizeProgressMediaList,
    id,
    patch,
    setPendingWorkflowRun,
  ]);

  const cancelGeneration = useCallback(() => {
    if (!generating) return;
    const pending = data.pendingWorkflowRun;
    pendingPollAbortRef.current?.abort();
    pendingPollAbortRef.current = null;
    if (pending?.progressListId) {
      patch(pending.progressListId, {
        ...(pending.listLabel?.trim() ? { label: pending.listLabel.trim() } : {}),
        lines: (pending.taskIds ?? []).map((_, idx) =>
          workflowMediaErrorToken({
            nodeId: id,
            prompt: prompt ?? "",
            kind: pending.mediaKind === "video" ? "video" : "image",
            message: "Cancelled",
          }),
        ),
        mode: "results",
        contentKind: "media",
      });
      finalizeProgressMediaList(pending.progressListId, undefined, pending.listLabel);
    }
    setPendingWorkflowRun(null);
    setGenerating(false);
    setLastGenerationError("Cancelled.");
    setLastGenerationErrorDetails(null);
    setErrorDetailsOpen(false);
    toast.message("Cancelled", { description: "Generation polling stopped." });
    emitRunLog("info", "Generation cancelled by user (polling stopped).");
    emitRunFinished(false);
  }, [
    data.pendingWorkflowRun,
    emitRunFinished,
    emitRunLog,
    finalizeProgressMediaList,
    generating,
    id,
    patch,
    prompt,
    setPendingWorkflowRun,
  ]);

  const showImageGeneratorOutputBubble = data.kind === "image";
  const imageGeneratorOutputReady = useMemo(
    () =>
      data.kind === "image" &&
      Boolean(data.outputPreviewUrl?.trim()) &&
      (data.outputMediaKind ?? "image") !== "video" &&
      !generating,
    [data.kind, data.outputMediaKind, data.outputPreviewUrl, generating],
  );

  const showVideoOutputBubbles = data.kind === "video" || data.kind === "motion";
  const videoExtractedFirstThumb = (data.videoExtractedFirstFrameUrl ?? "").trim();
  const videoExtractedLastThumb = (data.videoExtractedLastFrameUrl ?? "").trim();
  /** Card width follows preview width exactly for image/video generators. */
  const cardWidthPx = frame.width + CARD_PAD_X_PX;

  /**
   * Target handles: mirror the OUTPUT bubble pattern (`TextPromptNode`, image/video out column).
   * Full-size invisible handle stacked above pointer-events-none icon so React Flow can snap wires.
   * Do not overlay a `<button>` here — it blocks handle hit-testing.
   */
  const workflowPortTargetBubbleHandleClass =
    "nodrag nopan !absolute !inset-0 !z-[2] !box-border !h-8 !w-8 !min-h-8 !min-w-8 !max-h-8 !max-w-8 !rounded-full !border-0 !bg-transparent opacity-0 !transform-none";

  /** When two logical handles share one circular shell, split hit targets (avoid same-bbox overlap bugs). */
  const workflowPortTargetBubbleHandleLeftHalfClass =
    "nodrag nopan !absolute !left-0 !top-0 !z-[2] !box-border !h-8 !w-4 !min-h-8 !min-w-4 !max-h-8 !max-w-4 rounded-l-full !border-0 !bg-transparent opacity-0 !transform-none";

  const workflowPortTargetBubbleHandleRightHalfClass =
    "nodrag nopan !absolute !left-4 !top-0 !z-[2] !box-border !h-8 !w-4 !min-h-8 !min-w-4 !max-h-8 !max-w-4 rounded-r-full !border-0 !bg-transparent opacity-0 !transform-none";

  /**
   * Invisible wrapper for wiring hit targets — keeps React Flow snapping; icons sit above as visible chrome.
   */
  const workflowPortBubbleShellClass =
    "workflow-port-create-cursor relative h-8 w-8 shrink-0 rounded-full border border-transparent bg-transparent shadow-none";

  const workflowPortBubbleIconClass =
    "pointer-events-none absolute inset-0 z-[1] flex cursor-crosshair items-center justify-center text-white/85";

  /** Invisible full-bubble overlay for source ports on the right column (ids: `generated`, `videoFirst`, `videoLast`). */
  const workflowPortSourceBubbleHandleClass =
    "workflow-port-create-cursor nodrag nopan !absolute !inset-0 !z-[2] !box-border !h-8 !w-8 !min-h-8 !min-w-8 !max-h-8 !max-w-8 !rounded-full !border-0 !bg-transparent opacity-0 !transform-none";

  useLayoutEffect(() => {
    updateNodeInternals(id);
    // Second pass after layout/paint, avoids stale handle bounds when flex/card size settles.
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
    showImageGeneratorOutputBubble,
    imageGeneratorOutputReady,
    showVideoOutputBubbles,
    data.imageWorkflowPreset,
  ]);

  const aspectLocked =
    data.intrinsicAspect != null && Number.isFinite(data.intrinsicAspect) && data.intrinsicAspect > 0;
  const defaultRes = data.kind === "video" ? "720p" : data.kind === "motion" ? "1080p" : "1024";
  const resolution = useMemo(() => {
    const raw = data.resolution ?? defaultRes;
    if (data.kind === "image") {
      if (raw === "1024") return "1K";
      if (raw === "1536") return "2K";
    }
    return raw;
  }, [data.kind, data.resolution, defaultRes]);

  const videoExportDimensionLabel = useMemo(() => {
    if (data.kind !== "video" && data.kind !== "motion") return null;
    const d = workflowVideoExportPixelDimensions(resolution, aspectRatio);
    return `${d.width} × ${d.height}`;
  }, [aspectRatio, data.kind, resolution]);

  const quantity = Math.min(10, Math.max(1, data.quantity ?? 1));

  const models = useMemo(() => {
    if (data.kind === "video") {
      if (data.videoInputMode === "seedance_only") return VIDEO_CHAIN_SEEDANCE_MODELS;
      return VIDEO_MODELS;
    }
    if (data.kind === "motion") return MOTION_CONTROL_MODELS;
    if (data.kind === "variation" || data.kind === "assistant") return VARIATION_MODELS;
    if (data.kind === "image" && data.imageWorkflowPreset === "profile_360") {
      return IMAGE_MODELS.filter((m) =>
        (WORKFLOW_AVATAR_360_PROFILE_ALLOWED_MODELS as readonly string[]).includes(m.value),
      );
    }
    return IMAGE_MODELS;
  }, [data.kind, data.imageWorkflowPreset, data.videoInputMode]);

  const modelDefault =
    data.kind === "image" && data.imageWorkflowPreset === "profile_360"
      ? WORKFLOW_AVATAR_360_PROFILE_DEFAULT_MODEL
      : models[0]?.value ?? "nano";
  const rawModel = data.model ?? modelDefault;
  const model = models.some((m) => m.value === rawModel) ? rawModel : modelDefault;

  const aspects = useMemo(() => {
    if (data.kind === "video" || data.kind === "motion") return VIDEO_ASPECTS;
    if (data.kind === "variation" || data.kind === "assistant") return VARIATION_ASPECTS;
    if (data.kind === "image" && data.imageWorkflowPreset === "profile_360") return ["16:9"] as const;
    return IMAGE_ASPECTS;
  }, [data.kind, data.imageWorkflowPreset]);

  const resolutions = useMemo(() => {
    if (data.kind === "video" || data.kind === "motion") return VIDEO_RESOLUTIONS;
    if (data.kind === "variation" || data.kind === "assistant") return VARIATION_RESOLUTIONS;
    return IMAGE_RESOLUTIONS;
  }, [data.kind]);

  const showQuantity =
    (data.kind === "image" || data.kind === "variation" || data.kind === "assistant" || data.kind === "upscale") &&
    !(data.kind === "image" && data.imageWorkflowPreset === "profile_360");

  const videoDurationOptions = useMemo(() => {
    if (data.kind !== "video") return [] as string[];
    return studioVideoDurationSecOptions(resolveWorkflowVideoModelId(model));
  }, [data.kind, model]);

  const resolvedVideoModelId = useMemo(
    () => (data.kind === "video" ? resolveWorkflowVideoModelId(model) : ""),
    [data.kind, model],
  );

  /** UI gates derived from the picker capabilities — Seedance has no first/last frame ports. */
  const videoModelHasStartFrame = useMemo(
    () => (data.kind === "video" ? workflowVideoModelHasStartFrame(resolvedVideoModelId) : true),
    [data.kind, resolvedVideoModelId],
  );
  const videoModelHasEndFrame = useMemo(
    () => (data.kind === "video" ? workflowVideoModelHasEndFrame(resolvedVideoModelId) : false),
    [data.kind, resolvedVideoModelId],
  );
  const videoModelHasReferences = useMemo(
    () => (data.kind === "video" ? workflowVideoModelHasReferences(resolvedVideoModelId) : false),
    [data.kind, resolvedVideoModelId],
  );
  const videoModelSupportsElements = useMemo(
    () => (data.kind === "video" ? workflowVideoModelSupportsElements(resolvedVideoModelId) : false),
    [data.kind, resolvedVideoModelId],
  );
  const videoModelSeedance2ProLike = useMemo(
    () =>
      data.kind === "video" &&
      (resolvedVideoModelId === "bytedance/seedance-2" || resolvedVideoModelId === "bytedance/seedance-2-fast"),
    [data.kind, resolvedVideoModelId],
  );

  /** Seedance 2 / Fast: supports omni reference video uploads (`referenceVideoUrls`). */
  const seedance2ProLike = useMemo(() => {
    if (data.kind !== "video") return false;
    return resolvedVideoModelId === "bytedance/seedance-2" || resolvedVideoModelId === "bytedance/seedance-2-fast";
  }, [data.kind, resolvedVideoModelId]);

  /**
   * If a model switch hides an input bubble, prune any edges that still target that handle.
   * This prevents “ghost” connections to handles that no longer render (e.g. Seedance has no start/end frame ports).
   */
  useEffect(() => {
    const validTargets = new Set<string>();
    validTargets.add("text");
    validTargets.add("inText");

    if (data.kind === "motion") {
      validTargets.add("startImage");
      validTargets.add("inImage");
      validTargets.add("inVideo");
    }

    if (data.kind === "video") {
      if (videoModelHasStartFrame) {
        validTargets.add("startImage");
        if (!videoModelHasReferences) validTargets.add("inImage");
      }
      if (videoModelHasEndFrame) validTargets.add("endImage");
      if (videoModelHasReferences) {
        validTargets.add("references");
        validTargets.add("inImage");
      }
      if (seedance2ProLike) {
        validTargets.add("inVideo");
      }
    }

    if (data.kind === "image" || data.kind === "variation" || data.kind === "assistant" || data.kind === "upscale") {
      validTargets.add("inImage");
    }

    setEdges((prev) =>
      prev.filter((e) => {
        if (e.target !== id) return true;
        const h = (e.targetHandle ?? "").trim();
        if (!h) return true;
        return validTargets.has(h);
      }),
    );
  }, [
    data.kind,
    id,
    seedance2ProLike,
    setEdges,
    videoModelHasEndFrame,
    videoModelHasReferences,
    videoModelHasStartFrame,
  ]);

  const motionAutoSettings = data.motionAutoSettings ?? true;
  const motionBackgroundSource = data.motionBackgroundSource ?? "input_video";
  const assistantModel = data.assistantModel ?? "gpt-5o";
  const assistantMode = data.assistantMode ?? "input";
  const assistantOutput = data.assistantOutput ?? "";
  const assistantExportMode = data.assistantExportMode ?? "text";
  const websiteUrl = (data.websiteUrl ?? "").trim();
  const websiteOutputMode = data.websiteOutputMode ?? "full_flow";
  const websiteProductImageCount = data.websiteProductImageCount ?? 3;
  const profile360ImageUi = data.kind === "image" && data.imageWorkflowPreset === "profile_360";
  const batchPromptCount = useStore(
    useCallback(
      (s) => {
        if (data.kind !== "image" && data.kind !== "video" && data.kind !== "motion") return 0;
        const { batch } = collectWorkflowBatchPrompts(
          s.nodes,
          s.edges,
          id,
          [...WORKFLOW_TEXT_INPUT_HANDLES],
          prompt,
        );
        return batch?.length ?? 0;
      },
      [data.kind, id, prompt],
    ),
  );
  const motionVideoInputUrlForCredits = useStore(
    useCallback(
      (s) => {
        if (data.kind !== "motion") return "";
        const linked = collectLinkedVideoUrlsForHandles(s.nodes, s.edges, id, ["inVideo"]);
        return (
          linked[0]?.trim() ||
          (data.referenceMediaKind === "video" ? data.referencePreviewUrl?.trim() : "") ||
          ""
        );
      },
      [data.kind, data.referenceMediaKind, data.referencePreviewUrl, id],
    ),
  );

  /**
   * Connected reference image URLs for Image Generator inputs (references/start + node-local upload),
   * in a stable order so users can reason about which image is "primary" vs extra context.
   */
  const imageInputRefSignature = useStore(
    useCallback(
      (s) => {
        if (data.kind !== "image") return "";
        const startUrls = collectLinkedImageUrlsForHandles(s.nodes, s.edges, id, ["startImage"]);
        const refUrls = collectLinkedImageUrlsForHandles(s.nodes, s.edges, id, ["references"]);
        const legacyImg = collectLinkedImageUrlsForHandles(s.nodes, s.edges, id, ["inImage"]);
        const nodeRef =
          data.referenceMediaKind === "image" && data.referencePreviewUrl?.trim()
            ? [data.referencePreviewUrl.trim()]
            : [];
        const all = [...nodeRef, ...startUrls, ...refUrls, ...legacyImg];
        const seen = new Set<string>();
        const out: string[] = [];
        for (const u of all) {
          const t = u.trim();
          if (!t || seen.has(t)) continue;
          seen.add(t);
          out.push(t);
        }
        return out.join("|");
      },
      [data.kind, data.referenceMediaKind, data.referencePreviewUrl, id],
    ),
  );
  const imageInputRefUrls = useMemo(
    () => (imageInputRefSignature ? imageInputRefSignature.split("|").filter(Boolean) : []),
    [imageInputRefSignature],
  );

  /**
   * Connected reference image URLs (start frame + references port + node-local upload), in the
   * order PiAPI binds them to `@image1, @image2, …`. We feed this to the chip strip below the
   * prompt so users can see the auto-naming and type matching `@imageN` mentions.
   */
  const videoElementRefSignature = useStore(
    useCallback(
      (s) => {
        if (data.kind !== "video") return "";
        const startUrls = collectLinkedImageUrlsForHandles(s.nodes, s.edges, id, ["startImage"]);
        const refUrls = collectLinkedImageUrlsForHandles(s.nodes, s.edges, id, ["references"]);
        const legacyImg = collectLinkedImageUrlsForHandles(s.nodes, s.edges, id, ["inImage"]);
        const nodeRef =
          data.referenceMediaKind === "image" && data.referencePreviewUrl?.trim()
            ? [data.referencePreviewUrl.trim()]
            : [];
        const start = (data.videoStartImageUrl?.trim() ? [data.videoStartImageUrl.trim()] : []).concat(
          startUrls,
        );
        const all = [...start, ...refUrls, ...legacyImg, ...nodeRef];
        const seen = new Set<string>();
        const out: string[] = [];
        for (const u of all) {
          const t = u.trim();
          if (!t || seen.has(t)) continue;
          seen.add(t);
          out.push(t);
        }
        return out.join("|");
      },
      [
        data.kind,
        data.referenceMediaKind,
        data.referencePreviewUrl,
        data.videoStartImageUrl,
        id,
      ],
    ),
  );
  const videoElementRefUrls = useMemo(
    () => (videoElementRefSignature ? videoElementRefSignature.split("|").filter(Boolean) : []),
    [videoElementRefSignature],
  );

  /**
   * Video generator inputs as thumbnails (ordered), for quick visual validation.
   * Matches the same pool as `videoElementRefUrls`, but we also track explicit end-frame.
   */
  const videoEndFrameUrl = useStore(
    useCallback(
      (s) => {
        if (data.kind !== "video") return "";
        const linkedFromEndPort = collectLinkedImageUrlsForHandles(s.nodes, s.edges, id, ["endImage"]);
        return (data.videoEndImageUrl?.trim() || linkedFromEndPort[0] || "").trim();
      },
      [data.kind, data.videoEndImageUrl, id],
    ),
  );

  /** Seedance 2 / Fast: connected video refs (omni motion reference). */
  const seedanceVideoRefSignature = useStore(
    useCallback(
      (s) => {
        if (data.kind !== "video") return "";
        if (!videoModelSeedance2ProLike) return "";
        const linked = collectLinkedVideoUrlsForHandles(s.nodes, s.edges, id, ["inVideo"]);
        const nodeLocal =
          data.referenceMediaKind === "video" && data.referencePreviewUrl?.trim()
            ? [data.referencePreviewUrl.trim()]
            : [];
        const all = [...linked, ...nodeLocal];
        const seen = new Set<string>();
        const out: string[] = [];
        for (const u of all) {
          const t = u.trim();
          if (!t || seen.has(t)) continue;
          seen.add(t);
          out.push(t);
        }
        return out.join("|");
      },
      [data.kind, data.referenceMediaKind, data.referencePreviewUrl, id, videoModelSeedance2ProLike],
    ),
  );
  const seedanceVideoRefUrls = useMemo(
    () => (seedanceVideoRefSignature ? seedanceVideoRefSignature.split("|").filter(Boolean) : []),
    [seedanceVideoRefSignature],
  );

  useEffect(() => {
    if (data.kind !== "motion") return;
    const src = motionVideoInputUrlForCredits.trim();
    if (!src) {
      setMotionDetectedInputDurationSec(null);
      if (data.motionInputDurationSec !== undefined) {
        patch(id, { motionInputDurationSec: undefined });
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      const measured = await probeWorkflowVideoDurationSec(src);
      if (cancelled) return;
      const normalized = measured != null && Number.isFinite(measured) && measured > 0 ? measured : null;
      setMotionDetectedInputDurationSec(normalized);
      if (normalized == null) return;
      const rounded = Math.round(normalized * 100) / 100;
      if (data.motionInputDurationSec !== rounded) {
        patch(id, { motionInputDurationSec: rounded });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data.kind, data.motionInputDurationSec, id, motionVideoInputUrlForCredits, patch]);

  const estimatedCredits = useMemo(() => {
    const runCount = Math.max(1, batchPromptCount);
    const multiBatchFromList = batchPromptCount > 1;

    if (data.kind === "image") {
      if (quantity > 1 && !multiBatchFromList) {
        const oneNode = workflowImageChargeCredits({ model, resolution, quantity: 1 });
        return oneNode * quantity * runCount;
      }
      return workflowImageChargeCredits({ model, resolution, quantity }) * runCount;
    }
    if (data.kind === "video") {
      const oneVideo = workflowVideoChargeCredits({
        model,
        resolution,
        durationSec: data.videoDurationSec,
      });
      return oneVideo * runCount;
    }
    if (data.kind === "motion") {
      const oneMotion = workflowMotionControlChargeCredits({
        quality: resolution,
        durationSec: motionDetectedInputDurationSec ?? 10,
      });
      return oneMotion * runCount;
    }
    return 0;
  }, [
    batchPromptCount,
    data.kind,
    data.videoDurationSec,
    model,
    quantity,
    resolution,
    motionDetectedInputDurationSec,
  ]);

  const runFromHereEstimatedCredits = useStore(
    useCallback(
      (s) => {
        const byId = new Map(s.nodes.map((n) => [n.id, n]));
        if (!byId.has(id)) return 0;
        const outgoing = new Map<string, string[]>();
        for (const e of s.edges) {
          if (!outgoing.has(e.source)) outgoing.set(e.source, []);
          outgoing.get(e.source)!.push(e.target);
        }
        const seen = new Set<string>();
        const queue = [id];
        let total = 0;
        while (queue.length) {
          const cur = queue.shift()!;
          if (seen.has(cur)) continue;
          seen.add(cur);
          const n = byId.get(cur);
          if (n?.type === "adAsset") {
            total += estimateWorkflowAdAssetRunCredits(n.data as AdAssetNodeData, n.id, s.nodes, s.edges);
          }
          for (const nxt of outgoing.get(cur) ?? []) {
            if (!seen.has(nxt)) queue.push(nxt);
          }
        }
        return Math.max(0, Math.round(total));
      },
      [id],
    ),
  );
  const assistantEstimatedCredits = useMemo(
    () => (data.kind === "assistant" ? WORKFLOW_ASSISTANT_CREDITS_BY_MODEL[assistantModel] ?? 5 : 0),
    [assistantModel, data.kind],
  );
  const hasGeneratedOutput = Boolean(data.outputPreviewUrl?.trim());
  const hasAssistantOutput = Boolean(assistantOutput.trim());
  const hasWebsiteRun = Boolean(data.websiteLastRunAt?.trim());
  const isGeneratorNode = data.kind === "image" || data.kind === "video" || data.kind === "motion";
  const generatorTextInputWireCount = useStore(
    useCallback(
      (s) => {
        if (!isGeneratorNode) return 0;
        return s.edges.filter((e) => {
          if (e.target !== id) return false;
          const h = e.targetHandle ?? "";
          return WORKFLOW_TEXT_INPUT_HANDLES.includes(h as (typeof WORKFLOW_TEXT_INPUT_HANDLES)[number]);
        }).length;
      },
      [id, isGeneratorNode],
    ),
  );
  const hasLinkedGeneratorTextInput = isGeneratorNode && generatorTextInputWireCount > 0;
  const promptPreviewText = (data.lastRunPrompt ?? prompt).trim();
  const showPromptPreviewChip =
    hasPreviewMedia && promptPreviewText.length > 0 && !profile360ImageUi;
  /** Fullscreen-style prompt overlay: image / video generators only (not motion, variation, upscale, etc.). */
  const useWorkflowPromptOverlay = data.kind === "image" || data.kind === "video";
  const expandPromptEditorOnFocus = useWorkflowPromptOverlay;
  const openPromptEditor = useCallback(() => {
    if (!useWorkflowPromptOverlay) return;
    const composedSeed = (() => {
      if (data.kind !== "image" && data.kind !== "video" && data.kind !== "motion") {
        return prompt;
      }
      const nodes = getNodes();
      const edges = getEdges();
      const linked = collectLinkedPromptTextsForHandles(nodes, edges, id, [...WORKFLOW_TEXT_INPUT_HANDLES]);
      return composeWorkflowPrompt(prompt, linked);
    })();
    const seed = (data.lastRunPrompt ?? composedSeed ?? prompt).trim() || prompt;
    setPromptEditorDraft(seed);
    setPromptEditorOpen(true);
  }, [data.kind, data.lastRunPrompt, getEdges, getNodes, id, prompt, useWorkflowPromptOverlay]);

  const closePromptEditor = useCallback(() => {
    patch(id, { prompt: promptEditorDraft });
    setPromptEditorOpen(false);
  }, [id, patch, promptEditorDraft]);

  useEffect(() => {
    if (!promptEditorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePromptEditor();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePromptEditor, promptEditorOpen]);

  useEffect(() => {
    if (!promptEditorOpen) return;
    const raf = requestAnimationFrame(() => promptEditorTextareaRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [promptEditorOpen]);

  useEffect(() => {
    if (data.kind !== "video") return;
    if (data.videoDurationSec === undefined) return;
    const coerced = coerceWorkflowVideoDurationSec(model, data.videoDurationSec);
    if (data.videoDurationSec !== coerced) {
      patch(id, { videoDurationSec: coerced });
    }
  }, [data.kind, data.videoDurationSec, id, model, patch]);

  useEffect(() => {
    if (data.kind !== "image" || data.imageWorkflowPreset !== "profile_360") return;
    const nextAspect = WORKFLOW_AVATAR_360_PROFILE_ASPECT;
    const nextIntrinsic = 16 / 9;
    if (data.aspectRatio === nextAspect && data.intrinsicAspect === nextIntrinsic) return;
    patch(id, { aspectRatio: nextAspect, intrinsicAspect: nextIntrinsic });
  }, [data.aspectRatio, data.imageWorkflowPreset, data.intrinsicAspect, data.kind, id, patch]);

  const onGenerate = useCallback(async () => {
    if (generating) return;
    setLastGenerationError(null);
    setLastGenerationErrorDetails(null);
    setErrorDetailsOpen(false);

    const nodes = getNodes();
    const edges = getEdges();
    const profile360Preset = data.kind === "image" && data.imageWorkflowPreset === "profile_360";
    const linkedPrompts =
      profile360Preset
        ? ([] as string[])
        : data.kind === "image" || data.kind === "video" || data.kind === "motion" || data.kind === "assistant"
          ? collectLinkedPromptTextsForHandles(nodes, edges, id, [...WORKFLOW_TEXT_INPUT_HANDLES])
          : collectLinkedPromptTexts(nodes, edges, id);
    const linkedAssistantImageRefs =
      data.kind === "assistant"
        ? collectLinkedImageUrlsForHandles(
            nodes,
            edges,
            id,
            data.assistantVisionPreset === "image_to_json"
              ? ["references", "inImage"]
              : ["references", "startImage", "inImage"],
          )
        : [];
    const effectivePrompt = profile360Preset ? WORKFLOW_AVATAR_360_PROFILE_PROMPT : composeWorkflowPrompt(prompt, linkedPrompts);
    const batchContext =
      data.kind === "image" || data.kind === "video" || data.kind === "motion"
        ? profile360Preset
          ? { batch: null, composedSingle: WORKFLOW_AVATAR_360_PROFILE_PROMPT, fromPromptList: false }
          : collectWorkflowBatchPrompts(nodes, edges, id, [...WORKFLOW_TEXT_INPUT_HANDLES], prompt)
        : { batch: null, composedSingle: effectivePrompt, fromPromptList: false };
    const batchPrompts = batchContext.batch?.map((x) => x.trim()).filter(Boolean) ?? null;
    const singlePrompt = (batchContext.composedSingle || effectivePrompt).trim();
    const fromPromptList = batchContext.fromPromptList;
    const requiresPrompt = data.kind !== "motion" && !profile360Preset;
    if (requiresPrompt && !(batchPrompts?.length || singlePrompt)) {
      toast.error("Add a prompt", {
        description: linkedPrompts.length
          ? "Linked nodes had no usable text. Type a prompt in the module or put text in the connected canvas note."
          : "Type the prompt inside the module, or connect the text prompt port to a canvas note whose text should be included.",
      });
      emitRunFinished(false);
      emitRunLog("error", "Run blocked: prompt is empty.");
      return;
    }

    const promptUsedForPreview = (batchPrompts?.[0] ?? singlePrompt ?? "").trim();
    if (promptUsedForPreview) {
      patch(id, { lastRunPrompt: promptUsedForPreview });
    }

    if (data.kind === "assistant") {
      emitRunLog("info", "Assistant run started.");
      const assistantListLabel = `${(data.label || cfg.title || "Assistant").trim() || "Assistant"} prompts`;
      const httpsVisionUrls = linkedAssistantImageRefs
        .map((u) => (typeof u === "string" ? u.trim() : ""))
        .filter((u) => /^https:\/\//i.test(u))
        .slice(0, 12);
      const assistantVisionPreset = data.assistantVisionPreset === "image_to_json" ? "image_to_json" : undefined;
      if (assistantVisionPreset === "image_to_json" && httpsVisionUrls.length === 0) {
        toast.error("Connect an image", {
          description:
            "Image → JSON needs a wired image hosted at HTTPS (upload first so it gets a public URL).",
        });
        emitRunFinished(false);
        emitRunLog("error", "Assistant (image→JSON): no HTTPS reference image URLs.");
        return;
      }

      const promptForApi =
        httpsVisionUrls.length > 0
          ? singlePrompt.trim()
          : linkedAssistantImageRefs.length > 0
            ? `${singlePrompt.trim()}\n\nReference image URLs:\n${linkedAssistantImageRefs.map((u) => `- ${u}`).join("\n")}`
            : singlePrompt.trim();

      setGenerating(true);
      let ok = false;
      try {
        const res = await fetch("/api/gpt/workflow-assistant-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt:
              assistantVisionPreset === "image_to_json" && !promptForApi
                ? "Return the structured JSON analysis for the attached image per your instructions."
                : promptForApi,
            model: assistantModel,
            ...(httpsVisionUrls.length > 0 ? { imageUrls: httpsVisionUrls } : {}),
            ...(assistantVisionPreset === "image_to_json"
              ? { visionPreset: "image_to_json" as const }
              : {}),
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
        if (assistantExportMode === "list") {
          const lines = splitAssistantOutputToListLines(json.output.trim());
          if (lines.length) {
            const self = nodes.find((n) => n.id === id);
            const outEdges = edges.filter(
              (e) =>
                e.source === id &&
                (e.sourceHandle ?? "out") === "out" &&
                (e.targetHandle === "inText" || e.targetHandle === "text" || !e.targetHandle),
            );
            const linkedListId = outEdges
              .map((e) => e.target)
              .find((tid) => nodes.some((n) => n.id === tid && n.type === "promptList"));

            if (linkedListId) {
              patch(linkedListId, {
                label: assistantListLabel,
                lines,
                mode: "prompts",
                contentKind: "text",
              });
            } else if (self) {
              const listOffsetX = Math.max(560, cardWidthPx + 220);
              const listNode = buildPromptListNode(
                { x: self.position.x + listOffsetX, y: self.position.y + 8 },
                { label: assistantListLabel, lines: [], mode: "prompts" },
              );
              setNodes((prev) => [...prev, listNode]);
              setEdges((prev) => [
                ...prev,
                {
                  id: `e-${id}-${listNode.id}-${crypto.randomUUID().slice(0, 8)}`,
                  source: id,
                  sourceHandle: "out",
                  target: listNode.id,
                  targetHandle: "inText",
                  style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
                },
              ]);
              // Smooth "build" effect: reveal generated prompts one by one in the new list.
              lines.forEach((_, idx) => {
                window.setTimeout(() => {
                  patch(listNode.id, {
                    lines: lines.slice(0, idx + 1),
                    mode: "prompts",
                    contentKind: "text",
                  });
                }, 90 + idx * 70);
              });
            }
            toast.success(`Assistant ready — ${lines.length} prompt${lines.length > 1 ? "s" : ""} in list`);
          } else {
            toast.success("Assistant response ready");
          }
        } else {
          toast.success("Assistant response ready");
        }
        patch(id, { websiteLastRunAt: new Date().toISOString() });
        ok = true;
        emitRunLog("success", "Assistant run finished.");
      } catch (e) {
        toast.error("Assistant failed", {
          description: e instanceof Error ? e.message : "Try again.",
        });
        emitRunLog("error", `Assistant failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      } finally {
        setGenerating(false);
        emitRunFinished(ok);
      }
      return;
    }

    if (data.kind === "website") {
      if (websiteOutputMode === "profile_360") {
        const imgs = collectLinkedImageUrlsForHandles(nodes, edges, id, ["references", "inImage"]);
        const img = imgs
          .map((u) => (typeof u === "string" ? u.trim() : ""))
          .find((u) => u && u !== "about:blank");
        if (!img) {
          toast.error("Connect a reference image", {
            description: "Use the Images input and wire an avatar or photo (same as Studio Avatar 360° profile).",
          });
          emitRunFinished(false);
          emitRunLog("error", "Website module (360° profile): no image connected.");
          return;
        }
        emitRunLog("info", "Website module (360° profile) started.");
        setGenerating(true);
        let ok = false;
        try {
          const self = nodes.find((n) => n.id === id);
          if (!self) throw new Error("Could not find node position.");
          const built = buildWorkflow360ProfileBranch(
            { x: self.position.x + 520, y: self.position.y + 40 },
            { sourceImageUrl: img },
          );
          setNodes((prev) => [...prev, ...built.nodes]);
          setEdges((prev) => [...prev, ...built.edges]);
          patch(id, { websiteLastRunAt: new Date().toISOString() });
          toast.success("360° profile branch created");
          ok = true;
          emitRunLog("success", "Website module (360° profile) finished.");
        } catch (e) {
          toast.error("Website module failed", {
            description: userMessageFromCaughtError(e, "Try again."),
          });
          emitRunLog(
            "error",
            `Website module (360° profile) failed: ${userMessageFromCaughtError(e, "Try again.")}`,
          );
        } finally {
          setGenerating(false);
          emitRunFinished(ok);
        }
        return;
      }

      if (!/^https?:\/\//i.test(websiteUrl)) {
        toast.error("Enter a valid website URL", {
          description: "Use a full URL starting with http:// or https://",
        });
        emitRunFinished(false);
        emitRunLog("error", "Website module blocked: invalid URL.");
        return;
      }
      emitRunLog("info", "Website module started.");
      setGenerating(true);
      let ok = false;
      try {
        const startRes = await fetch("/api/link-to-ad/initial-pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeUrl: websiteUrl }),
        });
        const startJson = (await startRes.json()) as { runId?: string; error?: string };
        if (!startRes.ok || !startJson.runId) {
          throw new Error(startJson.error || "Website pipeline failed.");
        }

        const getRes = await fetch(`/api/runs/get?runId=${encodeURIComponent(startJson.runId)}`, {
          cache: "no-store",
        });
        const getJson = (await getRes.json()) as {
          data?: { id: string; store_url?: string | null; title?: string | null; extracted?: unknown };
          error?: string;
        };
        if (!getRes.ok || !getJson.data) {
          throw new Error(getJson.error || "Could not load pipeline result.");
        }

        const self = nodes.find((n) => n.id === id);
        if (!self) throw new Error("Could not find node position.");

        if (websiteOutputMode === "full_flow") {
          const built = buildWorkflowProjectPipelineFromRun(
            { x: self.position.x + 540, y: self.position.y + 120 },
            {
              id: getJson.data.id,
              title: getJson.data.title ?? undefined,
              store_url: getJson.data.store_url ?? undefined,
              extracted: getJson.data.extracted,
            },
          );
          setNodes((prev) => [...prev, ...built.nodes]);
          setEdges((prev) => [...prev, ...built.edges]);
          toast.success("Website flow created");
        } else {
          const snap = readUniverseFromExtracted(getJson.data.extracted);
          if (!snap) throw new Error("Could not parse extracted website data.");
          if (websiteOutputMode === "angles") {
            const lines = splitAllScriptOptions(snap.scriptsText ?? "").map((x) => x.trim()).filter(Boolean).slice(0, 3);
            if (!lines.length) throw new Error("No script angles found.");
            const listNode = buildPromptListNode(
              { x: self.position.x + 420, y: self.position.y + 8 },
              { label: "Website angles", lines, mode: "prompts" },
            );
            setNodes((prev) => [...prev, listNode]);
            setEdges((prev) => [
              ...prev,
              {
                id: `e-${id}-${listNode.id}-${crypto.randomUUID().slice(0, 8)}`,
                source: id,
                sourceHandle: "out",
                target: listNode.id,
                targetHandle: "in",
                style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
              },
            ]);
            toast.success("3 angles exported");
          } else {
            const urls = linkToAdProductPhotoPickerUrls(snap).slice(0, websiteProductImageCount);
            if (!urls.length) throw new Error("No product images found.");
            const refs = urls.map((u, i) =>
              buildImageRefNode(
                { x: self.position.x + 360 + i * 220, y: self.position.y + 12 },
                { label: `Product ${i + 1}`, imageUrl: u, source: "upload", mediaKind: "image" },
              ),
            );
            setNodes((prev) => [...prev, ...refs]);
            setEdges((prev) => [
              ...prev,
              ...refs.map((r) => ({
                id: `e-${id}-${r.id}-${crypto.randomUUID().slice(0, 8)}`,
                source: id,
                sourceHandle: "out",
                target: r.id,
                targetHandle: "in",
                style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
              })),
            ]);
            toast.success(`${refs.length} product image${refs.length > 1 ? "s" : ""} extracted`);
          }
        }
        ok = true;
        emitRunLog("success", "Website module finished.");
      } catch (e) {
        toast.error("Website module failed", {
          description: userMessageFromCaughtError(e, "Try another product URL."),
        });
        emitRunLog("error", `Website module failed: ${userMessageFromCaughtError(e, "Try another product URL.")}`);
      } finally {
        setGenerating(false);
        emitRunFinished(ok);
      }
      return;
    }

    if (data.kind !== "image" && data.kind !== "video" && data.kind !== "motion") {
      toast.message("Coming soon", { description: "Run is available for Image, Video, and Motion Control generators." });
      emitRunFinished(false);
      emitRunLog("error", "Run not supported for this module type.");
      return;
    }

    const shouldFanOutAsModules =
      (data.kind === "image" || data.kind === "video" || data.kind === "motion") &&
      quantity > 1 &&
      !(batchPrompts?.length && batchPrompts.length > 1) &&
      !(data.kind === "image" && data.imageWorkflowPreset === "profile_360");
    const perNodeQuantity = shouldFanOutAsModules ? 1 : quantity;

    if (shouldFanOutAsModules) {
      const self = nodes.find((n) => n.id === id);
      if (self?.type === "adAsset") {
        const cloneCount = Math.max(0, quantity - 1);
        const incomingToSelf = edges.filter((e) => e.target === id);
        const xStep = Math.max(320, cardWidthPx + 26);
        const clones: AdAssetNodeType[] = Array.from({ length: cloneCount }, (_, idx) => {
          const cloneId = crypto.randomUUID();
          const cloneData = self.data as AdAssetNodeData;
          return {
            ...self,
            type: "adAsset" as const,
            id: cloneId,
            selected: false,
            position: { x: self.position.x + (idx + 1) * xStep, y: self.position.y },
            data: {
              ...cloneData,
              quantity: 1,
              outputPreviewUrl: undefined,
              outputMediaKind: undefined,
              videoExtractedFirstFrameUrl: undefined,
              videoExtractedLastFrameUrl: undefined,
            },
          };
        });
        const cloneEdges = clones.flatMap((clone) =>
          incomingToSelf.map((e) => ({
            ...e,
            id: `e-${e.source}-${clone.id}-${crypto.randomUUID().slice(0, 8)}`,
            target: clone.id,
            selected: false,
          })),
        );
        setNodes((prev) => [...prev, ...clones]);
        if (cloneEdges.length) {
          setEdges((prev) => [...prev, ...cloneEdges]);
        }
        setTimeout(() => {
          clones.forEach((clone) => {
            window.dispatchEvent(new CustomEvent("workflow:run-node", { detail: { nodeId: clone.id } }));
          });
        }, 60);
        toast.success(`${quantity} generators started`, {
          description: "Generated modules were duplicated and wired to the same inputs.",
        });
      }
    }

    const personalKey = getPersonalApiKey()?.trim() || undefined;
    const piapiKey = getPersonalPiapiApiKey()?.trim() || undefined;
    const creditBypass = isPlatformCreditBypassActive();
    const refUrl = data.referencePreviewUrl?.trim();
    const refImageForImageGen =
      data.referenceMediaKind !== "video" && refUrl ? refUrl : undefined;

    if (data.kind === "image") {
      emitRunLog("info", "Image generation started.");
      const imageResultsListLabel = `${(data.label || cfg.title || "Image").trim() || "Image"} results`;
      const linkedImageReferences = collectLinkedImageUrlsForHandles(nodes, edges, id, [
        "references",
        "startImage",
        "inImage",
      ]);
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
      if (profile360Preset && refsForJob.length === 0) {
        toast.error("Connect a reference image", {
          description: "Wire an avatar or photo into References, or upload one in the preview slot (same as Studio Avatar 360° profile).",
        });
        emitRunFinished(false);
        emitRunLog("error", "360° profile preset blocked: no reference image.");
        return;
      }
      const avatar360Models = new Set<string>(WORKFLOW_AVATAR_360_PROFILE_ALLOWED_MODELS);
      const imageModelForJob = profile360Preset
        ? avatar360Models.has(model)
          ? model
          : WORKFLOW_AVATAR_360_PROFILE_DEFAULT_MODEL
        : model;
      const imageAspectForJob = profile360Preset ? WORKFLOW_AVATAR_360_PROFILE_ASPECT : aspectRatio;
      const imageResolutionForJob = profile360Preset
        ? ["1K", "2K", "4K"].includes(resolution)
          ? resolution
          : "1K"
        : resolution;
      const imageQtyForJob = profile360Preset ? 1 : perNodeQuantity;
      const perRunCharge = workflowImageChargeCredits({
        model: imageModelForJob,
        resolution: imageResolutionForJob,
        quantity: imageQtyForJob,
      });
      const runCount = Math.max(1, batchPrompts?.length ?? 1);
      const charge = perRunCharge * runCount;
      if (!creditBypass && creditsRef.current < charge) {
        toast.error("Not enough credits", { description: `You need ${charge} credits for this run.` });
        emitRunFinished(false);
        emitRunLog("error", `Image generation blocked: not enough credits (${charge}).`);
        return;
      }
      const platformCharge = creditBypass ? 0 : charge;
      if (!creditBypass && platformCharge > 0) {
        spendCredits(platformCharge);
        creditsRef.current = Math.max(0, creditsRef.current - platformCharge);
      }
      setGenerating(true);
      let ok = false;
      let promptsForRun: string[] = [];
      let progressListId: string | null = null;
      const progressiveImageUrls: string[] = [];
      let pendingImageTaskIds: string[] = [];
      try {
        promptsForRun = batchPrompts?.length ? batchPrompts : [singlePrompt];
        const shouldBuildProgressList = fromPromptList && promptsForRun.length > 1;
        const nodeRef = nodes.find((n) => n.id === id);
        if (shouldBuildProgressList && nodeRef) {
          const pendingSlots = promptsForRun.map((_, idx) => `${WORKFLOW_PENDING_MEDIA_PREFIX}${idx}`);
          const existingListId = findLinkedWorkflowMediaResultsListId(nodes, edges, id, "image");
          if (existingListId) {
            progressListId = existingListId;
            patch(progressListId, {
              label: imageResultsListLabel,
              lines: pendingSlots,
              mode: "results",
              contentKind: "media",
            });
          } else {
            const listNode = buildPromptListNode(
              { x: nodeRef.position.x + Math.max(560, cardWidthPx + 220), y: nodeRef.position.y + 18 },
              { label: "Image results", lines: pendingSlots, mode: "results" },
            );
            listNode.data = { ...listNode.data, contentKind: "media" };
            progressListId = listNode.id;
            setNodes((prev) => [...prev, listNode]);
            setEdges((prev) => [
              ...prev,
              {
                id: `e-${id}-${listNode.id}-${crypto.randomUUID().slice(0, 8)}`,
                source: id,
                sourceHandle: "generated",
                target: listNode.id,
                targetHandle: "inImage",
                style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
              },
            ]);
          }
        }
        const runCorrelationId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `wf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        pendingImageTaskIds = Array.from({ length: promptsForRun.length }, () => "");
        setPendingWorkflowRun({
          mediaKind: "image",
          taskIds: pendingImageTaskIds,
          progressListId,
          listLabel: imageResultsListLabel,
          correlationId: runCorrelationId,
        });
        emitRunLog(
          "info",
          `Image run config: model=${imageModelForJob}, aspect=${imageAspectForJob}, resolution=${imageResolutionForJob}, prompts=${
            promptsForRun.length
          }, promptChars=${promptsForRun.map((p) => p.trim().length).join("/")}, refs=${
            refsForJob.length
          }, promptSample="${promptsForRun[0]?.trim().slice(0, 120) ?? ""}".`,
        );
        const imageSettled = await Promise.allSettled(
          promptsForRun.map(async (p, idx) => {
            const { imageUrl } = await runWorkflowImageJob({
              planId,
              personalApiKey: personalKey,
              prompt: p,
              model: imageModelForJob,
              aspectRatio: imageAspectForJob,
              resolution: imageResolutionForJob,
              quantity: imageQtyForJob,
              referenceImageUrls: refsForJob.length ? refsForJob : undefined,
              workflowRunCorrelationId: runCorrelationId,
              onTaskStarted: (taskId) => {
                pendingImageTaskIds[idx] = taskId;
                setPendingWorkflowRun({
                  mediaKind: "image",
                  taskIds: pendingImageTaskIds,
                  progressListId,
                  listLabel: imageResultsListLabel,
                  correlationId: runCorrelationId,
                });
              },
            });
            primeRemoteMediaForDisplay(imageUrl);
            if (progressListId) {
              progressiveImageUrls[idx] = imageUrl;
              patch(progressListId, {
                lines: promptsForRun.map((_, slotIdx) =>
                  progressiveImageUrls[slotIdx]?.trim() || `${WORKFLOW_PENDING_MEDIA_PREFIX}${slotIdx}`,
                ),
                mode: "results",
                contentKind: "media",
              });
            }
            return imageUrl;
          }),
        );
        const imageResultLines = promptsForRun.map((promptText, idx) => {
          const row = imageSettled[idx];
          if (row?.status === "fulfilled") return row.value.trim();
          const raw = row?.status === "rejected" ? (row.reason instanceof Error ? row.reason.message : String(row.reason ?? "")) : "";
          const msg = raw.trim() || "Image generation failed.";
          return workflowMediaErrorToken({
            nodeId: id,
            prompt: promptText,
            kind: "image",
            message: msg,
          });
        });
        const imageResults = imageResultLines.filter(isWorkflowResolvedMediaLine);
        const imageUrl =
          imageResults
            .map((u) => u.trim())
            .filter(Boolean)
            .at(-1) ?? "";
        patch(id, {
          outputPreviewUrl: imageUrl,
          outputMediaKind: "image",
        });
        if (shouldBuildProgressList) {
          if (progressListId) {
            finalizeProgressMediaList(progressListId, imageResultLines, imageResultsListLabel);
          }
          const failedCount = imageResultLines.length - imageResults.length;
          if (failedCount > 0) {
            toast.message(`Batch done (${imageResults.length}/${imageResultLines.length})`, {
              description: `${failedCount} item(s) failed. See list cards for Dismiss / Regenerate.`,
            });
          } else {
            toast.success(`Batch done (${imageResults.length})`, {
              description: "Image list updated progressively during generation.",
            });
          }
        } else if (fromPromptList && (batchPrompts?.length ?? 0) > 1 && nodeRef) {
          const existingListId = findLinkedWorkflowMediaResultsListId(nodes, edges, id, "image");
          if (existingListId) {
            patch(existingListId, {
              label: imageResultsListLabel,
              lines: imageResultLines,
              mode: "results",
              contentKind: "media",
            });
            const failedCount = imageResultLines.length - imageResults.length;
            if (failedCount > 0) {
              toast.message(`Batch done (${imageResults.length}/${imageResultLines.length})`, {
                description: `${failedCount} item(s) failed. See list cards for Dismiss / Regenerate.`,
              });
            } else {
              toast.success(`Batch done (${imageResults.length})`, {
                description: "Connected image list was updated.",
              });
            }
          } else {
            const listNode = buildPromptListNode(
              { x: nodeRef.position.x + 380, y: nodeRef.position.y + 18 },
              { label: "Image results", lines: imageResultLines, mode: "results" },
            );
            listNode.data = { ...listNode.data, contentKind: "media" };
            setNodes((prev) => [...prev, listNode]);
            setEdges((prev) => [
              ...prev,
              {
                id: `e-${id}-${listNode.id}-${crypto.randomUUID().slice(0, 8)}`,
                source: id,
                sourceHandle: "generated",
                target: listNode.id,
                targetHandle: "inImage",
                style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
              },
            ]);
            const failedCount = imageResultLines.length - imageResults.length;
            if (failedCount > 0) {
              toast.message(`Batch done (${imageResults.length}/${imageResultLines.length})`, {
                description: `${failedCount} item(s) failed. See list cards for Dismiss / Regenerate.`,
              });
            } else {
              toast.success(`Batch done (${imageResults.length})`, {
                description: "A new List node was created with all generated image URLs.",
              });
            }
          }
        } else {
          if (imageResults.length === promptsForRun.length) {
            toast.success("Image ready");
          } else {
            toast.error("Some images failed", {
              description: "Check the connected list to dismiss or regenerate failed items.",
            });
          }
        }
        ok = imageResults.length === promptsForRun.length;
        emitRunLog(
          ok ? "success" : "error",
          ok
            ? "Image generation finished."
            : `Image batch partial failure (${imageResults.length}/${promptsForRun.length} succeeded).`,
        );
        setPendingWorkflowRun(null);
      } catch (e) {
        const { summary: msg, details } = detailedMessageFromCaughtError(e, "Image generation failed. Try again.");
        if (progressListId) {
          const completed = promptsForRun
            .map((_, slotIdx) => progressiveImageUrls[slotIdx]?.trim())
            .filter(Boolean) as string[];
          finalizeProgressMediaList(progressListId, completed, imageResultsListLabel);
        }
        refundPlatformCredits(platformCharge, grantCredits, creditsRef);
        setLastGenerationError(msg);
        setLastGenerationErrorDetails(details ?? null);
        setErrorDetailsOpen(false);
        toast.error(msg, details ? { description: details } : undefined);
        emitRunLog("error", details ? `Image generation failed: ${msg} — ${details}` : `Image generation failed: ${msg}`);
      } finally {
        if (!ok && !pendingImageTaskIds.some((t) => t.trim())) {
          setPendingWorkflowRun(null);
        }
        setGenerating(false);
        emitRunFinished(ok);
      }
      return;
    }

    if (data.kind === "motion") {
      emitRunLog("info", "Motion control started.");
      const motionImageRefs = collectLinkedImageUrlsForHandles(nodes, edges, id, ["startImage", "inImage"]);
      const motionVideoRefs = collectLinkedVideoUrlsForHandles(nodes, edges, id, ["inVideo"]);
      const motionImageUrl =
        motionImageRefs[0]?.trim() ||
        (data.referenceMediaKind === "image" ? data.referencePreviewUrl?.trim() : "") ||
        "";
      const motionVideoUrl =
        motionVideoRefs[0]?.trim() ||
        (data.referenceMediaKind === "video" ? data.referencePreviewUrl?.trim() : "") ||
        "";
      if (!motionImageUrl || !motionVideoUrl) {
        toast.error("Motion Control needs 2 inputs", {
          description: "Connect one image to Character image and one video to Motion video.",
        });
        emitRunFinished(false);
        emitRunLog("error", "Motion control blocked: missing image/video inputs.");
        return;
      }
      const motionQuality = (resolution === "1080p" ? "1080p" : "720p") as "720p" | "1080p";
      const detectedDurationSec = await probeWorkflowVideoDurationSec(motionVideoUrl);
      if (detectedDurationSec == null || !Number.isFinite(detectedDurationSec) || detectedDurationSec <= 0) {
        toast.error("Could not read motion input duration", {
          description: "Please use a valid video input (3s to 30s).",
        });
        emitRunFinished(false);
        emitRunLog("error", "Motion control blocked: could not detect input video duration.");
        return;
      }
      setMotionDetectedInputDurationSec(detectedDurationSec);
      const roundedMotionDuration = Math.round(detectedDurationSec * 100) / 100;
      if (data.motionInputDurationSec !== roundedMotionDuration) {
        patch(id, { motionInputDurationSec: roundedMotionDuration });
      }
      const perMotionCharge = workflowMotionControlChargeCredits({
        quality: motionQuality,
        durationSec: detectedDurationSec,
      });
      const runCount = Math.max(1, batchPrompts?.length ?? 1);
      const mCharge = perMotionCharge * runCount;
      if (!creditBypass && creditsRef.current < mCharge) {
        toast.error("Not enough credits", { description: `You need ${mCharge} credits for this run.` });
        emitRunFinished(false);
        emitRunLog("error", `Motion control blocked: not enough credits (${mCharge}).`);
        return;
      }
      const mPlatformCharge = creditBypass ? 0 : mCharge;
      if (!creditBypass && mPlatformCharge > 0) {
        spendCredits(mPlatformCharge);
        creditsRef.current = Math.max(0, creditsRef.current - mPlatformCharge);
      }
      setGenerating(true);
      let ok = false;
      let pendingTaskIds: string[] = [];
      try {
        const promptsForRun = batchPrompts?.length ? batchPrompts : [singlePrompt];
        emitRunLog(
          "info",
          `Motion run config: model=${model}, quality=${motionQuality}, duration=${detectedDurationSec}s, prompts=${
            promptsForRun.length
          }, promptChars=${promptsForRun.map((p) => p.trim().length).join("/")}, imageInput=${
            motionImageUrl ? "yes" : "no"
          }, videoInput=${motionVideoUrl ? "yes" : "no"}, promptSample="${
            promptsForRun[0]?.trim().slice(0, 120) ?? ""
          }".`,
        );
        const motionCorrelationId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `wf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        pendingTaskIds = Array.from({ length: promptsForRun.length }, () => "");
        setPendingWorkflowRun({
          mediaKind: "video",
          taskIds: pendingTaskIds,
          listLabel: `${(data.label || cfg.title || "Motion").trim() || "Motion"} results`,
          correlationId: motionCorrelationId,
        });
        const results = await Promise.all(
          promptsForRun.map(async (p, idx) => {
            const { videoUrl } = await runWorkflowMotionControlJob({
              planId,
              personalApiKey: personalKey,
              prompt: p,
              motionFamily: model === "kling-2.6" ? "kling-2.6" : "kling-3.0",
              quality: motionQuality,
              imageUrl: motionImageUrl,
              videoUrl: motionVideoUrl,
              backgroundSource: data.motionBackgroundSource ?? "input_video",
              workflowRunCorrelationId: motionCorrelationId,
              onTaskStarted: (taskId) => {
                pendingTaskIds[idx] = taskId;
                setPendingWorkflowRun({
                  mediaKind: "video",
                  taskIds: pendingTaskIds,
                  listLabel: `${(data.label || cfg.title || "Motion").trim() || "Motion"} results`,
                  correlationId: motionCorrelationId,
                });
              },
            });
            primeRemoteMediaForDisplay(videoUrl);
            return videoUrl;
          }),
        );
        const videoUrl =
          results
            .map((u) => u.trim())
            .filter(Boolean)
            .at(-1) ?? "";
        patch(id, {
          outputPreviewUrl: videoUrl,
          outputMediaKind: "video",
          videoExtractedFirstFrameUrl: undefined,
          videoExtractedLastFrameUrl: undefined,
        });
        toast.success("Motion control video ready");
        ok = true;
        setPendingWorkflowRun(null);
        emitRunLog("success", "Motion control finished.");
      } catch (e) {
        const { summary: msg, details } = detailedMessageFromCaughtError(e, "Motion control failed. Try again.");
        refundPlatformCredits(mPlatformCharge, grantCredits, creditsRef);
        setLastGenerationError(msg);
        setLastGenerationErrorDetails(details ?? null);
        setErrorDetailsOpen(false);
        toast.error(msg, details ? { description: details } : undefined);
        emitRunLog("error", details ? `Motion control failed: ${msg} — ${details}` : `Motion control failed: ${msg}`);
      } finally {
        if (!ok && !pendingTaskIds.some((t) => t.trim())) setPendingWorkflowRun(null);
        setGenerating(false);
        emitRunFinished(ok);
      }
      return;
    }

    /* video */
    const videoResultsListLabel = `${(data.label || cfg.title || "Video").trim() || "Video"} results`;
    const perVideoCharge = workflowVideoChargeCredits({
      model,
      resolution,
      durationSec: data.videoDurationSec,
    });
    const runCount = Math.max(1, batchPrompts?.length ?? 1);
    const vCharge = perVideoCharge * runCount;
    if (!creditBypass && creditsRef.current < vCharge) {
      toast.error("Not enough credits", { description: `You need ${vCharge} credits for this run.` });
      emitRunFinished(false);
      emitRunLog("error", `Video generation blocked: not enough credits (${vCharge}).`);
      return;
    }
    emitRunLog("info", "Video generation started.");
    const vPlatformCharge = creditBypass ? 0 : vCharge;
    if (!creditBypass && vPlatformCharge > 0) {
      spendCredits(vPlatformCharge);
      creditsRef.current = Math.max(0, creditsRef.current - vPlatformCharge);
    }
    setGenerating(true);
    let ok = false;
    let promptsForRun: string[] = [];
    let progressListId: string | null = null;
    const progressiveVideoUrls: string[] = [];
    let pendingVideoTaskIds: string[] = [];
    try {
      let nodesForVideoInputs = nodes;
      const incomingVideoFrameEdges = edges.filter(
        (e) => e.target === id && ((e.targetHandle ?? "") === "startImage" || (e.targetHandle ?? "") === "endImage"),
      );
      let frameExtractionFailed = false;
      if (incomingVideoFrameEdges.length > 0) {
        const byId = new Map(nodesForVideoInputs.map((n) => [n.id, n]));
        const frameCacheWrites = new Map<string, Partial<AdAssetNodeData>>();
        const frameTaskSeen = new Set<string>();
        for (const edge of incomingVideoFrameEdges) {
          const src = byId.get(edge.source);
          if (!src || src.type !== "adAsset") continue;
          const srcData = src.data as AdAssetNodeData;
          if (srcData.kind !== "video") continue;
          const outUrl = srcData.outputPreviewUrl?.trim();
          if (!outUrl) continue;
          const srcHandle = edge.sourceHandle ?? "out";
          const wantEndFrame = srcHandle !== "videoFirst";
          const firstCached =
            frameCacheWrites.get(src.id)?.videoExtractedFirstFrameUrl?.trim() ??
            srcData.videoExtractedFirstFrameUrl?.trim() ??
            "";
          const lastCached =
            frameCacheWrites.get(src.id)?.videoExtractedLastFrameUrl?.trim() ??
            srcData.videoExtractedLastFrameUrl?.trim() ??
            "";
          const alreadyHaveWanted = wantEndFrame ? Boolean(lastCached) : Boolean(firstCached);
          if (alreadyHaveWanted) continue;
          const taskKey = `${src.id}:${wantEndFrame ? "last" : "first"}`;
          if (frameTaskSeen.has(taskKey)) continue;
          frameTaskSeen.add(taskKey);
          try {
            const extracted = await extractVideoFrameJpegDataUrlFromUrl(outUrl, wantEndFrame);
            const prev = frameCacheWrites.get(src.id) ?? {};
            frameCacheWrites.set(src.id, {
              ...prev,
              ...(wantEndFrame
                ? { videoExtractedLastFrameUrl: extracted }
                : { videoExtractedFirstFrameUrl: extracted }),
            });
          } catch (err) {
            frameExtractionFailed = true;
            console.warn("[workflow] Failed to auto-extract video frame", err);
          }
        }
        if (frameCacheWrites.size > 0) {
          nodesForVideoInputs = nodesForVideoInputs.map((n) => {
            const patchData = frameCacheWrites.get(n.id);
            if (!patchData) return n;
            return {
              ...n,
              data: {
                ...(n.data as AdAssetNodeData),
                ...patchData,
              },
            } as WorkflowCanvasNode;
          });
          setNodes((prev) =>
            prev.map((n) => {
              const patchData = frameCacheWrites.get(n.id);
              if (!patchData) return n;
              return {
                ...n,
                data: {
                  ...(n.data as AdAssetNodeData),
                  ...patchData,
                },
              } as WorkflowCanvasNode;
            }),
          );
        }
      }
      const linkedFromStartPortStrict = collectLinkedImageUrlsForHandles(nodesForVideoInputs, edges, id, ["startImage"]);
      const linkedFromEndPort = collectLinkedImageUrlsForHandles(nodesForVideoInputs, edges, id, ["endImage"]);
      const linkedFromReferencesPortStrict = collectLinkedImageUrlsForHandles(
        nodesForVideoInputs,
        edges,
        id,
        ["references"],
      );
      // Legacy: `inImage` when no explicit start/references wiring (center `in` removed from nodes).
      const linkedFromLegacyImagePorts = collectLinkedImageUrlsForHandles(nodesForVideoInputs, edges, id, [
        "inImage",
      ]);
      const linkedFromStartPort =
        linkedFromStartPortStrict.length > 0 ? linkedFromStartPortStrict : linkedFromLegacyImagePorts;
      const linkedFromReferencesPort =
        linkedFromReferencesPortStrict.length > 0 ? linkedFromReferencesPortStrict : linkedFromLegacyImagePorts;
      const nodeRefUrl =
        data.referenceMediaKind === "image" && data.referencePreviewUrl?.trim()
          ? data.referencePreviewUrl.trim()
          : "";
      const startFrame =
        (data.videoStartImageUrl?.trim() || linkedFromStartPort[0] || nodeRefUrl || "").trim() || undefined;
      const endFrame = (data.videoEndImageUrl?.trim() || linkedFromEndPort[0] || "").trim() || undefined;

      // The user wired a video frame as input but extraction failed AND no fallback frame is
      // available — abort (refunds credits via the central catch) instead of silently
      // downgrading to text-to-video, which would ignore the connected start/end image.
      if (frameExtractionFailed && !startFrame && !endFrame) {
        throw new Error(
          "Could not read connected video frame. Open the source video and use its corner bubble to save first/last frame, then run again.",
        );
      }
      const referencePool = [...linkedFromReferencesPort];
      if (nodeRefUrl && startFrame !== nodeRefUrl && !referencePool.includes(nodeRefUrl)) {
        referencePool.push(nodeRefUrl);
      }
      const referenceOnly = Array.from(new Set(referencePool.filter(Boolean))).filter(
        (u) => u !== startFrame && u !== endFrame,
      );
      const indexedStartImages =
        linkedFromStartPort.length > 0
          ? linkedFromStartPort
          : linkedFromReferencesPort.length > 0
            ? linkedFromReferencesPort
            : [];
      const pickByIndex = (arr: string[], idx: number, fallback: string | undefined): string | undefined => {
        if (!arr.length) return fallback;
        const clamped = idx >= arr.length ? arr[arr.length - 1] : arr[idx];
        const chosen = clamped?.trim();
        return chosen || fallback;
      };

      promptsForRun = batchPrompts?.length ? batchPrompts : [singlePrompt];
      const promptChars = promptsForRun.map((x) => x.trim().length);
      emitRunLog(
        "info",
        `Video run config: model=${model}, aspect=${aspectRatio}, duration=${data.videoDurationSec ?? "auto"}s, prompts=${
          promptsForRun.length
        }, promptChars=${promptChars.join("/")}, startImage=${startFrame ? "yes" : "no"}, endImage=${
          endFrame ? "yes" : "no"
        }, refs=${referenceOnly.length}, promptSample="${promptsForRun[0]?.trim().slice(0, 120) ?? ""}".`,
      );
      const isSeedanceModel = model.startsWith("bytedance/seedance");
      const seedance2ProLike =
        resolvedVideoModelId === "bytedance/seedance-2" || resolvedVideoModelId === "bytedance/seedance-2-fast";
      const linkedVideoFromInPort = seedance2ProLike
        ? collectLinkedVideoUrlsForHandles(nodesForVideoInputs, edges, id, ["inVideo"])
        : [];
      const nodeLocalVideoUrl =
        seedance2ProLike && data.referenceMediaKind === "video" && data.referencePreviewUrl?.trim()
          ? data.referencePreviewUrl.trim()
          : "";
      const workflowSeedanceProVideoRefUrls: string[] = seedance2ProLike
        ? (() => {
            const seen = new Set<string>();
            const out: string[] = [];
            for (const u of [...linkedVideoFromInPort, ...(nodeLocalVideoUrl ? [nodeLocalVideoUrl] : [])]) {
              const t = u.trim();
              if (!t || seen.has(t)) continue;
              seen.add(t);
              out.push(t);
              if (out.length >= 1) break;
            }
            return out;
          })()
        : [];
      if (isSeedanceModel) {
        emitRunLog(
          "info",
          `Seedance input debug: startPort=${linkedFromStartPort.length}, referencesPort=${linkedFromReferencesPort.length}, endPort=${linkedFromEndPort.length}, resolvedStart=${startFrame ? "yes" : "no"}, resolvedRefs=${referenceOnly.length}, videoRefs=${workflowSeedanceProVideoRefUrls.length}.`,
        );
      }
      const shouldBuildProgressList = fromPromptList && promptsForRun.length > 1;
      const nodeRef = nodes.find((n) => n.id === id);
      if (shouldBuildProgressList && nodeRef) {
        const pendingSlots = promptsForRun.map((_, idx) => `${WORKFLOW_PENDING_MEDIA_PREFIX}${idx}`);
        const existingListId = findLinkedWorkflowMediaResultsListId(nodes, edges, id, "video");
        if (existingListId) {
          progressListId = existingListId;
          patch(progressListId, {
            label: videoResultsListLabel,
            lines: pendingSlots,
            mode: "results",
            contentKind: "media",
          });
        } else {
          const listNode = buildPromptListNode(
            { x: nodeRef.position.x + Math.max(560, cardWidthPx + 220), y: nodeRef.position.y + 18 },
            { label: "Video results", lines: pendingSlots, mode: "results" },
          );
          listNode.data = { ...listNode.data, contentKind: "media" };
          progressListId = listNode.id;
          setNodes((prev) => [...prev, listNode]);
          setEdges((prev) => [
            ...prev,
            {
              id: `e-${id}-${listNode.id}-${crypto.randomUUID().slice(0, 8)}`,
              source: id,
              sourceHandle: "out",
              target: listNode.id,
              targetHandle: "inVideo",
              style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
            },
          ]);
        }
      }
      const videoCorrelationId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `wf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      pendingVideoTaskIds = Array.from({ length: promptsForRun.length }, () => "");
      setPendingWorkflowRun({
        mediaKind: "video",
        taskIds: pendingVideoTaskIds,
        progressListId,
        listLabel: videoResultsListLabel,
        correlationId: videoCorrelationId,
      });
      const videoSettled = await Promise.allSettled(
        promptsForRun.map(async (p, idx) => {
          const indexedStartFrame = pickByIndex(indexedStartImages, idx, startFrame);
          const indexedReferenceOnly = referenceOnly.filter((u) => u !== indexedStartFrame && u !== endFrame);
          if (
            isSeedanceModel &&
            !indexedStartFrame &&
            indexedReferenceOnly.length === 0 &&
            !(seedance2ProLike && workflowSeedanceProVideoRefUrls.length > 0)
          ) {
            throw new Error(
              seedance2ProLike
                ? "Seedance could not resolve any reference from this node. Connect reference images, wire a video module into Video input, or upload a reference video (Seedance 2 / Fast), then run again."
                : "Seedance could not resolve any reference image from this node inputs. Connect at least one image to Start image or References on the Video Generator (not Text), then run again.",
            );
          }
          const { videoUrl } = await runWorkflowVideoJob({
            planId,
            personalApiKey: personalKey,
            piapiApiKey: piapiKey,
            prompt: p,
            model,
            aspectRatio,
            resolution,
            durationSec: data.videoDurationSec,
            linkedImageUrl: indexedStartFrame,
            referenceImageUrl: undefined,
            endImageUrl: endFrame,
            referenceImageUrls: indexedReferenceOnly.length ? indexedReferenceOnly : undefined,
            referenceVideoUrls:
              seedance2ProLike && workflowSeedanceProVideoRefUrls.length > 0
                ? workflowSeedanceProVideoRefUrls
                : undefined,
            workflowRunCorrelationId: videoCorrelationId,
            onTaskStarted: (taskId) => {
              pendingVideoTaskIds[idx] = taskId;
              setPendingWorkflowRun({
                mediaKind: "video",
                taskIds: pendingVideoTaskIds,
                progressListId,
                listLabel: videoResultsListLabel,
                correlationId: videoCorrelationId,
              });
            },
          });
          primeRemoteMediaForDisplay(videoUrl);
          if (progressListId) {
            progressiveVideoUrls[idx] = videoUrl;
            patch(progressListId, {
              lines: promptsForRun.map((_, slotIdx) =>
                progressiveVideoUrls[slotIdx]?.trim() || `${WORKFLOW_PENDING_MEDIA_PREFIX}${slotIdx}`,
              ),
              mode: "results",
              contentKind: "media",
            });
          }
          return videoUrl;
        }),
      );
      const videoResultLines = promptsForRun.map((promptText, idx) => {
        const row = videoSettled[idx];
        if (row?.status === "fulfilled") return row.value.trim();
        const raw = row?.status === "rejected" ? (row.reason instanceof Error ? row.reason.message : String(row.reason ?? "")) : "";
        const msg = raw.trim() || "Video generation failed.";
        return workflowMediaErrorToken({
          nodeId: id,
          prompt: promptText,
          kind: "video",
          message: msg,
        });
      });
      const videoResults = videoResultLines.filter(isWorkflowResolvedMediaLine);
      const videoUrl =
        videoResults
          .map((u) => u.trim())
          .filter(Boolean)
          .at(-1) ?? "";
      patch(id, {
        outputPreviewUrl: videoUrl,
        outputMediaKind: "video",
        videoExtractedFirstFrameUrl: undefined,
        videoExtractedLastFrameUrl: undefined,
      });
      if (shouldBuildProgressList) {
        if (progressListId) {
          finalizeProgressMediaList(progressListId, videoResultLines, videoResultsListLabel);
        }
        const failedCount = videoResultLines.length - videoResults.length;
        if (failedCount > 0) {
          toast.message(`Batch done (${videoResults.length}/${videoResultLines.length})`, {
            description: `${failedCount} item(s) failed. See list cards for Dismiss / Regenerate.`,
          });
        } else {
          toast.success(`Batch done (${videoResults.length})`, {
            description: "Video list updated progressively during generation.",
          });
        }
      } else {
        if (videoResults.length === promptsForRun.length) {
          toast.success("Video ready");
        } else {
          toast.error("Some videos failed", {
            description: "Check the connected list to dismiss or regenerate failed items.",
          });
        }
      }
      ok = videoResults.length === promptsForRun.length;
      emitRunLog(
        ok ? "success" : "error",
        ok
          ? "Video generation finished."
          : `Video batch partial failure (${videoResults.length}/${promptsForRun.length} succeeded).`,
      );
      setPendingWorkflowRun(null);
    } catch (e) {
      const { summary: msg, details } = detailedMessageFromCaughtError(e, "Video generation failed. Try again.");
      if (progressListId) {
        const completed = promptsForRun
          .map((_, slotIdx) => progressiveVideoUrls[slotIdx]?.trim())
          .filter(Boolean) as string[];
        finalizeProgressMediaList(progressListId, completed, videoResultsListLabel);
      }
      refundPlatformCredits(vPlatformCharge, grantCredits, creditsRef);
      setLastGenerationError(msg);
      setLastGenerationErrorDetails(details ?? null);
      setErrorDetailsOpen(false);
      toast.error(msg, details ? { description: details } : undefined);
      emitRunLog(
        "error",
        details ? `Video generation failed: ${msg} — ${details}` : `Video generation failed: ${msg}`,
      );
    } finally {
      if (!ok && !pendingVideoTaskIds.some((t) => t.trim())) {
        setPendingWorkflowRun(null);
      }
      setGenerating(false);
      emitRunFinished(ok);
    }
  }, [
    cfg,
    data.assistantVisionPreset,
    data.imageWorkflowPreset,
    data.kind,
    data.label,
    data.motionBackgroundSource,
    data.motionInputDurationSec,
    data.referenceMediaKind,
    data.referencePreviewUrl,
    data.videoDurationSec,
    data.videoStartImageUrl,
    data.videoEndImageUrl,
    generating,
    getEdges,
    getNodes,
    grantCredits,
    id,
    resolvedVideoModelId,
    model,
    aspectRatio,
    resolution,
    quantity,
    cardWidthPx,
    patch,
    planId,
    prompt,
    spendCredits,
    setNodes,
    setEdges,
    assistantModel,
    assistantExportMode,
    websiteUrl,
    websiteOutputMode,
    websiteProductImageCount,
    emitRunFinished,
    emitRunLog,
    setPendingWorkflowRun,
    finalizeProgressMediaList,
  ]);

  const runThisNodeOnly = useCallback(() => {
    setRunChoiceOpen(false);
    void onGenerate();
  }, [onGenerate]);
  const runFromHere = useCallback(() => {
    setRunChoiceOpen(false);
    window.dispatchEvent(new CustomEvent("workflow:run-from-here", { detail: { nodeId: id } }));
  }, [id]);
  const onGenerateButtonClick = useCallback(() => {
    if (generating) return;
    if (!hasDownstreamModules) {
      void onGenerate();
      return;
    }
    setRunChoiceOpen((v) => !v);
  }, [generating, hasDownstreamModules, onGenerate]);

  useEffect(() => {
    const onRunNode = (ev: Event) => {
      const detail = (ev as CustomEvent<{ nodeId?: string }>).detail;
      if (!detail?.nodeId || detail.nodeId !== id) return;
      void onGenerate();
    };
    window.addEventListener("workflow:run-node", onRunNode as EventListener);
    return () => window.removeEventListener("workflow:run-node", onRunNode as EventListener);
  }, [id, onGenerate]);

  if (data.kind === "website") {
    const websiteCardWidth = Math.max(cardWidthPx, 520);
    const modeMeta = WEBSITE_OUTPUT_MODES.find((m) => m.value === websiteOutputMode);
    const profile360Website = websiteOutputMode === "profile_360";
    return (
      <>
        <WorkflowNodeContextToolbar nodeId={id} onRun={runThisNodeOnly} onRunFromHere={runFromHere} />
        <div
          className="relative flex items-end gap-1"
          onMouseEnter={() => window.dispatchEvent(new CustomEvent("workflow:hover-node", { detail: { nodeId: id } }))}
          onMouseLeave={() => window.dispatchEvent(new CustomEvent("workflow:unhover-node"))}
        >
          {profile360Website ? (
            <div className="nodrag nopan flex shrink-0 flex-col gap-1 pb-3">
              <div className={cn(workflowPortBubbleShellClass, "nodrag nopan relative")}>
                <Handle
                  id="references"
                  type="target"
                  position={Position.Left}
                  className={workflowPortTargetBubbleHandleClass}
                  aria-label="Website 360° image input"
                  title="Connect a product shot, avatar, or image reference to run the 360° preset."
                  onPointerDown={(e) => handleInputBubblePointerDown(e, "references")}
                />
                <span className={workflowPortBubbleIconClass} aria-hidden>
                  <Images className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </span>
              </div>
            </div>
          ) : (
            <div className="nodrag nopan flex shrink-0 flex-col gap-1 pb-3">
              <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
                <Handle
                  id="text"
                  type="target"
                  position={Position.Left}
                  className={workflowPortTargetBubbleHandleLeftHalfClass}
                  aria-label="Website notes / prompt text input"
                  onPointerDown={(e) => handleInputBubblePointerDown(e, "text")}
                />
                <Handle
                  id="inText"
                  type="target"
                  position={Position.Left}
                  className={workflowPortTargetBubbleHandleRightHalfClass}
                  aria-label="Alternate website text input"
                  onPointerDown={(e) => handleInputBubblePointerDown(e, "text")}
                />
                <span
                  className={workflowPortBubbleIconClass}
                  title="Optional linked text context (same port family as Video Generator)."
                  aria-hidden
                >
                  <Type className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </span>
              </div>
            </div>
          )}

          <div
            className={cn(
              "relative overflow-visible rounded-2xl border border-white/[0.08] bg-[#121212]/98 px-3 pb-3 pt-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm",
              selected ? "ring-2 ring-violet-500/85 ring-offset-2 ring-offset-[#06070d]" : "",
            )}
            style={{ width: websiteCardWidth }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Handle
              id="out"
              type="source"
              position={Position.Right}
              className="workflow-port-create-cursor nodrag nopan !box-border !h-8 !w-8 !min-h-8 !min-w-8 !max-h-8 !max-w-8 !rounded-full !border-0 !bg-transparent opacity-0"
            />

            <div className="mb-2 flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0 text-white/75" strokeWidth={2} aria-hidden />
              <p className="min-w-0 truncate text-[13px] font-semibold tracking-tight text-white">Website module #{displayIndex}</p>
            </div>

            <div className="space-y-2">
              {profile360Website ? (
                <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-[11px] leading-snug text-white/60">
                  Wire one image reference on the left (product, avatar upload, etc.). Run adds a preset Image Generator only—choose your source yourself.
                </div>
              ) : (
                <div>
                  <p className="mb-1 text-[11px] font-medium text-white/60">Website URL</p>
                  <input
                    value={websiteUrl}
                    onChange={(e) => patch(id, { websiteUrl: e.target.value })}
                    placeholder="https://your-store.com/product-page"
                    onWheelCapture={keepWheelInsideScrollable}
                    className="nodrag nopan nowheel h-9 w-full rounded-lg border border-white/12 bg-black/35 px-3 text-[13px] text-white/90 outline-none focus:border-violet-500/40"
                  />
                </div>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-medium text-white/60">Output</p>
                  <Select
                    value={websiteOutputMode}
                    onValueChange={(v) =>
                      patch(id, {
                        websiteOutputMode: v as "product_images" | "angles" | "full_flow" | "profile_360",
                      })
                    }
                  >
                    <SelectTrigger size="sm" className={cn(selectTriggerClass, "w-full")}>
                      <SelectValue placeholder="Output mode" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClass} position="popper">
                      {WEBSITE_OUTPUT_MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="text-[12px] focus:bg-violet-500/20">
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {websiteOutputMode === "product_images" ? (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-white/60">Image count</p>
                    <Select
                      value={String(websiteProductImageCount)}
                      onValueChange={(v) => patch(id, { websiteProductImageCount: Number(v) as 1 | 3 | 5 })}
                    >
                      <SelectTrigger size="sm" className={cn(selectTriggerClass, "w-full")}>
                        <SelectValue placeholder="Count" />
                      </SelectTrigger>
                      <SelectContent className={selectContentClass} position="popper">
                        <SelectItem value="1" className="text-[12px] focus:bg-violet-500/20">1 image</SelectItem>
                        <SelectItem value="3" className="text-[12px] focus:bg-violet-500/20">3 images</SelectItem>
                        <SelectItem value="5" className="text-[12px] focus:bg-violet-500/20">5 images</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-[11px] text-white/55">
                    {modeMeta?.hint ?? ""}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <div className="relative ml-auto">
                <button
                  type="button"
                  title={generating ? "Running website module…" : "Run website module"}
                  disabled={generating}
                  className="nodrag nopan flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 shadow-md transition hover:bg-white/95 disabled:cursor-not-allowed disabled:opacity-55"
                  onClick={onGenerateButtonClick}
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-900" aria-hidden />
                  ) : hasWebsiteRun ? (
                    <RotateCcw className="h-4 w-4 text-zinc-900" strokeWidth={2.25} />
                  ) : (
                    <ArrowRight className="h-4 w-4 text-zinc-900" strokeWidth={2.25} />
                  )}
                </button>
                {runChoiceOpen && hasDownstreamModules ? (
                  <div className="absolute bottom-[calc(100%+8px)] right-0 z-50 min-w-[170px] rounded-xl border border-white/12 bg-[#14141a]/95 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur-md">
                    <button
                      type="button"
                      className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-white/90 transition hover:bg-white/[0.08]"
                      onClick={runThisNodeOnly}
                    >
                      This node only
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-white/90 transition hover:bg-white/[0.08]"
                      onClick={runFromHere}
                    >
                      Run from here
                      {runFromHereEstimatedCredits > 0 ? ` (${runFromHereEstimatedCredits} cr)` : ""}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (data.kind === "assistant") {
    const assistantImageToJson = data.assistantVisionPreset === "image_to_json";
    const assistantCardWidth = Math.max(cardWidthPx, 420);
    const assistantBodyHeightPx = Math.max(248, assistantCardWidth - 114);
    return (
      <>
        <WorkflowNodeContextToolbar nodeId={id} onRun={runThisNodeOnly} onRunFromHere={runFromHere} />
        <div
          className="relative flex items-end gap-1"
          onMouseEnter={() => window.dispatchEvent(new CustomEvent("workflow:hover-node", { detail: { nodeId: id } }))}
          onMouseLeave={() => window.dispatchEvent(new CustomEvent("workflow:unhover-node"))}
        >
          <div className="nodrag nopan absolute -top-7 left-3 z-[8] flex min-w-0 items-center gap-2.5 pr-2" onPointerDown={(e) => e.stopPropagation()}>
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
          <div className="nodrag nopan flex shrink-0 flex-col gap-1 pb-3">
            <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
              <Handle
                id="text"
                type="target"
                position={Position.Left}
                className={workflowPortTargetBubbleHandleLeftHalfClass}
                aria-label="Assistant text input"
                onPointerDown={(e) => handleInputBubblePointerDown(e, "text")}
              />
              <Handle
                id="inText"
                type="target"
                position={Position.Left}
                className={workflowPortTargetBubbleHandleRightHalfClass}
                aria-label="Alternate assistant text port"
                onPointerDown={(e) => handleInputBubblePointerDown(e, "text")}
              />
              <span className={workflowPortBubbleIconClass} title="Assistant prompt text input." aria-hidden>
                <Type className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </span>
            </div>
            {!assistantImageToJson ? (
              <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
                <Handle
                  id="startImage"
                  type="target"
                  position={Position.Left}
                  className={workflowPortTargetBubbleHandleClass}
                  aria-label="Primary assistant reference image"
                  title="Primary context image (same port family as Video Generator start frame)."
                  onPointerDown={(e) => handleInputBubblePointerDown(e, "startImage")}
                />
                <span className={workflowPortBubbleIconClass} aria-hidden>
                  <ImageIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </span>
              </div>
            ) : null}
            <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
              <Handle
                id="references"
                type="target"
                position={Position.Left}
                className={workflowPortTargetBubbleHandleLeftHalfClass}
                aria-label="Reference images input"
                onPointerDown={(e) => handleInputBubblePointerDown(e, "references")}
              />
              <Handle
                id="inImage"
                type="target"
                position={Position.Left}
                className={workflowPortTargetBubbleHandleRightHalfClass}
                aria-label="Alternate assistant reference images port"
                onPointerDown={(e) => handleInputBubblePointerDown(e, "references")}
              />
              <span
                className={workflowPortBubbleIconClass}
                title={
                  assistantImageToJson
                    ? "Reference image for vision (HTTPS URL after upload)."
                    : "Additional reference images for Assistant context."
                }
                aria-hidden
              >
                <Images className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </span>
            </div>
          </div>
          <div
            className={cn(
              "relative overflow-visible rounded-2xl border border-white/[0.08] bg-[#121212]/98 px-3 pb-3 pt-12 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm",
              selected ? "ring-2 ring-violet-500/85 ring-offset-2 ring-offset-[#06070d]" : "",
            )}
            style={{ width: assistantCardWidth }}
            onPointerDown={(e) => e.stopPropagation()}
          >
          <div className="nodrag nopan absolute -right-10 top-2 z-[7]">
            <div className={cn(workflowPortBubbleShellClass, "nodrag nopan relative")}>
              <Handle
                id="out"
                type="source"
                position={Position.Right}
                className={workflowPortSourceBubbleHandleClass}
                aria-label="Assistant text output"
                title="Assistant text output"
              />
              <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-[11px] font-bold leading-none text-violet-200/90">
                <Type className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </span>
            </div>
          </div>
          <div className="absolute left-2 top-2 z-[3] flex items-start gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0d0d10]/95 p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-medium transition",
                  assistantMode === "input" ? "bg-white text-zinc-900" : "text-white/75 hover:bg-white/[0.08]",
                )}
                onClick={() => patch(id, { assistantMode: "input" })}
              >
                Input
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-medium transition",
                  assistantMode === "output" ? "bg-white text-zinc-900" : "text-white/75 hover:bg-white/[0.08]",
                )}
                onClick={() => patch(id, { assistantMode: "output" })}
              >
                Result
              </button>
            </div>
            {assistantReferenceWireCount > 0 ? (
              <div
                className="nowheel flex max-w-[260px] items-center gap-1.5 overflow-x-auto overflow-y-hidden rounded-lg bg-[#0f0f13]/90 px-1.5 py-1 studio-params-scroll"
                onWheelCapture={keepWheelInsideScrollable}
                onPointerDown={(e) => e.stopPropagation()}
                title="Linked upload/reference images used as assistant context."
              >
                {assistantLinkedReferencePreviewUrls.map((u, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${u}-${idx}`}
                    src={u}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-md object-cover"
                  />
                ))}
              </div>
            ) : null}
            {assistantTextInputWireCount > 0 ? (
              <div
                className="inline-flex items-center gap-1 rounded-lg border border-violet-400/35 bg-violet-500/12 px-1.5 py-1 text-[10px] font-semibold text-violet-100"
                title={`Connected text input${assistantTextInputWireCount > 1 ? "s" : ""} are included in the assistant prompt.`}
              >
                <Type className="h-3.5 w-3.5" strokeWidth={2} />
                <span className="tabular-nums">{assistantTextInputWireCount}</span>
              </div>
            ) : null}
          </div>

          {assistantMode === "input" ? (
            <>
              {assistantImageToJson ? (
                <p className="nodrag nopan mb-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[10px] leading-snug text-white/52">
                  Image → JSON uses vision on your wired HTTPS image. The Result tab holds one JSON object (no markdown). Add optional notes in the brief below.
                </p>
              ) : null}
            <textarea
              value={prompt}
              onChange={(e) => patch(id, { prompt: e.target.value })}
              placeholder={
                assistantImageToJson
                  ? "Optional extra instructions (preset already requests structured JSON)…"
                  : "Type your prompt for the assistant..."
              }
              rows={4}
              onWheelCapture={keepWheelInsideScrollable}
              onFocus={() => setPromptFocused(true)}
              onBlur={() => setPromptFocused(false)}
              style={{ minHeight: assistantBodyHeightPx }}
              className="nodrag nopan nowheel w-full resize-y rounded-xl border border-white/12 bg-black/35 px-2.5 py-2 text-[12px] leading-relaxed text-white/92 placeholder:text-white/30 caret-white outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/25"
            />
            </>
          ) : (
            <textarea
              value={assistantOutput}
              onChange={(e) => patch(id, { assistantOutput: e.target.value })}
              placeholder="No result yet. Switch to Input and run the assistant."
              style={{ height: assistantBodyHeightPx }}
              onWheelCapture={keepWheelInsideScrollable}
              onFocus={() => setPromptFocused(true)}
              onBlur={() => setPromptFocused(false)}
              className="nodrag nopan nowheel w-full resize-y overflow-y-auto rounded-xl border border-white/12 bg-black/35 px-2.5 py-2 text-[12px] leading-relaxed text-white/88 placeholder:text-white/35 caret-white outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/25 studio-minimal-scrollbar"
            />
          )}

          <div className="mt-1.5 flex w-full flex-wrap items-center gap-1.5">
            <Select
              value={assistantExportMode}
              onValueChange={(v) => patch(id, { assistantExportMode: v as "text" | "list" })}
            >
              <SelectTrigger size="sm" className={cn(selectTriggerClass, "h-7 min-w-0 max-w-[5.5rem] px-2 text-[10px]")}>
                <SelectValue placeholder="Export mode" />
              </SelectTrigger>
              <SelectContent className={selectContentClass} position="popper">
                {ASSISTANT_EXPORT_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-[12px] focus:bg-violet-500/20">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={assistantModel}
              onValueChange={(v) => patch(id, { assistantModel: v as AdAssetNodeData["assistantModel"] })}
            >
              <SelectTrigger size="sm" className={cn(selectTriggerClass, "h-7 min-w-0 max-w-[6.25rem] px-2 text-[10px]")}>
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
            <span
              className="inline-flex h-7 items-center gap-1 rounded-full border border-violet-400/35 bg-violet-500/12 px-2 text-[10px] font-semibold tabular-nums text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
              title="Estimated credits for this run"
            >
              <Coins className="h-3 w-3 text-violet-200" strokeWidth={2.2} aria-hidden />
              {assistantEstimatedCredits}
            </span>
            <div className="relative ml-auto">
              <button
                type="button"
                title={
                  generating
                    ? "Running assistant…"
                    : hasAssistantOutput
                      ? "Regenerate assistant response"
                      : "Run assistant"
                }
                disabled={generating}
                className="nodrag nopan flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 shadow-md transition hover:bg-white/95 disabled:cursor-not-allowed disabled:opacity-55"
                onClick={onGenerateButtonClick}
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-900" aria-hidden />
                ) : hasAssistantOutput ? (
                  <RotateCcw className="h-3.5 w-3.5 text-zinc-900" strokeWidth={2.25} />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5 text-zinc-900" strokeWidth={2.25} />
                )}
              </button>
              {generating ? (
                <button
                  type="button"
                  title="Cancel generation"
                  aria-label="Cancel generation"
                  className="nodrag nopan ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/14 bg-white/[0.06] text-white/80 shadow-md transition hover:bg-white/[0.10] hover:text-white"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelGeneration();
                  }}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
              ) : null}
              {runChoiceOpen && hasDownstreamModules ? (
                <div className="absolute bottom-[calc(100%+8px)] right-0 z-50 min-w-[170px] rounded-xl border border-white/12 bg-[#14141a]/95 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur-md">
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-white/90 transition hover:bg-white/[0.08]"
                    onClick={runThisNodeOnly}
                  >
                    This node only
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-white/90 transition hover:bg-white/[0.08]"
                    onClick={runFromHere}
                  >
                    Run from here
                    {runFromHereEstimatedCredits > 0 ? ` (${runFromHereEstimatedCredits} cr)` : ""}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        </div>
      </>
    );
  }

  return (
    <>
      <WorkflowNodeContextToolbar nodeId={id} onRun={runThisNodeOnly} onRunFromHere={runFromHere} />

      {seedanceProVideoTrimFile ? (
        <WorkflowMediaTrimDialog
          open={true}
          file={seedanceProVideoTrimFile}
          kind="video"
          maxDurationSec={15}
          title="Trim video to 15s"
          onOpenChange={(open) => {
            if (open) return;
            setSeedanceProVideoTrimFile(null);
          }}
          onTrimmed={(trimmed) => {
            setSeedanceProVideoTrimFile(null);
            void attachSeedanceProReferenceVideoFile(trimmed);
          }}
        />
      ) : null}

      <div
        className="relative flex gap-1 items-stretch"
        onMouseEnter={() => window.dispatchEvent(new CustomEvent("workflow:hover-node", { detail: { nodeId: id } }))}
        onMouseLeave={() => window.dispatchEvent(new CustomEvent("workflow:unhover-node"))}
      >
      <div className="flex min-w-0 flex-1 items-end gap-1">
      {/* Side tools (reference) */}
      {data.kind === "video" || data.kind === "motion" ? (
        <div className="nodrag nopan flex shrink-0 flex-col gap-1 pb-3">
          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
            <Handle
              id="text"
              type="target"
              position={Position.Left}
              className={workflowPortTargetBubbleHandleLeftHalfClass}
              aria-label="Prompt text input port"
              onPointerDown={(e) => handleInputBubblePointerDown(e, "text")}
            />
            <Handle
              id="inText"
              type="target"
              position={Position.Left}
              className={workflowPortTargetBubbleHandleRightHalfClass}
              aria-label="Alternate prompt text port"
              onPointerDown={(e) => handleInputBubblePointerDown(e, "text")}
            />
            <span className={workflowPortBubbleIconClass} title="Prompt text, one incoming wire; compose the main prompt inside the module." aria-hidden>
              <Type className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            </span>
          </div>

          {data.kind === "motion" || (data.kind === "video" && seedance2ProLike) ? (
            <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
              <Handle
                id="inVideo"
                type="target"
                position={Position.Left}
                className={workflowPortTargetBubbleHandleClass}
                aria-label={
                  data.kind === "motion" ? "Motion reference video input" : "Seedance reference video input"
                }
                title={
                  data.kind === "motion"
                    ? "Motion reference video — click to add upload, list, or video generator."
                    : "Seedance 2 / Fast: optional motion reference video for omni_reference."
                }
                onPointerDown={(e) => handleInputBubblePointerDown(e, "inVideo")}
              />
              <span className={workflowPortBubbleIconClass} aria-hidden>
                <Play className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </span>
            </div>
          ) : null}

          {data.kind === "motion" || (data.kind === "video" && videoModelHasStartFrame) ? (
            <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
              {data.kind === "motion" || (data.kind === "video" && !videoModelHasReferences) ? (
                <>
                  <Handle
                    id="startImage"
                    type="target"
                    position={Position.Left}
                    className={workflowPortTargetBubbleHandleLeftHalfClass}
                    aria-label="Start frame image input"
                    title="Start frame image, primary half of this bubble."
                    onPointerDown={(e) => handleInputBubblePointerDown(e, "startImage")}
                  />
                  <Handle
                    id="inImage"
                    type="target"
                    position={Position.Left}
                    className={workflowPortTargetBubbleHandleRightHalfClass}
                    aria-label="Alternate start frame image port"
                    title="Alternate start-frame port."
                    onPointerDown={(e) => handleInputBubblePointerDown(e, "startImage")}
                  />
                </>
              ) : (
                <Handle
                  id="startImage"
                  type="target"
                  position={Position.Left}
                  className={workflowPortTargetBubbleHandleClass}
                  aria-label="Start frame image input"
                  title="Start frame image, one incoming image (first frame / primary reference)."
                  onPointerDown={(e) => handleInputBubblePointerDown(e, "startImage")}
                />
              )}
              <span className={workflowPortBubbleIconClass} aria-hidden>
                <ImageIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </span>
            </div>
          ) : null}

          {data.kind === "video" && videoModelHasEndFrame ? (
          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
            <Handle
              id="endImage"
              type="target"
              position={Position.Left}
              className={workflowPortTargetBubbleHandleClass}
              aria-label="End frame image input"
              title="End frame image, one incoming image (last frame when the model supports it)."
              onPointerDown={(e) => handleInputBubblePointerDown(e, "endImage")}
            />
            <span className={workflowPortBubbleIconClass} aria-hidden>
              <ImageIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </span>
          </div>
          ) : null}

          {data.kind === "video" && videoModelHasReferences ? (
          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
            <Handle
              id="references"
              type="target"
              position={Position.Left}
              className={workflowPortTargetBubbleHandleLeftHalfClass}
              aria-label="Reference images input"
              onPointerDown={(e) => handleInputBubblePointerDown(e, "references")}
            />
            <Handle
              id="inImage"
              type="target"
              position={Position.Left}
              className={workflowPortTargetBubbleHandleRightHalfClass}
              aria-label="Alternate reference images port"
              onPointerDown={(e) => handleInputBubblePointerDown(e, "references")}
            />
            <span
              className={workflowPortBubbleIconClass}
              title={
                videoModelSupportsElements
                  ? "Reference images. Type @image1, @image2, … in the prompt to bind them."
                  : "Reference images, multiple incoming images supported by this model."
              }
              aria-hidden
            >
              <Images className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </span>
          </div>
          ) : null}
        </div>
      ) : data.kind === "image" ||
        data.kind === "variation" ||
        data.kind === "upscale" ? (
        <div className="nodrag nopan flex shrink-0 flex-col gap-1 pb-3">
          {!profile360ImageUi || data.kind !== "image" ? (
            <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
              <Handle
                id="text"
                type="target"
                position={Position.Left}
                className={workflowPortTargetBubbleHandleLeftHalfClass}
                aria-label="Prompt text input port"
                onPointerDown={(e) => handleInputBubblePointerDown(e, "text")}
              />
              <Handle
                id="inText"
                type="target"
                position={Position.Left}
                className={workflowPortTargetBubbleHandleRightHalfClass}
                aria-label="Alternate prompt text port"
                onPointerDown={(e) => handleInputBubblePointerDown(e, "text")}
              />
              <span className={workflowPortBubbleIconClass} title="Prompt text, one incoming wire; compose the main prompt inside the module." aria-hidden>
                <Type className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </span>
            </div>
          ) : null}

          {data.kind === "image" ? (
            <>
              {!profile360ImageUi ? (
                <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
                  <Handle
                    id="startImage"
                    type="target"
                    position={Position.Left}
                    className={workflowPortTargetBubbleHandleClass}
                    aria-label="Primary reference image input"
                    title="Primary image / start frame (same role as Video Generator)."
                    onPointerDown={(e) => handleInputBubblePointerDown(e, "startImage")}
                  />
                  <span className={workflowPortBubbleIconClass} aria-hidden>
                    <ImageIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </span>
                </div>
              ) : null}
              <div className={cn(workflowPortBubbleShellClass, "nodrag nopan relative")}>
                <Handle
                  id="references"
                  type="target"
                  position={Position.Left}
                  className={workflowPortTargetBubbleHandleLeftHalfClass}
                  aria-label="Reference images input"
                  onPointerDown={(e) => handleInputBubblePointerDown(e, "references")}
                />
                <Handle
                  id="inImage"
                  type="target"
                  position={Position.Left}
                  className={workflowPortTargetBubbleHandleRightHalfClass}
                  aria-label="Alternate reference images port"
                  onPointerDown={(e) => handleInputBubblePointerDown(e, "references")}
                />
                <span
                  className={workflowPortBubbleIconClass}
                  title={
                    profile360ImageUi
                      ? `Reference image (${imageReferenceWireCount} wired). Upload, avatar, or image node OK.`
                      : `Reference images, ${imageReferenceWireCount}/${WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX} connected (max ${WORKFLOW_IMAGE_GENERATOR_REFERENCE_MAX} for this job).`
                  }
                  aria-hidden
                >
                  <Images className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </span>
                {!profile360ImageUi ? (
                  <span
                    className="pointer-events-none absolute -right-0.5 -top-1 z-[3] rounded px-[3px] py-px text-[8px] font-bold tabular-nums leading-none text-white/70 shadow-[0_1px_6px_rgba(0,0,0,0.65)] ring-1 ring-white/12"
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
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
                <Handle
                  id="startImage"
                  type="target"
                  position={Position.Left}
                  className={workflowPortTargetBubbleHandleClass}
                  aria-label="Primary reference image input"
                  title="Primary image input (aligned with Video Generator ports)."
                  onPointerDown={(e) => handleInputBubblePointerDown(e, "startImage")}
                />
                <span className={workflowPortBubbleIconClass} aria-hidden>
                  <ImageIcon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </span>
              </div>
              <div className={cn(workflowPortBubbleShellClass, "nodrag nopan")}>
                <Handle
                  id="references"
                  type="target"
                  position={Position.Left}
                  className={workflowPortTargetBubbleHandleLeftHalfClass}
                  aria-label="Reference images input"
                  onPointerDown={(e) => handleInputBubblePointerDown(e, "references")}
                />
                <Handle
                  id="inImage"
                  type="target"
                  position={Position.Left}
                  className={workflowPortTargetBubbleHandleRightHalfClass}
                  aria-label="Alternate reference images port"
                  onPointerDown={(e) => handleInputBubblePointerDown(e, "references")}
                />
                <span className={workflowPortBubbleIconClass} title="Additional reference images (same layout as Video Generator)." aria-hidden>
                  <Images className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </span>
              </div>
            </>
          )}
        </div>
      ) : null}

      <div
        className="contents"
        data-workflow-generating={
          generating && (data.kind === "image" || data.kind === "video") ? "true" : undefined
        }
      >
      <div className="relative pt-5" style={{ width: cardWidthPx }}>
        <div className="absolute left-0 top-0 z-[6] flex min-w-0 items-center gap-2.5 pr-2">
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
            "group/card relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121212]/98 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-[width,border-color] duration-200 ease-out",
            data.kind === "image" || data.kind === "video" ? "px-0 pb-0 pt-0" : "px-3 pb-3 pt-2.5",
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
              !assistantOpenRef.current &&
              !promptFocusedRef.current &&
              !promptEditorOpenRef.current
            ) {
              setCardHovered(false);
            }
          }, 220);
        }}
      >
        <div
          className={cn(
            "relative w-full overflow-hidden",
            data.kind === "image" || data.kind === "video" ? "rounded-none mt-0" : hasPreviewMedia ? "mt-0 rounded-xl" : "mt-2 rounded-xl",
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
            <div
              className={cn(
                "absolute inset-0 z-[1] h-full w-full transition-[filter,opacity] duration-200 ease-out",
                promptEditorOpen && useWorkflowPromptOverlay && "pointer-events-none opacity-0",
              )}
            >
              {previewMediaKind === "video" ||
              (data.kind === "video" && previewMediaKind !== "image") ? (
                <video
                  ref={previewVideoRef}
                  key={previewUrl}
                  src={previewUrl}
                  className="pointer-events-none h-full w-full object-cover"
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  title="Generated video preview"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={previewImageRef}
                  src={previewUrl}
                  alt=""
                  className="pointer-events-none h-full w-full object-cover"
                />
              )}
            </div>
          ) : null}
          {hasPreviewMedia && (data.kind === "image" || data.kind === "video") ? (
            <div className="nodrag nopan absolute left-2 top-2 z-[6] flex flex-col items-center gap-1 opacity-0 transition group-hover/card:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openOutputPreviewLightbox();
                }}
                title="Open fullscreen"
                className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/85 backdrop-blur-sm transition hover:bg-black/70"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  downloadPreviewMedia();
                }}
                title="Download"
                className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/85 backdrop-blur-sm transition hover:bg-black/70"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ) : null}

          {generating && (data.kind === "image" || data.kind === "video") ? (
            <div
              className="pointer-events-none nodrag nopan absolute inset-0 z-[9] flex flex-col items-center justify-center gap-3 bg-black/42 backdrop-blur-[2.5px] transition-[opacity,backdrop-filter] duration-300 ease-out motion-reduce:transition-none"
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

          {!generating && lastGenerationError && (data.kind === "image" || data.kind === "video") ? (
            <div
              className="nodrag nopan absolute inset-0 z-[9] flex flex-col items-center justify-center gap-2 bg-[#14141c]/92 backdrop-blur-[2px] px-3 py-3"
              role="alert"
              aria-live="assertive"
              aria-label={data.kind === "video" ? "Video generation failed" : "Image generation failed"}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-red-400/35 bg-red-500/12">
                <AlertTriangle className="h-4 w-4 text-red-300" strokeWidth={2.2} aria-hidden />
              </div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-red-200/90">
                {data.kind === "video" ? "Video failed" : "Image failed"}
              </p>
              <p className="line-clamp-4 max-w-full text-center text-[10.5px] leading-snug text-white/75">
                {lastGenerationError}
              </p>
              {lastGenerationErrorDetails ? (
                errorDetailsOpen ? (
                  <div
                    className="nodrag nopan flex w-full max-w-[260px] flex-col gap-1 rounded-md border border-white/10 bg-black/45 px-2 py-1.5 text-left"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <p className="max-h-[88px] overflow-auto whitespace-pre-wrap break-words text-[9.5px] leading-snug text-white/70 studio-minimal-scrollbar">
                      {lastGenerationErrorDetails}
                    </p>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setErrorDetailsOpen(false);
                        }}
                        className="text-[9px] font-medium text-white/55 underline-offset-2 hover:text-white/85 hover:underline"
                      >
                        Hide details
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                            void navigator.clipboard
                              .writeText(lastGenerationErrorDetails)
                              .then(() => toast.success("Error copied"))
                              .catch(() => toast.error("Could not copy"));
                          }
                        }}
                        className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium text-white/75 hover:bg-white/[0.08] hover:text-white"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setErrorDetailsOpen(true);
                    }}
                    className="text-[9.5px] font-medium text-white/55 underline-offset-2 hover:text-white/85 hover:underline"
                  >
                    Show details
                  </button>
                )
              ) : null}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLastGenerationError(null);
                  setLastGenerationErrorDetails(null);
                  setErrorDetailsOpen(false);
                }}
                className="mt-0.5 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white/80 transition hover:bg-black/75 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div
            className={cn(
              "pointer-events-none absolute right-2 top-2 z-[2] rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white/80 transition-opacity duration-300",
              generating && (data.kind === "image" || data.kind === "video") && "opacity-35",
            )}
          >
            {data.kind === "video" || data.kind === "motion"
              ? (videoExportDimensionLabel ?? `${frame.width} × ${frame.height}`)
              : `${frame.width} × ${frame.height}`}
          </div>

          {showPromptPreviewChip ? (
            <button
              type="button"
              className={cn(
                "nodrag nopan absolute bottom-14 z-[4] border border-white/15 bg-black/35 px-2.5 py-2 text-left text-[12px] leading-snug text-white/92 backdrop-blur-sm transition hover:border-violet-400/45 hover:bg-black/50",
                "inset-x-2 rounded-lg",
                showEditLayer ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (useWorkflowPromptOverlay) {
                  openPromptEditor();
                } else {
                  setCardHovered(true);
                  requestAnimationFrame(() => compactPromptTextareaRef.current?.focus());
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Click to edit prompt"
            >
              <span className="line-clamp-2 whitespace-pre-wrap">
                {promptPreviewText}
              </span>
            </button>
          ) : data.kind === "image" || data.kind === "video" ? null : (
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
              "absolute inset-x-0 bottom-0 z-[5] px-2 pb-1.5 pt-7 transition-opacity duration-200",
              data.kind === "image" || data.kind === "video" ? "rounded-b-none" : "rounded-b-[10px]",
              "bg-gradient-to-t from-[#0c0c0c] via-[#0c0c0c]/92 to-transparent",
              showEditLayer ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div className="nodrag nopan relative" onPointerDown={(e) => e.stopPropagation()}>
              {data.kind === "video" && videoModelHasReferences && videoElementRefUrls.length > 0 ? (
                <div
                  className="mb-1 flex w-full items-center gap-1 overflow-x-auto pb-0.5 nowheel"
                  title={
                    videoModelSupportsElements
                      ? "Type @image1, @image2, … in the prompt to bind these references."
                      : "Reference images that will be sent to the model."
                  }
                >
                  {videoElementRefUrls.slice(0, 6).map((url, idx) => {
                    const tag = `@image${idx + 1}`;
                    return (
                      <HoverCard.Root key={`${tag}-${url}`} openDelay={140} closeDelay={80}>
                        <HoverCard.Trigger asChild>
                          <button
                            type="button"
                            title={`Insert ${tag} into prompt`}
                            aria-label={`${tag}: insert into prompt`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => {
                              const current = prompt ?? "";
                              const needsSep = current.length > 0 && !/\s$/.test(current);
                              const next = `${current}${needsSep ? " " : ""}${tag} `;
                              patch(id, { prompt: next });
                            }}
                            className="flex shrink-0 items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/12 pl-0.5 pr-1.5 py-0.5 text-[9px] font-semibold text-violet-100 transition hover:border-violet-300/60 hover:bg-violet-500/22"
                          >
                            <span className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt=""
                                className="h-4 w-4 rounded-full object-cover ring-1 ring-violet-300/30"
                              />
                              {idx === 0 ? (
                                <span
                                  className="absolute -right-1 -top-1 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-white text-[8px] font-black text-zinc-900 shadow"
                                  title="Start image"
                                >
                                  S
                                </span>
                              ) : null}
                            </span>
                            <span className="tabular-nums">{tag}</span>
                          </button>
                        </HoverCard.Trigger>
                        <HoverCard.Portal>
                          <HoverCard.Content
                            side="top"
                            align="center"
                            sideOffset={10}
                            collisionPadding={16}
                            className={cn(
                              "nodrag nopan z-[520] max-w-[min(92vw,22rem)] rounded-xl border border-white/15 bg-[#141418] p-2.5 shadow-[0_24px_64px_rgba(0,0,0,0.75)] outline-none",
                              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt=""
                              className="mx-auto block max-h-[min(72vh,20rem)] w-auto max-w-full rounded-lg object-contain"
                            />
                            <div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-white/55">
                              {tag}
                            </div>
                          </HoverCard.Content>
                        </HoverCard.Portal>
                      </HoverCard.Root>
                    );
                  })}
                  {videoElementRefUrls.length > 6 ? (
                    <span className="shrink-0 text-[9px] font-semibold text-white/45">
                      +{videoElementRefUrls.length - 6}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {data.kind === "video" && videoElementRefUrls.length > 0 ? (
                <div
                  className="mb-1 flex w-full items-center gap-1 overflow-x-auto pb-0.5 nowheel"
                  title="Input images (ordered). S = start, E = end."
                >
                  {videoElementRefUrls.slice(0, 8).map((url, idx) => {
                    const label = `Image ${idx + 1}`;
                    const isStart = idx === 0;
                    const isEnd = Boolean(videoEndFrameUrl && url === videoEndFrameUrl);
                    return (
                      <HoverCard.Root key={`${label}-${url}`} openDelay={140} closeDelay={80}>
                        <HoverCard.Trigger asChild>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            className="relative h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/20"
                            aria-label={label}
                            title={`${label}${isStart ? " (start)" : ""}${isEnd ? " (end)" : ""}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="h-full w-full object-cover" />
                            <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] font-bold tabular-nums text-white">
                              {idx + 1}
                            </span>
                            {isStart ? (
                              <span className="absolute bottom-0.5 right-0.5 rounded bg-white px-1 text-[8px] font-black text-zinc-900 shadow">
                                S
                              </span>
                            ) : isEnd ? (
                              <span className="absolute bottom-0.5 right-0.5 rounded bg-white px-1 text-[8px] font-black text-zinc-900 shadow">
                                E
                              </span>
                            ) : null}
                          </button>
                        </HoverCard.Trigger>
                        <HoverCard.Portal>
                          <HoverCard.Content
                            side="top"
                            align="center"
                            sideOffset={10}
                            collisionPadding={16}
                            className={cn(
                              "nodrag nopan z-[520] max-w-[min(92vw,22rem)] rounded-xl border border-white/15 bg-[#141418] p-2.5 shadow-[0_24px_64px_rgba(0,0,0,0.75)] outline-none",
                              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt=""
                              className="mx-auto block max-h-[min(72vh,20rem)] w-auto max-w-full rounded-lg object-contain"
                            />
                            <div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-white/55">
                              {isStart ? "Start image" : isEnd ? "End image" : label}
                            </div>
                          </HoverCard.Content>
                        </HoverCard.Portal>
                      </HoverCard.Root>
                    );
                  })}
                  {videoElementRefUrls.length > 8 ? (
                    <span className="shrink-0 text-[9px] font-semibold text-white/45">
                      +{videoElementRefUrls.length - 8}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {data.kind === "image" && imageInputRefUrls.length > 0 ? (
                <div
                  className="mb-1 flex w-full items-center gap-1 overflow-x-auto pb-0.5 nowheel"
                  title="Reference images (ordered). The first one is treated as primary."
                >
                  {imageInputRefUrls.slice(0, 8).map((url, idx) => {
                    const label = `Image ${idx + 1}`;
                    return (
                      <HoverCard.Root key={`${label}-${url}`} openDelay={140} closeDelay={80}>
                        <HoverCard.Trigger asChild>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            className="relative h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/20"
                            aria-label={label}
                            title={idx === 0 ? `${label} (start)` : label}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="h-full w-full object-cover" />
                            <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px] font-bold tabular-nums text-white">
                              {idx + 1}
                            </span>
                            {idx === 0 ? (
                              <span className="absolute bottom-0.5 right-0.5 rounded bg-white px-1 text-[8px] font-black text-zinc-900 shadow">
                                S
                              </span>
                            ) : null}
                          </button>
                        </HoverCard.Trigger>
                        <HoverCard.Portal>
                          <HoverCard.Content
                            side="top"
                            align="center"
                            sideOffset={10}
                            collisionPadding={16}
                            className={cn(
                              "nodrag nopan z-[520] max-w-[min(92vw,22rem)] rounded-xl border border-white/15 bg-[#141418] p-2.5 shadow-[0_24px_64px_rgba(0,0,0,0.75)] outline-none",
                              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt=""
                              className="mx-auto block max-h-[min(72vh,20rem)] w-auto max-w-full rounded-lg object-contain"
                            />
                            <div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-white/55">
                              {idx === 0 ? "Start image" : label}
                            </div>
                          </HoverCard.Content>
                        </HoverCard.Portal>
                      </HoverCard.Root>
                    );
                  })}
                  {imageInputRefUrls.length > 8 ? (
                    <span className="shrink-0 text-[9px] font-semibold text-white/45">
                      +{imageInputRefUrls.length - 8}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {data.kind === "video" && videoModelSeedance2ProLike && seedanceVideoRefUrls.length > 0 ? (
                <div
                  className="mb-1 flex w-full items-center gap-1 overflow-x-auto pb-0.5 nowheel"
                  title="Reference video (Seedance omni). Type @video1 in the prompt to bind it."
                >
                  {seedanceVideoRefUrls.slice(0, 3).map((url, idx) => {
                    const tag = `@video${idx + 1}`;
                    return (
                      <HoverCard.Root key={`${tag}-${url}`} openDelay={160} closeDelay={90}>
                        <HoverCard.Trigger asChild>
                          <button
                            type="button"
                            title={`Insert ${tag} into prompt`}
                            aria-label={`${tag}: insert into prompt`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => {
                              const current = prompt ?? "";
                              const needsSep = current.length > 0 && !/\s$/.test(current);
                              const next = `${current}${needsSep ? " " : ""}${tag} `;
                              patch(id, { prompt: next });
                            }}
                            className="flex shrink-0 items-center gap-1 rounded-full border border-sky-400/25 bg-sky-500/10 pl-1 pr-1.5 py-0.5 text-[9px] font-semibold text-sky-100 transition hover:border-sky-300/55 hover:bg-sky-500/20"
                          >
                            <span className="tabular-nums">{tag}</span>
                          </button>
                        </HoverCard.Trigger>
                        <HoverCard.Portal>
                          <HoverCard.Content
                            side="top"
                            align="center"
                            sideOffset={10}
                            collisionPadding={16}
                            className={cn(
                              "nodrag nopan z-[520] w-[min(92vw,22rem)] rounded-xl border border-white/15 bg-[#141418] p-2.5 shadow-[0_24px_64px_rgba(0,0,0,0.75)] outline-none",
                              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                            )}
                          >
                            <video
                              src={`/api/download?url=${encodeURIComponent(url)}`}
                              className="block w-full max-h-[min(72vh,18rem)] rounded-lg bg-black"
                              controls
                              playsInline
                              preload="metadata"
                            />
                            <div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-white/55">
                              {tag}
                            </div>
                          </HoverCard.Content>
                        </HoverCard.Portal>
                      </HoverCard.Root>
                    );
                  })}
                  {seedanceVideoRefUrls.length > 3 ? (
                    <span className="shrink-0 text-[9px] font-semibold text-white/45">
                      +{seedanceVideoRefUrls.length - 3}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {profile360ImageUi ? (
                <p className="nodrag nopan rounded-lg border border-white/10 bg-black/35 px-2 py-1.5 text-[10px] leading-snug text-white/52">
                  Same preset as Studio → Avatar → 360° profile: fixed turnaround brief, 16:9 output, GPT Image 2 or NanoBanana Pro, 1K–4K resolution.
                </p>
              ) : !hasPreviewMedia || !isGeneratorNode || !hasLinkedGeneratorTextInput ? (
                <textarea
                  ref={compactPromptTextareaRef}
                  value={prompt}
                  onChange={(e) => patch(id, { prompt: e.target.value })}
                  placeholder={cfg.promptPlaceholder}
                  rows={data.kind === "video" ? 3 : 2}
                  onWheelCapture={keepWheelInsideScrollable}
                  onFocus={(e) => {
                    setPromptFocused(true);
                    if (expandPromptEditorOnFocus) {
                      openPromptEditor();
                      requestAnimationFrame(() => e.currentTarget.blur());
                    }
                  }}
                  onBlur={() => setPromptFocused(false)}
                  className={cn(
                    "nodrag nopan nowheel w-full resize-none rounded-lg border border-white/10 bg-black/55 px-2 py-1 pr-7 text-[10px] leading-snug text-white/88 placeholder:text-white/26 outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/25",
                    data.kind === "video"
                      ? "min-h-[72px] max-h-[120px] overflow-y-scroll studio-params-scroll"
                      : "min-h-[34px] max-h-[72px] overflow-y-scroll studio-params-scroll",
                  )}
                />
              ) : null}
              {data.kind === "video" && !videoModelSupportsElements && (prompt ?? "").includes("@") ? (
                <p className="mt-1 text-[10px] leading-snug text-white/45">
                  elements can not be used inside this model, please use seedance 2 or kling 3.0
                </p>
              ) : null}
              {data.kind !== "image" && data.kind !== "video" ? (
                <button
                  type="button"
                  title="Prompt assistant, describe what you want"
                  className={cn(
                    "rounded-md p-1 text-violet-300/85 transition hover:bg-violet-500/15 hover:text-violet-100",
                    hasPreviewMedia ? "absolute right-0.5 top-0.5" : "absolute bottom-1 right-0.5",
                  )}
                  onClick={() => {
                    setAssistantOpen(true);
                    setAssistantResult("");
                  }}
                >
                  <Wand2 className="h-3 w-3" strokeWidth={2} />
                </button>
              ) : null}
            </div>

            <div
              className="nodrag nopan mt-1 flex min-w-0 w-full flex-wrap content-start items-end gap-x-1 gap-y-1"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {showQuantity ? (
                <div className="flex h-6 shrink-0 items-center gap-px rounded-full border border-white/12 bg-[#1c1c1f] px-0.5 text-[9px] font-semibold text-white/88">
                  <button
                    type="button"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/55 hover:bg-white/[0.08] hover:text-white"
                    aria-label="Decrease count"
                    onClick={() => patch(id, { quantity: Math.max(1, quantity - 1) })}
                  >
                    <Minus className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </button>
                  <span className="min-w-[1.35rem] text-center tabular-nums">×{quantity}</span>
                  <button
                    type="button"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/55 hover:bg-white/[0.08] hover:text-white"
                    aria-label="Increase count"
                    onClick={() => patch(id, { quantity: Math.min(10, quantity + 1) })}
                  >
                    <Plus className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </button>
                </div>
              ) : null}

              <Select value={model} onValueChange={(v) => patch(id, { model: v })} onOpenChange={setModelMenuOpen}>
                <SelectTrigger
                  size="sm"
                  className={cn(selectTriggerClass, generatorSelectTriggerExtras, "min-w-0 max-w-[5.25rem] shrink-0")}
                >
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
              {data.kind === "video" && data.videoInputMode === "seedance_only" ? (
                <span
                  className="inline-flex h-6 items-center rounded-full border border-emerald-400/35 bg-emerald-500/10 px-1.5 text-[8px] text-emerald-100/90"
                  title="Video-chain mode: only Seedance 2 / Seedance 2 Fast are available. Fast is selected by default."
                >
                  Seedance 2 / Fast only
                </span>
              ) : null}

              {data.kind === "video" &&
              (resolvedVideoModelId === "bytedance/seedance-2" ||
                resolvedVideoModelId === "bytedance/seedance-2-fast") ? (
                <>
                  <input
                    ref={seedanceProVideoFileInputRef}
                    type="file"
                    className="hidden"
                    accept={WORKFLOW_SEEDANCE_2_PRO_VIDEO_FILE_ACCEPT}
                    onChange={onSeedanceProReferenceVideoSelected}
                  />
                  <button
                    type="button"
                    title="Upload a motion reference video (MP4/MOV) for Seedance omni"
                    disabled={seedanceProVideoUploadBusy}
                    className={cn(
                      "inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full border px-1.5 text-[8px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
                      "border-cyan-400/35 bg-cyan-500/12 text-cyan-100/90 hover:border-cyan-400/55 hover:bg-cyan-500/18",
                    )}
                    onClick={() => seedanceProVideoFileInputRef.current?.click()}
                  >
                    {seedanceProVideoUploadBusy ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
                    ) : (
                      <Clapperboard className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                    )}
                    <span className="max-w-[5.5rem] truncate">Ref. video</span>
                  </button>
                </>
              ) : null}

              {data.kind !== "motion" ? (aspectLocked ? (
                <div
                  className={cn(
                    selectTriggerClass,
                    "pointer-events-none min-w-0 max-w-[3.25rem] shrink-0 cursor-default opacity-95",
                  )}
                  title="Aspect follows uploaded or avatar media"
                >
                  <span className="mr-0.5 shrink-0 text-[9px] text-white/45" aria-hidden>
                    {aspectIcon(aspectRatio)}
                  </span>
                  <span className="truncate text-[9px] text-white/75">{aspectRatio}</span>
                </div>
              ) : (
                <Select value={aspectRatio} onValueChange={(v) => patch(id, { aspectRatio: v })} onOpenChange={setAspectMenuOpen}>
                  <SelectTrigger
                    size="sm"
                    className={cn(selectTriggerClass, generatorSelectTriggerExtras, "min-w-0 max-w-[3.35rem] shrink-0")}
                  >
                    <span className="mr-0.5 shrink-0 text-[9px] text-white/45" aria-hidden>
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
              )) : null}

              {data.kind === "motion" && motionAutoSettings ? (
                <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-white/10 bg-black/25 px-1.5 text-[8px] text-white/45">
                  Auto
                </span>
              ) : (
                <Select value={resolution} onValueChange={(v) => patch(id, { resolution: v })}>
                  <SelectTrigger
                    size="sm"
                    className={cn(selectTriggerClass, generatorSelectTriggerExtras, "min-w-0 max-w-[4.25rem] shrink-0")}
                  >
                    <SelectValue placeholder="Res" />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass} position="popper">
                    {resolutions.map((r) => (
                      <SelectItem key={r} value={r} className="text-[12px] focus:bg-violet-500/20">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {data.kind === "motion" ? (
                <>
                  <button
                    type="button"
                    onClick={() => patch(id, { motionAutoSettings: !motionAutoSettings })}
                    className={cn(
                      "inline-flex h-6 shrink-0 items-center rounded-full border px-1.5 text-[9px] font-semibold",
                      motionAutoSettings
                        ? "border-emerald-400/45 bg-emerald-500/20 text-emerald-100"
                        : "border-white/12 bg-black/20 text-white/70",
                    )}
                  >
                    Auto
                  </button>
                  <Select
                    value={motionBackgroundSource}
                    onValueChange={(v) => patch(id, { motionBackgroundSource: v as "input_video" | "input_image" })}
                  >
                    <SelectTrigger
                      size="sm"
                      className={cn(selectTriggerClass, generatorSelectTriggerExtras, "min-w-0 max-w-[5.5rem] shrink-0")}
                    >
                      <SelectValue placeholder="BG" />
                    </SelectTrigger>
                    <SelectContent className={selectContentClass} position="popper">
                      <SelectItem value="input_video" className="text-[12px] focus:bg-violet-500/20">
                        BG: Video
                      </SelectItem>
                      <SelectItem value="input_image" className="text-[12px] focus:bg-violet-500/20">
                        BG: Image
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </>
              ) : null}
              {data.kind === "video" && videoDurationOptions.length > 0 ? (
                <Select
                  value={String(coerceWorkflowVideoDurationSec(model, data.videoDurationSec))}
                  onValueChange={(v) => patch(id, { videoDurationSec: Number(v) })}
                >
                  <SelectTrigger
                    size="sm"
                    className={cn(selectTriggerClass, generatorSelectTriggerExtras, "min-w-0 max-w-[3.75rem] shrink-0")}
                  >
                    <SelectValue placeholder="Dur" />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass} position="popper">
                    {videoDurationOptions.map((r) => (
                      <SelectItem key={r} value={r} className="text-[12px] focus:bg-violet-500/20">
                        {r}s
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : data.kind === "video" ? (
                <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-white/10 bg-black/25 px-1.5 text-[8px] text-white/45">
                  Fixed
                </span>
              ) : null}
              <div className="nodrag nopan group/run ml-auto inline-flex shrink-0 items-center gap-1">
                {estimatedCredits > 0 ? (
                  <span
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded-full border border-violet-400/35 bg-violet-500/12 px-1.5 text-[9px] font-semibold tabular-nums text-white shadow-[0_4px_14px_rgba(0,0,0,0.35)]",
                      hasPreviewMedia && "border-violet-300/45 bg-[#0f0f13]/90 backdrop-blur-sm",
                    )}
                    title="Estimated credits for this run"
                  >
                    <Coins className="h-3 w-3 text-violet-200" strokeWidth={2.2} aria-hidden />
                    {estimatedCredits}
                  </span>
                ) : null}
                <div className="relative">
                <button
                  type="button"
                  title={generating ? "Generating…" : hasGeneratedOutput ? "Regenerate" : "Generate"}
                  disabled={generating}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 shadow-md transition hover:bg-white/95 disabled:cursor-not-allowed disabled:opacity-55"
                  onClick={onGenerateButtonClick}
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-900" aria-hidden />
                  ) : hasGeneratedOutput ? (
                    <RotateCcw className="h-3.5 w-3.5 text-zinc-900" strokeWidth={2.25} />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-900" strokeWidth={2.25} />
                  )}
                </button>
                {runChoiceOpen && hasDownstreamModules ? (
                  <div className="absolute bottom-[calc(100%+8px)] right-0 z-50 min-w-[170px] rounded-xl border border-white/12 bg-[#14141a]/95 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur-md">
                    <button
                      type="button"
                      className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-white/90 transition hover:bg-white/[0.08]"
                      onClick={runThisNodeOnly}
                    >
                      This node only
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-white/90 transition hover:bg-white/[0.08]"
                      onClick={runFromHere}
                    >
                      Run from here
                      {runFromHereEstimatedCredits > 0 ? ` (${runFromHereEstimatedCredits} cr)` : ""}
                    </button>
                  </div>
                ) : null}
                </div>
              </div>
            </div>
          </div>

          {promptEditorOpen && useWorkflowPromptOverlay ? (
            <div
              className="nodrag nopan absolute inset-0 z-[24] flex h-full min-h-0 w-full flex-col bg-[#0d0d10]"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.1] px-2.5 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/65">Edit prompt</p>
                <button
                  type="button"
                  onClick={closePromptEditor}
                  className="rounded-md px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  Done
                </button>
              </div>
              <textarea
                ref={promptEditorTextareaRef}
                value={promptEditorDraft}
                onChange={(e) => setPromptEditorDraft(e.target.value)}
                placeholder={cfg.promptPlaceholder}
                onWheelCapture={keepWheelInsideScrollable}
                onFocus={() => setPromptFocused(true)}
                onBlur={() => setPromptFocused(false)}
                className="nodrag nopan nowheel min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-[#0a0a0c] px-3 py-3 text-[13px] leading-relaxed text-white/92 placeholder:text-white/35 outline-none ring-0 focus:ring-0 studio-params-scroll"
              />
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
                onWheelCapture={keepWheelInsideScrollable}
                className="nowheel min-h-[88px] w-full resize-y rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-[12px] text-white/90 placeholder:text-white/30 outline-none focus:border-violet-500/35 disabled:opacity-60"
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
                    onWheelCapture={keepWheelInsideScrollable}
                    className="nowheel min-h-[100px] w-full resize-y rounded-xl border border-white/12 bg-black/35 px-3 py-2 text-[12px] leading-relaxed text-white/90 outline-none focus:border-violet-500/35"
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

        {data.kind !== "video" && data.kind !== "image" && data.kind !== "motion" ? (
          <Handle
            id="out"
            type="source"
            position={Position.Right}
            className="workflow-port-create-cursor nodrag nopan !box-border !h-8 !w-8 !min-h-8 !min-w-8 !max-h-8 !max-w-8 !rounded-full !border-0 !bg-transparent opacity-0"
            title="Drag or hold to create a linked module"
          />
        ) : null}
      </div>
      </div>
      </div>
      </div>
  {showImageGeneratorOutputBubble ? (
        <div className="nodrag nopan relative z-[5] flex shrink-0 flex-col gap-1 self-start pt-5">
          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan relative")}>
            <Handle
              id="generated"
              type="source"
              position={Position.Right}
              className={workflowPortSourceBubbleHandleClass}
              aria-label="Generated image output"
              title={
                imageGeneratorOutputReady
                  ? "Drag to wire this generated image into references, start frame, or another module."
                  : "Run once to produce an image; then drag from here to chain into the next module."
              }
            />
            <Handle
              id="out"
              type="source"
              position={Position.Right}
              className={workflowPortSourceBubbleHandleClass}
              aria-label="Legacy generated image output"
              title="Legacy output handle (same as generated image)."
            />
            <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/85">
              <ImageIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </span>
          </div>
        </div>
      ) : null}
  {showVideoOutputBubbles ? (
        <div className="nodrag nopan relative z-[5] flex shrink-0 flex-col gap-1 self-start pt-5">
          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan relative")}>
            <Handle
              id="out"
              type="source"
              position={Position.Right}
              className={workflowPortSourceBubbleHandleClass}
              aria-label="Generated video output"
              title="Drag to wire this generated video into a list or downstream video input."
            />
            <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-violet-200/90">
              <Clapperboard className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </span>
          </div>
          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan relative overflow-hidden")}>
            <Handle
              id="videoFirst"
              type="source"
              position={Position.Right}
              className={workflowPortSourceBubbleHandleClass}
              aria-label="First frame output"
              title="First frame — double-click to capture; thumbnail appears here when saved. Wire S into start or references."
              onDoubleClick={(e) => {
                e.stopPropagation();
                void onExtractVideoFrame("first");
              }}
            />
            {videoExtractedFirstThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={videoExtractedFirstThumb}
                alt=""
                className="pointer-events-none absolute inset-0 z-0 h-full w-full rounded-full object-cover"
              />
            ) : null}
            <span
              className={cn(
                "pointer-events-none absolute inset-0 z-[1] flex items-center justify-center rounded-full ring-1 ring-inset ring-white/[0.08]",
                !videoExtractedFirstThumb && "bg-black/25 text-white/88",
              )}
            >
              {frameExtractBusy === "first" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden />
              ) : videoExtractedFirstThumb ? null : (
                <ImageIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              )}
            </span>
          </div>
          <div className={cn(workflowPortBubbleShellClass, "nodrag nopan relative overflow-hidden")}>
            <Handle
              id="videoLast"
              type="source"
              position={Position.Right}
              className={workflowPortSourceBubbleHandleClass}
              aria-label="Last frame output"
              title="Last frame — double-click to capture; thumbnail here when saved. Wire E into the next start or references."
              onDoubleClick={(e) => {
                e.stopPropagation();
                void onExtractVideoFrame("last");
              }}
            />
            {videoExtractedLastThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={videoExtractedLastThumb}
                alt=""
                className="pointer-events-none absolute inset-0 z-0 h-full w-full rounded-full object-cover"
              />
            ) : null}
            <span
              className={cn(
                "pointer-events-none absolute inset-0 z-[1] flex items-center justify-center rounded-full ring-1 ring-inset ring-white/[0.08]",
                !videoExtractedLastThumb && "bg-black/25 text-white/88",
              )}
            >
              {frameExtractBusy === "last" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden />
              ) : videoExtractedLastThumb ? null : (
                <ImageIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              )}
            </span>
          </div>
        </div>
      ) : null}
      </div>
      {outputPreviewLightbox && previewUrl && typeof document !== "undefined"
        ? createPortal(
            <div
              className="nodrag nopan fixed inset-0 z-[9999] flex items-center justify-center bg-black/88 p-3 backdrop-blur-[2px]"
              onClick={() => setOutputPreviewLightbox(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Full output preview"
            >
              <button
                type="button"
                className="nodrag nopan absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-lg hover:bg-black/85"
                title="Close preview"
                onClick={(e) => {
                  e.stopPropagation();
                  setOutputPreviewLightbox(false);
                }}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <div
                className="nodrag nopan flex max-h-[92vh] max-w-[96vw] items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                {previewLightboxIsVideo ? (
                  <video
                    key={previewUrl}
                    src={previewUrl}
                    className="max-h-[92vh] max-w-[96vw] object-contain"
                    controls
                    autoPlay
                    playsInline
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt=""
                    className="max-h-[92vh] max-w-[96vw] object-contain"
                  />
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

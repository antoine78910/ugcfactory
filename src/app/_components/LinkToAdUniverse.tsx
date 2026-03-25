"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, ImagePlus, Loader2, Maximize2, PenLine, Plus, RefreshCw, Sparkles, Trash2, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UploadBusyOverlay } from "@/app/_components/UploadBusyOverlay";
import { absolutizeImageUrl } from "@/lib/imageUrl";
import { pickBestProductUrlForNanoBanana, productUrlsForGpt } from "@/lib/productReferenceImages";
import {
  cloneAnglePipeline,
  cloneExtractedBase,
  createEmptyKlingByReference,
  deriveAngleLabelsFromScripts,
  emptyAnglePipeline,
  flattenAnglePipeToTopLevel,
  normalizeKlingByReference,
  normalizePipelineByAngle,
  parseThreeLabeledPrompts,
  readUniverseFromExtracted,
  selectedAngleScript,
  snapshotAfterKlingVideoSuccessForAngle,
  teaserFromScriptBlock,
  type KlingReferenceSlotV1,
  type LinkToAdAnglePipelineV1,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";
import {
  useCreditsPlan,
  getPersonalApiKey,
  isPersonalApiActive,
} from "@/app/_components/CreditsPlanContext";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";
import { LinkToAdUniverseStepper } from "@/app/_components/LinkToAdUniverseStepper";
import { WebsiteScanChecklist } from "@/app/_components/WebsiteScanChecklist";
import { WebsiteScanLoader } from "@/app/_components/WebsiteScanLoader";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { cn } from "@/lib/utils";
import {
  type ScriptFactorBlocks,
  EMPTY_SCRIPT_FACTORS,
  angleBlockForEditing,
  splitScriptFactorsForUi,
  composeScriptFromFactors,
} from "@/lib/linkToAdScriptFactors";
import ShapeGrid from "@/app/ShapeGrid";
import { LINK_TO_AD_LOADING_MESSAGES } from "@/lib/linkToAd/loadingMessageLoops";
import { CREDITS_LINK_TO_AD_GENERATE_FROM_URL } from "@/lib/linkToAd/generationCredits";
import type { InternalFetch } from "@/lib/linkToAd/internalFetch";
import { runInitialPipeline } from "@/lib/linkToAd/runInitialPipeline";
import { loadAvatarUrls } from "@/lib/avatarLibrary";
import { AvatarPickerDialog } from "@/app/_components/AvatarPickerDialog";
import { clipboardImageFiles } from "@/lib/clipboardImage";

/** Same-origin API calls with session (mirrors server `createInternalFetchFromRequest`). */
const browserPipelineFetch = ((path: string, init?: RequestInit) => fetch(path, init)) as InternalFetch;

function splitAllScriptOptions(full: string): string[] {
  const text = full.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  const re = /SCRIPT\s+OPTION\s*\d+\b/gi;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) starts.push(m.index);
  if (starts.length === 0) return [text];
  const out: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    out.push(text.slice(start, end).trim());
  }
  return out;
}

function selectedScriptOptionByIndex(full: string, index: number | null): string {
  if (index === null || index < 0) return "";
  const all = splitAllScriptOptions(full);
  if (all[index]) return all[index];
  const clamped = index === 0 || index === 1 || index === 2 ? index : 2;
  return selectedAngleScript(full, clamped);
}

function countWords(text: string): number {
  const t = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return 0;
  return t.split(" ").filter(Boolean).length;
}

function clampToMaxWords(text: string, maxWords: number): string {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const parts = raw.split(" ").filter(Boolean);
  if (parts.length <= maxWords) return raw;
  return parts.slice(0, maxWords).join(" ");
}

function angleBriefPartsFromScriptOption(
  raw: string,
  angleIndex: 0 | 1 | 2,
): { brief: string; full: string; canExpand: boolean } {
  const { editable, headline } = angleBlockForEditing(raw);
  const factors = splitScriptFactorsForUi(editable, headline);
  const headlineClean = headline.replace(/\s+/g, " ").trim();
  const hookClean = (factors.hook || "").replace(/\s+/g, " ").trim();
  const benefitsClean = (factors.benefits || "").replace(/\s+/g, " ").trim();

  // Prefer headline when present (it reads like a real angle).
  if (headlineClean) return { brief: headlineClean, full: headlineClean, canExpand: false };

  // Fall back to a compact, non-structured brief (no HOOK:/PROBLEM:/...).
  const bits = [hookClean, benefitsClean].filter(Boolean);
  const joined = bits.join(" ").trim();
  if (joined) {
    const canExpand = joined.length > 160;
    return { brief: canExpand ? `${joined.slice(0, 160)}…` : joined, full: joined, canExpand };
  }

  // Last resort: existing heuristic teaser.
  const teaser = teaserFromScriptBlock(raw, angleIndex);
  // teaserFromScriptBlock can also append an ellipsis — give a show-all if it's long.
  const canExpand = teaser.length > 160 || /…$/.test(teaser) || /\.{3}$/.test(teaser);
  return { brief: teaser, full: teaser, canExpand };
}

function angleFullSummaryFromScriptOption(raw: string): string {
  const { editable, headline } = angleBlockForEditing(raw);
  const factors = splitScriptFactorsForUi(editable, headline);
  const lines = [
    factors.hook?.trim(),
    factors.problem?.trim(),
    factors.benefits?.trim(),
    factors.cta?.trim(),
  ].filter(Boolean) as string[];

  const text = lines.join("\n");
  return text || editable.trim() || raw.trim();
}

function mergeNanoUrlIntoThreeSlots(prev: string[], slot: 0 | 1 | 2, url: string): string[] {
  const base: string[] = [0, 1, 2].map((i) => {
    const v = prev[i];
    return typeof v === "string" && v.trim() ? v : "";
  });
  base[slot] = url;
  return base;
}

/** Shimmer sweep on copy + very subtle tilt (spinner beside it supplies the obvious “rotate”). */
function StatusLineShimmer({ text, className }: { text: string; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      className="inline-block align-baseline will-change-transform"
      animate={reduceMotion ? { rotate: 0 } : { rotate: [0, 0.35, 0, -0.35, 0] }}
      transition={{ repeat: reduceMotion ? 0 : Infinity, duration: 6.5, ease: "easeInOut" }}
    >
      <TextShimmer
        as="span"
        className={cn(
          "dark:[--base-color:rgba(210,200,255,0.5)] dark:[--base-gradient-color:#faf5ff]",
          className,
        )}
        duration={2.8}
        spread={1.65}
      >
        {text}
      </TextShimmer>
    </motion.span>
  );
}

function NanoThreeImageArchitectureLoader() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {([0, 1, 2] as const).map((i) => (
          <div
            key={i}
            className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-black/20"
            aria-hidden
          >
            <ShapeGrid
              direction="diagonal"
              speed={0.65}
              squareSize={14}
              borderColor="#3b1c6d"
              hoverFillColor="#2a1252"
              shape="hexagon"
              hoverTrailAmount={0}
              className="absolute inset-0 h-full w-full opacity-75"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-violet-500/12 to-transparent animate-pulse" />
            <div
              className="absolute inset-0 lta-image-arch-reveal bg-violet-400/15"
              style={{ animationDelay: `${i * 120}ms` }}
            />
            <div className="absolute left-2 top-2 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-white/70">
              {i + 1}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs font-normal text-white/45">Assembling image architecture…</p>
    </div>
  );
}

export type LinkToAdUniverseProps = {
  /** When set, load this run once (e.g. from Projects). */
  resumeRunId?: string | null;
  onResumeConsumed?: () => void;
  /** Refresh Projects list after save. */
  onRunsChanged?: () => void;
};

function confidenceToQuality(c: string | undefined) {
  const v = String(c ?? "").toLowerCase();
  if (v === "high") return { label: "good", color: "text-emerald-400", help: "Clean product image looks strong." };
  if (v === "medium")
    return {
      label: "medium",
      color: "text-violet-300",
      help: "Image is usable but not perfect. Upload a neutral product-only photo for best results.",
    };
  return {
    label: "bad",
    color: "text-destructive",
    help: "Low confidence. Upload a neutral product-only photo (no background, no people) for best results.",
  };
}

function safeParseJson<T>(raw: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return { ok: false, error: "Invalid JSON from server." };
  }
}

function withAudioHint(prompt: string) {
  const p = prompt.trim();
  if (!p) return p;
  const lower = p.toLowerCase();
  const mentionsAudio =
    lower.includes("audio") ||
    lower.includes("sound") ||
    lower.includes("voice") ||
    lower.includes("voix") ||
    lower.includes("voiceover") ||
    lower.includes("narration") ||
    lower.includes("dialogue");
  if (mentionsAudio) return p;
  return `${p}\n\nAudio: ON. Include natural spoken voice and subtle ambient sound.`;
}

function composeCustomUgcIntent(topic: string, offer: string, cta: string): string {
  const t = topic.trim();
  const o = offer.trim();
  const c = cta.trim();
  const parts: string[] = [];
  if (t) parts.push(`Creative direction: talk about ${t}.`);
  if (o) parts.push(`Offer: ${o}.`);
  if (c) parts.push(`CTA: ${c}.`);
  return parts.join(" ");
}

function storeHostname(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    const h = u.hostname.replace(/^www\./i, "");
    return h || null;
  } catch {
    return null;
  }
}

/** Public favicon proxy (no API key). */
function brandFaviconUrl(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
}

/** Short teaser for UI only; full text stays in state for GPT / scripts APIs. */
function compactBrandSummaryForUi(full: string, maxLen = 200): string {
  const t = full.replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  let block = t.split(/\n\s*\n/)[0]?.trim() ?? t;
  block = block.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  if (block.length <= maxLen) return block;
  const cut = block.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 48 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

function firstHexColor(input: string): string | null {
  const m = input.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/);
  if (!m) return null;
  const raw = m[0];
  if (raw.length === 4) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return raw.toUpperCase();
}

type VideoPromptSections = {
  direction: string;
  scene: string;
  motion: string;
  style: string;
};

function splitVideoPromptSectionsForUi(prompt: string): VideoPromptSections {
  const clean = prompt.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  if (!clean) return { direction: "", scene: "", motion: "", style: "" };
  const sentences = (clean.match(/[^.!?]+[.!?]?/g) ?? []).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= 4) {
    return {
      direction: sentences[0] ?? "",
      scene: sentences[1] ?? "",
      motion: sentences[2] ?? "",
      style: sentences.slice(3).join(" ").trim(),
    };
  }
  if (sentences.length === 3) {
    return { direction: sentences[0], scene: sentences[1], motion: sentences[2], style: "" };
  }
  if (sentences.length === 2) {
    return { direction: sentences[0], scene: sentences[1], motion: "", style: "" };
  }
  const parts = clean.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    direction: parts[0] ?? clean,
    scene: parts[1] ?? "",
    motion: parts[2] ?? "",
    style: parts.slice(3).join(", ").trim(),
  };
}

function composeVideoPromptFromSections(sections: VideoPromptSections): string {
  const blocks = [
    sections.direction.trim() ? `Creative direction: ${sections.direction.trim()}` : "",
    sections.scene.trim() ? `Scene setup: ${sections.scene.trim()}` : "",
    sections.motion.trim() ? `Motion cues: ${sections.motion.trim()}` : "",
    sections.style.trim() ? `Style & constraints: ${sections.style.trim()}` : "",
  ].filter(Boolean);
  return blocks.join("\n");
}

function LinkToAdPendingProductThumbnails({ items }: { items: { id: string; blob: string }[] }) {
  if (!items.length) return null;
  return (
    <>
      {items.map((row) => (
        <div
          key={row.id}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-violet-500/35 bg-[#050507]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.blob} alt="" className="h-full w-full object-cover" />
          <UploadBusyOverlay active className="rounded-lg" />
        </div>
      ))}
    </>
  );
}

export default function LinkToAdUniverse({ resumeRunId, onResumeConsumed, onRunsChanged }: LinkToAdUniverseProps) {
  const { planId, current: creditsBalance, spendCredits, grantCredits } = useCreditsPlan();
  /** After a fresh store scan starts, gate later steps against this snapshot so the wallet UI does not “jump” each step. Resync on image/video redo actions only. */
  const [ltaFrozenCredits, setLtaFrozenCredits] = useState<number | null>(null);
  const creditsBalanceRef = useRef(creditsBalance);
  creditsBalanceRef.current = creditsBalance;

  const [ltaCreditModal, setLtaCreditModal] = useState<{
    required: number;
    current: number;
  } | null>(null);

  /** Deduct from wallet once on URL Generate; keep ref/frozen in sync with that charge. */
  const spendLtaCreditsIfEnough = useCallback(
    (cost: number): boolean => {
      if (isPersonalApiActive()) return true;
      const k = Math.max(0, Math.floor(cost));
      if (k <= 0) return true;
      if (creditsBalanceRef.current < k) {
        setLtaCreditModal({ current: creditsBalanceRef.current, required: k });
        return false;
      }
      spendCredits(k);
      creditsBalanceRef.current = Math.max(0, creditsBalanceRef.current - k);
      setLtaFrozenCredits((x) => (x !== null ? Math.max(0, x - k) : x));
      return true;
    },
    [spendCredits],
  );

  const [storeUrl, setStoreUrl] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  /** Extra product photo uploads should not trigger global "Working..." pipeline state. */
  const [isUploadingAdditionalPhotos, setIsUploadingAdditionalPhotos] = useState(false);
  const [pendingProductUploads, setPendingProductUploads] = useState<{ id: string; blob: string }[]>([]);
  const [extractedTitle, setExtractedTitle] = useState<string | null>(null);

  const [cleanCandidate, setCleanCandidate] = useState<{ url: string; reason?: string } | null>(null);
  const [fallbackImageUrl, setFallbackImageUrl] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [neutralUploadUrl, setNeutralUploadUrl] = useState<string | null>(null);
  /** URLs classified as product-only (multi-angle); used for GPT vision + Nano single pick. */
  const [productOnlyImageUrls, setProductOnlyImageUrls] = useState<string[]>([]);
  const [userPhotoUrls, setUserPhotoUrls] = useState<string[]>([]);
  const [avatarPhotoUrls, setAvatarPhotoUrls] = useState<string[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<string[]>([]);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [brandFaviconFailed, setBrandFaviconFailed] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  /** File input on the Store URL step (optional product photos before scan). */
  const earlyProductPhotosInputRef = useRef<HTMLInputElement>(null);
  /** After user clicks "Generate video from this image", show video prompt + output panels (incl. errors). */
  const [userStartedVideoFromImage, setUserStartedVideoFromImage] = useState(false);
  /**
   * Split layout: compact reference strip + video column. Stays on when switching between the 3 images;
   * off when user returns to full grid, changes angle, or regenerates all 3 images.
   */
  const [videoStageMode, setVideoStageMode] = useState(false);

  const [summaryText, setSummaryText] = useState<string>("");
  const [scriptsText, setScriptsText] = useState<string>("");
  const [generationMode, setGenerationMode] = useState<"automatic" | "custom_ugc">("automatic");
  const [customUgcTopic, setCustomUgcTopic] = useState("");
  const [customUgcOffer, setCustomUgcOffer] = useState("");
  const [customUgcCta, setCustomUgcCta] = useState("");
  const [stage, setStage] = useState<
    | "idle"
    | "scanning"
    | "finding_image"
    | "summarizing"
    | "writing_scripts"
    | "server_pipeline"
    | "ready"
    | "error"
  >("idle");

  /** Real checklist step 0–4 during `runInitialPipeline` from the browser (no fake timer). */
  const [serverPipelineStepIndex, setServerPipelineStepIndex] = useState<number | null>(null);

  const [universeRunId, setUniverseRunId] = useState<string | null>(null);
  const [lastExtractedJson, setLastExtractedJson] = useState<Record<string, unknown> | null>(null);
  const [angleLabels, setAngleLabels] = useState<[string, string, string]>(["", "", ""]);
  const [selectedAngleIndex, setSelectedAngleIndex] = useState<number | null>(null);
  const [customAngleInput, setCustomAngleInput] = useState("");
  const [isCustomAngleLoading, setIsCustomAngleLoading] = useState(false);
  /** Generated script shown for review before merging into the three angle slots. */
  const [pendingCustomAnglePreview, setPendingCustomAnglePreview] = useState<{
    headline: string;
    script: string;
    sourcePrompt: string;
  } | null>(null);
  /** Manual edit of headline + script before "Add to my angles". */
  const [pendingCustomAngleEditing, setPendingCustomAngleEditing] = useState(false);
  const [editableScript, setEditableScript] = useState("");
  const [expandedAngleScripts, setExpandedAngleScripts] = useState<Record<number, boolean>>({});
  const [angleScriptDrafts, setAngleScriptDrafts] = useState<Record<number, string>>({});
  const [scriptEditVisible, setScriptEditVisible] = useState(false);
  const [scriptFactors, setScriptFactors] = useState<ScriptFactorBlocks>({ ...EMPTY_SCRIPT_FACTORS });
  const [scriptHasEdits, setScriptHasEdits] = useState(false);
  const [editableVideoPrompt, setEditableVideoPrompt] = useState("");
  const [videoPromptSections, setVideoPromptSections] = useState<VideoPromptSections>({
    direction: "",
    scene: "",
    motion: "",
    style: "",
  });
  const [videoPromptInlineEdit, setVideoPromptInlineEdit] = useState(false);
  const [videoPromptHasEdits, setVideoPromptHasEdits] = useState(false);
  const [videoPromptEditVisible, setVideoPromptEditVisible] = useState(false);
  /** Saved Nano + Kling pipeline per script angle (inactive slots + hydrate); active angle also in flat state below. */
  const [pipelineByAngle, setPipelineByAngle] = useState<
    [LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1]
  >(() => [emptyAnglePipeline(), emptyAnglePipeline(), emptyAnglePipeline()]);

  const [nanoBananaPromptsRaw, setNanoBananaPromptsRaw] = useState("");
  const [nanoBananaSelectedPromptIndex, setNanoBananaSelectedPromptIndex] = useState<0 | 1 | 2>(0);
  const [nanoBananaTaskId, setNanoBananaTaskId] = useState<string | null>(null);
  const [nanoBananaImageUrl, setNanoBananaImageUrl] = useState<string | null>(null);
  const [nanoBananaImageUrls, setNanoBananaImageUrls] = useState<string[]>([]);
  const [nanoBananaSelectedImageIndex, setNanoBananaSelectedImageIndex] = useState<0 | 1 | 2 | null>(null);
  const [ugcVideoPromptGpt, setUgcVideoPromptGpt] = useState("");
  /** Per reference image (0–2): Kling video URL, task id, history, saved motion prompt. */
  const [klingByRef, setKlingByRef] = useState<KlingReferenceSlotV1[]>(() => createEmptyKlingByReference());
  /** Which reference index the active Kling poll belongs to (single global poll). */
  const [klingPollImageIndex, setKlingPollImageIndex] = useState<0 | 1 | 2 | null>(null);

  const [isNanoPromptsLoading, setIsNanoPromptsLoading] = useState(false);
  const [isNanoImageSubmitting, setIsNanoImageSubmitting] = useState(false);
  const [nanoPollTaskId, setNanoPollTaskId] = useState<string | null>(null);
  /** Slot index for the in-flight single-image Nano poll (for per-thumb loading UI). */
  const [nanoPollingSlotIndex, setNanoPollingSlotIndex] = useState<0 | 1 | 2 | null>(null);
  const [isNanoAllImagesSubmitting, setIsNanoAllImagesSubmitting] = useState(false);
  const [isVideoPromptLoading, setIsVideoPromptLoading] = useState(false);
  const [isKlingSubmitting, setIsKlingSubmitting] = useState(false);
  const [klingPollTaskId, setKlingPollTaskId] = useState<string | null>(null);
  /** Lightbox: full reference image (source is often 9:16; grid shows 3:4 crop). */
  const [nanoImageLightboxUrl, setNanoImageLightboxUrl] = useState<string | null>(null);
  const [expandedAngleBriefs, setExpandedAngleBriefs] = useState<Record<number, boolean>>({});
  const [angleSummaryDrafts, setAngleSummaryDrafts] = useState<Record<number, string>>({});

  const nanoPromptsAbortRef = useRef<AbortController | null>(null);
  const nanoImageAbortRef = useRef<AbortController | null>(null);
  const nanoThreeAbortRef = useRef<AbortController | null>(null);
  const videoPromptAbortRef = useRef<AbortController | null>(null);
  const klingAbortRef = useRef<AbortController | null>(null);

  const cancelCurrentGeneration = useCallback(() => {
    nanoPromptsAbortRef.current?.abort();
    nanoImageAbortRef.current?.abort();
    nanoThreeAbortRef.current?.abort();
    videoPromptAbortRef.current?.abort();
    klingAbortRef.current?.abort();

    setIsNanoPromptsLoading(false);
    setIsNanoImageSubmitting(false);
    setIsNanoAllImagesSubmitting(false);
    setIsVideoPromptLoading(false);
    setIsKlingSubmitting(false);

    setNanoPollTaskId(null);
    setNanoPollingSlotIndex(null);
    setKlingPollTaskId(null);
    setKlingPollImageIndex(null);
    toast.message("Generation cancelled", { description: "Stopped polling and aborted pending requests." });
  }, []);

  const selImg = nanoBananaSelectedImageIndex;
  const activeKlingSlot = useMemo(() => {
    if (selImg === null) {
      return { videoUrl: null as string | null, taskId: null as string | null, history: [] as string[] };
    }
    const s = klingByRef[selImg];
    return {
      videoUrl: (s?.videoUrl ?? null) as string | null,
      taskId: (s?.taskId ?? null) as string | null,
      history: [...(s?.history ?? [])],
    };
  }, [selImg, klingByRef]);
  const klingVideoUrl = activeKlingSlot.videoUrl;
  const klingTaskId = activeKlingSlot.taskId;
  const klingHistory = activeKlingSlot.history;

  const klingRenderingThisReference = Boolean(
    klingPollTaskId &&
      klingPollImageIndex !== null &&
      klingPollImageIndex === nanoBananaSelectedImageIndex,
  );

  function patchKlingSlot(i: 0 | 1 | 2, patch: Partial<KlingReferenceSlotV1>) {
    setKlingByRef((prev) => {
      const next = prev.map((s) => ({
        ...s,
        history: [...(s.history || [])],
      }));
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function promoteHistoryToMain(slotIdx: 0 | 1 | 2, historyUrl: string) {
    setKlingByRef((prev) => {
      const next = prev.map((s) => ({
        ...s,
        history: [...(s.history || [])],
      }));
      const cur = next[slotIdx];
      const main = cur.videoUrl?.trim();
      const hist = (cur.history || []).filter((u) => u !== historyUrl);
      const newHist = main && main !== historyUrl ? [main, ...hist] : hist;
      next[slotIdx] = { ...cur, videoUrl: historyUrl, history: newHist.slice(0, 12) };
      return next;
    });
  }

  function captureActivePipeline(): LinkToAdAnglePipelineV1 {
    const imgIdx = nanoBananaSelectedImageIndex;
    const klingMerged = klingByRef.map((s, i) => ({
      videoUrl: s.videoUrl ?? null,
      taskId: s.taskId ?? null,
      history: [...(s.history || [])],
      ugcVideoPrompt:
        i === imgIdx ? ugcVideoPromptGpt || undefined : s.ugcVideoPrompt,
    }));
    return {
      nanoBananaPromptsRaw,
      nanoBananaSelectedPromptIndex,
      nanoBananaTaskId,
      nanoBananaImageUrl,
      nanoBananaImageUrls: [...nanoBananaImageUrls],
      nanoBananaSelectedImageIndex,
      ugcVideoPromptGpt,
      klingByReferenceIndex: klingMerged,
      videoStageMode,
    };
  }

  function applyPipelineFromSnapshot(p: LinkToAdAnglePipelineV1) {
    setNanoBananaPromptsRaw(p.nanoBananaPromptsRaw ?? "");
    setNanoBananaSelectedPromptIndex(
      p.nanoBananaSelectedPromptIndex === 0 || p.nanoBananaSelectedPromptIndex === 1 || p.nanoBananaSelectedPromptIndex === 2
        ? p.nanoBananaSelectedPromptIndex
        : 0,
    );
    setNanoBananaTaskId(p.nanoBananaTaskId ?? null);
    setNanoBananaImageUrl(p.nanoBananaImageUrl ?? null);
    setNanoBananaImageUrls(Array.isArray(p.nanoBananaImageUrls) ? [...p.nanoBananaImageUrls] : []);
    setNanoBananaSelectedImageIndex(
      p.nanoBananaSelectedImageIndex === 0 || p.nanoBananaSelectedImageIndex === 1 || p.nanoBananaSelectedImageIndex === 2
        ? p.nanoBananaSelectedImageIndex
        : null,
    );
    setUgcVideoPromptGpt(p.ugcVideoPromptGpt ?? "");
    const k = p.klingByReferenceIndex;
    setKlingByRef(
      k && k.length === 3
        ? k.map((s) => ({
            videoUrl: s.videoUrl ?? null,
            taskId: s.taskId ?? null,
            history: [...(s.history || [])],
            ugcVideoPrompt: s.ugcVideoPrompt,
          }))
        : createEmptyKlingByReference(),
    );
    setVideoStageMode(Boolean(p.videoStageMode));
    setUserStartedVideoFromImage(
      Boolean(
        (p.ugcVideoPromptGpt && p.ugcVideoPromptGpt.trim()) ||
          (p.nanoBananaImageUrl && String(p.nanoBananaImageUrl).trim()) ||
          (k &&
            k.some(
              (s) =>
                (s.videoUrl && String(s.videoUrl).trim()) ||
                (s.taskId && String(s.taskId).trim()) ||
                (s.history && s.history.length > 0) ||
                (s.ugcVideoPrompt && s.ugcVideoPrompt.trim()),
            )),
      ),
    );
  }

  /** Clone triple from state + merge current flat UI into the active angle (for saves). */
  function buildPersistTriplePatchingActive(
    patch?: Partial<LinkToAdAnglePipelineV1>,
  ): [LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1] {
    const t: [LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1] = [
      cloneAnglePipeline(pipelineByAngle[0]),
      cloneAnglePipeline(pipelineByAngle[1]),
      cloneAnglePipeline(pipelineByAngle[2]),
    ];
    const a = selectedAngleIndex;
    if (a === 0 || a === 1 || a === 2) {
      t[a] = { ...captureActivePipeline(), ...(patch ?? {}) };
    }
    return t;
  }

  function snapshotWithPersistTriple(
    base: LinkToAdUniverseSnapshotV1,
    triple: [LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1],
    sel?: number | null,
  ): LinkToAdUniverseSnapshotV1 {
    const effectiveSel = sel !== undefined ? sel : base.selectedAngleIndex;
    const active =
      effectiveSel === 0 || effectiveSel === 1 || effectiveSel === 2 ? triple[effectiveSel] : triple[0];
    const kn = normalizeKlingByReference({
      klingByReferenceIndex: active.klingByReferenceIndex,
      klingVideoUrl: null,
      klingTaskId: null,
      nanoBananaSelectedImageIndex: active.nanoBananaSelectedImageIndex,
    });
    return {
      ...base,
      ...(sel !== undefined ? { selectedAngleIndex: sel } : {}),
      linkToAdPipelineByAngle: triple,
      ...flattenAnglePipeToTopLevel(active, kn),
    };
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevAngleRef = useRef<number | null>(null);
  /** Angle / slots when Kling poll started (so save targets the right pipeline if state moves). */
  const klingPollAngleRef = useRef<0 | 1 | 2 | null>(null);
  const klingPollSlotsRef = useRef<KlingReferenceSlotV1[] | null>(null);
  const klingMergedSnapRef = useRef<LinkToAdUniverseSnapshotV1 | null>(null);
  const summaryTextRef = useRef("");
  const isWorkingRef = useRef(false);
  const latestSnapRef = useRef<LinkToAdUniverseSnapshotV1 | null>(null);
  /** Prompt string sent for the current image task (for accurate persist after poll). */
  const lastNanoImagePromptRef = useRef("");
  const lastNanoImagePromptIndexRef = useRef<0 | 1 | 2>(0);
  const lastKlingVideoPromptRef = useRef("");
  /** Avoid infinite resume loop if KIE poll fails after returning to the page. */
  const klingResumeAttemptedRef = useRef(false);

  useEffect(() => {
    const idx = nanoBananaSelectedImageIndex;
    const mergedSlots: KlingReferenceSlotV1[] = klingByRef.map((s, i) => ({
      ...s,
      history: [...(s.history || [])],
      ...(i === idx ? { ugcVideoPrompt: ugcVideoPromptGpt || undefined } : {}),
    }));
    const mirror = idx !== null ? mergedSlots[idx] : null;
    const triple: [LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1] = [
      cloneAnglePipeline(pipelineByAngle[0]),
      cloneAnglePipeline(pipelineByAngle[1]),
      cloneAnglePipeline(pipelineByAngle[2]),
    ];
    if (selectedAngleIndex === 0 || selectedAngleIndex === 1 || selectedAngleIndex === 2) {
      triple[selectedAngleIndex] = captureActivePipeline();
    }
    latestSnapRef.current = {
      v: 1,
      phase: scriptsText ? "after_scripts" : "after_summary",
      generationMode,
      customUgcIntent: composeCustomUgcIntent(customUgcTopic, customUgcOffer, customUgcCta),
      customUgcTopic: customUgcTopic.trim(),
      customUgcOffer: customUgcOffer.trim(),
      customUgcCta: customUgcCta.trim(),
      cleanCandidate,
      fallbackImageUrl,
      confidence,
      neutralUploadUrl,
      productOnlyImageUrls: productOnlyImageUrls.length ? productOnlyImageUrls : undefined,
      userPhotoUrls: userPhotoUrls.length ? userPhotoUrls : undefined,
      summaryText,
      scriptsText,
      angleLabels,
      selectedAngleIndex,
      nanoBananaPromptsRaw: nanoBananaPromptsRaw || undefined,
      nanoBananaSelectedPromptIndex,
      nanoBananaTaskId: nanoBananaTaskId ?? undefined,
      nanoBananaImageUrl: nanoBananaImageUrl ?? undefined,
      nanoBananaImageUrls: nanoBananaImageUrls.length ? nanoBananaImageUrls : undefined,
      nanoBananaSelectedImageIndex: nanoBananaSelectedImageIndex ?? undefined,
      ugcVideoPromptGpt: ugcVideoPromptGpt || undefined,
      klingByReferenceIndex: mergedSlots,
      klingTaskId: mirror?.taskId ?? undefined,
      klingVideoUrl: mirror?.videoUrl ?? undefined,
      linkToAdPipelineByAngle: triple,
    };
  }, [
    cleanCandidate,
    fallbackImageUrl,
    confidence,
    neutralUploadUrl,
    productOnlyImageUrls,
    userPhotoUrls,
    generationMode,
    customUgcTopic,
    customUgcOffer,
    customUgcCta,
    summaryText,
    scriptsText,
    angleLabels,
    selectedAngleIndex,
    nanoBananaPromptsRaw,
    nanoBananaSelectedPromptIndex,
    nanoBananaTaskId,
    nanoBananaImageUrl,
    nanoBananaImageUrls,
    nanoBananaSelectedImageIndex,
    ugcVideoPromptGpt,
    klingByRef,
    nanoBananaSelectedImageIndex,
    pipelineByAngle,
    videoStageMode,
  ]);

  const quality = useMemo(() => confidenceToQuality(confidence ?? undefined), [confidence]);
  const parsedNanoPrompts = useMemo(() => parseThreeLabeledPrompts(nanoBananaPromptsRaw), [nanoBananaPromptsRaw]);
  const scriptOptionBodiesAll = useMemo(() => splitAllScriptOptions(scriptsText), [scriptsText]);
  const hasAvatarPhoto = avatarPhotoUrls.length > 0;
  const sanitizeAngleLabelForAvatar = useCallback((text: string): string => {
    const t0 = String(text || "");
    if (!t0.trim()) return "";
    let t = t0;
    // Remove common demographic descriptors that can conflict with avatar reference image.
    t = t.replace(/\b\d{1,2}\s*[- ]?\s*(?:year\s*old|yo|y\/o)\s+(?:woman|man|female|male|girl|boy|creator|mom|dad)\b/gi, "");
    t = t.replace(/\b(?:a|an)\s+\d{1,2}\s*[- ]?\s*(?:year\s*old|yo|y\/o)\b/gi, "");
    // Clean up leftover punctuation/spaces.
    t = t.replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").replace(/^[\s,.-]+|[\s,.-]+$/g, "").trim();
    return t || t0.trim();
  }, []);
  const angleOptionCards = useMemo(() => {
    const count = Math.max(3, scriptOptionBodiesAll.length);
    return Array.from({ length: count }, (_, i) => {
      const explicit = i < 3 ? angleLabels[i]?.trim() : "";
      const body = scriptOptionBodiesAll[i] ?? "";
      const parts = body
        ? angleBriefPartsFromScriptOption(body, (i === 0 ? 0 : i === 1 ? 1 : 2) as 0 | 1 | 2)
        : { brief: "", full: "", canExpand: false };
      const explicitSafe = hasAvatarPhoto ? sanitizeAngleLabelForAvatar(explicit) : explicit;
      const fallbackSafe = hasAvatarPhoto ? sanitizeAngleLabelForAvatar(parts.brief) : parts.brief;
      const fullSafe = hasAvatarPhoto ? sanitizeAngleLabelForAvatar(parts.full) : parts.full;
      const fallback = fallbackSafe;
      return {
        index: i,
        label: explicitSafe || fallback || "…",
        fullLabel: explicitSafe || fullSafe || fallback || "…",
        canExpand: Boolean(!explicitSafe && parts.canExpand && fullSafe && fullSafe !== (explicitSafe || fallback)),
      };
    });
  }, [angleLabels, hasAvatarPhoto, sanitizeAngleLabelForAvatar, scriptOptionBodiesAll]);

  const factorWordRules = useMemo(
    () => ({
      hook: { min: 3, max: 5, label: "Hook", hint: "3–5 words" },
      problem: { min: 5, max: 7, label: "Problem", hint: "5–7 words" },
      benefits: {
        min: 10,
        max: 14,
        label: "Solution",
        hint: "10–14 words (must include product + main benefit)",
      },
      cta: { min: 3, max: 4, label: "CTA", hint: "3–4 words" },
    }),
    [],
  );

  const factorWordCounts = useMemo(() => {
    return {
      hook: countWords(scriptFactors.hook),
      problem: countWords(scriptFactors.problem),
      benefits: countWords(scriptFactors.benefits),
      cta: countWords(scriptFactors.cta),
    };
  }, [scriptFactors.benefits, scriptFactors.cta, scriptFactors.hook, scriptFactors.problem]);

  const factorWordsValid = useMemo(() => {
    const check = (k: keyof typeof factorWordRules) => {
      const c = factorWordCounts[k];
      const r = factorWordRules[k];
      return c >= r.min && c <= r.max;
    };
    return {
      hook: check("hook"),
      problem: check("problem"),
      benefits: check("benefits"),
      cta: check("cta"),
      all: check("hook") && check("problem") && check("benefits") && check("cta"),
    };
  }, [factorWordCounts, factorWordRules]);
  const composeScriptsFromOptions = useCallback((options: string[]) => {
    return options
      .map((opt, idx) => {
        const body = opt.trim();
        if (!body) return `SCRIPT OPTION ${idx + 1}`;
        return body;
      })
      .join("\n\n");
  }, []);

  const saveAngleScriptDraft = useCallback(
    (index: number) => {
      const draft = (angleScriptDrafts[index] ?? "").trim();
      if (!draft) {
        toast.error("Script cannot be empty.");
        return;
      }
      const nextOptions = [...scriptOptionBodiesAll];
      while (nextOptions.length <= index) {
        nextOptions.push(`SCRIPT OPTION ${nextOptions.length + 1}`);
      }
      nextOptions[index] = draft;
      const merged = composeScriptsFromOptions(nextOptions);
      setScriptsText(merged);
      if (selectedAngleIndex === index) {
        const headline = angleLabels[index as 0 | 1 | 2] || "";
        const { editable } = angleBlockForEditing(draft);
        setEditableScript(editable);
        setScriptFactors(splitScriptFactorsForUi(editable, headline));
        setScriptHasEdits(true);
      }
      toast.success(`Angle ${index + 1} script updated.`);
    },
    [
      angleLabels,
      angleScriptDrafts,
      composeScriptsFromOptions,
      scriptOptionBodiesAll,
      selectedAngleIndex,
      setScriptsText,
    ],
  );
  const displayedProductImageUrl = neutralUploadUrl ?? cleanCandidate?.url ?? fallbackImageUrl ?? null;

  const resolveMaybeRelativeUrl = useCallback(
    (url: string | null | undefined): string | null => {
      const u = (url || "").trim();
      if (!u) return null;
      if (/^https?:\/\//i.test(u)) return u;
      const base = storeUrl.trim();
      if (!base) return u;
      return absolutizeImageUrl(u, base) ?? u;
    },
    [storeUrl],
  );

  const resolvedPreviewUrl = useMemo(() => {
    if (!displayedProductImageUrl) return null;
    if (/^https?:\/\//i.test(displayedProductImageUrl)) return displayedProductImageUrl;
    const base = storeUrl.trim();
    if (!base) return displayedProductImageUrl;
    return absolutizeImageUrl(displayedProductImageUrl, base) ?? displayedProductImageUrl;
  }, [displayedProductImageUrl, storeUrl]);

  const resolvedCleanCandidateUrl = useMemo(() => resolveMaybeRelativeUrl(cleanCandidate?.url), [cleanCandidate?.url, resolveMaybeRelativeUrl]);
  const resolvedFallbackImageUrl = useMemo(() => resolveMaybeRelativeUrl(fallbackImageUrl), [fallbackImageUrl, resolveMaybeRelativeUrl]);
  const resolvedNeutralUploadUrl = useMemo(() => resolveMaybeRelativeUrl(neutralUploadUrl), [neutralUploadUrl, resolveMaybeRelativeUrl]);

  const isAlgorithmChosenPreview = useMemo(() => {
    const cur = (resolvedPreviewUrl || "").trim();
    if (!cur) return false;
    if (resolvedNeutralUploadUrl && cur === resolvedNeutralUploadUrl) return false;
    return (resolvedCleanCandidateUrl && cur === resolvedCleanCandidateUrl) || (resolvedFallbackImageUrl && cur === resolvedFallbackImageUrl);
  }, [resolvedCleanCandidateUrl, resolvedFallbackImageUrl, resolvedNeutralUploadUrl, resolvedPreviewUrl]);

  const removeAlgorithmChosenPreview = useCallback(() => {
    const cur = (resolvedPreviewUrl || "").trim();
    if (!cur) return;
    if (resolvedCleanCandidateUrl && cur === resolvedCleanCandidateUrl) setCleanCandidate(null);
    if (resolvedFallbackImageUrl && cur === resolvedFallbackImageUrl) setFallbackImageUrl(null);
    setProductOnlyImageUrls((prev) => prev.filter((u) => {
      const ru = resolveMaybeRelativeUrl(u);
      return ru ? ru !== cur : true;
    }));
  }, [resolveMaybeRelativeUrl, resolvedCleanCandidateUrl, resolvedFallbackImageUrl, resolvedPreviewUrl]);

  useEffect(() => {
    setAngleScriptDrafts((prev) => {
      const next: Record<number, string> = { ...prev };
      scriptOptionBodiesAll.forEach((body, idx) => {
        if (!next[idx] || !next[idx].trim()) {
          next[idx] = body;
        }
      });
      return next;
    });
  }, [scriptOptionBodiesAll]);

  useEffect(() => {
    setImgError(false);
  }, [resolvedPreviewUrl]);

  useEffect(() => {
    if (!nanoImageLightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNanoImageLightboxUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nanoImageLightboxUrl]);

  useEffect(() => {
    summaryTextRef.current = summaryText;
  }, [summaryText]);

  useEffect(() => {
    isWorkingRef.current = isWorking;
  }, [isWorking]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const urls = await loadAvatarUrls();
      if (!cancelled) setAvatarUrls(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [productOnlyImageUrls.length, userPhotoUrls.length]);

  const hydrateFromRun = useCallback(
    (
      run: {
        id: string;
        store_url?: string | null;
        title?: string | null;
        extracted?: unknown;
      },
      opts?: { silent?: boolean },
    ) => {
      const snap = readUniverseFromExtracted(run.extracted);
      if (!snap) {
        toast.error("This run has no Link to Ad Universe data.");
        return;
      }
      setUniverseRunId(run.id);
      setStoreUrl(typeof run.store_url === "string" ? run.store_url : "");
      setExtractedTitle(typeof run.title === "string" ? run.title : null);
      setCleanCandidate(snap.cleanCandidate);
      setFallbackImageUrl(snap.fallbackImageUrl);
      setConfidence(snap.confidence);
      setNeutralUploadUrl(snap.neutralUploadUrl);
      setProductOnlyImageUrls(
        snap.productOnlyImageUrls && snap.productOnlyImageUrls.length > 0
          ? snap.productOnlyImageUrls
          : snap.cleanCandidate?.url
            ? [snap.cleanCandidate.url]
            : [],
      );
      setUserPhotoUrls(
        (snap as any).userPhotoUrls && Array.isArray((snap as any).userPhotoUrls)
          ? (snap as any).userPhotoUrls
          : [],
      );
      setSummaryText(snap.summaryText);
      setScriptsText(snap.scriptsText);
      setGenerationMode(snap.generationMode === "custom_ugc" ? "custom_ugc" : "automatic");
      setCustomUgcTopic(((snap.customUgcTopic ?? "").trim() || (snap.customUgcIntent ?? "").trim()));
      setCustomUgcOffer((snap.customUgcOffer ?? "").trim());
      setCustomUgcCta((snap.customUgcCta ?? "").trim());
      setPendingCustomAnglePreview(null);
      setAngleLabels(
        snap.angleLabels[0] && snap.angleLabels[1] && snap.angleLabels[2]
          ? snap.angleLabels
          : snap.scriptsText
            ? deriveAngleLabelsFromScripts(snap.scriptsText)
            : ["", "", ""],
      );
      setSelectedAngleIndex(snap.selectedAngleIndex);
      const triple = normalizePipelineByAngle(snap);
      setPipelineByAngle([
        cloneAnglePipeline(triple[0]),
        cloneAnglePipeline(triple[1]),
        cloneAnglePipeline(triple[2]),
      ]);
      const sAng = snap.selectedAngleIndex;
      if (sAng === 0 || sAng === 1 || sAng === 2) {
        applyPipelineFromSnapshot(cloneAnglePipeline(triple[sAng]));
      } else {
        applyPipelineFromSnapshot(emptyAnglePipeline());
      }
      if (sAng !== null && sAng >= 0 && snap.scriptsText.trim()) {
        const raw = selectedScriptOptionByIndex(snap.scriptsText, sAng);
        const { editable, headline } = angleBlockForEditing(raw);
        setEditableScript(editable);
        setScriptFactors(splitScriptFactorsForUi(editable, headline));
      } else {
        setEditableScript("");
        setScriptFactors({ ...EMPTY_SCRIPT_FACTORS });
      }
      setScriptHasEdits(false);
      setScriptEditVisible(false);
      setNanoPollTaskId(null);
      setKlingPollTaskId(null);
      setKlingPollImageIndex(null);
      prevAngleRef.current = snap.selectedAngleIndex;
      setLastExtractedJson(cloneExtractedBase(run.extracted));
      setStage("ready");
      setImgError(false);
      if (!opts?.silent) {
        toast.success("Project resumed");
      }
    },
    [],
  );

  useEffect(() => {
    if (!resumeRunId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/runs/get?runId=${encodeURIComponent(resumeRunId)}`, { cache: "no-store" });
        const json = (await res.json()) as { data?: { id: string; store_url?: string; title?: string | null; extracted?: unknown }; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error || "Load failed");
        if (!cancelled) hydrateFromRun(json.data);
      } catch (e) {
        toast.error("Unable to load the project", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
      } finally {
        if (!cancelled) onResumeConsumed?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeRunId, onResumeConsumed, hydrateFromRun]);

  type RunExtras = {
    imagePrompt?: string;
    selectedImageUrl?: string | null;
    generatedImageUrls?: string[];
    videoPrompt?: string;
    videoUrl?: string | null;
  };

  const persistUniverse = useCallback(
    async (
      runId: string | null,
      url: string,
      title: string | null,
      extractedBase: Record<string, unknown>,
      snapshot: LinkToAdUniverseSnapshotV1,
      packshotUrls: string[],
      extras?: RunExtras,
    ): Promise<string> => {
      const extracted = { ...extractedBase, __universe: snapshot };
      const res = await fetch("/api/runs/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: runId ?? undefined,
          storeUrl: url,
          title,
          extracted,
          packshotUrls: packshotUrls.length ? packshotUrls.slice(0, 12) : undefined,
          ...(extras?.imagePrompt !== undefined ? { imagePrompt: extras.imagePrompt } : {}),
          ...(extras?.selectedImageUrl !== undefined ? { selectedImageUrl: extras.selectedImageUrl } : {}),
          ...(extras?.generatedImageUrls !== undefined ? { generatedImageUrls: extras.generatedImageUrls } : {}),
          ...(extras?.videoPrompt !== undefined ? { videoPrompt: extras.videoPrompt } : {}),
          ...(extras?.videoUrl !== undefined ? { videoUrl: extras.videoUrl } : {}),
        }),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error || "Save failed");
      setUniverseRunId(json.runId);
      onRunsChanged?.();
      return json.runId;
    },
    [onRunsChanged],
  );

  async function uploadNeutralPhoto(files: FileList | File[] | null) {
    const list = Array.isArray(files) ? files : Array.from(files ?? []);
    if (!list.length) return;

    const pendingRows = list.map((file) => ({
      id: crypto.randomUUID(),
      blob: URL.createObjectURL(file),
      file,
    }));
    setPendingProductUploads((p) => [...p, ...pendingRows.map(({ id, blob }) => ({ id, blob }))]);

    setIsWorking(true);
    try {
      const uploaded: string[] = [];
      let lastError: string | null = null;
      for (const row of pendingRows) {
        try {
          const fd = new FormData();
          fd.set("file", row.file);
          const res = await fetch("/api/uploads", { method: "POST", body: fd });
          const raw = await res.text();
          const parsed = safeParseJson<{ url?: string; error?: string }>(raw);
          if (!res.ok || !parsed.ok) {
            throw new Error(parsed.ok ? parsed.value.error || `Upload failed (${res.status})` : parsed.error);
          }
          if (!parsed.value.url) throw new Error(parsed.value.error || "Upload failed: missing url");
          uploaded.push(parsed.value.url);
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Upload failed";
        } finally {
          URL.revokeObjectURL(row.blob);
          setPendingProductUploads((p) => p.filter((x) => x.id !== row.id));
        }
      }
      if (!uploaded.length) throw new Error(lastError || "Upload failed");
      const [first, ...rest] = uploaded;
      setNeutralUploadUrl(first);
      if (uploaded.length > 0) {
        setUserPhotoUrls((prev) => [...prev, ...uploaded]);
        setProductOnlyImageUrls((prev) => [...prev, ...uploaded]);
      }
      const ok = uploaded.length;
      const fail = list.length - ok;
      if (fail > 0) {
        toast.warning("Photos uploaded", {
          description: `${ok} uploaded, ${fail} failed${lastError ? ` (${lastError})` : ""}.`,
        });
      } else {
        toast.success(ok === 1 ? "Neutral product photo uploaded" : `${ok} product photos uploaded`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error("Upload error", { description: message });
    } finally {
      setIsWorking(false);
    }
  }

  async function uploadAdditionalPhoto(files: FileList | File[] | null) {
    const list = Array.isArray(files) ? files : Array.from(files ?? []);
    if (!list.length) return;
    const pendingRows = list.map((file) => ({
      id: crypto.randomUUID(),
      blob: URL.createObjectURL(file),
      file,
    }));
    setPendingProductUploads((p) => [...p, ...pendingRows.map(({ id, blob }) => ({ id, blob }))]);
    setIsUploadingAdditionalPhotos(true);
    let added = 0;
    let lastError: string | null = null;
    try {
      for (const row of pendingRows) {
        try {
          const fd = new FormData();
          fd.set("file", row.file);
          const res = await fetch("/api/uploads", { method: "POST", body: fd });
          const raw = await res.text();
          const parsed = safeParseJson<{ url?: string; error?: string }>(raw);
          if (!res.ok || !parsed.ok) {
            throw new Error(parsed.ok ? parsed.value.error || `Upload failed (${res.status})` : parsed.error);
          }
          if (!parsed.value.url) throw new Error(parsed.value.error || "Upload failed: missing url");
          const url = parsed.value.url;
          setUserPhotoUrls((prev) => [...prev, url]);
          setProductOnlyImageUrls((prev) => [...prev, url]);
          added++;
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Upload failed";
        } finally {
          URL.revokeObjectURL(row.blob);
          setPendingProductUploads((p) => p.filter((x) => x.id !== row.id));
        }
      }
      if (added > 0) {
        toast.success(added > 1 ? `${added} photos added` : "Photo added");
      }
      if (lastError && added < list.length) {
        toast.error("Some uploads failed", { description: lastError });
      }
    } finally {
      setIsUploadingAdditionalPhotos(false);
    }
  }

  function removeProductPhoto(url: string) {
    setProductOnlyImageUrls((prev) => prev.filter((u) => u !== url));
    setUserPhotoUrls((prev) => prev.filter((u) => u !== url));
    setAvatarPhotoUrls((prev) => prev.filter((u) => u !== url));
    if (neutralUploadUrl === url) setNeutralUploadUrl(null);
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = clipboardImageFiles(event);
      if (!files.length) return;
      event.preventDefault();
      void uploadAdditionalPhoto(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function addAvatarAsProductPhoto(avatarUrl: string) {
    const u = avatarUrl.trim();
    if (!u) return;
    setUserPhotoUrls((prev) => (prev.includes(u) ? prev : [...prev, u]));
    setProductOnlyImageUrls((prev) => (prev.includes(u) ? prev : [...prev, u]));
    setAvatarPhotoUrls((prev) => (prev.includes(u) ? prev : [...prev, u]));
    toast.success("Avatar photo added");
  }

  async function onAddCustomAngle() {
    const angle = customAngleInput.trim();
    if (!angle || !summaryText.trim()) return;
    setIsCustomAngleLoading(true);
    try {
      const res = await fetch("/api/gpt/ugc-custom-angle-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandBrief: summaryText,
          customAngle: angle,
          productImageUrls: resolvedProductUrlsForGpt(),
          videoDurationSeconds: 15,
        }),
      });
      const json = (await res.json()) as { data?: string; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Script generation failed");
      const newScript = json.data.trim();
      const headlineMatch = newScript.match(/ANGLE_HEADLINE:\s*(.+)/i);
      const headline = headlineMatch?.[1]?.trim() || angle;
      setPendingCustomAnglePreview({ headline, script: newScript, sourcePrompt: angle });
      setPendingCustomAngleEditing(false);
      setCustomAngleInput("");
      toast.success("Review the script below, then add it or discard.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate custom angle");
    } finally {
      setIsCustomAngleLoading(false);
    }
  }

  function confirmPendingCustomAngle() {
    const pending = pendingCustomAnglePreview;
    if (!pending) return;
    const headline = pending.headline.trim() || pending.sourcePrompt;
    const script = pending.script.trim();
    if (!script) {
      toast.error("Script is empty", { description: "Add text or discard and regenerate." });
      return;
    }
    const cleanedBody = script.replace(/^\s*SCRIPT\s+OPTION\s*\d+\b\s*\n*/i, "").trim();
    if (!cleanedBody) {
      toast.error("Script is empty", { description: "Add text or discard and regenerate." });
      return;
    }
    const currentOptions = splitAllScriptOptions(scriptsText);
    const nextNumber = currentOptions.length + 1;
    const merged = scriptsText.trim()
      ? `${scriptsText.trim()}\n\nSCRIPT OPTION ${nextNumber}\n\n${cleanedBody}`
      : `SCRIPT OPTION 1\n\n${cleanedBody}`;
    const nextLabels: [string, string, string] = [...angleLabels] as [string, string, string];
    const firstEmpty = nextLabels.findIndex((l) => !l.trim());
    if (firstEmpty >= 0 && firstEmpty < 3) nextLabels[firstEmpty as 0 | 1 | 2] = headline;

    setScriptsText(merged);
    setAngleLabels(nextLabels);
    setPendingCustomAnglePreview(null);
    setPendingCustomAngleEditing(false);
    void onSelectAngle(nextNumber - 1, { scriptsText: merged, angleLabels: nextLabels });
    toast.success(`Custom angle added as angle ${nextNumber} — selected; ready to generate.`);
  }

  function parseAngleSummaryToFactors(text: string) {
    const lines = String(text || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return {
      hook: lines[0] ?? "",
      problem: lines[1] ?? "",
      benefits: lines[2] ?? "",
      cta: lines[3] ?? "",
    };
  }

  const saveAngleSummaryEdit = useCallback(
    (index: number) => {
      const draft = (angleSummaryDrafts[index] ?? "").trim();
      if (!draft) {
        toast.error("Script cannot be empty.");
        return;
      }

      const prevBody = scriptOptionBodiesAll[index] ?? "";
      const { headline } = angleBlockForEditing(prevBody);
      const prevEditable = angleBlockForEditing(prevBody).editable;
      const prevFactors = splitScriptFactorsForUi(prevEditable, headline);
      const edited = parseAngleSummaryToFactors(draft);
      const nextFactors = {
        ...prevFactors,
        hook: edited.hook,
        problem: edited.problem,
        benefits: edited.benefits,
        cta: edited.cta,
      };

      const core = composeScriptFromFactors(nextFactors).trim();
      const withHeadline = headline?.trim() ? `ANGLE_HEADLINE: ${headline.trim()}\n\n${core}` : core;
      const nextBody = `SCRIPT OPTION ${index + 1}\n\n${withHeadline}`.trim();

      const nextOptions = [...scriptOptionBodiesAll];
      while (nextOptions.length <= index) nextOptions.push(`SCRIPT OPTION ${nextOptions.length + 1}`);
      nextOptions[index] = nextBody;
      const merged = composeScriptsFromOptions(nextOptions);
      setScriptsText(merged);

      if (selectedAngleIndex === index) {
        const { editable } = angleBlockForEditing(nextBody);
        setEditableScript(editable);
        setScriptFactors(splitScriptFactorsForUi(editable, headline));
        setScriptHasEdits(true);
      }

      toast.success(`Angle ${index + 1} updated.`);
    },
    [
      angleSummaryDrafts,
      composeScriptsFromOptions,
      scriptOptionBodiesAll,
      selectedAngleIndex,
      setScriptsText,
      setEditableScript,
      setScriptFactors,
      setScriptHasEdits,
    ],
  );

  function discardPendingCustomAngle() {
    const restore = pendingCustomAnglePreview?.sourcePrompt;
    setPendingCustomAnglePreview(null);
    setPendingCustomAngleEditing(false);
    if (restore) setCustomAngleInput(restore);
  }

  function patchPendingCustomAngle(updates: Partial<{ headline: string; script: string }>) {
    setPendingCustomAnglePreview((prev) => (prev ? { ...prev, ...updates } : null));
  }

  async function onSelectAngle(
    index: number,
    opts?: { scriptsText?: string; angleLabels?: [string, string, string] },
  ) {
    const url = storeUrl.trim();
    if (!url || !lastExtractedJson) return;

    const scriptsSrc = opts?.scriptsText ?? scriptsText;

    const selectedPipelineIdx: 0 | 1 | 2 = index === 0 || index === 1 || index === 2 ? index : 2;
    const prevIdx = prevAngleRef.current;
    const prevPipelineIdx: 0 | 1 | 2 | null =
      prevIdx === 0 || prevIdx === 1 || prevIdx === 2 ? prevIdx : prevIdx !== null ? 2 : null;
    const angleChanged = prevPipelineIdx !== null && prevPipelineIdx !== selectedPipelineIdx;

    let nextTriple: [LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1] = [
      cloneAnglePipeline(pipelineByAngle[0]),
      cloneAnglePipeline(pipelineByAngle[1]),
      cloneAnglePipeline(pipelineByAngle[2]),
    ];

    if (angleChanged && prevPipelineIdx !== null) {
      nextTriple[prevPipelineIdx] = captureActivePipeline();
    }

    const load = cloneAnglePipeline(nextTriple[selectedPipelineIdx]);

    if (angleChanged || prevIdx === null) {
      setPipelineByAngle(nextTriple);
      applyPipelineFromSnapshot(load);
      setNanoPollTaskId(null);
      setNanoPollingSlotIndex(null);
      setKlingPollTaskId(null);
      setKlingPollImageIndex(null);
    }

    prevAngleRef.current = selectedPipelineIdx;
    setSelectedAngleIndex(index);
    const raw = selectedScriptOptionByIndex(scriptsSrc, index);
    const { editable, headline } = angleBlockForEditing(raw);
    setEditableScript(editable);
    setScriptEditVisible(false);
    setScriptFactors(splitScriptFactorsForUi(editable, headline));
    setScriptHasEdits(false);

    const base = latestSnapRef.current;
    if (!base) return;

    const persistTriple: [LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1] = [
      cloneAnglePipeline(nextTriple[0]),
      cloneAnglePipeline(nextTriple[1]),
      cloneAnglePipeline(nextTriple[2]),
    ];
    if (angleChanged || prevIdx === null) {
      persistTriple[selectedPipelineIdx] = cloneAnglePipeline(load);
    } else {
      persistTriple[selectedPipelineIdx] = captureActivePipeline();
    }

    const activePipe = persistTriple[selectedPipelineIdx];
    const kn = normalizeKlingByReference({
      klingByReferenceIndex: activePipe.klingByReferenceIndex,
      klingVideoUrl: null,
      klingTaskId: null,
      nanoBananaSelectedImageIndex: activePipe.nanoBananaSelectedImageIndex,
    });
    const snap: LinkToAdUniverseSnapshotV1 = {
      ...base,
      selectedAngleIndex: index,
      linkToAdPipelineByAngle: persistTriple,
      ...flattenAnglePipeToTopLevel(activePipe, kn),
      ...(opts?.scriptsText !== undefined ? { scriptsText: opts.scriptsText } : {}),
      ...(opts?.angleLabels !== undefined ? { angleLabels: opts.angleLabels } : {}),
    };
    try {
      await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave());
    } catch {
      /* ignore */
    }
  }

  function packshotsForSave(): string[] {
    const pageUrl = storeUrl.trim();
    if (!pageUrl) {
      const u = resolvedPreviewUrl;
      return u && /^https?:\/\//i.test(u) ? [u] : [];
    }
    const candidates = buildProductCandidatesForGeneration();
    const gpt = productUrlsForGpt({
      pageUrl,
      neutralUploadUrl,
      candidateUrls: candidates,
      fallbackUrl: fallbackImageUrl,
    });
    if (gpt.length > 0) return gpt;
    const u = resolvedPreviewUrl;
    return u && /^https?:\/\//i.test(u) ? [u] : [];
  }

  function resolvedProductUrlsForGpt(): string[] {
    const pageUrl = storeUrl.trim();
    const candidates = buildProductCandidatesForGeneration();
    return productUrlsForGpt({
      pageUrl: pageUrl || "",
      neutralUploadUrl,
      candidateUrls: candidates,
      fallbackUrl: fallbackImageUrl,
    });
  }

  /**
   * Prefer the most recently uploaded user photos (avatar or manual uploads),
   * then fall back to discovered product packshots.
   */
  function buildProductCandidatesForGeneration(): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (u: string) => {
      const t = (u || "").trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };

    for (let i = userPhotoUrls.length - 1; i >= 0; i--) push(userPhotoUrls[i]);
    for (let i = productOnlyImageUrls.length - 1; i >= 0; i--) push(productOnlyImageUrls[i]);
    if (out.length === 0 && cleanCandidate?.url) push(cleanCandidate.url);
    return out;
  }

  /** Resume after a save stopped at brand brief (scripts step failed or interrupted). Runs on the server so navigation does not cancel it. */
  async function onContinueScripts() {
    const url = storeUrl.trim();
    if (!url || !lastExtractedJson || !summaryText.trim()) {
      toast.error("Incomplete data to generate scripts.");
      return;
    }
    if (!universeRunId) {
      toast.error("No saved project yet. Run Generate from URL first.");
      return;
    }

    setIsWorking(true);
    setStage("writing_scripts");
    try {
      const res = await fetch("/api/link-to-ad/continue-scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: universeRunId }),
      });
      const json = (await res.json()) as { runId?: string; error?: string; scriptsStepOk?: boolean };
      if (!res.ok || !json.runId) {
        throw new Error(json.error || "Continue scripts failed");
      }
      const getRes = await fetch(`/api/runs/get?runId=${encodeURIComponent(json.runId)}`, { cache: "no-store" });
      const getJson = (await getRes.json()) as {
        data?: { id: string; store_url?: string | null; title?: string | null; extracted?: unknown };
        error?: string;
      };
      if (!getRes.ok || !getJson.data) {
        throw new Error(getJson.error || "Could not reload project");
      }
      hydrateFromRun(getJson.data, { silent: true });
      setStage("ready");
      toast.success("3 UGC scripts ready");
      onRunsChanged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scripts step failed";
      toast.warning("Script generation failed", { description: msg });
      setStage("ready");
    } finally {
      setIsWorking(false);
    }
  }

  async function onRegenerateMarketingAngles() {
    const url = storeUrl.trim();
    if (!url || !lastExtractedJson || !summaryText.trim()) {
      toast.error("Incomplete data to regenerate angles.");
      return;
    }
    if (!universeRunId) {
      toast.error("No saved project yet. Run Generate from URL first.");
      return;
    }

    const walletNow = creditsBalanceRef.current;
    setLtaFrozenCredits(walletNow);
    if (!spendLtaCreditsIfEnough(2)) {
      setLtaFrozenCredits(null);
      return;
    }

    setIsWorking(true);
    setStage("writing_scripts");
    try {
      const res = await fetch("/api/gpt/ugc-scripts-from-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeUrl: url,
          productTitle: extractedTitle,
          brandBrief: summaryText.trim(),
          previousScriptsText: scriptsText.trim(),
          productImageUrls: resolvedProductUrlsForGpt(),
          videoDurationSeconds: 15,
          generationMode,
          customUgcIntent: composeCustomUgcIntent(customUgcTopic, customUgcOffer, customUgcCta),
        }),
      });
      const json = (await res.json()) as { data?: string; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Regenerate scripts failed");
      const nextScripts = String(json.data);
      const nextLabels = deriveAngleLabelsFromScripts(nextScripts);

      // Reset downstream generations to avoid mixing prompts/images/videos across different scripts.
      setScriptsText(nextScripts);
      setAngleLabels(nextLabels);
      setSelectedAngleIndex(0);
      setNanoBananaPromptsRaw("");
      setNanoBananaSelectedPromptIndex(0);
      setNanoBananaTaskId(null);
      setNanoBananaImageUrl(null);
      setNanoBananaImageUrls([]);
      setNanoBananaSelectedImageIndex(null);
      setUgcVideoPromptGpt("");
      setKlingByRef(createEmptyKlingByReference());
      setNanoPollTaskId(null);
      setNanoPollingSlotIndex(null);
      setKlingPollTaskId(null);
      setKlingPollImageIndex(null);
      setUserStartedVideoFromImage(false);
      setVideoStageMode(false);
      prevAngleRef.current = null;
      setPipelineByAngle([emptyAnglePipeline(), emptyAnglePipeline(), emptyAnglePipeline()]);

      // Persist updated scripts back to the project.
      const base = latestSnapRef.current;
      if (base) {
        const activePipe = emptyAnglePipeline();
        const kn = normalizeKlingByReference({
          klingByReferenceIndex: activePipe.klingByReferenceIndex,
          klingVideoUrl: null,
          klingTaskId: null,
          nanoBananaSelectedImageIndex: activePipe.nanoBananaSelectedImageIndex,
        });
        const snap: LinkToAdUniverseSnapshotV1 = {
          ...base,
          scriptsText: nextScripts,
          angleLabels: nextLabels,
          selectedAngleIndex: 0,
          linkToAdPipelineByAngle: [emptyAnglePipeline(), emptyAnglePipeline(), emptyAnglePipeline()],
          ...flattenAnglePipeToTopLevel(activePipe, kn),
        };
        try {
          await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave());
        } catch {
          /* ignore */
        }
      }

      // Hydrate editor state for angle 1.
      void onSelectAngle(0, { scriptsText: nextScripts, angleLabels: nextLabels });
      toast.success("3 new angles ready");
      setStage("ready");
    } catch (err) {
      // Refund credits if regeneration fails.
      if (!isPersonalApiActive()) {
        grantCredits(2);
        creditsBalanceRef.current += 2;
        setLtaFrozenCredits(null);
      }
      const msg = err instanceof Error ? err.message : "Regenerate failed";
      toast.warning("Could not regenerate angles", { description: msg });
      setStage("ready");
    } finally {
      setIsWorking(false);
    }
  }

  async function onRun(opts?: { bypassSavedProject?: boolean }) {
    const url = storeUrl.trim();
    if (!url) {
      toast.error("Missing URL");
      return;
    }

    /** Re-run step 1: do not reuse neutral upload (UI should clear like the brief). */
    const userUploadedImageUrl = opts?.bypassSavedProject ? null : neutralUploadUrl;

    /** Saved run for this URL hydrates in place unless bypass (redo step 1). */
    const tryHydrateFromSavedRun = !opts?.bypassSavedProject;

    // Loader + status bar from first click (before find-by-url, which had no isWorking).
    setIsWorking(true);
    setStage("scanning");

    if (tryHydrateFromSavedRun) {
      try {
        const findRes = await fetch(`/api/runs/find-by-store-url?url=${encodeURIComponent(url)}`, { cache: "no-store" });
        const findJson = (await findRes.json()) as { data?: { id: string; store_url?: string; title?: string | null; extracted?: unknown } };
        if (findRes.ok && findJson.data) {
          const snap = readUniverseFromExtracted(findJson.data.extracted);
          if (snap) {
            hydrateFromRun(findJson.data);
            setStage("ready");
            setIsWorking(false);
            return;
          }
        }
      } catch {
        /* continue fresh scan */
      }
    }

    const walletNow = creditsBalanceRef.current;
    if (walletNow < CREDITS_LINK_TO_AD_GENERATE_FROM_URL) {
      setIsWorking(false);
      setStage("idle");
      setLtaCreditModal({
        current: walletNow,
        required: CREDITS_LINK_TO_AD_GENERATE_FROM_URL,
      });
      return;
    }
    let chargedFullBundle = false;
    setLtaFrozenCredits(walletNow);
    if (!spendLtaCreditsIfEnough(CREDITS_LINK_TO_AD_GENERATE_FROM_URL)) {
      setIsWorking(false);
      setStage("idle");
      setLtaFrozenCredits(null);
      return;
    }
    chargedFullBundle = true;

    setSummaryText("");
    setScriptsText("");
    setPendingCustomAnglePreview(null);
    setCustomAngleInput("");
    setAngleLabels(["", "", ""]);
    setSelectedAngleIndex(null);
    if (opts?.bypassSavedProject) {
      setNeutralUploadUrl(null);
    }
    setUniverseRunId(null);
    setLastExtractedJson(null);
    setExtractedTitle(null);
    setCleanCandidate(null);
    setFallbackImageUrl(null);
    setConfidence(null);
    setProductOnlyImageUrls([]);
    setImgError(false);
    setNanoBananaPromptsRaw("");
    setNanoBananaSelectedPromptIndex(0);
    setNanoBananaTaskId(null);
    setNanoBananaImageUrl(null);
    setNanoBananaImageUrls([]);
    setNanoBananaSelectedImageIndex(null);
    setUgcVideoPromptGpt("");
    setKlingByRef(createEmptyKlingByReference());
    setNanoPollTaskId(null);
    setNanoPollingSlotIndex(null);
    setKlingPollTaskId(null);
    setKlingPollImageIndex(null);
    setUserStartedVideoFromImage(false);
    setVideoStageMode(false);
    prevAngleRef.current = null;
    setPipelineByAngle([emptyAnglePipeline(), emptyAnglePipeline(), emptyAnglePipeline()]);

    try {
      setStage("server_pipeline");
      setServerPipelineStepIndex(0);
      const pipeResult = await runInitialPipeline(
        browserPipelineFetch,
        {
          storeUrl: url,
          neutralUploadUrl: userUploadedImageUrl,
          generationMode,
          customUgcIntent: composeCustomUgcIntent(customUgcTopic, customUgcOffer, customUgcCta),
        },
        (step) => setServerPipelineStepIndex(step),
      );

      if (!pipeResult.ok) {
        if (pipeResult.runId) {
          const getRes = await fetch(`/api/runs/get?runId=${encodeURIComponent(pipeResult.runId)}`, {
            cache: "no-store",
          });
          const getJson = (await getRes.json()) as {
            data?: { id: string; store_url?: string | null; title?: string | null; extracted?: unknown };
            error?: string;
          };
          if (getRes.ok && getJson.data) {
            hydrateFromRun(getJson.data, { silent: true });
            toast.message("Pipeline stopped early", {
              description: pipeResult.error || "Partial data was saved. Check your project.",
            });
            setStage("ready");
            onRunsChanged?.();
            return;
          }
        }
        throw new Error(pipeResult.error || "Initial pipeline failed");
      }

      const getRes = await fetch(`/api/runs/get?runId=${encodeURIComponent(pipeResult.runId)}`, { cache: "no-store" });
      const getJson = (await getRes.json()) as {
        data?: { id: string; store_url?: string | null; title?: string | null; extracted?: unknown };
        error?: string;
      };
      if (!getRes.ok || !getJson.data) {
        throw new Error(getJson.error || "Could not reload project after pipeline");
      }
      hydrateFromRun(getJson.data, { silent: true });
      setStage("ready");
      toast.success("Project saved");
      if (pipeResult.scriptsStepOk) {
        toast.success("3 UGC scripts ready");
      } else if (pipeResult.scriptsError) {
        toast.warning("Scripts step failed", { description: pipeResult.scriptsError });
      }
      onRunsChanged?.();
    } catch (err) {
      if (chargedFullBundle) {
        grantCredits(CREDITS_LINK_TO_AD_GENERATE_FROM_URL);
        creditsBalanceRef.current += CREDITS_LINK_TO_AD_GENERATE_FROM_URL;
        setLtaFrozenCredits(null);
      }
      setStage("error");
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error("Universe error", { description: message });
    } finally {
      setServerPipelineStepIndex(null);
      setIsWorking(false);
    }
  }

  async function onGenerateNanoBananaPrompts(angleIdx?: number | null) {
    const url = storeUrl.trim();
    const idx = angleIdx !== undefined && angleIdx !== null ? angleIdx : selectedAngleIndex;
    const selectedScript = selectedScriptOptionByIndex(scriptsText, idx);
    const script = (idx === selectedAngleIndex ? editableScript : selectedScript).trim() || selectedScript;
    const candidates = buildProductCandidatesForGeneration();
    const avatarRefs = userPhotoUrls
      .map((u) => u.trim())
      .filter((u, i, arr) => /^https?:\/\//i.test(u) && arr.indexOf(u) === i)
      .slice(-3)
      .reverse();
    const img = pickBestProductUrlForNanoBanana({
      pageUrl: url,
      neutralUploadUrl,
      candidateUrls: candidates,
      fallbackUrl: fallbackImageUrl,
    });
    if (!url || !lastExtractedJson || idx === null || !script.trim()) {
      toast.error("Pick an angle and make sure the script is ready.");
      return;
    }
    if (!img || !/^https?:\/\//i.test(img)) {
      toast.error("HTTPS product image is required (missing preview or relative URL).");
      return;
    }
    setIsNanoPromptsLoading(true);
    setIsNanoAllImagesSubmitting(false);
    let text = "";
    try {
      nanoPromptsAbortRef.current?.abort();
      const controller = new AbortController();
      nanoPromptsAbortRef.current = controller;
      const res = await fetch("/api/gpt/nanobanana-ugc-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          marketingScript: script,
          productImageUrl: img,
          avatarImageUrls: avatarRefs,
          generationMode,
          customUgcIntent: composeCustomUgcIntent(customUgcTopic, customUgcOffer, customUgcCta),
        }),
      });
      const json = (await res.json()) as { data?: string; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Image prompts failed");
      text = String(json.data);
      setNanoBananaPromptsRaw(text);
      setNanoBananaSelectedPromptIndex(0);
      setNanoBananaImageUrl(null);
      setNanoBananaImageUrls([]);
      setNanoBananaSelectedImageIndex(null);
      setKlingByRef(createEmptyKlingByReference());
      const sel = selectedAngleIndex;
      const selPipelineIdx: 0 | 1 | 2 =
        sel === 0 || sel === 1 || sel === 2 ? sel : sel !== null ? 2 : 0;
      const triple: [LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1] = [
        cloneAnglePipeline(pipelineByAngle[0]),
        cloneAnglePipeline(pipelineByAngle[1]),
        cloneAnglePipeline(pipelineByAngle[2]),
      ];
      triple[selPipelineIdx] = {
        ...emptyAnglePipeline(),
        nanoBananaPromptsRaw: text,
        nanoBananaSelectedPromptIndex: 0,
      };
      setPipelineByAngle(triple);
      const base = latestSnapRef.current;
      if (base && lastExtractedJson) {
        const snap = snapshotWithPersistTriple(base, triple, sel);
        await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
          imagePrompt: text,
        });
      }
      toast.success("3 image prompts saved.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("Image prompts", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setIsNanoPromptsLoading(false);
    }
  }

  async function onGenerateNanoBananaImage() {
    const url = storeUrl.trim();
    const candidates =
      productOnlyImageUrls.length > 0
        ? productOnlyImageUrls
        : cleanCandidate?.url
          ? [cleanCandidate.url]
          : [];
    const img = pickBestProductUrlForNanoBanana({
      pageUrl: url,
      neutralUploadUrl,
      candidateUrls: candidates,
      fallbackUrl: fallbackImageUrl,
    });
    const prompt = parsedNanoPrompts[nanoBananaSelectedPromptIndex]?.trim();
    if (!url || !lastExtractedJson || !prompt) {
      toast.error("Generate the 3 image prompts first, then choose a valid prompt.");
      return;
    }
    if (!img || !/^https?:\/\//i.test(img)) {
      toast.error("Product image missing or not HTTPS.");
      return;
    }
    setIsNanoImageSubmitting(true);
    lastNanoImagePromptRef.current = prompt;
    lastNanoImagePromptIndexRef.current = nanoBananaSelectedPromptIndex;
    try {
      nanoImageAbortRef.current?.abort();
      const controller = new AbortController();
      nanoImageAbortRef.current = controller;
      const res = await fetch("/api/nanobanana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          accountPlan: planId,
          model: "pro",
          prompt,
          imageUrls: [img],
          resolution: "2K",
          aspectRatio: "9:16",
          personalApiKey: getPersonalApiKey(),
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Image generation failed");
      setNanoBananaTaskId(json.taskId);
      setNanoPollTaskId(json.taskId);
      setNanoPollingSlotIndex(nanoBananaSelectedPromptIndex);
      const base = latestSnapRef.current;
      if (base && lastExtractedJson) {
        const triple = buildPersistTriplePatchingActive({
          nanoBananaTaskId: json.taskId,
          nanoBananaImageUrl: null,
          nanoBananaImageUrls: [],
          nanoBananaSelectedImageIndex: null,
        });
        setPipelineByAngle(triple);
        const snap = snapshotWithPersistTriple(base, triple);
        await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
          imagePrompt: prompt,
        });
      }
      toast.success("Image generation started");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("Image generation", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsNanoImageSubmitting(false);
    }
  }

  async function pollNanoBananaTaskForUrls(taskId: string): Promise<string[]> {
    // Poll NanoBanana task until successFlag indicates completion.
    // We keep it simple for pro image generation: take the first URL from the response.
    const sleepMs = 4000;
    // ~12 minutes max wait (enough for most generations).
    const maxAttempts = Math.ceil((12 * 60 * 1000) / sleepMs);
    const pKey = getPersonalApiKey();
    const keyParam = pKey ? `&personalApiKey=${encodeURIComponent(pKey)}` : "";
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${keyParam}`, {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json()) as any;
      if (!res.ok || !json.data) throw new Error(json.error || "Generation status check failed");
      const s = json.data.successFlag ?? 0;
      if (s === 0) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, sleepMs));
        continue;
      }
      if (s === 1) {
        const resp = json.data.response ?? {};
        const candidates: unknown[] = [
          (resp as { resultImageUrl?: unknown }).resultImageUrl,
          (resp as { resultUrls?: unknown }).resultUrls,
          (resp as { resultUrl?: unknown }).resultUrl,
          (resp as { result_url?: unknown }).result_url,
          (resp as { resultImageUrls?: unknown }).resultImageUrls,
        ];
        const urls = candidates.flatMap((v) => {
          if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
          if (typeof v === "string") return [v];
          return [];
        });
        if (!urls.length) throw new Error("Generation finished but image URLs are missing.");
        return urls;
      }
      throw new Error(json.data.errorMessage || `Generation failed (successFlag=${String(s)})`);
    }
    throw new Error("Image generation timed out.");
  }

  /** Run 3 NanoBanana Pro jobs sequentially; returns URLs in prompt order. */
  async function runNanoBananaProThreeSequential(
    img: string,
    prompts: [string, string, string],
  ): Promise<{ urlsByPrompt: string[]; lastTaskId: string | null }> {
    const urlsByPrompt: string[] = [];
    let lastTaskId: string | null = null;
    for (let i = 0; i < 3; i++) {
      const prompt = prompts[i];
      lastNanoImagePromptRef.current = prompt;
      lastNanoImagePromptIndexRef.current = i as 0 | 1 | 2;
      const res = await fetch("/api/nanobanana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountPlan: planId,
          model: "pro",
          prompt,
          imageUrls: [img],
          resolution: "2K",
          aspectRatio: "9:16",
          personalApiKey: getPersonalApiKey(),
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Image generation failed");
      lastTaskId = json.taskId;
      const urls = await pollNanoBananaTaskForUrls(json.taskId);
      urlsByPrompt[i] = urls[0];
    }
    return { urlsByPrompt, lastTaskId };
  }

  async function persistNanoThreeGeneratedImages(
    url: string,
    prompts: [string, string, string],
    urlsByPrompt: string[],
    lastTaskId: string | null,
  ) {
    setNanoBananaImageUrls(urlsByPrompt);
    setNanoBananaSelectedImageIndex(null);
    setNanoBananaSelectedPromptIndex(0);
    setNanoBananaTaskId(lastTaskId);
    setNanoBananaImageUrl(null);
    setUgcVideoPromptGpt("");
    setKlingByRef(createEmptyKlingByReference());
    setKlingPollTaskId(null);
    setKlingPollImageIndex(null);
    setUserStartedVideoFromImage(false);
    setVideoStageMode(false);
    const base = latestSnapRef.current;
    if (base && lastExtractedJson) {
      const triple = buildPersistTriplePatchingActive({
        nanoBananaTaskId: lastTaskId,
        nanoBananaImageUrl: null,
        nanoBananaImageUrls: urlsByPrompt,
        nanoBananaSelectedImageIndex: null,
        nanoBananaSelectedPromptIndex: 0,
        ugcVideoPromptGpt: "",
        klingByReferenceIndex: createEmptyKlingByReference(),
        videoStageMode: false,
      });
      setPipelineByAngle(triple);
      const snap = snapshotWithPersistTriple(base, triple);
      await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
        selectedImageUrl: null,
        generatedImageUrls: urlsByPrompt,
        videoPrompt: "",
        videoUrl: null,
      });
    }
  }

  async function onGenerateNanoBananaImagesFromAllPrompts() {
    const url = storeUrl.trim();
    const candidates = buildProductCandidatesForGeneration();
    const img = pickBestProductUrlForNanoBanana({
      pageUrl: url,
      neutralUploadUrl,
      candidateUrls: candidates,
      fallbackUrl: fallbackImageUrl,
    });
    if (!url || !lastExtractedJson || selectedAngleIndex === null) {
      toast.error("Project not ready to generate images.");
      return;
    }
    if (!img || !/^https?:\/\//i.test(img)) {
      toast.error("HTTPS product image is required to generate images.");
      return;
    }
    if (!nanoBananaPromptsRaw.trim()) {
      toast.error("Generate the 3 image prompts first.");
      return;
    }
    const prompts = parsedNanoPrompts.map((p) => p.trim());
    if (!prompts[0] || !prompts[1] || !prompts[2]) {
      toast.error("Some image prompts are missing.");
      return;
    }
    setIsNanoAllImagesSubmitting(true);
    try {
      nanoThreeAbortRef.current?.abort();
      const controller = new AbortController();
      nanoThreeAbortRef.current = controller;
      const { urlsByPrompt, lastTaskId } = await runNanoBananaProThreeSequential(img, prompts as [string, string, string]);

      if (!urlsByPrompt[0] || !urlsByPrompt[1] || !urlsByPrompt[2]) {
        throw new Error("Image generation did not produce 3 images.");
      }

      await persistNanoThreeGeneratedImages(url, prompts as [string, string, string], urlsByPrompt, lastTaskId);

      toast.success("3 images generated");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("Image generation", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsNanoAllImagesSubmitting(false);
    }
  }

  async function onSelectNanoBananaImage(idx: 0 | 1 | 2) {
    const url = storeUrl.trim();
    if (!url || !lastExtractedJson) return;
    if (!nanoBananaImageUrls[idx]) return;
    const selectedUrl = nanoBananaImageUrls[idx];
    const prompt = parsedNanoPrompts[idx]?.trim() || "";

    const slotsAfterSave = klingByRef.map((s) => ({
      ...s,
      history: [...(s.history || [])],
    }));
    if (nanoBananaSelectedImageIndex !== null) {
      const ci = nanoBananaSelectedImageIndex;
      slotsAfterSave[ci] = {
        ...slotsAfterSave[ci],
        ugcVideoPrompt: ugcVideoPromptGpt || undefined,
      };
    }
    const slot = slotsAfterSave[idx];
    const promptForNew = slot.ugcVideoPrompt ?? "";

    setKlingByRef(slotsAfterSave);
    setUgcVideoPromptGpt(promptForNew);
    setUserStartedVideoFromImage(
      Boolean(
        promptForNew.trim() ||
          slot.videoUrl?.trim() ||
          slot.taskId?.trim() ||
          (slot.history && slot.history.length > 0),
      ),
    );

    setNanoBananaSelectedImageIndex(idx);
    setNanoBananaSelectedPromptIndex(idx);
    setNanoBananaImageUrl(selectedUrl);
    lastNanoImagePromptRef.current = prompt;
    lastNanoImagePromptIndexRef.current = idx;

    const base = latestSnapRef.current;
    if (!base) return;
    const mirror = slotsAfterSave[idx];
    const triple = buildPersistTriplePatchingActive({
      nanoBananaSelectedImageIndex: idx,
      nanoBananaSelectedPromptIndex: idx,
      nanoBananaImageUrl: selectedUrl,
      nanoBananaImageUrls: [...nanoBananaImageUrls],
      ugcVideoPromptGpt: promptForNew,
      klingByReferenceIndex: slotsAfterSave.map((s) => ({
        videoUrl: s.videoUrl ?? null,
        taskId: s.taskId ?? null,
        history: [...(s.history || [])],
        ugcVideoPrompt: s.ugcVideoPrompt,
      })),
    });
    setPipelineByAngle(triple);
    const snap = snapshotWithPersistTriple(base, triple);
    const snapWithMirror: LinkToAdUniverseSnapshotV1 = {
      ...snap,
      klingTaskId: mirror.taskId ?? null,
      klingVideoUrl: mirror.videoUrl ?? null,
    };
    try {
      await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snapWithMirror, packshotsForSave(), {
        imagePrompt: prompt || undefined,
        selectedImageUrl: selectedUrl,
        generatedImageUrls: nanoBananaImageUrls,
        videoPrompt: promptForNew,
        videoUrl: mirror.videoUrl ?? null,
      });
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!nanoPollTaskId) return;
    const taskId = nanoPollTaskId;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const nKey = getPersonalApiKey();
        const nParam = nKey ? `&personalApiKey=${encodeURIComponent(nKey)}` : "";
        const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${nParam}`, { cache: "no-store" });
        const json = (await res.json()) as {
          data?: { successFlag?: number; response?: Record<string, unknown>; errorMessage?: string };
          error?: string;
        };
        if (!res.ok || !json.data) throw new Error(json.error || "Poll failed");
        if (cancelled) return;
        const s = json.data.successFlag ?? 0;
        if (s === 0) return;
        if (s === 1) {
          const resp = json.data.response ?? {};
          const candidates: unknown[] = [
            (resp as { resultImageUrl?: unknown }).resultImageUrl,
            (resp as { resultUrls?: unknown }).resultUrls,
            (resp as { resultUrl?: unknown }).resultUrl,
            (resp as { result_url?: unknown }).result_url,
            (resp as { resultImageUrls?: unknown }).resultImageUrls,
          ];
          const urls = candidates.flatMap((v) => {
            if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
            if (typeof v === "string") return [v];
            return [];
          });
          if (!urls.length) throw new Error("Image ready but URL missing.");
          const first = urls[0];
          const rawSlot = lastNanoImagePromptIndexRef.current;
          const pIdx: 0 | 1 | 2 = rawSlot === 0 || rawSlot === 1 || rawSlot === 2 ? rawSlot : 0;
          let merged: string[] = [];
          setNanoBananaImageUrls((prev) => {
            merged = mergeNanoUrlIntoThreeSlots(prev, pIdx, first);
            return merged;
          });
          setNanoBananaImageUrl(first);
          setNanoBananaSelectedImageIndex(pIdx);
          setNanoPollTaskId(null);
          setNanoPollingSlotIndex(null);
          const url0 = storeUrl.trim();
          const base = latestSnapRef.current;
          if (base && lastExtractedJson && url0) {
            const chosen = lastNanoImagePromptRef.current.trim();
            const triple = buildPersistTriplePatchingActive({
              nanoBananaImageUrl: first,
              nanoBananaImageUrls: merged,
              nanoBananaSelectedImageIndex: pIdx,
              nanoBananaTaskId: taskId,
            });
            setPipelineByAngle(triple);
            const snap = snapshotWithPersistTriple(base, triple);
            try {
              await persistUniverse(universeRunId, url0, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
                imagePrompt: chosen || undefined,
                selectedImageUrl: first,
                generatedImageUrls: merged.filter(Boolean),
              });
            } catch (e) {
              toast.error("Save failed", {
                description: e instanceof Error ? e.message : "Unknown error",
              });
            }
          }
          toast.success("Image saved");
          if (interval) clearInterval(interval);
          interval = null;
          return;
        }
        throw new Error(json.data.errorMessage || `Image generation failed: ${String(s)}`);
      } catch (err) {
        if (cancelled) return;
        toast.error("Image generation", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        setNanoPollTaskId(null);
        setNanoPollingSlotIndex(null);
        if (interval) clearInterval(interval);
        interval = null;
      }
    }

    tick();
    interval = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick uses latest closure via refs where needed
  }, [nanoPollTaskId]);

  async function onGenerateUgcVideoPrompt(): Promise<string | null> {
    const url = storeUrl.trim();
    const script = selectedScriptOptionByIndex(scriptsText, selectedAngleIndex);
    if (!url || !lastExtractedJson || selectedAngleIndex === null || !script.trim()) {
      toast.error("Angle script is missing.");
      return null;
    }
    setIsVideoPromptLoading(true);
    try {
      videoPromptAbortRef.current?.abort();
      const controller = new AbortController();
      videoPromptAbortRef.current = controller;
      const res = await fetch("/api/gpt/ugc-i2v-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ angleScript: script }),
      });
      const json = (await res.json()) as { data?: string; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Video prompt failed");
      const text = String(json.data);
      setUgcVideoPromptGpt(text);
      const nextSections = splitVideoPromptSectionsForUi(text);
      setVideoPromptSections(nextSections);
      setEditableVideoPrompt(composeVideoPromptFromSections(nextSections));
      setVideoPromptInlineEdit(false);
      setVideoPromptHasEdits(false);
      setVideoPromptEditVisible(true);
      const idx = nanoBananaSelectedImageIndex;
      if (idx === 0 || idx === 1 || idx === 2) {
        patchKlingSlot(idx, { ugcVideoPrompt: text });
      }
      const base = latestSnapRef.current;
      if (base && lastExtractedJson) {
        const nextSlots = klingByRef.map((s, i) => ({
          videoUrl: s.videoUrl ?? null,
          taskId: s.taskId ?? null,
          history: [...(s.history || [])],
          ugcVideoPrompt: i === idx ? text : s.ugcVideoPrompt,
        }));
        const triple = buildPersistTriplePatchingActive({
          ugcVideoPromptGpt: text,
          klingByReferenceIndex: nextSlots,
        });
        setPipelineByAngle(triple);
        const snap = snapshotWithPersistTriple(base, triple);
        await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snap, packshotsForSave(), {
          videoPrompt: text,
        });
      }
      toast.success("Video prompt saved");
      return text;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      toast.error("Video prompt", { description: e instanceof Error ? e.message : "Unknown error" });
      return null;
    } finally {
      setIsVideoPromptLoading(false);
    }
  }

  async function onGenerateKlingVideo(overrideVideoPrompt?: string) {
    const url = storeUrl.trim();
    const img = nanoBananaImageUrl;
    const prompt = (overrideVideoPrompt ?? ugcVideoPromptGpt).trim();
    const idx = nanoBananaSelectedImageIndex;
    if (!url || !lastExtractedJson || !img || !prompt || idx === null) {
      toast.error("Reference image and video prompt are required.");
      return;
    }
    setIsKlingSubmitting(true);
    const klingPrompt = withAudioHint(prompt);
    lastKlingVideoPromptRef.current = klingPrompt;
    try {
      klingAbortRef.current?.abort();
      const controller = new AbortController();
      klingAbortRef.current = controller;
      const res = await fetch("/api/kling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          marketModel: "bytedance/seedance-2.0-pro",
          prompt: klingPrompt,
          imageUrl: img,
          duration: 15,
          aspectRatio: "9:16",
          personalApiKey: getPersonalApiKey(),
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Video generation failed");
      const nextSlots = klingByRef.map((s, i) => ({
        ...s,
        history: [...(s.history || [])],
      }));
      nextSlots[idx] = { ...nextSlots[idx], taskId: json.taskId };
      setKlingByRef(nextSlots);
      const ang =
        selectedAngleIndex === 0 || selectedAngleIndex === 1 || selectedAngleIndex === 2 ? selectedAngleIndex : 0;
      klingPollAngleRef.current = ang;
      klingPollSlotsRef.current = nextSlots.map((s) => ({
        videoUrl: s.videoUrl ?? null,
        taskId: s.taskId ?? null,
        history: [...(s.history || [])],
        ugcVideoPrompt: s.ugcVideoPrompt,
      }));
      setKlingPollTaskId(json.taskId);
      setKlingPollImageIndex(idx);
      const base = latestSnapRef.current;
      if (base && lastExtractedJson) {
        const triple = buildPersistTriplePatchingActive({
          klingByReferenceIndex: nextSlots.map((s) => ({
            videoUrl: s.videoUrl ?? null,
            taskId: s.taskId ?? null,
            history: [...(s.history || [])],
            ugcVideoPrompt: s.ugcVideoPrompt,
          })),
        });
        setPipelineByAngle(triple);
        const snap = snapshotWithPersistTriple(base, triple);
        const snapOut: LinkToAdUniverseSnapshotV1 = {
          ...snap,
          klingTaskId: json.taskId,
          klingVideoUrl: nextSlots[idx].videoUrl ?? null,
        };
        await persistUniverse(universeRunId, url, extractedTitle, lastExtractedJson, snapOut, packshotsForSave(), {
          videoPrompt: klingPrompt,
        });
      }
      toast.success("Video generation started");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("Video", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setIsKlingSubmitting(false);
    }
  }

  const klingSlotSignature = useMemo(
    () => klingByRef.map((s) => `${s.taskId ?? ""}|${s.videoUrl ?? ""}`).join(";"),
    [klingByRef],
  );

  useEffect(() => {
    klingResumeAttemptedRef.current = false;
  }, [klingSlotSignature]);

  /** Resume KIE polling if the user left during generation (task saved, poll was cancelled on unmount). */
  useEffect(() => {
    if (klingPollTaskId) return;
    if (klingResumeAttemptedRef.current) return;
    for (let i = 0; i < 3; i++) {
      const slot = klingByRef[i];
      const tid = slot.taskId?.trim();
      const vid = slot.videoUrl?.trim();
      if (tid && !vid) {
        klingResumeAttemptedRef.current = true;
        const ang =
          selectedAngleIndex === 0 || selectedAngleIndex === 1 || selectedAngleIndex === 2 ? selectedAngleIndex : 0;
        klingPollAngleRef.current = ang;
        klingPollSlotsRef.current = klingByRef.map((s) => ({
          videoUrl: s.videoUrl ?? null,
          taskId: s.taskId ?? null,
          history: [...(s.history || [])],
          ugcVideoPrompt: s.ugcVideoPrompt,
        }));
        setKlingPollTaskId(tid);
        setKlingPollImageIndex(i as 0 | 1 | 2);
        return;
      }
    }
  }, [klingByRef, klingPollTaskId]);

  useEffect(() => {
    if (!klingPollTaskId || klingPollImageIndex === null) return;
    const taskId = klingPollTaskId;
    const slotIndex = klingPollImageIndex;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const kKey = getPersonalApiKey();
        const kParam = kKey ? `&personalApiKey=${encodeURIComponent(kKey)}` : "";
        const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}${kParam}`, { cache: "no-store" });
        const json = (await res.json()) as {
          data?: { status?: string; response?: string[]; error_message?: string };
          error?: string;
        };
        if (!res.ok || !json.data) throw new Error(json.error || "Poll failed");
        if (cancelled) return;
        const s = json.data.status ?? "IN_PROGRESS";
        if (s === "IN_PROGRESS") return;
        if (s === "SUCCESS") {
          const vUrl = json.data.response?.[0];
          if (!vUrl) throw new Error("Video OK but URL missing.");
          klingMergedSnapRef.current = null;
          setKlingByRef((prev) => {
            const base = latestSnapRef.current;
            if (!base) return prev;
            const angleIdx = klingPollAngleRef.current ?? 0;
            const slotsFromPoll =
              klingPollSlotsRef.current?.map((s) => ({
                videoUrl: s.videoUrl ?? null,
                taskId: s.taskId ?? null,
                history: [...(s.history || [])],
                ugcVideoPrompt: s.ugcVideoPrompt,
              })) ?? prev.map((s) => ({
                videoUrl: s.videoUrl ?? null,
                taskId: s.taskId ?? null,
                history: [...(s.history || [])],
                ugcVideoPrompt: s.ugcVideoPrompt,
              }));
            const triple = normalizePipelineByAngle(base).map((p) => cloneAnglePipeline(p)) as [
              LinkToAdAnglePipelineV1,
              LinkToAdAnglePipelineV1,
              LinkToAdAnglePipelineV1,
            ];
            const pipe = cloneAnglePipeline(triple[angleIdx]);
            triple[angleIdx] = { ...pipe, klingByReferenceIndex: slotsFromPoll };
            const interim: LinkToAdUniverseSnapshotV1 = { ...base, linkToAdPipelineByAngle: triple };
            const nextSnap = snapshotAfterKlingVideoSuccessForAngle(
              interim,
              angleIdx as 0 | 1 | 2,
              slotIndex,
              vUrl,
              taskId,
            );
            klingMergedSnapRef.current = nextSnap;
            klingPollAngleRef.current = null;
            klingPollSlotsRef.current = null;
            return nextSnap.klingByReferenceIndex ?? prev;
          });
          setKlingPollTaskId(null);
          setKlingPollImageIndex(null);
          const mergedSnapForPersist = klingMergedSnapRef.current as LinkToAdUniverseSnapshotV1 | null;
          const tripleAfterKling = mergedSnapForPersist?.linkToAdPipelineByAngle;
          if (tripleAfterKling) {
            setPipelineByAngle([cloneAnglePipeline(tripleAfterKling[0]), cloneAnglePipeline(tripleAfterKling[1]), cloneAnglePipeline(tripleAfterKling[2])]);
          }
          const url0 = storeUrl.trim();
          if (mergedSnapForPersist && lastExtractedJson && url0) {
            try {
              await persistUniverse(universeRunId, url0, extractedTitle, lastExtractedJson, mergedSnapForPersist, packshotsForSave(), {
                videoUrl: vUrl,
                videoPrompt: lastKlingVideoPromptRef.current || undefined,
              });
            } catch (e) {
              toast.error("Video save failed", {
                description: e instanceof Error ? e.message : "Unknown error",
              });
            }
          }
          toast.success("Video saved in the project");
          if (interval) clearInterval(interval);
          interval = null;
          return;
        }
        throw new Error(json.data.error_message || `Video generation failed: ${String(s)}`);
      } catch (err) {
        if (cancelled) return;
        toast.error("Video generation", { description: err instanceof Error ? err.message : "Unknown error" });
        klingPollAngleRef.current = null;
        klingPollSlotsRef.current = null;
        setKlingPollTaskId(null);
        setKlingPollImageIndex(null);
        if (interval) clearInterval(interval);
        interval = null;
      }
    }

    tick();
    interval = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [klingPollTaskId, klingPollImageIndex]);

  const showAnglePicker = Boolean(scriptsText && angleLabels[0] && angleLabels[1] && angleLabels[2]);
  const showContinueScripts =
    Boolean(summaryText.trim() && !scriptsText && lastExtractedJson && stage === "ready" && !isWorking);
  const showI2vPipeline = selectedAngleIndex !== null && scriptsText.trim().length > 0;
  const nanoImageSlots = useMemo((): [string, string, string] => {
    const a = nanoBananaImageUrls;
    return [
      (typeof a[0] === "string" ? a[0] : "").trim(),
      (typeof a[1] === "string" ? a[1] : "").trim(),
      (typeof a[2] === "string" ? a[2] : "").trim(),
    ];
  }, [nanoBananaImageUrls]);
  const nanoHasAnyReferenceImage = nanoImageSlots.some(Boolean);
  const nanoHasThreeImages = nanoImageSlots.every(Boolean);
  const nanoShowReferenceStrip =
    Boolean(nanoBananaPromptsRaw.trim()) &&
    (nanoHasAnyReferenceImage || Boolean(nanoPollTaskId) || isNanoAllImagesSubmitting);
  /** Compact strip + video column (persists when switching reference image). */
  const showVideoStageLayout = Boolean(
    videoStageMode &&
      nanoBananaImageUrl?.trim() &&
      nanoHasThreeImages &&
      Boolean(nanoBananaPromptsRaw.trim()),
  );
  /** Video prompt / render UI is relevant (loading, result, or user just kicked off generation). */
  const showVideoWorkPanel = Boolean(
    nanoBananaImageUrl?.trim() &&
      (userStartedVideoFromImage ||
        ugcVideoPromptGpt.trim() ||
        isVideoPromptLoading ||
        isKlingSubmitting ||
        klingPollTaskId ||
        klingVideoUrl),
  );

  const step1Done = Boolean(summaryText.trim() && resolvedPreviewUrl);
  const step2Done = Boolean(scriptsText.trim() && selectedAngleIndex !== null);
  const step3Done = Boolean(nanoHasThreeImages && nanoBananaImageUrl);
  /** Step 4 = full video flow (prompt + render) until a final video exists. */
  const step4Done = Boolean(klingVideoUrl);

  const universeCurrentStep = useMemo(() => {
    if (!step1Done) return 1;
    if (!step2Done) return 2;
    if (!step3Done) return 3;
    if (!step4Done) return 4;
    return 5;
  }, [step1Done, step2Done, step3Done, step4Done]);

  const universeLoadingState = useMemo((): {
    phase: string | null;
    message: string | null;
  } => {
    if (nanoPollTaskId || isNanoAllImagesSubmitting) {
      return { phase: "nano_three", message: LINK_TO_AD_LOADING_MESSAGES.nano_three };
    }
    if (isNanoPromptsLoading) {
      return { phase: "nano_prompts", message: LINK_TO_AD_LOADING_MESSAGES.nano_prompts };
    }
    if (isNanoImageSubmitting) {
      return { phase: "nano_single_image", message: LINK_TO_AD_LOADING_MESSAGES.nano_single_image };
    }
    if (isVideoPromptLoading) {
      return { phase: "video_prompt", message: LINK_TO_AD_LOADING_MESSAGES.video_prompt };
    }
    if (isKlingSubmitting) {
      return { phase: "kling_starting", message: LINK_TO_AD_LOADING_MESSAGES.kling_starting };
    }
    if (klingRenderingThisReference) {
      return { phase: "kling_rendering", message: LINK_TO_AD_LOADING_MESSAGES.kling_rendering };
    }
    if (!isWorking) return { phase: null, message: null };
    if (stage === "server_pipeline") {
      return { phase: "server_pipeline", message: LINK_TO_AD_LOADING_MESSAGES.server_pipeline };
    }
    if (stage === "scanning") {
      return { phase: "scanning", message: LINK_TO_AD_LOADING_MESSAGES.scanning };
    }
    if (stage === "finding_image") {
      return { phase: "finding_image", message: LINK_TO_AD_LOADING_MESSAGES.finding_image };
    }
    if (stage === "summarizing") {
      return { phase: "summarizing", message: LINK_TO_AD_LOADING_MESSAGES.summarizing };
    }
    if (stage === "writing_scripts") {
      return { phase: "writing_scripts", message: LINK_TO_AD_LOADING_MESSAGES.writing_scripts };
    }
    return { phase: "working", message: LINK_TO_AD_LOADING_MESSAGES.working };
  }, [
    nanoPollTaskId,
    isNanoAllImagesSubmitting,
    isNanoPromptsLoading,
    isNanoImageSubmitting,
    isVideoPromptLoading,
    isKlingSubmitting,
    klingRenderingThisReference,
    isWorking,
    stage,
  ]);

  const showUniverseLoading = universeLoadingState.message !== null;

  async function handleGenerateVideoFromSelectedImage() {
    if (nanoBananaSelectedImageIndex === null || !nanoBananaImageUrl?.trim()) {
      toast.error("Select a reference image first.");
      return;
    }
    if (isVideoPromptLoading || isKlingSubmitting || Boolean(klingPollTaskId)) return;
    setVideoStageMode(true);
    setUserStartedVideoFromImage(true);
    const t = await onGenerateUgcVideoPrompt();
    if (t?.trim()) {
      const nextSections = splitVideoPromptSectionsForUi(t.trim());
      setVideoPromptSections(nextSections);
      setEditableVideoPrompt(composeVideoPromptFromSections(nextSections));
      setVideoPromptInlineEdit(false);
      setVideoPromptHasEdits(false);
      setVideoPromptEditVisible(true);
    }
  }

  async function handleConfirmVideoGeneration() {
    const prompt = composeVideoPromptFromSections(videoPromptSections).trim();
    setEditableVideoPrompt(prompt);
    if (!prompt) {
      toast.error("Video prompt is empty.");
      return;
    }
    setVideoPromptEditVisible(false);
    await onGenerateKlingVideo(prompt);
  }

  const primaryBtnClass =
    "h-11 rounded-2xl bg-violet-400 px-6 text-black font-semibold border border-violet-200/40 shadow-[0_6px_0_0_rgba(76,29,149,0.9)] transition-all hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9)] active:translate-y-[6px] disabled:cursor-wait disabled:pointer-events-none disabled:active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:bg-violet-400 disabled:hover:shadow-[0_6px_0_0_rgba(76,29,149,0.9)] disabled:opacity-100";

  function handleGenerateFromUrl() {
    const u = storeUrl.trim();
    if (!u) {
      toast.error("Enter a store URL.");
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      toast.error("URL must start with https:// (or http://).");
      return;
    }
    if (isWorking) return;
    if (showContinueScripts) {
      void onContinueScripts();
      return;
    }
    void onRun();
  }

  const storeHostnameResolved = useMemo(() => storeHostname(storeUrl), [storeUrl]);

  useEffect(() => {
    setBrandFaviconFailed(false);
  }, [storeHostnameResolved]);

  const showBrandHeaderInsteadOfUrl = useMemo(
    () =>
      Boolean(
        summaryText.trim() ||
          scriptsText.trim() ||
          (typeof resolvedPreviewUrl === "string" && resolvedPreviewUrl.length > 0),
      ),
    [summaryText, scriptsText, resolvedPreviewUrl],
  );

  const brandDisplayName = useMemo(() => {
    const t = extractedTitle?.trim();
    if (t) return t;
    const h = storeHostnameResolved;
    if (h) return h;
    const u = storeUrl.trim();
    return u || "Store";
  }, [extractedTitle, storeHostnameResolved, storeUrl]);

  const brandFaviconSrc = useMemo(() => {
    const h = storeHostnameResolved;
    if (!h) return null;
    return brandFaviconUrl(h);
  }, [storeHostnameResolved]);

  const brandSummaryTeaser = useMemo(() => compactBrandSummaryForUi(summaryText), [summaryText]);
  const brandColorHex = useMemo(() => {
    const fromSummary = firstHexColor(summaryText);
    if (fromSummary) return fromSummary;
    try {
      const raw = JSON.stringify(lastExtractedJson ?? {});
      return firstHexColor(raw);
    } catch {
      return null;
    }
  }, [summaryText, lastExtractedJson]);

  return (
    <>
    <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.10)]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Link to Ad</CardTitle>
          {stage === "error" ? (
            <div className="flex items-center gap-2 text-xs text-red-300/90">
              <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-1">Error</span>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <LinkToAdUniverseStepper
          currentStep={universeCurrentStep}
          step1Done={step1Done}
          step2Done={step2Done}
          step3Done={step3Done}
          step4Done={step4Done}
        />
        {showUniverseLoading ? (
          <div className="-mt-2 mb-2 flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-violet-500/15 bg-violet-500/[0.06] px-3 py-3 sm:gap-4 sm:px-4 shadow-[0_0_24px_rgba(139,92,246,0.12)]">
            {isWorking &&
            (stage === "scanning" ||
              stage === "finding_image" ||
              stage === "server_pipeline" ||
              stage === "summarizing" ||
              stage === "writing_scripts") ? (
              <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-8">
                <WebsiteScanLoader
                  label={
                    stage === "scanning"
                      ? "Scan site"
                      : stage === "finding_image"
                        ? "Scan images"
                        : stage === "summarizing"
                          ? "Brand"
                          : stage === "writing_scripts"
                            ? "Scripts"
                            : "Scanning…"
                  }
                  subtitle={
                    universeLoadingState.message ? (
                      <StatusLineShimmer
                        text={universeLoadingState.message}
                        className="block text-left text-xs leading-snug sm:text-sm"
                      />
                    ) : null
                  }
                  className="min-w-0 flex-1"
                />
                <WebsiteScanChecklist
                  stage={stage}
                  isWorking={isWorking}
                  serverPipelineStepIndex={serverPipelineStepIndex}
                  className="shrink-0 lg:max-w-[min(100%,22rem)]"
                />
              </div>
            ) : (
              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-violet-300" aria-hidden />
                <div className="flex min-w-0 flex-col gap-1">
                  {universeLoadingState.message ? (
                    <StatusLineShimmer text={universeLoadingState.message} className="text-sm font-medium" />
                  ) : null}
                  {(nanoPollTaskId || isNanoAllImagesSubmitting) ? (
                    <span className="text-xs font-normal text-white/50">
                      This may take several minutes.
                    </span>
                  ) : null}
                </div>
                {showUniverseLoading ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-9 rounded-lg border border-white/15 bg-white/5 text-xs text-white/75 hover:bg-white/10"
                    onClick={() => cancelCurrentGeneration()}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
        <div className="space-y-3">
          {!showBrandHeaderInsteadOfUrl ? (
            <div>
              <Label className="text-base font-medium text-white/80">Store URL</Label>
              {!isWorking ? (
                <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">Mode</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setGenerationMode("automatic")}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left transition",
                          generationMode === "automatic"
                            ? "border-violet-400/60 bg-violet-500/15 text-white"
                            : "border-white/10 bg-black/20 text-white/65 hover:border-white/20",
                        )}
                      >
                        <p className="text-sm font-semibold">Automatic</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">
                          Current Link to Ad flow with editable script factors.
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGenerationMode("custom_ugc")}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left transition",
                          generationMode === "custom_ugc"
                            ? "border-violet-400/60 bg-violet-500/15 text-white"
                            : "border-white/10 bg-black/20 text-white/65 hover:border-white/20",
                        )}
                      >
                        <p className="text-sm font-semibold">Custom UGC intent</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">
                          Add your own creative direction on top of Link to Ad.
                        </p>
                      </button>
                    </div>
                  </div>
                  {generationMode === "custom_ugc" ? (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-white/70">What should your UGC focus on?</Label>
                      <Textarea
                        value={customUgcTopic}
                        onChange={(e) => setCustomUgcTopic(e.target.value)}
                        placeholder="Ex: no talk, just show texture/results and product usage in real-life shots."
                        className="min-h-[92px] border-white/10 bg-black/30 text-sm text-white/85 placeholder:text-white/30"
                      />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-white/70">Your offer (optional)</Label>
                          <Input
                            value={customUgcOffer}
                            onChange={(e) => setCustomUgcOffer(e.target.value)}
                            placeholder="Ex: 20% off today / free shipping"
                            className="h-10 border-white/10 bg-black/30 text-sm text-white/85 placeholder:text-white/30"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-white/70">CTA (optional)</Label>
                          <Input
                            value={customUgcCta}
                            onChange={(e) => setCustomUgcCta(e.target.value)}
                            placeholder="Ex: Tap to shop now"
                            className="h-10 border-white/10 bg-black/30 text-sm text-white/85 placeholder:text-white/30"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="relative mt-2 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <Input
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  placeholder="https://..."
                  disabled={isWorking}
                  className="h-14 min-h-[3.5rem] min-w-0 flex-1 rounded-xl border-white/10 bg-white/[0.03] px-4 text-lg text-white placeholder:text-white/35 disabled:cursor-wait disabled:opacity-60"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleGenerateFromUrl();
                    }
                  }}
                />
                <Button
                  type="button"
                  disabled={isWorking || !storeUrl.trim()}
                  onClick={handleGenerateFromUrl}
                  aria-busy={isWorking}
                  className={`${primaryBtnClass} h-auto min-h-14 shrink-0 px-8 py-2.5 text-base sm:min-w-[160px] inline-flex flex-col items-center justify-center gap-1`}
                >
                  {isWorking ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                      Working…
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center justify-center gap-2 font-semibold leading-tight">
                        <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
                        Generate
                      </span>
                      <span className="text-[11px] font-semibold text-black/70">
                        {CREDITS_LINK_TO_AD_GENERATE_FROM_URL} credits
                      </span>
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-2 max-w-xl text-[11px] leading-snug text-white/40">
                Use the exact product page URL, not just your shop homepage. We need the specific listing to pull the
                right images and details.
                <span className="mt-1 block">
                  This is for one product only. To test another product, create a new Link to Ad with that product URL.
                </span>
              </p>

              {/* Product photos + avatar are shown only after brief + scripts are generated (next step),
                  to keep the URL step focused and avoid accidental generation triggers. */}
            </div>
          ) : null}
        </div>

        {(resolvedPreviewUrl || summaryText.trim() || (isWorking && storeUrl.trim())) && !scriptsText.trim() ? (
          <div className="mx-auto w-full max-w-xl">
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    {showBrandHeaderInsteadOfUrl ? (
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#0d0a14]">
                          {brandFaviconSrc && !brandFaviconFailed ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={brandFaviconSrc}
                              alt=""
                              width={28}
                              height={28}
                              className="h-7 w-7 object-contain"
                              referrerPolicy="no-referrer"
                              onError={() => setBrandFaviconFailed(true)}
                            />
                          ) : (
                            <span className="text-sm font-bold uppercase text-violet-300">
                              {(brandDisplayName.slice(0, 1) || "?").toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold leading-tight text-white">{brandDisplayName}</p>
                          {storeHostnameResolved ? (
                            <p className="mt-0.5 truncate text-xs text-white/40">{storeHostnameResolved}</p>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="min-w-0 py-0.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Store</p>
                        <p className="truncate text-sm font-medium text-white/85">
                          {storeHostnameResolved || storeUrl.trim() || "…"}
                        </p>
                        {isWorking ? (
                          <p className="mt-1 text-xs text-violet-300/90">Scanning the store…</p>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#050507]">
                    {resolvedPreviewUrl && !imgError ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={resolvedPreviewUrl}
                        src={resolvedPreviewUrl}
                        alt="Product"
                        className="h-full w-full object-cover object-center"
                        loading="eager"
                        referrerPolicy="no-referrer"
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-1 text-center text-[10px] leading-tight text-white/35">
                        {resolvedPreviewUrl
                          ? "Can't load"
                          : isWorking
                            ? "…"
                            : "No image"}
                      </div>
                    )}
                    {resolvedPreviewUrl && !imgError ? (
                      <div className="pointer-events-none absolute bottom-0.5 right-0.5 rounded border border-white/10 bg-black/70 px-1 py-px backdrop-blur-sm">
                        {quality.label === "good" ? (
                          <span className="text-[8px] font-medium text-emerald-400">OK</span>
                        ) : (
                          <span className={`text-[8px] font-medium ${quality.color}`}>{quality.label}</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                {brandSummaryTeaser ? (
                  <p className="mt-3 line-clamp-3 text-xs leading-snug text-white/50">{brandSummaryTeaser}</p>
                ) : null}

                {imgError && resolvedPreviewUrl ? (
                  <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    Could not load the image preview (hotlinking may block embeds).{" "}
                    <a
                      href={resolvedPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline underline-offset-2"
                    >
                      Open image
                    </a>
                  </div>
                ) : null}

                {scriptsText.trim() && (productOnlyImageUrls.length > 0 || neutralUploadUrl) ? (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                        Product photos ({productOnlyImageUrls.length})
                      </span>
                      <button
                        type="button"
                        disabled={isWorking || isUploadingAdditionalPhotos}
                        className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white/80"
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <ImagePlus className="h-3 w-3" />
                        Add photo
                      </button>
                      {avatarUrls.length > 0 ? (
                        <button
                          type="button"
                          disabled={isWorking || isUploadingAdditionalPhotos}
                          className="ml-2 rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white/80"
                          onClick={() => setAvatarPickerOpen(true)}
                        >
                          Upload my avatar
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <LinkToAdPendingProductThumbnails items={pendingProductUploads} />
                      {productOnlyImageUrls.map((url, i) => (
                        <div key={`${url}-${i}`} className="group/photo relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#050507]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Product ${i + 1}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => removeProductPhoto(url)}
                            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/70 text-white/60 opacity-0 transition hover:text-red-400 group-hover/photo:opacity-100"
                            aria-label="Remove"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={isWorking || isUploadingAdditionalPhotos}
                        onClick={() => photoInputRef.current?.click()}
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-white/30 transition hover:border-violet-400/40 hover:text-violet-300"
                      >
                        <ImagePlus className="h-5 w-5" />
                      </button>
                    </div>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        void uploadAdditionalPhoto(e.target.files);
                        e.currentTarget.value = "";
                      }}
                      disabled={isWorking || isUploadingAdditionalPhotos}
                    />
                  </div>
                ) : null}

                {/* Upload recommendation removed (too noisy); users can add photos after scripts. */}
              </div>
            </div>
          </div>
        ) : null}

        {selectedAngleIndex === null &&
        (summaryText.trim() ||
          scriptsText.trim() ||
          showContinueScripts ||
          (isWorking && stage === "writing_scripts")) ? (
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
            {isWorking && stage === "writing_scripts" ? (
              <div className="flex items-center gap-2 text-xs text-violet-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Writing three script angles…
              </div>
            ) : showAnglePicker ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#0d0a14]">
                          {brandFaviconSrc && !brandFaviconFailed ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={brandFaviconSrc}
                              alt=""
                              width={28}
                              height={28}
                              className="h-7 w-7 object-contain"
                              referrerPolicy="no-referrer"
                              onError={() => setBrandFaviconFailed(true)}
                            />
                          ) : (
                            <span className="text-sm font-bold uppercase text-violet-300">
                              {(brandDisplayName.slice(0, 1) || "?").toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold leading-tight text-white">{brandDisplayName}</p>
                          {storeHostnameResolved ? (
                            <p className="mt-0.5 truncate text-xs text-white/40">{storeHostnameResolved}</p>
                          ) : null}
                        </div>
                      </div>
                      {/* Brand color intentionally hidden (not useful in Link to Ad UI). */}
                    </div>
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#050507]">
                      {resolvedPreviewUrl && !imgError ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={resolvedPreviewUrl}
                          src={resolvedPreviewUrl}
                          alt="Product"
                          className="h-full w-full object-cover object-center"
                          loading="eager"
                          referrerPolicy="no-referrer"
                          onError={() => setImgError(true)}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-1 text-center text-[10px] leading-tight text-white/35">
                          {resolvedPreviewUrl ? "Can't load" : "No image"}
                        </div>
                      )}
                  {resolvedPreviewUrl && !imgError && isAlgorithmChosenPreview ? (
                    <>
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-2 py-1.5">
                        <p className="text-[10px] font-medium leading-tight text-white/70">
                          Product photo scraped by our algorithm — you can change it.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAlgorithmChosenPreview()}
                        className="absolute right-1 top-1 z-20 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white/70 shadow transition hover:text-red-300"
                        aria-label="Remove scraped photo"
                        title="Remove scraped photo"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </>
                  ) : null}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                        Product photos ({productOnlyImageUrls.length})
                      </span>
                      <button
                        type="button"
                        disabled={isWorking}
                        className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white/80"
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <ImagePlus className="h-3 w-3" />
                        Add photo
                      </button>
                      {avatarUrls.length > 0 ? (
                        <button
                          type="button"
                          disabled={isWorking || isUploadingAdditionalPhotos}
                          className="ml-2 rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white/80"
                          onClick={() => setAvatarPickerOpen(true)}
                        >
                          Upload my avatar
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <LinkToAdPendingProductThumbnails items={pendingProductUploads} />
                      {productOnlyImageUrls.map((url, i) => (
                        <div key={`${url}-${i}`} className="group/photo relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#050507]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Product ${i + 1}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            type="button"
                            onClick={() => removeProductPhoto(url)}
                            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/70 text-white/60 opacity-0 transition hover:text-red-400 group-hover/photo:opacity-100"
                            aria-label="Remove"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={isWorking}
                        onClick={() => photoInputRef.current?.click()}
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-white/30 transition hover:border-violet-400/40 hover:text-violet-300"
                      >
                        <ImagePlus className="h-5 w-5" />
                      </button>
                    </div>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        void uploadAdditionalPhoto(e.target.files);
                        e.currentTarget.value = "";
                      }}
                      disabled={isWorking || isUploadingAdditionalPhotos}
                    />
                  </div>
                </div>
                <p className="text-sm font-semibold tracking-tight text-white/90">
                  Choose your AI UGC angle
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-white/45">You can regenerate a fresh set anytime.</p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isWorking || stage === "writing_scripts"}
                    onClick={() => void onRegenerateMarketingAngles()}
                    className={`${primaryBtnClass} h-auto min-h-12 shrink-0 px-4 py-2 text-sm inline-flex flex-col items-center justify-center gap-0.5`}
                  >
                    <span className="font-semibold leading-tight">Regenerate 3 new angles</span>
                    <span className="text-[11px] font-semibold text-black/70">2 credits</span>
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                {angleOptionCards.map((card) => (
                  <button
                    key={card.index}
                    type="button"
                    onClick={() => void onSelectAngle(card.index)}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition-all hover:border-violet-400/40 hover:bg-white/[0.07]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-violet-300">Angle {card.index + 1}</span>
                    </div>
                    <p className={cn("mt-2 text-sm leading-snug text-white/85", !expandedAngleBriefs[card.index] && card.canExpand && "line-clamp-3")}>
                      {expandedAngleBriefs[card.index] ? card.fullLabel : card.label}
                    </p>
                    {card.canExpand ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className="mt-2 inline-flex text-[11px] font-medium text-violet-300/80 hover:text-violet-200"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setExpandedAngleBriefs((prev) => ({ ...prev, [card.index]: !Boolean(prev[card.index]) }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            setExpandedAngleBriefs((prev) => ({ ...prev, [card.index]: !Boolean(prev[card.index]) }));
                          }
                        }}
                      >
                        {expandedAngleBriefs[card.index] ? "Show less" : "Show all"}
                      </span>
                    ) : null}
                  </button>
                ))}
                </div>
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3">
                  <p className="mb-2 text-xs font-semibold text-white/50">
                    <Plus className="mr-1 inline h-3 w-3" />
                    Add a custom angle
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={customAngleInput}
                      onChange={(e) => setCustomAngleInput(e.target.value)}
                      placeholder="e.g. Morning routine with the product"
                      className="h-9 flex-1 border-white/10 bg-black/30 text-sm text-white placeholder:text-white/25"
                      onKeyDown={(e) => { if (e.key === "Enter" && customAngleInput.trim()) void onAddCustomAngle(); }}
                      disabled={isCustomAngleLoading}
                    />
                    <Button
                      type="button"
                      disabled={!customAngleInput.trim() || isCustomAngleLoading}
                      onClick={() => void onAddCustomAngle()}
                      className="h-9 shrink-0 border border-violet-400/30 bg-violet-500/20 px-3 text-xs font-semibold text-violet-200 hover:bg-violet-500/30"
                    >
                      {isCustomAngleLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Generate"
                      )}
                    </Button>
                  </div>
                  {pendingCustomAnglePreview ? (
                    <div className="mt-3 space-y-2 rounded-lg border border-violet-400/25 bg-violet-500/[0.08] p-3">
                      <p className="text-xs font-semibold text-violet-200">
                        Generated angle — review before adding
                        {pendingCustomAngleEditing ? (
                          <span className="ml-1.5 font-normal text-violet-300/80">(editing)</span>
                        ) : null}
                      </p>
                      {pendingCustomAngleEditing ? (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-white/40">Headline</Label>
                          <Input
                            value={pendingCustomAnglePreview.headline}
                            onChange={(e) => patchPendingCustomAngle({ headline: e.target.value })}
                            className="h-9 border-white/10 bg-black/40 text-sm text-white placeholder:text-white/25"
                            spellCheck
                          />
                        </div>
                      ) : (
                        <p className="text-sm font-medium leading-snug text-white/90">
                          {pendingCustomAnglePreview.headline}
                        </p>
                      )}
                      <Textarea
                        readOnly={!pendingCustomAngleEditing}
                        value={pendingCustomAnglePreview.script}
                        onChange={(e) => patchPendingCustomAngle({ script: e.target.value })}
                        className={cn(
                          "max-h-52 min-h-[140px] resize-y border-white/10 bg-black/40 font-mono text-xs leading-relaxed text-white/85",
                          !pendingCustomAngleEditing && "cursor-default opacity-95",
                        )}
                        spellCheck={pendingCustomAngleEditing}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={confirmPendingCustomAngle}
                          className="h-9 border border-violet-400/40 bg-violet-500/30 px-3 text-xs font-semibold text-white hover:bg-violet-500/40"
                        >
                          Add to my angles
                        </Button>
                        {pendingCustomAngleEditing ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setPendingCustomAngleEditing(false)}
                            className="h-9 border border-white/15 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/10"
                          >
                            Done editing
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setPendingCustomAngleEditing(true)}
                            className="h-9 border border-white/15 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/10"
                          >
                            <PenLine className="mr-1.5 h-3.5 w-3.5 opacity-90" aria-hidden />
                            Edit
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={discardPendingCustomAngle}
                          className="h-9 border border-white/15 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/10"
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[80px] items-center justify-center rounded-lg border border-white/10 bg-black/20 px-4 text-center text-sm text-white/35">
                Waiting for scripts…
              </div>
            )}
          </div>
        ) : null}

        {showI2vPipeline ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
            {/* Left: script angles + reference thumbnails + large image pickers */}
            <div className="flex min-w-0 flex-col gap-4 lg:w-[min(100%,22rem)] xl:w-[min(100%,26rem)] lg:shrink-0">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#0d0a14]">
                        {brandFaviconSrc && !brandFaviconFailed ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={brandFaviconSrc}
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 object-contain"
                            referrerPolicy="no-referrer"
                            onError={() => setBrandFaviconFailed(true)}
                          />
                        ) : (
                          <span className="text-sm font-bold uppercase text-violet-300">
                            {(brandDisplayName.slice(0, 1) || "?").toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold leading-tight text-white">{brandDisplayName}</p>
                        {storeHostnameResolved ? (
                          <p className="mt-0.5 truncate text-xs text-white/40">{storeHostnameResolved}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#050507]">
                    {resolvedPreviewUrl && !imgError ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={resolvedPreviewUrl}
                        src={resolvedPreviewUrl}
                        alt="Product"
                        className="h-full w-full object-cover object-center"
                        loading="eager"
                        referrerPolicy="no-referrer"
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-1 text-center text-[10px] leading-tight text-white/35">
                        {resolvedPreviewUrl ? "Can't load" : "No image"}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {(productOnlyImageUrls.length > 0 || neutralUploadUrl) && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                      Product photos ({productOnlyImageUrls.length})
                    </span>
                    <button
                      type="button"
                      disabled={isWorking || isUploadingAdditionalPhotos}
                      className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white/80 disabled:opacity-50"
                      onClick={() => photoInputRef.current?.click()}
                    >
                      <ImagePlus className="h-3 w-3" />
                      Add photo
                    </button>
                    {avatarUrls.length > 0 ? (
                      <button
                        type="button"
                        disabled={isWorking || isUploadingAdditionalPhotos}
                        className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white/80 disabled:opacity-50"
                        onClick={() => setAvatarPickerOpen(true)}
                      >
                        Upload my avatar
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <LinkToAdPendingProductThumbnails items={pendingProductUploads} />
                    {productOnlyImageUrls.map((url, i) => (
                      <div
                        key={`${url}-${i}-side`}
                        className="group/photo2 relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#050507]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Product ${i + 1}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          type="button"
                          onClick={() => removeProductPhoto(url)}
                          className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/70 text-white/60 opacity-0 transition hover:text-red-400 group-hover/photo2:opacity-100"
                          aria-label="Remove"
                          disabled={isUploadingAdditionalPhotos}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={isWorking || isUploadingAdditionalPhotos}
                      onClick={() => photoInputRef.current?.click()}
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-white/30 transition hover:border-violet-400/40 hover:text-violet-300 disabled:opacity-50"
                      aria-label="Add product photos"
                    >
                      <ImagePlus className="h-5 w-5" />
                    </button>
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      void uploadAdditionalPhoto(e.target.files);
                      e.currentTarget.value = "";
                    }}
                    disabled={isWorking || isUploadingAdditionalPhotos}
                  />
                </div>
              )}

              <div className="rounded-xl border border-violet-500/20 bg-black/25 px-3 py-2.5 sm:px-4">
                <div className="flex flex-col gap-4">
                  {nanoShowReferenceStrip ? (
                    <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                        Reference
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {([0, 1, 2] as const).map((i) => {
                          const url = nanoImageSlots[i];
                          const sel = nanoBananaSelectedImageIndex === i;
                          const pollingHere = Boolean(nanoPollTaskId && nanoPollingSlotIndex === i);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => void onSelectNanoBananaImage(i)}
                              className={cn(
                                "group/thumb relative aspect-square w-12 shrink-0 overflow-hidden rounded-lg border-2 bg-[#050507] transition-all sm:w-14",
                                sel
                                  ? "border-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.35)]"
                                  : "border-transparent opacity-80 hover:border-white/20 hover:opacity-100",
                                !url && !pollingHere && "cursor-default opacity-50 hover:opacity-50",
                              )}
                            >
                              {url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={url}
                                  alt={`Reference ${i + 1}`}
                                  className="h-full w-full object-cover object-center"
                                  loading="lazy"
                                />
                              ) : pollingHere ? (
                                <span className="flex h-full w-full items-center justify-center bg-black/40">
                                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-violet-300" aria-hidden />
                                </span>
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-[9px] font-medium uppercase tracking-wide text-white/25">
                                  —
                                </span>
                              )}
                              {url ? (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  aria-label="Open full size"
                                  className="absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100"
                                  onClick={(e) => { e.stopPropagation(); setNanoImageLightboxUrl(url); }}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setNanoImageLightboxUrl(url); } }}
                                >
                                  <Maximize2 className="h-3 w-3" aria-hidden />
                                </span>
                              ) : null}
                              {sel ? (
                                <span className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-400 text-black shadow">
                                  <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                {scriptsText.trim() ? (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                      Script angles
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {angleOptionCards.map((card) => {
                        const i = card.index;
                        const active = selectedAngleIndex === i;
                        const expanded = Boolean(expandedAngleScripts[i]);
                        const fullScript = scriptOptionBodiesAll[i] ?? "";
                        const summary = angleFullSummaryFromScriptOption(fullScript);
                        return (
                          <div
                            key={i}
                            className={cn(
                              "rounded-xl border px-3 py-2.5 transition-all",
                              active
                                ? "border-violet-400/55 bg-violet-500/[0.14] shadow-[0_0_20px_rgba(139,92,246,0.12)] ring-1 ring-violet-400/25"
                                : "border-white/10 bg-white/[0.03] hover:border-violet-400/35 hover:bg-white/[0.06]",
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-violet-300">
                                Angle {i + 1}
                                {active ? (
                                  <span className="ml-1.5 font-semibold normal-case text-violet-200/90">· active</span>
                                ) : null}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!Boolean(expandedAngleScripts[i])) {
                                    setAngleSummaryDrafts((prev) => ({
                                      ...prev,
                                      [i]: angleFullSummaryFromScriptOption(fullScript),
                                    }));
                                  }
                                  setExpandedAngleScripts((prev) => ({ ...prev, [i]: !Boolean(prev[i]) }));
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/70 transition hover:border-violet-400/35 hover:bg-white/[0.07] hover:text-white"
                              >
                                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                {expanded ? "Hide full script" : "View full script"}
                              </button>
                            </div>
                            <button type="button" onClick={() => void onSelectAngle(i)} className="mt-1.5 w-full text-left">
                              <p className="text-xs leading-snug text-white/80 line-clamp-5">
                                {card.label}
                              </p>
                            </button>
                            {expanded ? (
                              <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
                                <Textarea
                                  value={angleSummaryDrafts[i] ?? summary}
                                  onChange={(e) => setAngleSummaryDrafts((prev) => ({ ...prev, [i]: e.target.value }))}
                                  className="min-h-[120px] border-white/10 bg-black/25 text-xs leading-relaxed text-white/85"
                                  spellCheck
                                />
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-[10px] text-white/45">
                                    Edit the angle text (Hook, Problem, Solution, CTA). No metadata/persona.
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      saveAngleSummaryEdit(i);
                                    }}
                                    className="h-8 rounded-lg border border-emerald-400/35 bg-emerald-500/20 px-3 text-xs text-white hover:bg-emerald-500/35"
                                  >
                                    Save
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Right: generate prompts, generate video, Kling / video stage */}
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {!showVideoStageLayout ? (
                <div className="flex flex-col gap-4 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
                  {showUniverseLoading && universeLoadingState.message ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-300" aria-hidden />
                        <span className="truncate text-xs font-medium text-white/75">
                          {universeLoadingState.message}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 text-xs text-white/75 hover:bg-white/10"
                        onClick={() => cancelCurrentGeneration()}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                  {nanoBananaPromptsRaw && !nanoHasThreeImages ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">Image prompts</h3>
                        <p className="mt-2 text-sm leading-snug text-white/70">
                          Your 3 prompts are ready. Next, generate the 3 reference images.
                        </p>
                      </div>
                      <div className="space-y-2">
                        {([0, 1, 2] as const).map((i) => (
                          <div
                            key={i}
                            className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs leading-relaxed text-white/85"
                          >
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                              Prompt {i + 1}
                            </p>
                            <p className="whitespace-pre-wrap">{parsedNanoPrompts[i]?.trim() || "—"}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          disabled={isNanoAllImagesSubmitting || !selectedAngleIndex || !nanoBananaPromptsRaw.trim()}
                          onClick={() => void onGenerateNanoBananaImagesFromAllPrompts()}
                          className={`h-auto min-h-12 w-full max-w-md flex-col gap-1 py-2.5 ${primaryBtnClass}`}
                        >
                          <span className="text-sm font-semibold leading-tight">Generate 3 images</span>
                        </Button>
                        <p className="text-xs text-white/45">
                          You can cancel while it runs. Images will appear here as soon as they’re ready.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {nanoBananaPromptsRaw && nanoHasThreeImages ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                          Next step
                        </h3>
                        <p className="mt-2 text-sm leading-snug text-white/70">
                          Pick a 1:1 reference below (or use the strip on the left), then generate your UGC video.
                        </p>
                      </div>
                      <div className="grid w-full max-w-md grid-cols-3 gap-2 sm:max-w-lg sm:gap-3">
                        {([0, 1, 2] as const).map((i) => {
                          const sel = nanoBananaSelectedImageIndex === i;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => void onSelectNanoBananaImage(i)}
                              className={cn(
                                "group/card relative aspect-square w-full min-w-0 overflow-hidden rounded-xl border-2 bg-[#050507] transition-all",
                                sel
                                  ? "border-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.35)]"
                                  : "border-white/10 opacity-90 hover:border-violet-400/40 hover:opacity-100",
                              )}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={nanoBananaImageUrls[i]}
                                alt={`Reference ${i + 1}`}
                                className="h-full w-full object-cover object-center"
                                loading="lazy"
                              />
                              <span
                                role="button"
                                tabIndex={0}
                                aria-label="Open full size"
                                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 shadow transition-opacity group-hover/card:opacity-100"
                                onClick={(e) => { e.stopPropagation(); setNanoImageLightboxUrl(nanoBananaImageUrls[i] ?? null); }}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setNanoImageLightboxUrl(nanoBananaImageUrls[i] ?? null); } }}
                              >
                                <Maximize2 className="h-4 w-4" aria-hidden />
                              </span>
                              {sel ? (
                                <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-400 text-black shadow sm:h-6 sm:w-6">
                                  <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={3} aria-hidden />
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex max-w-md flex-col gap-2 sm:max-w-lg">
                        <Button
                          type="button"
                          disabled={
                            nanoBananaSelectedImageIndex === null ||
                            isVideoPromptLoading ||
                            isKlingSubmitting ||
                            Boolean(klingPollTaskId) ||
                            !nanoBananaImageUrl
                          }
                          onClick={() => void handleGenerateVideoFromSelectedImage()}
                          className={`flex h-auto min-h-12 w-full flex-col gap-1 py-2.5 ${primaryBtnClass}`}
                        >
                          {isVideoPromptLoading || isKlingSubmitting || klingPollTaskId ? (
                            <span className="inline-flex items-center justify-center gap-2 text-base font-semibold">
                              <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                              Working…
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center gap-2 text-base font-semibold leading-tight">
                              <Video className="h-5 w-5 shrink-0" aria-hidden />
                              Generate video from this image
                            </span>
                          )}
                        </Button>
                        {nanoBananaSelectedImageIndex === null ? (
                          <p className="text-xs text-white/45">
                            Tap a square above to choose your reference, then generate.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {selectedAngleIndex !== null &&
                  ((!nanoBananaPromptsRaw.trim() &&
                    !isNanoPromptsLoading &&
                    !isNanoAllImagesSubmitting &&
                    !nanoPollTaskId) ||
                    isNanoPromptsLoading ||
                    nanoPollTaskId ||
                    isNanoAllImagesSubmitting) ? (
                    <div className="shrink-0 rounded-xl border border-white/10 bg-black/25 p-4">
                      <div className="flex flex-col gap-3">
                        {!nanoBananaPromptsRaw.trim() &&
                        !isNanoPromptsLoading &&
                        !isNanoAllImagesSubmitting &&
                        !nanoPollTaskId ? (
                          <>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-white/75">
                                  Optional: edit the script before generating images.
                                </p>
                                {scriptHasEdits ? (
                                  <span className="text-[10px] text-violet-200/85">Edited factors ready</span>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!scriptEditVisible) {
                                      setScriptFactors(splitScriptFactorsForUi(editableScript));
                                    }
                                    setScriptEditVisible(!scriptEditVisible);
                                  }}
                                  className="flex items-center gap-1 text-[11px] font-medium text-violet-300/80 transition hover:text-violet-200"
                                >
                                  <PenLine className="h-3 w-3" />
                                  {scriptEditVisible ? "Done editing" : "Edit the script"}
                                </button>
                              </div>
                              {scriptEditVisible ? (
                                <>
                                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                                    <p className="text-[11px] font-medium text-white/75">
                                      Intentionally limited edits (to avoid lip-sync desync or story inconsistencies across the video).
                                    </p>
                                    <p className="mt-1 text-[10px] leading-snug text-white/45">
                                      Hook: 3–5 words · Problem: 5–7 words · Solution: 10–14 words · CTA: 3–4 words
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                        {factorWordRules.hook.label}
                                      </p>
                                      <span
                                        className={cn(
                                          "text-[10px] tabular-nums",
                                          factorWordsValid.hook ? "text-white/45" : "text-red-200/80",
                                        )}
                                      >
                                        {factorWordCounts.hook}/{factorWordRules.hook.max}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-white/35">{factorWordRules.hook.hint}</p>
                                    <Textarea
                                      value={scriptFactors.hook}
                                      onChange={(e) => {
                                        const v = clampToMaxWords(e.target.value, factorWordRules.hook.max);
                                        const next = { ...scriptFactors, hook: v };
                                        setScriptFactors(next);
                                        setEditableScript(composeScriptFromFactors(next));
                                        setScriptHasEdits(true);
                                      }}
                                      className={cn(
                                        "min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80",
                                        !factorWordsValid.hook && "border-red-500/35",
                                      )}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                        {factorWordRules.problem.label}
                                      </p>
                                      <span
                                        className={cn(
                                          "text-[10px] tabular-nums",
                                          factorWordsValid.problem ? "text-white/45" : "text-red-200/80",
                                        )}
                                      >
                                        {factorWordCounts.problem}/{factorWordRules.problem.max}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-white/35">{factorWordRules.problem.hint}</p>
                                    <Textarea
                                      value={scriptFactors.problem}
                                      onChange={(e) => {
                                        const v = clampToMaxWords(e.target.value, factorWordRules.problem.max);
                                        const next = { ...scriptFactors, problem: v };
                                        setScriptFactors(next);
                                        setEditableScript(composeScriptFromFactors(next));
                                        setScriptHasEdits(true);
                                      }}
                                      className={cn(
                                        "min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80",
                                        !factorWordsValid.problem && "border-red-500/35",
                                      )}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Avatar</p>
                                    <Textarea value={scriptFactors.avatar} onChange={(e) => { const next = { ...scriptFactors, avatar: e.target.value }; setScriptFactors(next); setEditableScript(composeScriptFromFactors(next)); setScriptHasEdits(true); }} className="min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80" />
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                        {factorWordRules.benefits.label}
                                      </p>
                                      <span
                                        className={cn(
                                          "text-[10px] tabular-nums",
                                          factorWordsValid.benefits ? "text-white/45" : "text-red-200/80",
                                        )}
                                      >
                                        {factorWordCounts.benefits}/{factorWordRules.benefits.max}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-white/35">{factorWordRules.benefits.hint}</p>
                                    <Textarea
                                      value={scriptFactors.benefits}
                                      onChange={(e) => {
                                        const v = clampToMaxWords(e.target.value, factorWordRules.benefits.max);
                                        const next = { ...scriptFactors, benefits: v };
                                        setScriptFactors(next);
                                        setEditableScript(composeScriptFromFactors(next));
                                        setScriptHasEdits(true);
                                      }}
                                      className={cn(
                                        "min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80",
                                        !factorWordsValid.benefits && "border-red-500/35",
                                      )}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Proof</p>
                                    <Textarea value={scriptFactors.proof} onChange={(e) => { const next = { ...scriptFactors, proof: e.target.value }; setScriptFactors(next); setEditableScript(composeScriptFromFactors(next)); setScriptHasEdits(true); }} className="min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80" />
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Offer</p>
                                    <Textarea value={scriptFactors.offer} onChange={(e) => { const next = { ...scriptFactors, offer: e.target.value }; setScriptFactors(next); setEditableScript(composeScriptFromFactors(next)); setScriptHasEdits(true); }} className="min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80" />
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                        {factorWordRules.cta.label}
                                      </p>
                                      <span
                                        className={cn(
                                          "text-[10px] tabular-nums",
                                          factorWordsValid.cta ? "text-white/45" : "text-red-200/80",
                                        )}
                                      >
                                        {factorWordCounts.cta}/{factorWordRules.cta.max}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-white/35">{factorWordRules.cta.hint}</p>
                                    <Textarea
                                      value={scriptFactors.cta}
                                      onChange={(e) => {
                                        const v = clampToMaxWords(e.target.value, factorWordRules.cta.max);
                                        const next = { ...scriptFactors, cta: v };
                                        setScriptFactors(next);
                                        setEditableScript(composeScriptFromFactors(next));
                                        setScriptHasEdits(true);
                                      }}
                                      className={cn(
                                        "min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80",
                                        !factorWordsValid.cta && "border-red-500/35",
                                      )}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Tone</p>
                                    <Textarea value={scriptFactors.tone} onChange={(e) => { const next = { ...scriptFactors, tone: e.target.value }; setScriptFactors(next); setEditableScript(composeScriptFromFactors(next)); setScriptHasEdits(true); }} className="min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80" />
                                  </div>
                                  </div>
                                </>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              disabled={!resolvedPreviewUrl || (scriptEditVisible && !factorWordsValid.all)}
                              className={`h-auto min-h-11 w-full max-w-md py-2.5 ${primaryBtnClass}`}
                              onClick={() => {
                                if (scriptEditVisible && !factorWordsValid.all) {
                                  toast.error("Please match the required word limits before generating.");
                                  return;
                                }
                                setScriptHasEdits(false);
                                void onGenerateNanoBananaPrompts(selectedAngleIndex as 0 | 1 | 2);
                              }}
                            >
                              <span className="text-sm font-semibold leading-tight">Generate 3 prompts</span>
                            </Button>
                          </>
                        ) : null}
                        {nanoPollTaskId || isNanoAllImagesSubmitting ? (
                          <NanoThreeImageArchitectureLoader />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-5 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
                  <div className="flex flex-col gap-2 border-b border-white/10 pb-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Actions</p>
                    <Button
                      type="button"
                      className={`h-auto min-h-11 w-full max-w-sm flex-col gap-1 px-3 py-2.5 ${primaryBtnClass}`}
                      disabled={
                        isNanoAllImagesSubmitting ||
                        isNanoPromptsLoading ||
                        Boolean(nanoPollTaskId) ||
                        isWorking ||
                        isVideoPromptLoading ||
                        isKlingSubmitting ||
                        Boolean(klingPollTaskId)
                      }
                      onClick={() => void onGenerateNanoBananaImagesFromAllPrompts()}
                    >
                      <span className="text-sm font-semibold leading-tight">New 3 images</span>
                    </Button>
                    <p className="text-[10px] leading-snug text-white/35">
                      Angles &amp; reference frames are on the left.
                    </p>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-6">
                    {showVideoWorkPanel ? (
                    <>
                      {videoPromptEditVisible && editableVideoPrompt.trim() && !klingVideoUrl ? (
                        <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-white/90">Review prompt sections</p>
                            <span className="text-[10px] text-white/40">Edit blocks before generating</span>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Direction</p>
                              <Textarea
                                value={videoPromptSections.direction}
                                onChange={(e) => {
                                  const next = { ...videoPromptSections, direction: e.target.value };
                                  setVideoPromptSections(next);
                                  setEditableVideoPrompt(composeVideoPromptFromSections(next));
                                }}
                                className="min-h-[88px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80"
                              />
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Scene</p>
                              <Textarea
                                value={videoPromptSections.scene}
                                onChange={(e) => {
                                  const next = { ...videoPromptSections, scene: e.target.value };
                                  setVideoPromptSections(next);
                                  setEditableVideoPrompt(composeVideoPromptFromSections(next));
                                }}
                                className="min-h-[88px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80"
                              />
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Motion</p>
                              <Textarea
                                value={videoPromptSections.motion}
                                onChange={(e) => {
                                  const next = { ...videoPromptSections, motion: e.target.value };
                                  setVideoPromptSections(next);
                                  setEditableVideoPrompt(composeVideoPromptFromSections(next));
                                }}
                                className="min-h-[88px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80"
                              />
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Style</p>
                              <Textarea
                                value={videoPromptSections.style}
                                onChange={(e) => {
                                  const next = { ...videoPromptSections, style: e.target.value };
                                  setVideoPromptSections(next);
                                  setEditableVideoPrompt(composeVideoPromptFromSections(next));
                                }}
                                className="min-h-[88px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80"
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            disabled={
                              isKlingSubmitting ||
                              Boolean(klingPollTaskId) ||
                              !composeVideoPromptFromSections(videoPromptSections).trim()
                            }
                            onClick={() => void handleConfirmVideoGeneration()}
                            className={`h-11 w-full max-w-sm ${primaryBtnClass}`}
                          >
                            {isKlingSubmitting || klingPollTaskId ? (
                              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                <Loader2 className="h-4 w-4 animate-spin" /> Working…
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                <Video className="h-4 w-4" /> Generate video
                              </span>
                            )}
                          </Button>
                        </div>
                      ) : null}
                      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Your video</p>
                        <p className="mt-1 text-xs text-white/45">
                          Preview in 9:16. Regenerate adds the last clip below; switch reference images to see each
                          frame&apos;s ads.
                        </p>
                        {klingVideoUrl ? (
                          <>
                            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                              <div className="mx-auto w-[11.5rem] max-w-full shrink-0 sm:mx-0 sm:w-[12.5rem]">
                                <div className="aspect-[9/16] w-full overflow-hidden rounded-lg border border-white/10 bg-black">
                                  <video
                                    src={klingVideoUrl}
                                    controls
                                    playsInline
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              </div>
                              <div className="flex w-full flex-col justify-center gap-2 sm:w-auto sm:min-w-[11rem] sm:flex-1">
                                <Button
                                  type="button"
                                  className={`h-auto min-h-10 w-full px-3 py-2 sm:w-full ${primaryBtnClass}`}
                                  disabled={
                                    isKlingSubmitting ||
                                    Boolean(klingPollTaskId) ||
                                    !ugcVideoPromptGpt.trim() ||
                                    !nanoBananaImageUrl
                                  }
                                  onClick={() => {
                                    void onGenerateKlingVideo();
                                  }}
                                >
                                  {isKlingSubmitting || klingRenderingThisReference ? (
                                    <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                                      Working…
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-2 text-sm font-semibold leading-tight">
                                      <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                                      Regenerate
                                    </span>
                                  )}
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-10 w-full justify-center border border-white/15 bg-white/5 text-white hover:bg-white/10 sm:w-full"
                                  asChild
                                >
                                  <a
                                    href={`/api/download?url=${encodeURIComponent(klingVideoUrl)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Download video
                                  </a>
                                </Button>
                              </div>
                            </div>
                            {klingHistory.length > 0 &&
                            (nanoBananaSelectedImageIndex === 0 ||
                              nanoBananaSelectedImageIndex === 1 ||
                              nanoBananaSelectedImageIndex === 2) ? (
                              <div className="mt-4 border-t border-white/10 pt-4">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                  Previous versions
                                </p>
                                <p className="mt-0.5 text-[10px] text-white/35">
                                  Tap a thumbnail to make it the main preview (swap with current).
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {klingHistory.map((u, hi) => (
                                    <button
                                      key={`${u.slice(-32)}-${hi}`}
                                      type="button"
                                      className="group relative aspect-[9/16] w-[4.25rem] shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black transition hover:border-violet-400/60"
                                      title="Use this version as main preview"
                                      onClick={() =>
                                        promoteHistoryToMain(nanoBananaSelectedImageIndex, u)
                                      }
                                    >
                                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                      <video
                                        src={u}
                                        muted
                                        playsInline
                                        preload="metadata"
                                        className="pointer-events-none h-full w-full object-cover"
                                      />
                                      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent py-3 pt-6 text-center text-[9px] font-medium text-white/95 opacity-0 transition group-hover:opacity-100">
                                        Use
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                        {nanoBananaImageUrl &&
                        ugcVideoPromptGpt.trim() &&
                        !klingVideoUrl &&
                        !klingPollTaskId &&
                        !isKlingSubmitting ? (
                          <Button
                            type="button"
                            className={`mt-4 h-auto min-h-11 py-2.5 ${primaryBtnClass}`}
                            onClick={() => {
                              void onGenerateKlingVideo();
                            }}
                          >
                            <span className="text-sm font-semibold leading-tight">Retry video render</span>
                          </Button>
                        ) : null}
                        {isKlingSubmitting ? (
                          <div className="mt-4 flex items-center gap-2 text-xs text-violet-200">
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                            <span>{LINK_TO_AD_LOADING_MESSAGES.kling_starting}</span>
                          </div>
                        ) : null}
                        {klingRenderingThisReference ? (
                          <p className="mt-4 flex items-center gap-2 text-xs text-violet-200">
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                            <span>{LINK_TO_AD_LOADING_MESSAGES.kling_rendering}</span>
                          </p>
                        ) : null}
                      </div>

                      {!(videoPromptEditVisible && editableVideoPrompt.trim() && !klingVideoUrl) ? (
                        <div className="space-y-4 border-t border-white/10 pt-5">
                          <div>
                            <p className="text-sm font-semibold text-white/90">Video</p>
                            <p className="mt-1 text-xs text-white/45">
                              Motion prompt and final render. You can retry each step if something fails.
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Prompt</p>
                            {nanoBananaImageUrl &&
                            userStartedVideoFromImage &&
                            !ugcVideoPromptGpt.trim() &&
                            !isVideoPromptLoading &&
                            selectedAngleIndex !== null ? (
                              <Button
                                type="button"
                                className={`mt-2 h-auto min-h-11 py-2.5 ${primaryBtnClass}`}
                                onClick={() => {
                                  void onGenerateUgcVideoPrompt();
                                }}
                              >
                                <span className="text-sm font-semibold leading-tight">Retry video prompt</span>
                              </Button>
                            ) : null}
                            {isVideoPromptLoading ? (
                              <div className="mt-3 flex items-center gap-2 text-xs text-violet-200">
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                <span>{LINK_TO_AD_LOADING_MESSAGES.video_prompt}</span>
                              </div>
                            ) : null}
                            {ugcVideoPromptGpt ? (
                              <div className="mt-3 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-white/40">
                                    {videoPromptHasEdits ? "Edited prompt blocks (not rendered yet)" : "Prompt blocks"}
                                  </span>
                                  <button
                                    type="button"
                                    className="text-[11px] font-medium text-violet-300/85 transition hover:text-violet-200"
                                    onClick={() => {
                                      if (!videoPromptInlineEdit) {
                                        setVideoPromptSections(splitVideoPromptSectionsForUi(ugcVideoPromptGpt));
                                      }
                                      setVideoPromptInlineEdit((v) => !v);
                                    }}
                                  >
                                    {videoPromptInlineEdit ? "Done editing" : "Edit blocks"}
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Direction</p>
                                    {videoPromptInlineEdit ? (
                                      <Textarea
                                        value={videoPromptSections.direction}
                                        onChange={(e) => {
                                          setVideoPromptSections((prev) => ({ ...prev, direction: e.target.value }));
                                          setVideoPromptHasEdits(true);
                                        }}
                                        className="mt-1 min-h-[78px] border-white/10 bg-black/35 text-xs leading-relaxed text-white/80"
                                      />
                                    ) : (
                                      <p className="mt-1 text-xs leading-relaxed text-white/75 line-clamp-4">
                                        {(videoPromptHasEdits ? videoPromptSections.direction : splitVideoPromptSectionsForUi(ugcVideoPromptGpt).direction) || "—"}
                                      </p>
                                    )}
                                  </div>
                                  <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Scene</p>
                                    {videoPromptInlineEdit ? (
                                      <Textarea
                                        value={videoPromptSections.scene}
                                        onChange={(e) => {
                                          setVideoPromptSections((prev) => ({ ...prev, scene: e.target.value }));
                                          setVideoPromptHasEdits(true);
                                        }}
                                        className="mt-1 min-h-[78px] border-white/10 bg-black/35 text-xs leading-relaxed text-white/80"
                                      />
                                    ) : (
                                      <p className="mt-1 text-xs leading-relaxed text-white/75 line-clamp-4">
                                        {(videoPromptHasEdits ? videoPromptSections.scene : splitVideoPromptSectionsForUi(ugcVideoPromptGpt).scene) || "—"}
                                      </p>
                                    )}
                                  </div>
                                  <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Motion</p>
                                    {videoPromptInlineEdit ? (
                                      <Textarea
                                        value={videoPromptSections.motion}
                                        onChange={(e) => {
                                          setVideoPromptSections((prev) => ({ ...prev, motion: e.target.value }));
                                          setVideoPromptHasEdits(true);
                                        }}
                                        className="mt-1 min-h-[78px] border-white/10 bg-black/35 text-xs leading-relaxed text-white/80"
                                      />
                                    ) : (
                                      <p className="mt-1 text-xs leading-relaxed text-white/75 line-clamp-4">
                                        {(videoPromptHasEdits ? videoPromptSections.motion : splitVideoPromptSectionsForUi(ugcVideoPromptGpt).motion) || "—"}
                                      </p>
                                    )}
                                  </div>
                                  <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Style</p>
                                    {videoPromptInlineEdit ? (
                                      <Textarea
                                        value={videoPromptSections.style}
                                        onChange={(e) => {
                                          setVideoPromptSections((prev) => ({ ...prev, style: e.target.value }));
                                          setVideoPromptHasEdits(true);
                                        }}
                                        className="mt-1 min-h-[78px] border-white/10 bg-black/35 text-xs leading-relaxed text-white/80"
                                      />
                                    ) : (
                                      <p className="mt-1 text-xs leading-relaxed text-white/75 line-clamp-4">
                                        {(videoPromptHasEdits ? videoPromptSections.style : splitVideoPromptSectionsForUi(ugcVideoPromptGpt).style) || "—"}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {videoPromptHasEdits ? (
                                  <Button
                                    type="button"
                                    className={`h-auto min-h-11 py-2.5 ${primaryBtnClass}`}
                                    disabled={
                                      isKlingSubmitting ||
                                      Boolean(klingPollTaskId) ||
                                      !nanoBananaImageUrl ||
                                      !composeVideoPromptFromSections(videoPromptSections).trim()
                                    }
                                    onClick={() => {
                                      const nextPrompt = composeVideoPromptFromSections(videoPromptSections).trim();
                                      if (!nextPrompt) return;
                                      setEditableVideoPrompt(nextPrompt);
                                      setUgcVideoPromptGpt(nextPrompt);
                                      setVideoPromptHasEdits(false);
                                      setVideoPromptInlineEdit(false);
                                      void onGenerateKlingVideo(nextPrompt);
                                    }}
                                  >
                                    <span className="inline-flex items-center gap-2 text-sm font-semibold leading-tight">
                                      <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                                      Regenerate video
                                    </span>
                                  </Button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-8 text-center">
                      <div>
                        <p className="text-base font-semibold text-white/90">
                          Image {(nanoBananaSelectedImageIndex ?? 0) + 1} selected
                        </p>
                        <p className="mx-auto mt-2 max-w-sm text-sm text-white/55">
                          Generate a motion prompt and video from this frame, or pick another 1:1 reference (left strip or
                          “Next step” column).
                        </p>
                      </div>
                      <Button
                        type="button"
                        disabled={
                          isVideoPromptLoading ||
                          isKlingSubmitting ||
                          Boolean(klingPollTaskId) ||
                          !nanoBananaImageUrl
                        }
                        onClick={() => void handleGenerateVideoFromSelectedImage()}
                        className={`flex h-auto min-h-12 py-2.5 ${primaryBtnClass}`}
                      >
                        <span className="inline-flex items-center justify-center gap-2 text-base font-semibold leading-tight">
                          <Video className="h-5 w-5 shrink-0" aria-hidden />
                          Generate video from this image
                        </span>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>

    {nanoImageLightboxUrl ? (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/88 p-4 backdrop-blur-[2px]"
        onClick={() => setNanoImageLightboxUrl(null)}
        role="dialog"
        aria-modal="true"
        aria-label="Full reference image"
      >
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute right-3 top-3 z-10 h-10 w-10 rounded-full border border-white/20 bg-black/65 text-white shadow-lg hover:bg-black/85"
          onClick={(e) => {
            e.stopPropagation();
            setNanoImageLightboxUrl(null);
          }}
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden />
        </Button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={nanoImageLightboxUrl}
          alt="Full reference image preview"
          className="max-h-[92vh] max-w-[min(100%,1200px)] rounded-xl border border-violet-500/20 object-contain shadow-[0_0_60px_rgba(139,92,246,0.15)]"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    ) : null}

    {ltaCreditModal ? (
      <StudioBillingDialog
        open
        onOpenChange={(open) => {
          if (!open) setLtaCreditModal(null);
        }}
        planId={planId}
        studioMode="video"
        variant={{
          kind: "credits",
          currentCredits: ltaCreditModal.current,
          requiredCredits: ltaCreditModal.required,
        }}
      />
    ) : null}
    <AvatarPickerDialog
      open={avatarPickerOpen}
      onOpenChange={setAvatarPickerOpen}
      avatarUrls={avatarUrls}
      onPick={addAvatarAsProductPhoto}
      title="Choose avatar for product photos"
    />
    </>
  );
}

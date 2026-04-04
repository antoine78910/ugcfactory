"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Maximize2,
  PenLine,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  User,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UploadBusyOverlay } from "@/app/_components/UploadBusyOverlay";
import { absolutizeImageUrl } from "@/lib/imageUrl";
import {
  allProductUrlsForNanoBanana,
  pickBestProductUrlForNanoBanana,
  productUrlsForGpt,
} from "@/lib/productReferenceImages";
import {
  cloneAnglePipeline,
  cloneExtractedBase,
  createEmptyKlingByReference,
  deriveAngleLabelsFromScripts,
  emptyAnglePipeline,
  flattenAnglePipeToTopLevel,
  normalizeKlingByReference,
  normalizePipelineByAngle,
  mergeNanoPromptForApi,
  composeThreeLabeledPrompts,
  composeVideoPromptEditableSections,
  parseNanoEditableSections,
  parseThreeLabeledPrompts,
  parseVideoPromptEditableSections,
  splitUgcVideoPromptForEditing,
  type VideoPromptEditableSections,
  readUniverseFromExtracted,
  splitAllScriptOptions,
  splitNanoPromptBodyForEditing,
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
  getPersonalPiapiApiKey,
  isPlatformCreditBypassActive,
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
import {
  factorWordRulesForUgcDuration,
  normalizeUgcScriptVideoDurationSec,
} from "@/lib/ugcAiScriptBrief";
import { LINK_TO_AD_LOADING_MESSAGES } from "@/lib/linkToAd/loadingMessageLoops";
import { assertStudioImageUpload, STUDIO_IMAGE_FILE_ACCEPT } from "@/lib/studioUploadValidation";
import {
  creditsLinkToAdFullPipeline,
  creditsLinkToAdVideoFromImage,
  LINK_TO_AD_DEFAULT_VIDEO_MODEL,
  LINK_TO_AD_DEFAULT_VIDEO_DURATION_SEC,
  LINK_TO_AD_VIDEO_MARKET_MODEL,
} from "@/lib/linkToAd/generationCredits";
import type { InternalFetch } from "@/lib/linkToAd/internalFetch";
import { runInitialPipeline } from "@/lib/linkToAd/runInitialPipeline";
import { proxiedMediaSrc } from "@/lib/mediaProxyUrl";
import { loadAvatarUrls } from "@/lib/avatarLibrary";
import { AvatarPickerDialog } from "@/app/_components/AvatarPickerDialog";
import { clipboardImageFiles } from "@/lib/clipboardImage";
import VideoCard from "@/app/_components/VideoCard";
import {
  STUDIO_GENERATION_KIND_LINK_TO_AD_IMAGE,
  STUDIO_GENERATION_KIND_LINK_TO_AD_VIDEO,
} from "@/lib/studioGenerationKinds";

/** Same-origin API calls with session (mirrors server `createInternalFetchFromRequest`). */
const browserPipelineFetch = ((path: string, init?: RequestInit) => fetch(path, init)) as InternalFetch;

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

function fnv1aHash(input: string): string {
  // Tiny deterministic hash for “did references change?” checks.
  // (Avoid expensive crypto; collisions are extremely unlikely for this use.)
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Unsigned 32-bit to hex.
  return (h >>> 0).toString(16);
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

/** While KIE jobs run, show each frame as soon as its URL exists; skeleton only for missing slots. */
function NanoThreeImageGenerationGrid({
  urls,
  busy,
  captions,
}: {
  urls: [string, string, string];
  busy: boolean;
  captions: [string, string, string];
}) {
  const reduceMotion = useReducedMotion();
  const filled = urls.filter((u) => u.trim()).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {([0, 1, 2] as const).map((i) => {
          const url = urls[i]?.trim();
          const cap = (captions[i] ?? "").trim() || `Frame ${i + 1}`;
          return (
            <div key={i} className="flex min-w-0 flex-col gap-1.5">
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-black/20">
                {url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={proxiedMediaSrc(url)}
                      alt=""
                      className="h-full w-full object-cover object-center"
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                    />
                    <div className="absolute left-2 top-2 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-white/70">
                      {i + 1}
                    </div>
                  </>
                ) : busy ? (
                  <motion.div
                    className="relative h-full w-full"
                    aria-hidden
                    initial={reduceMotion ? undefined : { opacity: 0.6, y: 8 }}
                    animate={reduceMotion ? undefined : { opacity: [0.65, 1, 0.65], y: [4, 0, 4] }}
                    transition={{
                      duration: 2.1,
                      delay: i * 0.12,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
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
                    <motion.div
                      className="absolute -left-[40%] top-0 h-full w-[45%] bg-gradient-to-r from-transparent via-violet-300/16 to-transparent"
                      animate={reduceMotion ? undefined : { x: ["0%", "300%"] }}
                      transition={{
                        duration: 1.8,
                        delay: i * 0.18,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-violet-500/10 via-transparent to-violet-900/20" />
                    <div className="absolute left-2 top-2 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-white/70">
                      {i + 1}
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-white/25">—</div>
                )}
              </div>
              {!busy ? (
                <p className="line-clamp-2 break-words text-center text-[10px] leading-tight text-white/40">{cap}</p>
              ) : null}
            </div>
          );
        })}
      </div>
      {busy ? (
        <div className="flex items-center gap-2 text-xs font-normal text-white/45">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300/80" aria-hidden />
          <span>{filled >= 3 ? "Saving project…" : `Generating images… (${filled}/3 ready)`}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Large 9:16 stage while Kling renders — same visual language as Nano image generation (feed-ready). */
function KlingVideoGenerationPlaceholder({
  posterUrl,
  statusText,
}: {
  posterUrl: string | null | undefined;
  statusText: string;
}) {
  const reduceMotion = useReducedMotion();
  const poster = posterUrl?.trim();
  return (
    <div className="relative mx-auto mt-4 w-full max-w-[min(22rem,94vw)] sm:max-w-[24rem]">
      <div
        className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/12 bg-black/45 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.75)]"
        role="status"
        aria-live="polite"
        aria-label={statusText}
      >
        {poster ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxiedMediaSrc(poster)}
              alt=""
              className="absolute inset-0 h-full w-full scale-[1.08] object-cover object-center opacity-40 blur-md"
              loading="eager"
              decoding="async"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxiedMediaSrc(poster)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.22]"
              loading="eager"
              decoding="async"
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-violet-950/95 via-black to-indigo-950/90" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/50 to-black/80" />
        <ShapeGrid
          direction="diagonal"
          speed={0.52}
          squareSize={18}
          borderColor="#4c1d95"
          hoverFillColor="#2e1065"
          shape="hexagon"
          hoverTrailAmount={0}
          className="absolute inset-0 h-full w-full opacity-[0.5]"
        />
        <motion.div
          className="pointer-events-none absolute -left-[38%] top-0 h-full w-[44%] bg-gradient-to-r from-transparent via-fuchsia-200/14 to-transparent"
          animate={reduceMotion ? undefined : { x: ["0%", "320%"] }}
          transition={{ duration: 2.05, repeat: Infinity, ease: "linear" }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-violet-950/30 via-transparent to-violet-500/5" />
        <div className="absolute left-3 top-3 rounded-full border border-white/12 bg-black/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/65">
          9:16 · Feed
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <motion.div
            className="relative flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full border border-violet-400/20 bg-black/35 shadow-[0_0_40px_rgba(139,92,246,0.28)]"
            animate={reduceMotion ? undefined : { scale: [1, 1.05, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Loader2 className="h-9 w-9 animate-spin text-violet-200/95" aria-hidden />
          </motion.div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Video</p>
            <StatusLineShimmer text={statusText} className="text-sm font-medium text-white/88" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Retries transient failures during long NanoBanana runs (browser often surfaces these as "fetch failed"). */
async function fetchWithRetry(
  input: string,
  init: RequestInit | undefined,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<Response> {
  const retries = opts?.retries ?? 4;
  const base = opts?.baseDelayMs ?? 650;
  let lastErr: unknown;
  for (let a = 0; a < retries; a++) {
    try {
      const res = await fetch(input, init);
      const retryStatus =
        res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
      if (retryStatus && a < retries - 1) {
        await new Promise((r) => setTimeout(r, base * (a + 1)));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (a < retries - 1) {
        await new Promise((r) => setTimeout(r, base * (a + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export type LinkToAdRecentRunChip = {
  id: string;
  title: string | null;
  storeUrl: string;
  createdAt: string;
  thumbUrl: string | null;
};

export type LinkToAdUniverseProps = {
  /** When set, load this run once (e.g. from Projects). */
  resumeRunId?: string | null;
  onResumeConsumed?: () => void;
  /** Refresh Projects list after save. */
  onRunsChanged?: () => void;
  /** Last few Link to Ad runs (e.g. 3 most recent) for quick switching. */
  recentLinkToAdRuns?: LinkToAdRecentRunChip[];
  /** Current run id (persisted) — highlights the active chip. */
  activeRunId?: string | null;
  onActiveRunIdChange?: (runId: string | null) => void;
  /** Parent remounts Link to Ad for a clean session (Return to Link to Ad). */
  onStartFreshLinkToAdSession?: () => void;
  /** Load another run in place (same as Projects → open). */
  onSwitchLinkToAdRun?: (runId: string) => void;
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

function PersonaPhotoSection({
  personaPhotoUrls,
  pendingPersonaUploads,
  isUploading,
  isWorking,
  onUploadClick,
  onAvatarPickerOpen,
  avatarUrlsCount,
  onRemove,
}: {
  personaPhotoUrls: string[];
  pendingPersonaUploads: { id: string; blob: string }[];
  isUploading: boolean;
  isWorking: boolean;
  onUploadClick: () => void;
  onAvatarPickerOpen: () => void;
  avatarUrlsCount: number;
  onRemove: (url: string) => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
          <User className="h-3 w-3" />
          Persona / Avatar
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-white/30">
            Optional
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isWorking || isUploading}
            className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white/80 disabled:opacity-50"
            onClick={onUploadClick}
          >
            <ImagePlus className="h-3 w-3" />
            Upload photo
          </button>
          <button
            type="button"
            disabled={isWorking || isUploading}
            className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white/80 disabled:opacity-50"
            onClick={onAvatarPickerOpen}
            title={avatarUrlsCount === 0 ? "Studio → Avatar: generate an avatar first" : undefined}
          >
            Use avatar
          </button>
        </div>
      </div>
      {personaPhotoUrls.length > 0 || pendingPersonaUploads.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {pendingPersonaUploads.map((row) => (
            <div
              key={row.id}
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-violet-500/35 bg-[#050507]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.blob} alt="" className="h-full w-full object-cover" />
              <UploadBusyOverlay active className="rounded-full" />
            </div>
          ))}
          {personaPhotoUrls.map((url, i) => (
            <div key={`persona-${url}-${i}`} className="group/persona relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-violet-400/30 bg-[#050507]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Persona ${i + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <button
                type="button"
                onClick={() => onRemove(url)}
                className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white/60 opacity-0 transition hover:text-red-400 group-hover/persona:opacity-100"
                aria-label="Remove"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={isWorking || isUploading}
            onClick={onUploadClick}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-white/15 bg-white/[0.02] text-white/30 transition hover:border-violet-400/40 hover:text-violet-300 disabled:opacity-50"
            aria-label="Add persona photo"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={isWorking || isUploading}
          onClick={onUploadClick}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-white/35 transition hover:border-violet-400/30 hover:text-white/50 disabled:opacity-50"
        >
          <User className="h-4 w-4" />
          Add a person or avatar to appear in the video
        </button>
      )}
      {personaPhotoUrls.length > 0 && (
        <p className="text-[10px] leading-relaxed text-violet-300/60">
          The persona photo will be used as visual reference — avatar description will be skipped in the script.
        </p>
      )}
    </div>
  );
}

export default function LinkToAdUniverse({
  resumeRunId,
  onResumeConsumed,
  onRunsChanged,
  recentLinkToAdRuns = [],
  activeRunId: activeRunIdProp = null,
  onActiveRunIdChange,
  onStartFreshLinkToAdSession,
  onSwitchLinkToAdRun,
}: LinkToAdUniverseProps) {
  const reduceMotion = useReducedMotion();
  const { planId, current: creditsBalance, spendCredits, grantCredits } = useCreditsPlan();
  /** After a fresh store scan starts, gate later steps against this snapshot so the wallet UI does not “jump” each step. Resync on image/video redo actions only. */
  const [ltaFrozenCredits, setLtaFrozenCredits] = useState<number | null>(null);
  const creditsBalanceRef = useRef(creditsBalance);
  creditsBalanceRef.current = creditsBalance;
  /** When true, we already charged 10 credits once for regenerating the 3 Nano images. */
  const [ltaPrepaidThreeImagesRegen, setLtaPrepaidThreeImagesRegen] = useState(false);
  /** Previous images kept “warm” on the left when regenerating angles without recreating visuals. */
  const [ltaWarmReferenceImages, setLtaWarmReferenceImages] = useState<string[]>([]);

  const [ltaCreditModal, setLtaCreditModal] = useState<{
    required: number;
    current: number;
  } | null>(null);

  /** Deduct from wallet once on URL Generate; keep ref/frozen in sync with that charge. */
  const spendLtaCreditsIfEnough = useCallback(
    (cost: number): boolean => {
      if (isPlatformCreditBypassActive()) return true;
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

  const registerLinkToAdStudioImage = useCallback(async (taskId: string, label: string) => {
    try {
      await fetch("/api/studio/generations/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: STUDIO_GENERATION_KIND_LINK_TO_AD_IMAGE,
          label,
          taskId,
          provider: "kie-market",
          creditsCharged: 0,
          personalApiKey: getPersonalApiKey(),
        }),
      });
    } catch {
      /* ignore */
    }
  }, []);

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
  const [personaPhotoUrls, setPersonaPhotoUrls] = useState<string[]>([]);
  const [pendingPersonaUploads, setPendingPersonaUploads] = useState<{ id: string; blob: string }[]>([]);
  const [isUploadingPersonaPhotos, setIsUploadingPersonaPhotos] = useState(false);
  const personaPhotoInputRef = useRef<HTMLInputElement>(null);
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
  const scriptProvider = "claude" as const;

  const [videoDuration, setVideoDuration] = useState<number>(LINK_TO_AD_DEFAULT_VIDEO_DURATION_SEC);
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
  const [angleLabels, setAngleLabels] = useState<string[]>(["", "", ""]);
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
  const [videoPromptSections, setVideoPromptSections] = useState<VideoPromptEditableSections>({
    motion: "",
    dialogue: "",
    ambience: "",
  });
  /** Text after EDIT blocks (fidelity / audio rules) — not shown in UI, sent to the video model. */
  const [videoPromptTechnicalTail, setVideoPromptTechnicalTail] = useState("");
  /** Older one-blob prompts without EDIT — sections.motion holds the full creative text. */
  const [videoPromptIsLegacyBlob, setVideoPromptIsLegacyBlob] = useState(false);
  /** Native <details> open state — hide summary preview while editing to avoid duplicating Motion/Dialogue/Ambience. */
  const [videoBriefDetailsOpen, setVideoBriefDetailsOpen] = useState(false);
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
  const [nanoPromptDrafts, setNanoPromptDrafts] = useState<[string, string, string]>(["", "", ""]);
  /** Technical suffix (negative prompt, etc.) — not shown in the main editor; rejoined when generating. */
  const [nanoPromptTechnicalTails, setNanoPromptTechnicalTails] = useState<[string, string, string]>([
    "",
    "",
    "",
  ]);
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
  const [productImageLightboxUrl, setProductImageLightboxUrl] = useState<string | null>(null);
  const [expandedAngleBriefs, setExpandedAngleBriefs] = useState<Record<number, boolean>>({});
  const [angleSummaryDrafts, setAngleSummaryDrafts] = useState<Record<number, string>>({});
  /** Screen-recording: hide recent-generation chips (stored in localStorage). */
  const [hidePreviousLtaGenerations, setHidePreviousLtaGenerations] = useState(false);

  const nanoBananaPromptsSignatureRef = useRef<string | null>(null);
  /** Incremented when user abandons the flow so late pipeline responses do not re-hydrate the UI. */
  const linkToAdFlowEpochRef = useRef(0);

  const nanoPromptsAbortRef = useRef<AbortController | null>(null);
  const nanoImageAbortRef = useRef<AbortController | null>(null);
  const nanoThreeAbortRef = useRef<AbortController | null>(null);
  const videoPromptAbortRef = useRef<AbortController | null>(null);
  const klingAbortRef = useRef<AbortController | null>(null);

  const hydrateVideoPromptFromStored = useCallback((full: string) => {
    const raw = full.replace(/\r\n/g, "\n").trim();
    if (!raw) {
      setVideoPromptTechnicalTail("");
      setVideoPromptIsLegacyBlob(false);
      setVideoPromptSections({ motion: "", dialogue: "", ambience: "" });
      return;
    }
    const { editable, technicalTail } = splitUgcVideoPromptForEditing(full);
    setVideoPromptTechnicalTail(technicalTail);
    const parsed = parseVideoPromptEditableSections(editable);
    if (parsed.isStructured) {
      setVideoPromptIsLegacyBlob(false);
      setVideoPromptSections({
        motion: parsed.motion,
        dialogue: parsed.dialogue,
        ambience: parsed.ambience,
      });
    } else {
      setVideoPromptIsLegacyBlob(true);
      setVideoPromptSections({ motion: editable, dialogue: "", ambience: "" });
    }
  }, []);

  const mergedVideoPromptDraft = useMemo(() => {
    const editable = videoPromptIsLegacyBlob
      ? videoPromptSections.motion.trim()
      : composeVideoPromptEditableSections(videoPromptSections).trim();
    return mergeNanoPromptForApi(editable, videoPromptTechnicalTail).trim();
  }, [videoPromptSections, videoPromptTechnicalTail, videoPromptIsLegacyBlob]);

  const cancelCurrentGeneration = useCallback((opts?: { silent?: boolean }) => {
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
    if (!opts?.silent) {
      toast.message("Generation cancelled", { description: "Stopped polling and aborted pending requests." });
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelCurrentGeneration({ silent: true });
    };
  }, [cancelCurrentGeneration]);

  useEffect(() => {
    try {
      const v = localStorage.getItem("link-to-ad-hide-previous-generations");
      if (v === "1") setHidePreviousLtaGenerations(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    onActiveRunIdChange?.(universeRunId);
  }, [universeRunId, onActiveRunIdChange]);

  const toggleHidePreviousLtaGenerations = useCallback(() => {
    setHidePreviousLtaGenerations((h) => {
      const next = !h;
      try {
        localStorage.setItem("link-to-ad-hide-previous-generations", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const hasStartedLinkToAdFlow = useMemo(
    () =>
      Boolean(
        storeUrl.trim() ||
          summaryText.trim() ||
          scriptsText.trim() ||
          universeRunId ||
          lastExtractedJson ||
          neutralUploadUrl ||
          productOnlyImageUrls.length > 0 ||
          userPhotoUrls.length > 0 ||
          avatarPhotoUrls.length > 0 ||
          avatarUrls.length > 0 ||
          personaPhotoUrls.length > 0 ||
          pendingProductUploads.length > 0 ||
          pendingPersonaUploads.length > 0 ||
          stage !== "idle" ||
          isWorking ||
          isUploadingAdditionalPhotos,
      ),
    [
      storeUrl,
      summaryText,
      scriptsText,
      universeRunId,
      lastExtractedJson,
      neutralUploadUrl,
      productOnlyImageUrls.length,
      userPhotoUrls.length,
      avatarPhotoUrls.length,
      avatarUrls.length,
      personaPhotoUrls.length,
      pendingProductUploads.length,
      pendingPersonaUploads.length,
      stage,
      isWorking,
      isUploadingAdditionalPhotos,
    ],
  );

  const confirmAndResetLinkToAdToStart = useCallback(() => {
    const msg = [
      "Cancel this Link to Ad?",
      "",
      "The draft on this screen will be lost (URL, brief, scripts, uploads, in-progress media).",
      "Credits already spent will NOT be refunded.",
      "",
      "Runs already saved to your Projects are not deleted.",
    ].join("\n");
    if (typeof window !== "undefined" && !window.confirm(msg)) return;

    linkToAdFlowEpochRef.current += 1;
    cancelCurrentGeneration({ silent: true });
    setIsWorking(false);
    setIsUploadingAdditionalPhotos(false);
    setStage("idle");
    setServerPipelineStepIndex(null);
    setStoreUrl("");
    setSummaryText("");
    setScriptsText("");
    setPendingCustomAnglePreview(null);
    setCustomAngleInput("");
    setPendingCustomAngleEditing(false);
    setAngleLabels(["", "", ""]);
    setSelectedAngleIndex(null);
    setNeutralUploadUrl(null);
    setUniverseRunId(null);
    setLastExtractedJson(null);
    setExtractedTitle(null);
    setCleanCandidate(null);
    setFallbackImageUrl(null);
    setConfidence(null);
    setProductOnlyImageUrls([]);
    setUserPhotoUrls([]);
    setAvatarPhotoUrls([]);
    setAvatarUrls([]);
    setPersonaPhotoUrls([]);
    setPendingProductUploads([]);
    setPendingPersonaUploads([]);
    setImgError(false);
    setBrandFaviconFailed(false);
    setAvatarPickerOpen(false);
    setNanoBananaPromptsRaw("");
    setNanoBananaSelectedPromptIndex(0);
    setNanoBananaTaskId(null);
    setNanoBananaImageUrl(null);
    setNanoBananaImageUrls([]);
    setNanoBananaSelectedImageIndex(null);
    setUgcVideoPromptGpt("");
    hydrateVideoPromptFromStored("");
    setKlingByRef(createEmptyKlingByReference());
    setNanoPollTaskId(null);
    setNanoPollingSlotIndex(null);
    setKlingPollTaskId(null);
    setKlingPollImageIndex(null);
    setUserStartedVideoFromImage(false);
    setVideoStageMode(false);
    setPipelineByAngle([emptyAnglePipeline(), emptyAnglePipeline(), emptyAnglePipeline()]);
    setEditableScript("");
    setScriptFactors({ ...EMPTY_SCRIPT_FACTORS });
    setScriptHasEdits(false);
    setScriptEditVisible(false);
    setExpandedAngleScripts({});
    setExpandedAngleBriefs({});
    setAngleSummaryDrafts({});
    setAngleScriptDrafts({});
    setNanoImageLightboxUrl(null);
    setProductImageLightboxUrl(null);
    setNanoPromptDrafts(["", "", ""]);
    setNanoPromptTechnicalTails(["", "", ""]);
    setGenerationMode("automatic");
    setCustomUgcTopic("");
    setCustomUgcOffer("");
    setCustomUgcCta("");
    setLtaFrozenCredits(null);
    latestSnapRef.current = null;
    prevAngleRef.current = null;
    nanoBananaPromptsSignatureRef.current = null;
    onRunsChanged?.();
    toast.message("Link to Ad reset", { description: "You can start a new ad from scratch." });
  }, [cancelCurrentGeneration, onRunsChanged]);

  const handleReturnToFreshLinkToAd = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Start a new Link to Ad? Unsaved work on this screen will be cleared. Saved generations stay in Projects.",
      )
    ) {
      return;
    }
    cancelCurrentGeneration({ silent: true });
    onStartFreshLinkToAdSession?.();
  }, [cancelCurrentGeneration, onStartFreshLinkToAdSession]);

  const handleSwitchRecentRun = useCallback(
    (runId: string) => {
      const active = activeRunIdProp ?? universeRunId;
      if (runId === active) {
        toast.message("Already on this generation");
        return;
      }
      cancelCurrentGeneration({ silent: true });
      onSwitchLinkToAdRun?.(runId);
    },
    [activeRunIdProp, universeRunId, cancelCurrentGeneration, onSwitchLinkToAdRun],
  );

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
  const showKlingVideoGeneratingUi = isKlingSubmitting || klingRenderingThisReference;

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
    const vPrompt = p.ugcVideoPromptGpt ?? "";
    setUgcVideoPromptGpt(vPrompt);
    hydrateVideoPromptFromStored(vPrompt);
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
        (vPrompt && vPrompt.trim()) ||
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
  /** Same for single-image Nano poll after hydrate clears `nanoPollTaskId`. */
  const nanoResumeAttemptedRef = useRef(false);
  /** Guard for auto-resuming scripts generation when user returns to a run that has summary but no scripts. */
  const scriptsResumeAttemptedRef = useRef(false);

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
      personaPhotoUrls: personaPhotoUrls.length ? personaPhotoUrls : undefined,
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
    personaPhotoUrls,
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
  const fullNanoPromptsTriple = useMemo((): [string, string, string] => {
    return [
      mergeNanoPromptForApi(nanoPromptDrafts[0] ?? "", nanoPromptTechnicalTails[0] ?? "").trim(),
      mergeNanoPromptForApi(nanoPromptDrafts[1] ?? "", nanoPromptTechnicalTails[1] ?? "").trim(),
      mergeNanoPromptForApi(nanoPromptDrafts[2] ?? "", nanoPromptTechnicalTails[2] ?? "").trim(),
    ] as [string, string, string];
  }, [nanoPromptDrafts, nanoPromptTechnicalTails]);
  const scriptOptionBodiesAll = useMemo(() => splitAllScriptOptions(scriptsText), [scriptsText]);
  const hasAvatarPhoto = avatarPhotoUrls.length > 0;
  const hasPersonaPhoto = personaPhotoUrls.length > 0;
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
      const explicit = angleLabels[i]?.trim() ?? "";
      const body = scriptOptionBodiesAll[i] ?? "";
      const parts = body
        ? angleBriefPartsFromScriptOption(body, (i === 0 ? 0 : i === 1 ? 1 : 2) as 0 | 1 | 2)
        : { brief: "", full: "", canExpand: false };
      const shouldSanitize = hasAvatarPhoto || hasPersonaPhoto;
      const explicitSafe = shouldSanitize ? sanitizeAngleLabelForAvatar(explicit) : explicit;
      const fallbackSafe = shouldSanitize ? sanitizeAngleLabelForAvatar(parts.brief) : parts.brief;
      const fullSafe = shouldSanitize ? sanitizeAngleLabelForAvatar(parts.full) : parts.full;
      const fallback = fallbackSafe;
      return {
        index: i,
        label: explicitSafe || fallback || "…",
        fullLabel: explicitSafe || fullSafe || fallback || "…",
        canExpand: Boolean(!explicitSafe && parts.canExpand && fullSafe && fullSafe !== (explicitSafe || fallback)),
      };
    });
  }, [angleLabels, hasAvatarPhoto, hasPersonaPhoto, sanitizeAngleLabelForAvatar, scriptOptionBodiesAll]);

  useEffect(() => {
    const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();
    const merged: [string, string, string] = [
      mergeNanoPromptForApi(nanoPromptDrafts[0] ?? "", nanoPromptTechnicalTails[0] ?? ""),
      mergeNanoPromptForApi(nanoPromptDrafts[1] ?? "", nanoPromptTechnicalTails[1] ?? ""),
      mergeNanoPromptForApi(nanoPromptDrafts[2] ?? "", nanoPromptTechnicalTails[2] ?? ""),
    ];
    const composed = composeThreeLabeledPrompts(merged);
    if (norm(composed) === norm(nanoBananaPromptsRaw)) {
      return;
    }
    const parsed = parseThreeLabeledPrompts(nanoBananaPromptsRaw);
    const parts = parsed.map((p) => splitNanoPromptBodyForEditing(p));
    setNanoPromptDrafts([parts[0].editable, parts[1].editable, parts[2].editable]);
    setNanoPromptTechnicalTails([parts[0].technicalTail, parts[1].technicalTail, parts[2].technicalTail]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drafts/tails read for compose guard when raw changes (skip re-parse after user edit)
  }, [nanoBananaPromptsRaw]);

  const factorWordRules = useMemo(
    () => factorWordRulesForUgcDuration(videoDuration),
    [videoDuration],
  );

  const factorWordCounts = useMemo(() => {
    return {
      hook: countWords(scriptFactors.hook),
      problem: countWords(scriptFactors.problem),
      benefits: countWords(scriptFactors.benefits),
      cta: countWords(scriptFactors.cta),
    };
  }, [scriptFactors.benefits, scriptFactors.cta, scriptFactors.hook, scriptFactors.problem]);

  const spokenWordTotal = useMemo(() => {
    return (
      factorWordCounts.hook +
      (factorWordRules.problem ? factorWordCounts.problem : 0) +
      factorWordCounts.benefits +
      factorWordCounts.cta
    );
  }, [factorWordCounts, factorWordRules.problem]);

  const factorWordsValid = useMemo(() => {
    const c = factorWordCounts;
    const r = factorWordRules;
    const inRange = (n: number, min: number, max: number) => n >= min && n <= max;
    const hookOk = inRange(c.hook, r.hook.min, r.hook.max);
    const problemOk =
      r.problem === null ? c.problem === 0 : inRange(c.problem, r.problem.min, r.problem.max);
    const benefitsOk = inRange(c.benefits, r.benefits.min, r.benefits.max);
    const ctaOk = inRange(c.cta, r.cta.min, r.cta.max);
    const totalOk = spokenWordTotal <= r.maxTotalSpoken;
    return {
      hook: hookOk,
      problem: problemOk,
      benefits: benefitsOk,
      cta: ctaOk,
      total: totalOk,
      all: hookOk && problemOk && benefitsOk && ctaOk && totalOk,
    };
  }, [factorWordCounts, factorWordRules, spokenWordTotal]);

  /** 5s tier omits PROBLEM — clear leftover text when user selects 5s. */
  useEffect(() => {
    if (normalizeUgcScriptVideoDurationSec(videoDuration) !== 5) return;
    setScriptFactors((prev) => {
      if (!prev.problem.trim()) return prev;
      const next = { ...prev, problem: "" };
      setEditableScript(composeScriptFromFactors(next));
      setScriptHasEdits(true);
      return next;
    });
  }, [videoDuration]);
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
        const headline = angleLabels[index] || "";
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
  const displayedProductImageUrl =
    neutralUploadUrl ?? productOnlyImageUrls[0] ?? cleanCandidate?.url ?? fallbackImageUrl ?? null;

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

  useEffect(() => {
    if (!avatarPickerOpen) return;
    let cancelled = false;
    void loadAvatarUrls().then((urls) => {
      if (!cancelled) setAvatarUrls(urls);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarPickerOpen]);

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
            : snap.fallbackImageUrl?.trim()
              ? [snap.fallbackImageUrl.trim()]
              : [],
      );
      setUserPhotoUrls(
        snap.userPhotoUrls && Array.isArray(snap.userPhotoUrls) ? snap.userPhotoUrls : [],
      );
      setPersonaPhotoUrls(
        snap.personaPhotoUrls && Array.isArray(snap.personaPhotoUrls) ? snap.personaPhotoUrls : [],
      );
      setSummaryText(snap.summaryText);
      setScriptsText(snap.scriptsText);
      setGenerationMode(snap.generationMode === "custom_ugc" ? "custom_ugc" : "automatic");
      setCustomUgcTopic(((snap.customUgcTopic ?? "").trim() || (snap.customUgcIntent ?? "").trim()));
      setCustomUgcOffer((snap.customUgcOffer ?? "").trim());
      setCustomUgcCta((snap.customUgcCta ?? "").trim());
      setPendingCustomAnglePreview(null);
      setAngleLabels(
        snap.angleLabels.length >= 3 && snap.angleLabels[0] && snap.angleLabels[1] && snap.angleLabels[2]
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
      const pipeSlot = sAng === 0 || sAng === 1 || sAng === 2 || sAng === 3 ? Math.min(sAng, 2) : null;
      if (pipeSlot !== null) {
        applyPipelineFromSnapshot(cloneAnglePipeline(triple[pipeSlot]));
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
          assertStudioImageUpload(row.file);
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
          assertStudioImageUpload(row.file);
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
          setNeutralUploadUrl((n) => n ?? url);
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

  async function uploadPersonaPhoto(files: FileList | File[] | null) {
    const list = Array.isArray(files) ? files : Array.from(files ?? []);
    if (!list.length) return;
    const pendingRows = list.map((file) => ({
      id: crypto.randomUUID(),
      blob: URL.createObjectURL(file),
      file,
    }));
    setPendingPersonaUploads((p) => [...p, ...pendingRows.map(({ id, blob }) => ({ id, blob }))]);
    setIsUploadingPersonaPhotos(true);
    let added = 0;
    let lastError: string | null = null;
    try {
      for (const row of pendingRows) {
        try {
          assertStudioImageUpload(row.file);
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
          setPersonaPhotoUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
          setUserPhotoUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
          added++;
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Upload failed";
        } finally {
          URL.revokeObjectURL(row.blob);
          setPendingPersonaUploads((p) => p.filter((x) => x.id !== row.id));
        }
      }
      if (added > 0) toast.success(added > 1 ? `${added} persona photos added` : "Persona photo added");
      if (lastError && added < list.length) toast.error("Some uploads failed", { description: lastError });
    } finally {
      setIsUploadingPersonaPhotos(false);
    }
  }

  function removePersonaPhoto(url: string) {
    setPersonaPhotoUrls((prev) => prev.filter((u) => u !== url));
    setUserPhotoUrls((prev) => prev.filter((u) => u !== url));
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

  function addAvatarAsPersonaPhoto(avatarUrl: string) {
    const u = avatarUrl.trim();
    if (!u) return;
    setPersonaPhotoUrls((prev) => (prev.includes(u) ? prev : [...prev, u]));
    setUserPhotoUrls((prev) => (prev.includes(u) ? prev : [...prev, u]));
    setAvatarPhotoUrls((prev) => (prev.includes(u) ? prev : [...prev, u]));
    toast.success("Persona avatar added");
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
          videoDurationSeconds: videoDuration,
          provider: scriptProvider,
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
    if (currentOptions.length >= 4) {
      toast.error("You can have at most 4 angles. Remove one in Projects or delete an angle first.");
      return;
    }
    const nextNumber = currentOptions.length + 1;
    const merged = scriptsText.trim()
      ? `${scriptsText.trim()}\n\nSCRIPT OPTION ${nextNumber}\n\n${cleanedBody}`
      : `SCRIPT OPTION 1\n\n${cleanedBody}`;
    const nextLabels: string[] = [...angleLabels];
    while (nextLabels.length < nextNumber) nextLabels.push("");
    const firstEmpty = nextLabels.findIndex((l) => !l.trim());
    if (firstEmpty >= 0 && firstEmpty < nextNumber) nextLabels[firstEmpty] = headline;
    else nextLabels[nextNumber - 1] = headline;

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
    opts?: { scriptsText?: string; angleLabels?: string[] },
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
    if (cleanCandidate?.url) push(cleanCandidate.url);
    return out;
  }

  /**
   * URLs for NanoBanana / GPT product vision: packshots only (not avatar refs).
   * Avatars belong in `avatarImageUrls`, not as the primary product reference.
   */
  function buildProductPackshotCandidatesForNano(): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (u: string) => {
      const t = (u || "").trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    for (let i = productOnlyImageUrls.length - 1; i >= 0; i--) push(productOnlyImageUrls[i]);
    if (cleanCandidate?.url) push(cleanCandidate.url);
    return out;
  }

  /** All HTTPS product reference URLs for Nano Banana Pro (multi-angle when available). */
  function resolveNanoProductImageUrls(): string[] {
    const pageUrl = storeUrl.trim();
    if (!pageUrl) return [];
    const all = allProductUrlsForNanoBanana({
      pageUrl,
      neutralUploadUrl,
      candidateUrls: buildProductPackshotCandidatesForNano(),
      fallbackUrl: fallbackImageUrl,
    });
    if (all.length > 0) return all;
    const preview = (resolvedPreviewUrl || "").trim();
    if (preview && /^https?:\/\//i.test(preview)) return [preview];
    return [];
  }

  /** Same image logic as the preview when possible (avoids “button enabled but no HTTPS product” mismatches). */
  function resolveNanoProductImageUrl(): string | null {
    const first = resolveNanoProductImageUrls()[0];
    if (first && /^https?:\/\//i.test(first)) return first;
    return null;
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
        body: JSON.stringify({ runId: universeRunId, videoDurationSeconds: videoDuration }),
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

  const [regenerateAnglesChoiceOpen, setRegenerateAnglesChoiceOpen] = useState(false);

  async function onRegenerateMarketingAngles(opts?: { keepExistingImages?: boolean; regenImagesAlso?: boolean }) {
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
    const wantsRegenImages = Boolean(opts?.regenImagesAlso);
    if (wantsRegenImages && !ltaPrepaidThreeImagesRegen) {
      if (!spendLtaCreditsIfEnough(10)) {
        // Roll back the 2 credits if we cannot also pay the image refresh.
        if (!isPlatformCreditBypassActive()) {
          grantCredits(2);
          creditsBalanceRef.current += 2;
        }
        setLtaFrozenCredits(null);
        return;
      }
      setLtaPrepaidThreeImagesRegen(true);
    }

    setIsWorking(true);
    setStage("writing_scripts");
    try {
      const personaRefs = personaPhotoUrls
        .map((u) => u.trim())
        .filter((u, i, arr) => /^https?:\/\//i.test(u) && arr.indexOf(u) === i)
        .slice(0, 3);
      const prevScripts = scriptsText.trim();
      let nextScripts = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const prevHint =
          attempt === 0
            ? prevScripts
            : `${prevScripts}\n\nIMPORTANT: Generate 3 NEW angles that are clearly different from the previous set (different hooks, pains, and CTAs).`;
        const res = await fetch("/api/gpt/ugc-scripts-from-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeUrl: url,
            productTitle: extractedTitle,
            brandBrief: summaryText.trim(),
            previousScriptsText: prevHint,
            productImageUrls: resolvedProductUrlsForGpt(),
            avatarImageUrls: personaRefs.length > 0 ? personaRefs : undefined,
            videoDurationSeconds: videoDuration,
            generationMode,
            customUgcIntent: composeCustomUgcIntent(customUgcTopic, customUgcOffer, customUgcCta),
            provider: scriptProvider,
          }),
        });
        const json = (await res.json()) as { data?: string; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error || "Regenerate scripts failed");
        nextScripts = String(json.data);
        if (nextScripts.trim() && nextScripts.trim() !== prevScripts) break;
      }
      const nextLabels = deriveAngleLabelsFromScripts(nextScripts);

      // Reset downstream generations to avoid mixing prompts/images/videos across different scripts.
      setScriptsText(nextScripts);
      setAngleLabels(nextLabels);
      setSelectedAngleIndex(0);
      setNanoBananaPromptsRaw("");
      setNanoBananaSelectedPromptIndex(0);
      setNanoBananaTaskId(null);
      const keepImages = Boolean(opts?.keepExistingImages);
      if (keepImages) {
        const warm = nanoBananaImageUrls.filter((u) => typeof u === "string" && u.trim().length > 0);
        if (warm.length) setLtaWarmReferenceImages((prev) => [...warm, ...prev].slice(0, 24));
      }
      // Always clear current 3-image state when scripts change (avoid mixing old visuals with new angles).
      setNanoBananaImageUrl(null);
      setNanoBananaImageUrls([]);
      setNanoBananaSelectedImageIndex(null);
      setUgcVideoPromptGpt("");
      hydrateVideoPromptFromStored("");
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
      if (!isPlatformCreditBypassActive()) {
        grantCredits(2);
        creditsBalanceRef.current += 2;
        if (opts?.regenImagesAlso && ltaPrepaidThreeImagesRegen) {
          grantCredits(10);
          creditsBalanceRef.current += 10;
          setLtaPrepaidThreeImagesRegen(false);
        }
        setLtaFrozenCredits(null);
      }
      const msg = err instanceof Error ? err.message : "Regenerate failed";
      toast.warning("Could not regenerate angles", { description: msg });
      setStage("ready");
    } finally {
      setIsWorking(false);
    }
  }

  function requestRegenerateMarketingAngles() {
    const hasImgs = nanoBananaImageUrls.some((u) => typeof u === "string" && u.trim().length > 0);
    if (hasImgs) {
      setRegenerateAnglesChoiceOpen(true);
      return;
    }
    void onRegenerateMarketingAngles();
  }

  async function onRun(opts?: { bypassSavedProject?: boolean }) {
    const url = storeUrl.trim();
    if (!url) {
      toast.error("Missing URL");
      return;
    }
    const epochAtStart = linkToAdFlowEpochRef.current;

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
            if (linkToAdFlowEpochRef.current !== epochAtStart) {
              setIsWorking(false);
              return;
            }
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
    if (walletNow < ltaGenerateCredits) {
      setIsWorking(false);
      setStage("idle");
      setLtaCreditModal({
        current: walletNow,
        required: ltaGenerateCredits,
      });
      return;
    }
    let chargedFullBundle = false;
    setLtaFrozenCredits(walletNow);
    if (!spendLtaCreditsIfEnough(ltaGenerateCredits)) {
      setIsWorking(false);
      setStage("idle");
      setLtaFrozenCredits(null);
      return;
    }
    chargedFullBundle = true;

    const pipelineProductUrls = [...productOnlyImageUrls];
    const pipelinePersonaUrls = [...personaPhotoUrls];

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
    hydrateVideoPromptFromStored("");
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
          userProductImageUrls: pipelineProductUrls,
          personaImageUrls: pipelinePersonaUrls,
          generationMode,
          customUgcIntent: composeCustomUgcIntent(customUgcTopic, customUgcOffer, customUgcCta),
          aiProvider: scriptProvider,
          videoDurationSeconds: videoDuration,
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
            if (linkToAdFlowEpochRef.current !== epochAtStart) {
              setIsWorking(false);
              return;
            }
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
      if (linkToAdFlowEpochRef.current !== epochAtStart) {
        return;
      }
      setStage("ready");
      toast.success("Project saved");
      if (pipeResult.scriptsStepOk) {
        toast.success("3 UGC scripts ready");
      } else if (pipeResult.scriptsError) {
        toast.warning("Scripts step failed", { description: pipeResult.scriptsError });
      }
      onRunsChanged?.();
    } catch (err) {
      if (linkToAdFlowEpochRef.current !== epochAtStart) {
        setLtaFrozenCredits(null);
        return;
      }
      if (chargedFullBundle) {
        grantCredits(ltaGenerateCredits);
        creditsBalanceRef.current += ltaGenerateCredits;
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

  async function onGenerateNanoBananaPrompts(angleIdx?: number | null): Promise<string | null> {
    const url = storeUrl.trim();
    const idx = angleIdx !== undefined && angleIdx !== null ? angleIdx : selectedAngleIndex;
    const selectedScript = selectedScriptOptionByIndex(scriptsText, idx);
    const script = (idx === selectedAngleIndex ? editableScript : selectedScript).trim() || selectedScript;
    const avatarRefs = personaPhotoUrls
      .map((u) => u.trim())
      .filter((u, i, arr) => /^https?:\/\//i.test(u) && arr.indexOf(u) === i)
      .slice(-3)
      .reverse();
    const nanoRefs = resolveNanoProductImageUrls();
    const img = nanoRefs[0] ?? null;
    const signature = `script:${fnv1aHash(script)}|imgs:${nanoRefs.join(",")}|avatars:${avatarRefs.join(",")}|provider:${scriptProvider}`;
    if (!url || !lastExtractedJson || idx === null || !script.trim()) {
      toast.error("Pick an angle and make sure the script is ready.");
      return null;
    }
    if (!img || !/^https?:\/\//i.test(img)) {
      toast.error("HTTPS product image is required (missing preview or relative URL).");
      return null;
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
          productImageUrls: nanoRefs,
          avatarImageUrls: avatarRefs,
          generationMode,
          customUgcIntent: composeCustomUgcIntent(customUgcTopic, customUgcOffer, customUgcCta),
          provider: scriptProvider,
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
      nanoBananaPromptsSignatureRef.current = signature;
      return text;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      toast.error("Image prompts", { description: e instanceof Error ? e.message : "Unknown error" });
      return null;
    } finally {
      setIsNanoPromptsLoading(false);
    }
  }

  async function onGenerateNanoBananaImage() {
    const url = storeUrl.trim();
    const nanoRefs = resolveNanoProductImageUrls();
    const img = nanoRefs[0];
    const prompt = fullNanoPromptsTriple[nanoBananaSelectedPromptIndex]?.trim();
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
      const res = await fetchWithRetry("/api/nanobanana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          accountPlan: planId,
          model: "pro",
          prompt,
          imageUrls: nanoRefs.length ? nanoRefs : [img],
          resolution: "4K",
          aspectRatio: "9:16",
          personalApiKey: getPersonalApiKey(),
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Image generation failed");
      setNanoBananaTaskId(json.taskId);
      setNanoPollTaskId(json.taskId);
      setNanoPollingSlotIndex(nanoBananaSelectedPromptIndex);
      const angleIdx =
        selectedAngleIndex === 0 || selectedAngleIndex === 1 || selectedAngleIndex === 2 ? selectedAngleIndex : 0;
      void registerLinkToAdStudioImage(json.taskId, `Link to Ad · Angle ${angleIdx + 1} · image`);
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

  async function pollNanoBananaTaskForUrls(taskId: string, signal?: AbortSignal): Promise<string[]> {
    // Poll NanoBanana task until successFlag indicates completion.
    // We keep it simple for pro image generation: take the first URL from the response.
    const sleepMs = 1800;
    // ~12 minutes max wait (enough for most generations).
    const maxAttempts = Math.ceil((12 * 60 * 1000) / sleepMs);
    const pKey = getPersonalApiKey();
    const piKey = getPersonalPiapiApiKey();
    const keyParam = `${pKey ? `&personalApiKey=${encodeURIComponent(pKey)}` : ""}${piKey ? `&piapiApiKey=${encodeURIComponent(piKey)}` : ""}`;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const res = await fetchWithRetry(
        `/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${keyParam}`,
        {
          method: "GET",
          cache: "no-store",
          signal,
        },
      );
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

  /**
   * Run 3 NanoBanana Pro jobs one after another (same billing model as before: 3 distinct prompts ⇒ 3
   * provider tasks; parallel did not reduce cost and was not faster enough for Link to Ad).
   */
  async function runNanoBananaProThreeSequential(
    imageUrls: string[],
    prompts: [string, string, string],
    opts?: { labelPrefix?: string },
    signal?: AbortSignal,
  ): Promise<{ urlsByPrompt: string[]; lastTaskId: string | null; taskIds: string[] }> {
    if (!imageUrls.length) {
      throw new Error("No product reference images.");
    }
    const urlsByPrompt: string[] = ["", "", ""];
    let lastTaskId: string | null = null;
    const taskIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 750));
      }
      const prompt = prompts[i];
      lastNanoImagePromptRef.current = prompt;
      lastNanoImagePromptIndexRef.current = i as 0 | 1 | 2;
      const res = await fetchWithRetry(
        "/api/nanobanana/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            accountPlan: planId,
            model: "pro",
            prompt,
            imageUrls: imageUrls.length ? imageUrls : [],
            resolution: "4K",
            aspectRatio: "9:16",
            personalApiKey: getPersonalApiKey(),
          }),
        },
      );
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Image generation failed");
      lastTaskId = json.taskId;
      taskIds.push(json.taskId);
      void registerLinkToAdStudioImage(
        json.taskId,
        opts?.labelPrefix ? `${opts.labelPrefix} · ${i + 1}/3` : `Link to Ad · Nano ${i + 1}/3`,
      );
      const urls = await pollNanoBananaTaskForUrls(json.taskId, signal);
      urlsByPrompt[i] = urls[0] ?? "";
      setNanoBananaImageUrls([...urlsByPrompt]);
      setNanoBananaTaskId(lastTaskId);
    }
    return { urlsByPrompt, lastTaskId, taskIds };
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
    hydrateVideoPromptFromStored("");
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

  async function onGenerateNanoBananaImagesFromAllPrompts(opts?: { forceRegenerateCharge?: boolean }) {
    const url = storeUrl.trim();
    const idx = selectedAngleIndex;
    if (!url || !lastExtractedJson || idx === null) {
      toast.error("Project not ready to generate images.");
      return;
    }
    const force = Boolean(opts?.forceRegenerateCharge);
    const hasExisting = nanoBananaImageUrls.some((u) => typeof u === "string" && u.trim().length > 0);
    const shouldCharge = (force || hasExisting) && !ltaPrepaidThreeImagesRegen;
    const usingPrepaid = ltaPrepaidThreeImagesRegen && !shouldCharge;
    if (shouldCharge) {
      const walletNow = creditsBalanceRef.current;
      setLtaFrozenCredits(walletNow);
      if (!spendLtaCreditsIfEnough(10)) {
        setLtaFrozenCredits(null);
        return;
      }
    }
    const nanoRefs = resolveNanoProductImageUrls();
    const img = nanoRefs[0];
    if (!img || !/^https?:\/\//i.test(img)) {
      toast.error("HTTPS product image is required to generate images.");
      return;
    }

    // If the user changed product/persona reference images since we last generated prompts,
    // regenerate the 3 NanoBanana prompts so the “New 3 images” takes the latest refs into account.
    const selectedScript = selectedScriptOptionByIndex(scriptsText, idx);
    const script = (idx === selectedAngleIndex ? editableScript : selectedScript).trim() || selectedScript;
    const avatarRefs = personaPhotoUrls
      .map((u) => u.trim())
      .filter((u, i, arr) => /^https?:\/\//i.test(u) && arr.indexOf(u) === i)
      .slice(-3)
      .reverse();
    const signature = `script:${fnv1aHash(script)}|imgs:${nanoRefs.join(",")}|avatars:${avatarRefs.join(",")}|provider:${scriptProvider}`;

    let promptsText = nanoBananaPromptsRaw;
    const signatureMatches = promptsText.trim().length > 0 && nanoBananaPromptsSignatureRef.current === signature;

    let prompts: [string, string, string];
    if (!signatureMatches) {
      const nextPrompts = await onGenerateNanoBananaPrompts(idx);
      if (!nextPrompts) return;
      promptsText = nextPrompts;
      prompts = parseThreeLabeledPrompts(promptsText).map((p) => {
        const { editable, technicalTail } = splitNanoPromptBodyForEditing(p);
        return mergeNanoPromptForApi(editable, technicalTail).trim();
      }) as [string, string, string];
    } else {
      prompts = fullNanoPromptsTriple;
    }

    if (!prompts[0] || !prompts[1] || !prompts[2]) {
      toast.error("Some image prompts are missing.");
      return;
    }

    // Reset old images + downstream state so we don't “reuse” previous results.
    setNanoBananaImageUrl(null);
    setNanoBananaImageUrls([]);
    setNanoBananaSelectedImageIndex(null);
    setNanoBananaSelectedPromptIndex(0);
    setNanoBananaTaskId(null);
    setNanoPollTaskId(null);
    setNanoPollingSlotIndex(null);

    setKlingByRef(createEmptyKlingByReference());
    setUgcVideoPromptGpt("");
    hydrateVideoPromptFromStored("");
    setUserStartedVideoFromImage(false);
    setVideoStageMode(false);

    setIsNanoAllImagesSubmitting(true);
    try {
      nanoThreeAbortRef.current?.abort();
      const controller = new AbortController();
      nanoThreeAbortRef.current = controller;
      const { urlsByPrompt, lastTaskId } = await runNanoBananaProThreeSequential(
        nanoRefs,
        prompts as [string, string, string],
        { labelPrefix: `Link to Ad · Angle ${idx + 1}` },
        controller.signal,
      );

      if (!urlsByPrompt[0] || !urlsByPrompt[1] || !urlsByPrompt[2]) {
        throw new Error("Image generation did not produce 3 images.");
      }

      await persistNanoThreeGeneratedImages(url, prompts as [string, string, string], urlsByPrompt, lastTaskId);

      toast.success("3 images generated");
      if (shouldCharge || usingPrepaid) setLtaPrepaidThreeImagesRegen(false);
      setLtaFrozenCredits(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if ((shouldCharge || usingPrepaid) && !isPlatformCreditBypassActive()) {
        grantCredits(10);
        creditsBalanceRef.current += 10;
        setLtaPrepaidThreeImagesRegen(false);
        setLtaFrozenCredits(null);
      }
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
    const prompt = fullNanoPromptsTriple[idx]?.trim() || "";

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
    hydrateVideoPromptFromStored(promptForNew);
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
        const nPiKey = getPersonalPiapiApiKey();
        const nParam = `${nKey ? `&personalApiKey=${encodeURIComponent(nKey)}` : ""}${nPiKey ? `&piapiApiKey=${encodeURIComponent(nPiKey)}` : ""}`;
        const res = await fetchWithRetry(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${nParam}`, {
          cache: "no-store",
        });
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
    interval = setInterval(tick, 2000);
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
        body: JSON.stringify({ angleScript: script, provider: scriptProvider }),
      });
      const json = (await res.json()) as { data?: string; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Video prompt failed");
      const text = String(json.data);
      setUgcVideoPromptGpt(text);
      hydrateVideoPromptFromStored(text);
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
          linkToAd: true,
          accountPlan: planId,
          marketModel: LINK_TO_AD_VIDEO_MARKET_MODEL,
          prompt: klingPrompt,
          imageUrl: img,
          duration: videoDuration,
          aspectRatio: "9:16",
          personalApiKey: getPersonalApiKey(),
          piapiApiKey: getPersonalPiapiApiKey(),
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Video generation failed");
      try {
        const angLabel =
          selectedAngleIndex === 0 || selectedAngleIndex === 1 || selectedAngleIndex === 2
            ? `Link to Ad · Angle ${selectedAngleIndex + 1}`
            : "Link to Ad · Video";
        await fetch("/api/studio/generations/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: STUDIO_GENERATION_KIND_LINK_TO_AD_VIDEO,
            label: angLabel,
            taskId: json.taskId,
            provider: "piapi",
            creditsCharged: 0,
            personalApiKey: getPersonalApiKey(),
            piapiApiKey: getPersonalPiapiApiKey(),
          }),
        });
      } catch {
        /* ignore history registration */
      }
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

  const nanoResumeSignature = useMemo(
    () => `${nanoBananaTaskId ?? ""}|${nanoBananaImageUrl ?? ""}|${nanoBananaImageUrls.join("|")}`,
    [nanoBananaTaskId, nanoBananaImageUrl, nanoBananaImageUrls],
  );

  useEffect(() => {
    nanoResumeAttemptedRef.current = false;
  }, [nanoResumeSignature]);

  useEffect(() => {
    scriptsResumeAttemptedRef.current = false;
  }, [universeRunId]);

  /** Resume Nano single-image poll after hydrate (hydrate clears `nanoPollTaskId`). */
  useEffect(() => {
    if (nanoPollTaskId) return;
    if (isNanoAllImagesSubmitting) return;
    if (isNanoImageSubmitting) return;
    if (nanoResumeAttemptedRef.current) return;
    const tid = nanoBananaTaskId?.trim();
    if (!tid) return;
    if (nanoBananaImageUrl) return;
    if (nanoBananaImageUrls.some((u) => Boolean(u?.trim()))) return;
    nanoResumeAttemptedRef.current = true;
    setNanoPollTaskId(tid);
    const slot =
      nanoBananaSelectedPromptIndex === 0 || nanoBananaSelectedPromptIndex === 1 || nanoBananaSelectedPromptIndex === 2
        ? nanoBananaSelectedPromptIndex
        : 0;
    lastNanoImagePromptIndexRef.current = slot;
    setNanoPollingSlotIndex(slot);
  }, [
    nanoPollTaskId,
    isNanoAllImagesSubmitting,
    isNanoImageSubmitting,
    nanoBananaTaskId,
    nanoBananaImageUrl,
    nanoBananaImageUrls,
    nanoBananaSelectedPromptIndex,
  ]);

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

  /** Auto-resume scripts generation when user returns to a run that has summary but no scripts yet. */
  useEffect(() => {
    if (scriptsResumeAttemptedRef.current) return;
    if (!summaryText.trim()) return;
    if (scriptsText.trim()) return;
    if (!lastExtractedJson) return;
    if (!universeRunId) return;
    if (stage !== "ready") return;
    if (isWorking) return;
    scriptsResumeAttemptedRef.current = true;
    void onContinueScripts();
  }, [summaryText, scriptsText, lastExtractedJson, universeRunId, stage, isWorking]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!klingPollTaskId || klingPollImageIndex === null) return;
    const taskId = klingPollTaskId;
    const slotIndex = klingPollImageIndex;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const kKey = getPersonalApiKey();
        const kPiKey = getPersonalPiapiApiKey();
        const kParam = `${kKey ? `&personalApiKey=${encodeURIComponent(kKey)}` : ""}${kPiKey ? `&piapiApiKey=${encodeURIComponent(kPiKey)}` : ""}`;
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
    interval = setInterval(tick, 2500);
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

  const nanoImageCaptionSlots = useMemo((): [string, string, string] => {
    const captionFromDraft = (raw: string) => {
      const sec = parseNanoEditableSections(raw);
      const pickFirstLine = (s: string) => {
        const t = s.trim();
        if (!t) return "";
        return (t.split(/\n/)[0]?.trim() ?? "").slice(0, 72);
      };
      if (sec.isStructured) {
        return (
          pickFirstLine(sec.person) || pickFirstLine(sec.scene) || pickFirstLine(sec.product)
        );
      }
      const t = (raw ?? "").trim();
      if (!t) return "";
      return (t.split(/\n/)[0]?.trim() ?? "").slice(0, 72);
    };
    return [
      captionFromDraft(nanoPromptDrafts[0] ?? ""),
      captionFromDraft(nanoPromptDrafts[1] ?? ""),
      captionFromDraft(nanoPromptDrafts[2] ?? ""),
    ];
  }, [nanoPromptDrafts]);

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

  const ltaGenerateCredits = useMemo(
    () => creditsLinkToAdFullPipeline(LINK_TO_AD_DEFAULT_VIDEO_MODEL, videoDuration),
    [videoDuration],
  );
  const ltaVideoOnlyCredits = useMemo(
    () => creditsLinkToAdVideoFromImage(LINK_TO_AD_DEFAULT_VIDEO_MODEL, videoDuration),
    [videoDuration],
  );

  /** Match product image resolution used for Nano prompts (preview or packshots), not only main preview URL. */
  const step1Done = Boolean(summaryText.trim() && resolveNanoProductImageUrl());
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
  // Image prompt generation already shows status inside the output panel; avoid duplicating it at the top.
  const showTopUniverseLoading = showUniverseLoading && universeLoadingState.phase !== "nano_prompts";

  async function handleGenerateVideoFromSelectedImage() {
    if (nanoBananaSelectedImageIndex === null || !nanoBananaImageUrl?.trim()) {
      toast.error("Select a reference image first.");
      return;
    }
    if (isVideoPromptLoading || isKlingSubmitting || Boolean(klingPollTaskId)) return;
    setVideoStageMode(true);
    setUserStartedVideoFromImage(true);
    await onGenerateUgcVideoPrompt();
  }

  async function handleConfirmVideoGeneration() {
    const prompt = mergedVideoPromptDraft;
    if (!prompt) {
      toast.error("Video prompt is empty.");
      return;
    }
    setUgcVideoPromptGpt(prompt);
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
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            {hasStartedLinkToAdFlow ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => handleReturnToFreshLinkToAd()}
                className="h-8 shrink-0 gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-2.5 text-xs font-semibold text-white/80 hover:border-violet-400/35 hover:bg-violet-500/10 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Return to Link to Ad
              </Button>
            ) : null}
            <CardTitle className="text-base">Link to Ad</CardTitle>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={hidePreviousLtaGenerations}
                aria-label={
                  hidePreviousLtaGenerations
                    ? "Show previous Link to Ad generations"
                    : "Hide previous Link to Ad generations"
                }
                onClick={toggleHidePreviousLtaGenerations}
                className={cn(
                  "group relative flex h-8 shrink-0 items-center rounded-full border px-1 transition-[border-color,background-color,box-shadow] duration-300",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0912]",
                  hidePreviousLtaGenerations
                    ? "w-[3.25rem] border-violet-400/40 bg-gradient-to-r from-violet-500/30 to-violet-600/20 shadow-[0_0_20px_rgba(139,92,246,0.15)]"
                    : "w-[3.25rem] border-white/12 bg-black/40 hover:border-white/18 hover:bg-white/[0.05]",
                )}
              >
                <motion.span
                  className="pointer-events-none flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#1a1025] shadow-md"
                  initial={false}
                  animate={{
                    x: hidePreviousLtaGenerations ? 20 : 0,
                    scale: hidePreviousLtaGenerations ? 0.92 : 1,
                  }}
                  transition={
                    reduceMotion
                      ? { duration: 0.12 }
                      : { type: "spring", stiffness: 520, damping: 34, mass: 0.65 }
                  }
                >
                  {hidePreviousLtaGenerations ? (
                    <EyeOff className="h-3.5 w-3.5 opacity-80" aria-hidden />
                  ) : (
                    <Eye className="h-3.5 w-3.5 opacity-90" aria-hidden />
                  )}
                </motion.span>
              </button>
              <div className="flex min-w-0 flex-col items-start leading-tight">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/50">
                  Previous runs
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium transition-colors duration-300",
                    hidePreviousLtaGenerations ? "text-white/35" : "text-violet-200/85",
                  )}
                >
                  {hidePreviousLtaGenerations ? "Hidden" : "Visible"}
                </span>
              </div>
            </div>
            {hasStartedLinkToAdFlow ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => confirmAndResetLinkToAdToStart()}
                className="h-8 shrink-0 gap-1.5 rounded-xl border border-red-400/25 bg-red-500/10 px-2.5 text-xs font-semibold text-red-100/90 hover:border-red-400/45 hover:bg-red-500/20"
              >
                Cancel Link to Ad
              </Button>
            ) : null}
            {stage === "error" ? (
              <div className="flex items-center gap-2 text-xs text-red-300/90">
                <span className="rounded-full border border-red-400/30 bg-red-500/10 px-2 py-1">Error</span>
              </div>
            ) : null}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {!hidePreviousLtaGenerations && recentLinkToAdRuns.length > 0 ? (
            <motion.div
              key="lta-recent-runs"
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -10, scale: 0.985 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -8, scale: 0.98, filter: "blur(4px)" }
              }
              transition={
                reduceMotion
                  ? { duration: 0.15 }
                  : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
              }
              className="origin-top overflow-hidden"
            >
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                <p className="text-[10px] leading-snug text-white/45">
                  All your Link to Ad generations are stored in your projects — switch between your last three here, or
                  open Projects for the full list.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recentLinkToAdRuns.map((r, i) => {
                    const active = (activeRunIdProp ?? universeRunId) === r.id;
                    const label =
                      (r.title && r.title.trim()) ||
                      (() => {
                        try {
                          return new URL(r.storeUrl).hostname.replace(/^www\./, "");
                        } catch {
                          return r.storeUrl.slice(0, 28);
                        }
                      })();
                    const dateShort = (() => {
                      try {
                        return new Date(r.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        });
                      } catch {
                        return "";
                      }
                    })();
                    return (
                      <motion.button
                        key={r.id}
                        type="button"
                        layout={!reduceMotion}
                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          reduceMotion
                            ? { duration: 0.12 }
                            : { delay: i * 0.035, duration: 0.28, ease: [0.22, 1, 0.36, 1] }
                        }
                        onClick={() => handleSwitchRecentRun(r.id)}
                        className={cn(
                          "flex min-w-0 max-w-[11rem] items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors",
                          active
                            ? "border-violet-400/50 bg-violet-500/15 text-white"
                            : "border-white/10 bg-white/[0.03] text-white/75 hover:border-violet-400/35 hover:bg-white/[0.05]",
                        )}
                      >
                        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40">
                          {r.thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[9px] text-white/30">—</span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold leading-tight">{label}</span>
                          <span className="text-[9px] text-white/40">{dateShort}</span>
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </CardHeader>

      <CardContent className="space-y-6">
        <LinkToAdUniverseStepper currentStep={universeCurrentStep} />
        {showTopUniverseLoading ? (
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
        {/* Duration */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Duration</p>
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
              {[5, 10, 15].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setVideoDuration(d)}
                  disabled={isWorking}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                    videoDuration === d
                      ? "bg-violet-500/15 text-white border border-violet-400/60"
                      : "bg-black/20 text-white/65 hover:border-white/20 border border-white/10",
                  )}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
        </div>

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
                        {ltaGenerateCredits} credits
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
                  <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#050507]">
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
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Open product image full size"
                        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 shadow transition-opacity hover:bg-black/70 hover:text-white/90 group-hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setProductImageLightboxUrl(resolvedPreviewUrl);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            setProductImageLightboxUrl(resolvedPreviewUrl);
                          }
                        }}
                      >
                        <Maximize2 className="h-4 w-4" aria-hidden />
                      </span>
                    ) : null}
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

                {productOnlyImageUrls.length > 0 || neutralUploadUrl || resolvedPreviewUrl ? (
                  <div className="mt-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
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
                      accept={STUDIO_IMAGE_FILE_ACCEPT}
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        void uploadAdditionalPhoto(e.target.files);
                        e.currentTarget.value = "";
                      }}
                      disabled={isWorking || isUploadingAdditionalPhotos}
                    />
                    <PersonaPhotoSection
                      personaPhotoUrls={personaPhotoUrls}
                      pendingPersonaUploads={pendingPersonaUploads}
                      isUploading={isUploadingPersonaPhotos}
                      isWorking={isWorking}
                      onUploadClick={() => personaPhotoInputRef.current?.click()}
                      onAvatarPickerOpen={() => setAvatarPickerOpen(true)}
                      avatarUrlsCount={avatarUrls.length}
                      onRemove={removePersonaPhoto}
                    />
                    <input
                      ref={personaPhotoInputRef}
                      type="file"
                      accept={STUDIO_IMAGE_FILE_ACCEPT}
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        void uploadPersonaPhoto(e.target.files);
                        e.currentTarget.value = "";
                      }}
                      disabled={isWorking || isUploadingPersonaPhotos}
                    />
                  </div>
                ) : null}
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
                    <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#050507]">
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
                      {resolvedPreviewUrl && !imgError ? (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="Open product image full size"
                          className={cn(
                            "absolute top-1 z-20 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 shadow transition-opacity hover:bg-black/70 hover:text-white/90 group-hover:opacity-100",
                            isAlgorithmChosenPreview ? "left-1" : "right-1",
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setProductImageLightboxUrl(resolvedPreviewUrl);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.stopPropagation();
                              setProductImageLightboxUrl(resolvedPreviewUrl);
                            }
                          }}
                        >
                          <Maximize2 className="h-4 w-4" aria-hidden />
                        </span>
                      ) : null}
                  {resolvedPreviewUrl && !imgError && isAlgorithmChosenPreview ? (
                    <button
                      type="button"
                      onClick={() => removeAlgorithmChosenPreview()}
                      className="absolute right-1 top-1 z-20 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white/70 shadow transition hover:text-red-300"
                      aria-label="Remove scraped photo"
                      title="Remove scraped photo"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
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
                      accept={STUDIO_IMAGE_FILE_ACCEPT}
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        void uploadAdditionalPhoto(e.target.files);
                        e.currentTarget.value = "";
                      }}
                      disabled={isWorking || isUploadingAdditionalPhotos}
                    />
                    <PersonaPhotoSection
                      personaPhotoUrls={personaPhotoUrls}
                      pendingPersonaUploads={pendingPersonaUploads}
                      isUploading={isUploadingPersonaPhotos}
                      isWorking={isWorking}
                      onUploadClick={() => personaPhotoInputRef.current?.click()}
                      onAvatarPickerOpen={() => setAvatarPickerOpen(true)}
                      avatarUrlsCount={avatarUrls.length}
                      onRemove={removePersonaPhoto}
                    />
                    <input
                      ref={personaPhotoInputRef}
                      type="file"
                      accept={STUDIO_IMAGE_FILE_ACCEPT}
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        void uploadPersonaPhoto(e.target.files);
                        e.currentTarget.value = "";
                      }}
                      disabled={isWorking || isUploadingPersonaPhotos}
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
                    onClick={() => requestRegenerateMarketingAngles()}
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
                  <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#050507]">
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
                    {resolvedPreviewUrl && !imgError ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Open product image full size"
                        className={cn(
                          "absolute top-1 z-20 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 shadow transition-opacity hover:bg-black/70 hover:text-white/90 group-hover:opacity-100",
                          isAlgorithmChosenPreview ? "left-1" : "right-1",
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setProductImageLightboxUrl(resolvedPreviewUrl);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            setProductImageLightboxUrl(resolvedPreviewUrl);
                          }
                        }}
                      >
                        <Maximize2 className="h-4 w-4" aria-hidden />
                      </span>
                    ) : null}
                    {resolvedPreviewUrl && !imgError && isAlgorithmChosenPreview ? (
                      <button
                        type="button"
                        onClick={() => removeAlgorithmChosenPreview()}
                        className="absolute right-1 top-1 z-[25] flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white/70 shadow transition hover:text-red-300"
                        aria-label="Remove scraped photo"
                        title="Remove scraped photo"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
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
                    accept={STUDIO_IMAGE_FILE_ACCEPT}
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      void uploadAdditionalPhoto(e.target.files);
                      e.currentTarget.value = "";
                    }}
                    disabled={isWorking || isUploadingAdditionalPhotos}
                  />
                  <PersonaPhotoSection
                    personaPhotoUrls={personaPhotoUrls}
                    pendingPersonaUploads={pendingPersonaUploads}
                    isUploading={isUploadingPersonaPhotos}
                    isWorking={isWorking}
                    onUploadClick={() => personaPhotoInputRef.current?.click()}
                    onAvatarPickerOpen={() => setAvatarPickerOpen(true)}
                    avatarUrlsCount={avatarUrls.length}
                    onRemove={removePersonaPhoto}
                  />
                  <input
                    ref={personaPhotoInputRef}
                    type="file"
                    accept={STUDIO_IMAGE_FILE_ACCEPT}
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      void uploadPersonaPhoto(e.target.files);
                      e.currentTarget.value = "";
                    }}
                    disabled={isWorking || isUploadingPersonaPhotos}
                  />
                </div>

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
                                  loading="eager"
                                  decoding="async"
                                  fetchPriority="high"
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
                      {nanoHasThreeImages && showVideoStageLayout ? (
                        <button
                          type="button"
                          disabled={
                            isNanoAllImagesSubmitting ||
                            isNanoPromptsLoading ||
                            Boolean(nanoPollTaskId) ||
                            isWorking ||
                            selectedAngleIndex === null ||
                            !nanoBananaPromptsRaw.trim()
                          }
                          onClick={() => void onGenerateNanoBananaImagesFromAllPrompts({ forceRegenerateCharge: true })}
                          className="mt-1 text-[10px] font-medium text-violet-300/85 underline-offset-2 transition hover:text-violet-200 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
                        >
                          Regenerate 3 images · 10 credits
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {ltaWarmReferenceImages.length > 0 ? (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                        Saved images
                      </p>
                      <button
                        type="button"
                        onClick={() => setLtaWarmReferenceImages([])}
                        className="text-[10px] font-medium text-white/40 underline-offset-2 transition hover:text-white/70 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ltaWarmReferenceImages.map((url, i) => (
                        <button
                          key={`${url}-${i}`}
                          type="button"
                          className="group relative aspect-[9/16] w-[4.25rem] shrink-0 overflow-hidden rounded-lg border border-white/15 bg-black transition hover:border-violet-400/60"
                          onClick={() => setNanoImageLightboxUrl(url)}
                          aria-label="Open saved image"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover object-center"
                            loading="lazy"
                            decoding="async"
                          />
                          <span className="pointer-events-none absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] leading-snug text-white/35">
                      These are kept for reference when you regenerate angles.
                    </p>
                  </div>
                ) : null}

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
                                <div className="flex justify-end">
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
                <div className="flex flex-col gap-4 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] px-4 pb-4 pt-2">
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
                  {nanoBananaPromptsRaw.trim() ? (
                    <div className="rounded-xl border border-white/10 bg-black/25 px-4 pb-3 pt-2">
                      <p className="text-xs font-semibold text-white/90">Image prompts (3)</p>
                      <p className="mt-0.5 text-[10px] leading-snug text-white/40">
                        Ajuste le texte éditable de chaque prompt avant de lancer la génération d’images. Les blocs
                        techniques (lumière, caméra, etc.) restent fusionnés automatiquement.
                      </p>
                      <div className="mt-3 grid grid-cols-1 gap-3">
                        {([0, 1, 2] as const).map((i) => (
                          <div key={i} className="space-y-1">
                            <Label className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                              Prompt {i + 1}
                            </Label>
                            <Textarea
                              value={nanoPromptDrafts[i]}
                              onChange={(e) => {
                                const v = e.target.value;
                                setNanoPromptDrafts((prev) => {
                                  const next: [string, string, string] = [prev[0], prev[1], prev[2]];
                                  next[i] = v;
                                  setNanoBananaPromptsRaw(
                                    composeThreeLabeledPrompts([
                                      mergeNanoPromptForApi(next[0], nanoPromptTechnicalTails[0]),
                                      mergeNanoPromptForApi(next[1], nanoPromptTechnicalTails[1]),
                                      mergeNanoPromptForApi(next[2], nanoPromptTechnicalTails[2]),
                                    ]),
                                  );
                                  return next;
                                });
                              }}
                              className="min-h-[100px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/85"
                              spellCheck
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {nanoBananaPromptsRaw &&
                  !nanoHasThreeImages &&
                  !isNanoAllImagesSubmitting &&
                  !nanoPollTaskId ? (
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        disabled={isNanoAllImagesSubmitting || selectedAngleIndex === null || !nanoBananaPromptsRaw.trim()}
                        onClick={() => void onGenerateNanoBananaImagesFromAllPrompts()}
                        className={`h-auto min-h-12 w-full max-w-md flex-col gap-1 py-2.5 ${primaryBtnClass}`}
                      >
                        <span className="text-sm font-semibold leading-tight">Generate 3 images</span>
                      </Button>
                    </div>
                  ) : null}

                  {nanoBananaPromptsRaw && nanoHasAnyReferenceImage ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                          Next step
                        </h3>
                        <p className="mt-2 text-sm leading-snug text-white/70">
                          Pick a 1:1 reference below (or use the strip on the left), then generate your UGC video.
                        </p>
                        {nanoHasThreeImages && !showVideoStageLayout ? (
                          <button
                            type="button"
                            disabled={
                              isNanoAllImagesSubmitting ||
                              isNanoPromptsLoading ||
                              Boolean(nanoPollTaskId) ||
                              isWorking ||
                              selectedAngleIndex === null ||
                              !nanoBananaPromptsRaw.trim()
                            }
                            onClick={() => void onGenerateNanoBananaImagesFromAllPrompts({ forceRegenerateCharge: true })}
                            className="mt-2 w-fit text-[10px] font-medium text-violet-300/85 underline-offset-2 transition hover:text-violet-200 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40"
                          >
                            Regenerate 3 images · 10 credits
                          </button>
                        ) : null}
                      </div>
                      <div className="grid w-full max-w-md grid-cols-3 gap-2 sm:max-w-lg sm:gap-3">
                        {([0, 1, 2] as const).map((i) => {
                          const sel = nanoBananaSelectedImageIndex === i;
                          const imgUrl = nanoBananaImageUrls[i] ?? "";
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => { if (imgUrl) void onSelectNanoBananaImage(i); }}
                              disabled={!imgUrl}
                              className={cn(
                                "group/card relative aspect-square w-full min-w-0 overflow-hidden rounded-xl border-2 bg-[#050507] transition-all",
                                imgUrl && sel
                                  ? "border-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.35)]"
                                  : imgUrl
                                  ? "border-white/10 opacity-90 hover:border-violet-400/40 hover:opacity-100"
                                  : "cursor-default border-white/5 opacity-50",
                              )}
                            >
                              {imgUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={imgUrl}
                                  alt={`Reference ${i + 1}`}
                                  className="h-full w-full object-cover object-center"
                                  loading="eager"
                                  decoding="async"
                                  fetchPriority="high"
                                />
                              ) : isNanoAllImagesSubmitting ? (
                                <span className="flex h-full w-full items-center justify-center bg-black/40">
                                  <Loader2 className="h-6 w-6 shrink-0 animate-spin text-violet-300" aria-hidden />
                                </span>
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-xs font-medium uppercase tracking-wide text-white/25">
                                  —
                                </span>
                              )}
                              {imgUrl ? (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  aria-label="Open full size"
                                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 shadow transition-opacity group-hover/card:opacity-100"
                                  onClick={(e) => { e.stopPropagation(); setNanoImageLightboxUrl(imgUrl); }}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setNanoImageLightboxUrl(imgUrl); } }}
                                >
                                  <Maximize2 className="h-4 w-4" aria-hidden />
                                </span>
                              ) : null}
                              {imgUrl && sel ? (
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
                    <div className="shrink-0 rounded-xl border border-white/10 bg-black/25 px-4 pb-3 pt-2">
                      <div className="flex flex-col gap-2">
                        {!nanoBananaPromptsRaw.trim() &&
                        !isNanoPromptsLoading &&
                        !isNanoAllImagesSubmitting &&
                        !nanoPollTaskId ? (
                          <>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className={scriptHasEdits ? "min-h-[1rem]" : undefined}>
                                  {scriptHasEdits ? (
                                    <span className="text-[10px] text-violet-200/85">Edited factors ready</span>
                                  ) : null}
                                </div>
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
                                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                      Spoken budget (Hook + Problem + Solution + CTA)
                                    </p>
                                    <span
                                      className={cn(
                                        "text-[10px] tabular-nums",
                                        factorWordsValid.total ? "text-white/55" : "text-amber-400/90",
                                      )}
                                    >
                                      {spokenWordTotal}/{factorWordRules.maxTotalSpoken}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                        {factorWordRules.hook.label}
                                      </p>
                                      <span className="text-[10px] tabular-nums text-white/45">
                                        {factorWordCounts.hook}/{factorWordRules.hook.max}
                                      </span>
                                    </div>
                                    <Textarea
                                      value={scriptFactors.hook}
                                      title={factorWordRules.hook.hint}
                                      onChange={(e) => {
                                        const v = clampToMaxWords(e.target.value, factorWordRules.hook.max);
                                        const next = { ...scriptFactors, hook: v };
                                        setScriptFactors(next);
                                        setEditableScript(composeScriptFromFactors(next));
                                        setScriptHasEdits(true);
                                      }}
                                      className="min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80"
                                    />
                                  </div>
                                  {factorWordRules.problem ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                        {factorWordRules.problem.label}
                                      </p>
                                      <span className="text-[10px] tabular-nums text-white/45">
                                        {factorWordCounts.problem}/{factorWordRules.problem.max}
                                      </span>
                                    </div>
                                    <Textarea
                                      value={scriptFactors.problem}
                                      title={factorWordRules.problem.hint}
                                      onChange={(e) => {
                                        const pr = factorWordRules.problem;
                                        if (!pr) return;
                                        const v = clampToMaxWords(e.target.value, pr.max);
                                        const next = { ...scriptFactors, problem: v };
                                        setScriptFactors(next);
                                        setEditableScript(composeScriptFromFactors(next));
                                        setScriptHasEdits(true);
                                      }}
                                      className="min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80"
                                    />
                                  </div>
                                  ) : (
                                    <div className="space-y-1 sm:col-span-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                        Problem
                                      </p>
                                      <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-white/45">
                                        Omitted for 5-second videos (15-word spoken budget). Use 10s or 15s to add a
                                        Problem block.
                                      </p>
                                    </div>
                                  )}
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Avatar / Persona</p>
                                    {hasPersonaPhoto ? (
                                      <div className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2.5">
                                        <div className="flex -space-x-2">
                                          {personaPhotoUrls.slice(0, 3).map((url, i) => (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img key={`factor-persona-${i}`} src={url} alt="" className="h-8 w-8 rounded-full border-2 border-[#0d0a14] object-cover" referrerPolicy="no-referrer" />
                                          ))}
                                        </div>
                                        <p className="text-[11px] leading-snug text-violet-300/80">
                                          Using uploaded persona photo — appearance will match the reference image.
                                        </p>
                                      </div>
                                    ) : (
                                      <Textarea value={scriptFactors.avatar} onChange={(e) => { const next = { ...scriptFactors, avatar: e.target.value }; setScriptFactors(next); setEditableScript(composeScriptFromFactors(next)); setScriptHasEdits(true); }} className="min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80" />
                                    )}
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                        {factorWordRules.benefits.label}
                                      </p>
                                      <span className="text-[10px] tabular-nums text-white/45">
                                        {factorWordCounts.benefits}/{factorWordRules.benefits.max}
                                      </span>
                                    </div>
                                    <Textarea
                                      value={scriptFactors.benefits}
                                      title={factorWordRules.benefits.hint}
                                      onChange={(e) => {
                                        const v = clampToMaxWords(e.target.value, factorWordRules.benefits.max);
                                        const next = { ...scriptFactors, benefits: v };
                                        setScriptFactors(next);
                                        setEditableScript(composeScriptFromFactors(next));
                                        setScriptHasEdits(true);
                                      }}
                                      className="min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80"
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
                                      <span className="text-[10px] tabular-nums text-white/45">
                                        {factorWordCounts.cta}/{factorWordRules.cta.max}
                                      </span>
                                    </div>
                                    <Textarea
                                      value={scriptFactors.cta}
                                      title={factorWordRules.cta.hint}
                                      onChange={(e) => {
                                        const v = clampToMaxWords(e.target.value, factorWordRules.cta.max);
                                        const next = { ...scriptFactors, cta: v };
                                        setScriptFactors(next);
                                        setEditableScript(composeScriptFromFactors(next));
                                        setScriptHasEdits(true);
                                      }}
                                      className="min-h-[74px] border-white/10 bg-black/30 text-xs leading-relaxed text-white/80"
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
                              disabled={
                                !resolveNanoProductImageUrl() ||
                                (scriptEditVisible && !factorWordsValid.all) ||
                                isNanoPromptsLoading ||
                                isWorking ||
                                Boolean(nanoPollTaskId)
                              }
                              className={`h-auto min-h-11 w-full max-w-md py-2.5 ${primaryBtnClass}`}
                              onClick={() => {
                                if (scriptEditVisible && !factorWordsValid.all) {
                                  toast.error(
                                    "Match each block’s word range and the total spoken budget for this duration before generating.",
                                  );
                                  return;
                                }
                                if (selectedAngleIndex === null || selectedAngleIndex === undefined) {
                                  toast.error("Pick an angle (1, 2, or 3) first.");
                                  return;
                                }
                                setScriptHasEdits(false);
                                void onGenerateNanoBananaPrompts(selectedAngleIndex);
                              }}
                            >
                              <span className="text-sm font-semibold leading-tight">Generate 3 prompts</span>
                            </Button>
                          </>
                        ) : null}
                        {nanoPollTaskId || isNanoAllImagesSubmitting ? (
                          <NanoThreeImageGenerationGrid
                            urls={nanoImageSlots}
                            busy={Boolean(nanoPollTaskId || isNanoAllImagesSubmitting)}
                            captions={nanoImageCaptionSlots}
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-5 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-6">
                    {showVideoWorkPanel ? (
                    <>
                      {mergedVideoPromptDraft && ugcVideoPromptGpt.trim() ? (
                        <details
                          className="rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-3"
                          onToggle={(e) => setVideoBriefDetailsOpen(e.currentTarget.open)}
                        >
                          <summary className="cursor-pointer list-none">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold text-white/90">Video brief</p>
                                <p className="mt-0.5 text-[10px] leading-snug text-white/45">
                                  Ajuste le mouvement, ce qui est dit, et l’ambiance sonore.
                                </p>
                              </div>
                              <span className="text-[10px] font-medium text-violet-200/80">
                                {videoBriefDetailsOpen ? "Close" : "Edit"}
                              </span>
                            </div>
                            {!videoBriefDetailsOpen &&
                              (videoPromptIsLegacyBlob ? (
                                <div className="mt-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                                  <p className="text-[9px] font-semibold uppercase tracking-wide text-white/45">Brief</p>
                                  <p className="mt-0.5 text-[11px] leading-snug text-white/75 line-clamp-6">
                                    {videoPromptSections.motion.trim() || "—"}
                                  </p>
                                </div>
                              ) : (
                                <div className="mt-2 grid gap-1.5">
                                  {(
                                    [
                                      ["Motion", videoPromptSections.motion],
                                      ["Dialogue", videoPromptSections.dialogue],
                                      ["Ambience", videoPromptSections.ambience],
                                    ] as const
                                  ).map(([label, value]) => (
                                    <div
                                      key={label}
                                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5"
                                    >
                                      <p className="text-[9px] font-semibold uppercase tracking-wide text-white/45">
                                        {label}
                                      </p>
                                      <p className="mt-0.5 text-[11px] leading-snug text-white/75 line-clamp-5">
                                        {value.trim() || "—"}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ))}
                          </summary>
                          <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                            {videoPromptIsLegacyBlob ? (
                              <div className="space-y-1">
                                <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-200/75">
                                  Older prompt — regenerate the video prompt for the short fields
                                </p>
                                <Textarea
                                  value={videoPromptSections.motion}
                                  onChange={(e) =>
                                    setVideoPromptSections((prev) => ({ ...prev, motion: e.target.value }))
                                  }
                                  className="min-h-[120px] border-white/10 bg-black/30 text-[11px] leading-snug text-white/80"
                                  spellCheck
                                />
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="space-y-0.5">
                                  <Label className="text-[9px] font-medium text-white/40">Motion</Label>
                                  <Textarea
                                    value={videoPromptSections.motion}
                                    onChange={(e) =>
                                      setVideoPromptSections((prev) => ({ ...prev, motion: e.target.value }))
                                    }
                                    className="min-h-[100px] border-white/10 bg-black/30 text-[11px] leading-snug text-white/80"
                                    spellCheck
                                  />
                                </div>
                                <div className="space-y-0.5">
                                  <Label className="text-[9px] font-medium text-white/40">Dialogue</Label>
                                  <Textarea
                                    value={videoPromptSections.dialogue}
                                    onChange={(e) =>
                                      setVideoPromptSections((prev) => ({ ...prev, dialogue: e.target.value }))
                                    }
                                    className="min-h-[100px] border-white/10 bg-black/30 text-[11px] leading-snug text-white/80"
                                    spellCheck
                                  />
                                </div>
                                <div className="space-y-0.5">
                                  <Label className="text-[9px] font-medium text-white/40">Ambience</Label>
                                  <Textarea
                                    value={videoPromptSections.ambience}
                                    onChange={(e) =>
                                      setVideoPromptSections((prev) => ({ ...prev, ambience: e.target.value }))
                                    }
                                    className="min-h-[72px] border-white/10 bg-black/30 text-[11px] leading-snug text-white/80"
                                    spellCheck
                                  />
                                </div>
                              </div>
                            )}
                            <Button
                              type="button"
                              disabled={isKlingSubmitting || Boolean(klingPollTaskId) || !mergedVideoPromptDraft}
                              onClick={() => void handleConfirmVideoGeneration()}
                              className={`h-9 w-full max-w-sm text-sm ${primaryBtnClass}`}
                            >
                              {isKlingSubmitting || klingPollTaskId ? (
                                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                  <Loader2 className="h-4 w-4 animate-spin" /> Working…
                                </span>
                              ) : klingVideoUrl ? (
                                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                  <RefreshCw className="h-4 w-4" /> Regenerate video
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                  <Video className="h-4 w-4" /> Generate video
                                </span>
                              )}
                            </Button>
                          </div>
                        </details>
                      ) : null}
                      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                        {isVideoPromptLoading ? (
                          <div className="mt-3 flex items-center gap-2 text-xs text-violet-200">
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                            <span>{LINK_TO_AD_LOADING_MESSAGES.video_prompt}</span>
                          </div>
                        ) : null}
                        {nanoBananaImageUrl &&
                        userStartedVideoFromImage &&
                        !ugcVideoPromptGpt.trim() &&
                        !isVideoPromptLoading &&
                        selectedAngleIndex !== null ? (
                          <Button
                            type="button"
                            className={`mt-3 h-auto min-h-11 py-2.5 ${primaryBtnClass}`}
                            onClick={() => {
                              void onGenerateUgcVideoPrompt();
                            }}
                          >
                            <span className="text-sm font-semibold leading-tight">Retry video prompt</span>
                          </Button>
                        ) : null}
                        {showKlingVideoGeneratingUi ? (
                          <KlingVideoGenerationPlaceholder
                            posterUrl={nanoBananaImageUrl}
                            statusText={
                              isKlingSubmitting
                                ? LINK_TO_AD_LOADING_MESSAGES.kling_starting
                                : LINK_TO_AD_LOADING_MESSAGES.kling_rendering
                            }
                          />
                        ) : klingVideoUrl ? (
                          <>
                            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                              <div className="mx-auto w-[11.5rem] max-w-full shrink-0 sm:mx-0 sm:w-[12.5rem]">
                                <VideoCard
                                  src={klingVideoUrl}
                                  poster={nanoBananaImageUrl ?? undefined}
                                />
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
                                      onMouseEnter={(e) => {
                                        const el = e.currentTarget.querySelector("video");
                                        if (el instanceof HTMLVideoElement) {
                                          try {
                                            el.currentTime = 0;
                                          } catch {
                                            /* ignore */
                                          }
                                          void el.play().catch(() => {});
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        const el = e.currentTarget.querySelector("video");
                                        if (el instanceof HTMLVideoElement) {
                                          el.pause();
                                          try {
                                            el.currentTime = 0;
                                          } catch {
                                            /* ignore */
                                          }
                                        }
                                      }}
                                    >
                                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                      <video
                                        src={proxiedMediaSrc(u)}
                                        poster={
                                          nanoBananaImageUrl ? proxiedMediaSrc(nanoBananaImageUrl) : undefined
                                        }
                                        muted
                                        playsInline
                                        loop
                                        preload="auto"
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
                          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                              Ready to render
                            </p>
                            <div className="mt-2 flex items-center gap-3">
                              <div className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={nanoBananaImageUrl}
                                  alt="Selected reference"
                                  className="h-full w-full object-cover object-center"
                                  loading="eager"
                                  decoding="async"
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-white/80 truncate">
                                  Using the selected image as the start frame
                                </p>
                                <p className="mt-0.5 text-[10px] text-white/40">
                                  Confirm to generate the video.
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              className={`mt-3 h-auto min-h-11 w-full py-2.5 ${primaryBtnClass}`}
                              onClick={() => {
                                void onGenerateKlingVideo();
                              }}
                            >
                              <span className="inline-flex items-center justify-center gap-2 text-sm font-semibold leading-tight">
                                <Video className="h-4 w-4 shrink-0" aria-hidden />
                                Generate video from selected image
                              </span>
                            </Button>
                          </div>
                        ) : null}
                      </div>

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
          src={proxiedMediaSrc(nanoImageLightboxUrl)}
          alt="Full reference image preview"
          className="max-h-[92vh] max-w-[min(100%,1200px)] rounded-xl border border-violet-500/20 object-contain shadow-[0_0_60px_rgba(139,92,246,0.15)]"
          onClick={(e) => e.stopPropagation()}
          loading="eager"
          decoding="async"
        />
      </div>
    ) : null}

    {productImageLightboxUrl ? (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/88 p-4 backdrop-blur-[2px]"
        onClick={() => setProductImageLightboxUrl(null)}
        role="dialog"
        aria-modal="true"
        aria-label="Full product image"
      >
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute right-3 top-3 z-10 h-10 w-10 rounded-full border border-white/20 bg-black/65 text-white shadow-lg hover:bg-black/85"
          onClick={(e) => {
            e.stopPropagation();
            setProductImageLightboxUrl(null);
          }}
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden />
        </Button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proxiedMediaSrc(productImageLightboxUrl)}
          alt="Full product image preview"
          className="max-h-[92vh] max-w-[min(100%,1200px)] rounded-xl border border-violet-500/20 object-contain shadow-[0_0_60px_rgba(139,92,246,0.15)]"
          onClick={(e) => e.stopPropagation()}
          loading="eager"
          decoding="async"
        />
      </div>
    ) : null}

    {regenerateAnglesChoiceOpen ? (
      <div
        className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-label="Regenerate angles"
        onClick={() => setRegenerateAnglesChoiceOpen(false)}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-white/12 bg-[#101014] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.75)]"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-semibold text-white">Regenerate 3 angles</p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            You already have generated images. Do you want to keep them as references, or recreate new ones?
          </p>
          <div className="mt-4 grid gap-2">
            <Button
              type="button"
              onClick={() => {
                setRegenerateAnglesChoiceOpen(false);
                void onRegenerateMarketingAngles({ keepExistingImages: true, regenImagesAlso: false });
              }}
              className="h-11 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
              variant="secondary"
            >
              Keep existing images (no extra charge)
            </Button>
            <Button
              type="button"
              onClick={() => {
                setRegenerateAnglesChoiceOpen(false);
                void onRegenerateMarketingAngles({ keepExistingImages: false, regenImagesAlso: true });
              }}
              className="h-11 rounded-xl border border-violet-400/40 bg-violet-500/30 text-white hover:bg-violet-500/40"
            >
              Recreate images too (+10 credits)
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => setRegenerateAnglesChoiceOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
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
      onPick={addAvatarAsPersonaPhoto}
      title="Choose persona / avatar"
    />
    </>
  );
}

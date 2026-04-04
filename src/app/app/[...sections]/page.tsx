"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Download, Loader2, Maximize2, Play, Plus, Sparkles, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import LinkToAdUniverse from "@/app/_components/LinkToAdUniverse";
import { ProjectRunBrandBriefEditor } from "@/app/_components/ProjectRunBrandBriefEditor";
import { ProjectRunScriptsEditor } from "@/app/_components/ProjectRunScriptsEditor";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";
import { StudioEmptyExamples, StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import { isProbablyVideoUrl, StudioGenerationsHistory } from "@/app/_components/StudioGenerationsHistory";
import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { calculateMotionControlCredits } from "@/lib/linkToAd/generationCredits";
import StudioAvatarPanel from "@/app/_components/StudioAvatarPanel";
import StudioImagePanel from "@/app/_components/StudioImagePanel";
import StudioUpscalePanel from "@/app/_components/StudioUpscalePanel";
import StudioShell from "@/app/_components/StudioShell";
import {
  StudioSingleModelCard,
  studioSelectContentClass,
  studioSelectItemClass,
} from "@/app/_components/StudioModelPicker";
import {
  useCreditsPlan,
  getPersonalApiKey,
  isPersonalApiActive,
  isPlatformCreditBypassActive,
  getPersonalElevenLabsApiKey,
} from "@/app/_components/CreditsPlanContext";
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";
import { registerStudioGenerationClient } from "@/lib/registerStudioGenerationClient";
import StudioVideoPanel from "@/app/_components/StudioVideoPanel";
import {
  packshotUrlsForGpt,
  pickPackshotForNanoBanana,
  productUrlsForGpt,
} from "@/lib/productReferenceImages";
import {
  branchUniverseForNewAd,
  cloneExtractedBase,
  parseNanoEditableSections,
  parseThreeLabeledPrompts,
  readUniverseFromExtracted,
  splitNanoPromptBodyForEditing,
  universeHasPendingKlingTask,
} from "@/lib/linkToAdUniverse";
import { motionControlUpgradeMessage } from "@/lib/subscriptionModelAccess";
import { clipboardImageFiles } from "@/lib/clipboardImage";
import { UploadBusyOverlay } from "@/app/_components/UploadBusyOverlay";
import { userMessageFromCaughtError } from "@/lib/generationUserMessage";
import {
  assertStudioImageUpload,
  assertStudioVideoUpload,
  STUDIO_IMAGE_FILE_ACCEPT,
  STUDIO_VIDEO_FILE_ACCEPT,
} from "@/lib/studioUploadValidation";
import { uploadBlobUrlToCdn, uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { proxiedMediaSrc } from "@/lib/mediaProxyUrl";
import { cn } from "@/lib/utils";
import { WAVESPEED_PROVIDER } from "@/lib/wavespeedChain";
import {
  calculateWaveSpeedVideoTranslateCredits,
  VOICE_CHANGE_CREDITS_FLAT,
} from "@/lib/pricing";
import {
  DEFAULT_WAVESPEED_HEYGEN_TRANSLATE_LANGUAGE,
  WAVESPEED_HEYGEN_TRANSLATE_LANGUAGES,
} from "@/lib/wavespeedTranslateLanguages";
import {
  STUDIO_GENERATION_KIND_STUDIO_TRANSLATE_VIDEO,
  STUDIO_GENERATION_KIND_VOICE_CHANGE,
} from "@/lib/studioGenerationKinds";

type WizardStep = "url" | "analysis" | "quiz" | "image" | "video";
type AppSection =
  | "link_to_ad"
  | "avatar"
  | "ad_clone"
  | "voice"
  | "motion_control"
  | "image"
  | "video"
  | "upscale"
  | "projects";

type Extracted = {
  url: string;
  canonical: string | null;
  title: string | null;
  description: string | null;
  images: string[];
  excerpt: string;
  snippets: string[];
  signals: { prices: string[]; textLength: number };
  structured?: { jsonLdProducts?: any[] };
};

type AnalyzeResult = any;
type RefundHint = { jobId: string; credits: number };

type Quiz = {
  aboutProduct: string;
  problems: string;
  promises: string;
  persona: string;
  angles: string;
  offers: string;
  videoDurationPreference: "15s" | "20s" | "30s";
};

type NanoModel = "nano" | "pro";
type TranslateToolMode = "video_translate" | "voice_change";
type VoiceToolMode = "voice_change" | "create_voice";
type VoiceChangeUploadKind = "audio" | "video";
type ElevenVoiceOption = {
  voiceId: string;
  name: string;
  category: string;
  previewUrl: string;
  labels: Record<string, string>;
  language?: string;
  publicOwnerId?: string;
  isShared?: boolean;
};

function formatClockTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${String(rs).padStart(2, "0")}`;
}

function SampleAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const stopRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const tick = () => {
    const a = audioRef.current;
    if (a) {
      setCurrentTime(a.currentTime || 0);
      if (!a.paused) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        stopRaf();
      }
    }
  };

  useEffect(() => {
    // Force a hard reload when src changes; fixes “old sample keeps playing”.
    const a = audioRef.current;
    if (!a) return;
    stopRaf();
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    a.pause();
    a.currentTime = 0;
    a.load();
  }, [src]);

  useEffect(() => {
    return () => stopRaf();
  }, []);

  const onTogglePlay = async () => {
    const a = audioRef.current;
    if (!a) return;
    try {
      if (a.paused) {
        await a.play();
        setPlaying(true);
        rafRef.current = requestAnimationFrame(tick);
      } else {
        a.pause();
        setPlaying(false);
        stopRaf();
      }
    } catch {
      // ignore autoplay/play errors
    }
  };

  const pct = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  return (
    <div className="w-full max-w-[26rem]">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        key={src}
        preload="none"
        onLoadedMetadata={(e) => {
          const d = (e.currentTarget.duration || 0) as number;
          setDuration(Number.isFinite(d) ? d : 0);
        }}
        onEnded={() => {
          setPlaying(false);
          stopRaf();
          setCurrentTime(0);
        }}
      >
        <source src={src} />
      </audio>

      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#0a0a0d] px-3 py-2 shadow-sm">
        <button
          type="button"
          onClick={onTogglePlay}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/80 transition hover:bg-white/[0.07]"
          aria-label={playing ? "Pause sample" : "Play sample"}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <span className="block h-3 w-3 rounded-[2px] bg-white/80" />
          ) : (
            <span
              className="ml-0.5 block h-0 w-0 border-y-[7px] border-y-transparent border-l-[10px] border-l-white/80"
              aria-hidden
            />
          )}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="absolute inset-y-0 left-0 rounded-full bg-violet-400" style={{ width: `${pct * 100}%` }} />
            <input
              type="range"
              min={0}
              max={Math.max(0.001, duration)}
              step={0.01}
              value={Math.min(duration, currentTime)}
              onChange={(e) => {
                const a = audioRef.current;
                if (!a) return;
                const v = Number(e.currentTarget.value);
                if (Number.isFinite(v)) {
                  a.currentTime = v;
                  setCurrentTime(v);
                }
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Seek"
            />
          </div>
          <div className="shrink-0 tabular-nums text-[10px] font-semibold text-white/55">
            {formatClockTime(currentTime)} / {formatClockTime(duration)}
          </div>
        </div>
      </div>
    </div>
  );
}

type ImageGenState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "polling"; taskId: string }
  | { kind: "success"; urls: string[] }
  | { kind: "error"; message: string };

type VideoGenState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "polling"; taskId: string }
  | { kind: "success"; url: string }
  | { kind: "error"; message: string };

const UGC_CURRENT_RUN_KEY = "ugc_current_run_id";

const APP_VALID_SECTIONS: AppSection[] = [
  "link_to_ad",
  "avatar",
  "ad_clone",
  "voice",
  "motion_control",
  "image",
  "video",
  "upscale",
  "projects",
];

/** URL slug ↔ internal section id. Exported so StudioShell can share the mapping. */
export const SECTION_TO_SLUG: Record<AppSection, string> = {
  link_to_ad: "link-to-ad",
  avatar: "avatar",
  ad_clone: "translate",
  voice: "voice",
  motion_control: "motion-control",
  image: "image",
  video: "video",
  upscale: "upscale",
  projects: "my-projects",
};

const SLUG_TO_SECTION: Record<string, AppSection> = Object.fromEntries(
  Object.entries(SECTION_TO_SLUG).map(([k, v]) => [v, k]),
) as Record<string, AppSection>;

const ELEVENLABS_OUTPUT_FORMAT_OPTIONS = [
  "mp3_22050_32",
  "mp3_24000_48",
  "mp3_44100_32",
  "mp3_44100_64",
  "mp3_44100_96",
  "mp3_44100_128",
  "mp3_44100_192",
  "pcm_8000",
  "pcm_16000",
  "pcm_22050",
  "pcm_24000",
  "pcm_32000",
  "pcm_44100",
  "pcm_48000",
  "ulaw_8000",
  "alaw_8000",
  "opus_48000_32",
  "opus_48000_64",
  "opus_48000_96",
  "opus_48000_128",
  "opus_48000_192",
] as const;

const VOICE_CHANGE_UPLOAD_ACCEPT = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  ".mp3",
  ".wav",
  ".webm",
  ".m4a",
  ".aac",
  STUDIO_VIDEO_FILE_ACCEPT,
].join(",");

/** Derive the active section from the browser pathname (e.g. "/app/link-to-ad"). */
export function sectionFromPathname(pathname: string): AppSection {
  const stripped = pathname.replace(/^\/app\/?/, "");
  const first = stripped.split("/").filter(Boolean)[0] ?? "";
  if (first === "watermark") return "video";
  return SLUG_TO_SECTION[first] ?? "link_to_ad";
}

/** Derive the translate sub-mode from the pathname (e.g. "/app/translate/voice-change"). */
function translateModeFromPathname(pathname: string): TranslateToolMode | null {
  const stripped = pathname.replace(/^\/app\/?/, "");
  const segs = stripped.split("/").filter(Boolean);
  if (segs[0] !== "translate") return null;
  return "video_translate";
}

/** Derive the voice sub-mode from the pathname (e.g. "/app/voice/create"). */
function voiceModeFromPathname(pathname: string): VoiceToolMode | null {
  const stripped = pathname.replace(/^\/app\/?/, "");
  const segs = stripped.split("/").filter(Boolean);
  if (segs[0] !== "voice") return null;
  if (segs[1] === "create") return "create_voice";
  return "voice_change";
}

/** Build a path-based URL for a section, preserving ?project= if provided. */
function sectionToPath(section: AppSection, projectId?: string | null, extra?: string): string {
  const slug = SECTION_TO_SLUG[section] ?? "link-to-ad";
  let path = `/app/${slug}`;
  if (extra) path += `/${extra}`;
  if (projectId) path += `?project=${encodeURIComponent(projectId)}`;
  return path;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    const href = u.toString();
    return href.endsWith("/") ? href.slice(0, -1) : href;
  } catch {
    const t = url.trim();
    const noSlash = t.endsWith("/") ? t.slice(0, -1) : t;
    return noSlash.toLowerCase();
  }
}

/** Link to Ad Universe snapshot stored under `extracted.__universe`. */
function runHasLinkToAdUniverse(extracted: unknown): boolean {
  if (!extracted || typeof extracted !== "object") return false;
  const u = (extracted as Record<string, unknown>).__universe;
  if (!u || typeof u !== "object") return false;
  return (u as { v?: unknown }).v === 1;
}

function universeThumbFromExtracted(extracted: unknown): string | null {
  if (!extracted || typeof extracted !== "object") return null;
  const u = (extracted as Record<string, unknown>).__universe;
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  if (typeof o.neutralUploadUrl === "string" && o.neutralUploadUrl.trim()) return o.neutralUploadUrl.trim();
  const cc = o.cleanCandidate;
  if (cc && typeof cc === "object" && typeof (cc as { url?: string }).url === "string") {
    const url = (cc as { url: string }).url.trim();
    if (url) return url;
  }
  if (typeof o.fallbackImageUrl === "string" && o.fallbackImageUrl.trim()) return o.fallbackImageUrl.trim();
  return null;
}

type RunGenerationPreview =
  | { kind: "image"; url: string }
  | { kind: "video" }
  | null;

function runGenerationPreview(run: {
  extracted?: unknown;
  video_url: string | null;
  selected_image_url: string | null;
  generated_image_urls?: string[] | null;
}): RunGenerationPreview {
  const img =
    universeThumbFromExtracted(run.extracted) ||
    run.selected_image_url ||
    (Array.isArray(run.generated_image_urls) && run.generated_image_urls[0]) ||
    null;
  if (img) return { kind: "image", url: img };
  if (run.video_url) return { kind: "video" };
  return null;
}

function addNonEmptyUrl(set: Set<string>, url: string | null | undefined) {
  const t = typeof url === "string" ? url.trim() : "";
  if (t) set.add(t);
}

/** All still-image URLs we persist on a run (wizard + Link to Ad universe). */
function collectProjectRunImageUrls(run: {
  extracted?: unknown;
  selected_image_url: string | null;
  generated_image_urls?: string[] | null;
}): string[] {
  const set = new Set<string>();
  addNonEmptyUrl(set, run.selected_image_url);
  if (Array.isArray(run.generated_image_urls)) {
    for (const u of run.generated_image_urls) addNonEmptyUrl(set, u);
  }
  const snap = readUniverseFromExtracted(run.extracted);
  if (snap) {
    addNonEmptyUrl(set, snap.cleanCandidate?.url ?? null);
    addNonEmptyUrl(set, snap.fallbackImageUrl);
    addNonEmptyUrl(set, snap.neutralUploadUrl);
    if (Array.isArray(snap.productOnlyImageUrls)) {
      for (const u of snap.productOnlyImageUrls) addNonEmptyUrl(set, u);
    }
    if (Array.isArray(snap.userPhotoUrls)) {
      for (const u of snap.userPhotoUrls) addNonEmptyUrl(set, u);
    }
    addNonEmptyUrl(set, snap.nanoBananaImageUrl ?? null);
    if (Array.isArray(snap.nanoBananaImageUrls)) {
      for (const u of snap.nanoBananaImageUrls) addNonEmptyUrl(set, u);
    }
    if (Array.isArray(snap.linkToAdPipelineByAngle)) {
      for (const pipe of snap.linkToAdPipelineByAngle) {
        if (!pipe) continue;
        addNonEmptyUrl(set, pipe.nanoBananaImageUrl ?? null);
        if (Array.isArray(pipe.nanoBananaImageUrls)) {
          for (const u of pipe.nanoBananaImageUrls) addNonEmptyUrl(set, u);
        }
      }
    }
  }
  return [...set];
}

function addVideosFromKlingSlots(set: Set<string>, slots: unknown) {
  if (!Array.isArray(slots)) return;
  for (const slot of slots) {
    if (!slot || typeof slot !== "object") continue;
    const o = slot as Record<string, unknown>;
    const vu = o.videoUrl;
    addNonEmptyUrl(set, typeof vu === "string" ? vu : null);
    const hist = o.history;
    if (Array.isArray(hist)) {
      for (const u of hist) addNonEmptyUrl(set, typeof u === "string" ? u : null);
    }
  }
}

/** Kling / classic wizard video URLs stored on a run. */
function collectProjectRunVideoUrls(run: { video_url: string | null; extracted?: unknown }): string[] {
  const set = new Set<string>();
  addNonEmptyUrl(set, run.video_url);
  const snap = readUniverseFromExtracted(run.extracted);
  if (snap) {
    addNonEmptyUrl(set, snap.klingVideoUrl ?? null);
    addVideosFromKlingSlots(set, snap.klingByReferenceIndex);
    if (Array.isArray(snap.linkToAdPipelineByAngle)) {
      for (const pipe of snap.linkToAdPipelineByAngle) {
        if (!pipe) continue;
        addVideosFromKlingSlots(set, pipe.klingByReferenceIndex);
      }
    }
  }
  return [...set];
}

const TEMPLATES = [
  {
    id: "template1",
    title: "Template 1: Authentic UGC smartphone (POV/Selfie)",
    bestFor: "beauty / beverage / food / fashion / gadget",
  },
  {
    id: "template2",
    title: "Template 2: Beauty/Wellness cinematic UGC",
    bestFor: "skincare / makeup / supplement / self-care",
  },
  {
    id: "template3",
    title: "Template 3: Storytelling problem-solution UGC",
    bestFor: "gadget / pain point / supplement / emotional niche",
  },
] as const;

type TemplateId = (typeof TEMPLATES)[number]["id"];

function safeString(x: unknown, fallback = ""): string {
  return typeof x === "string" ? x : fallback;
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
    lower.includes("asr") ||
    lower.includes("dialogue");
  if (mentionsAudio) return p;
  return `${p}\n\nAudio: ON. Include natural spoken voice and subtle ambient sound.`;
}

function ProjectVideoCard({ src, onFullscreen }: { src: string; onFullscreen: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <div
      className="group/vid relative h-40 w-[7.5rem] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black transition-all duration-200 hover:border-violet-400/40 hover:shadow-[0_0_16px_rgba(139,92,246,0.15)]"
      onMouseEnter={() => { videoRef.current?.play().catch(() => {}); }}
      onMouseLeave={() => {
        const v = videoRef.current;
        if (v) { v.pause(); v.currentTime = 0; }
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full object-cover"
        playsInline
        muted
        loop
        preload="metadata"
      />
      <div className="pointer-events-none absolute inset-0 bg-black/0 transition-all duration-200 group-hover/vid:bg-black/25" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-100 transition-opacity duration-200 group-hover/vid:opacity-0">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
          <Play className="h-3.5 w-3.5 text-white" fill="currentColor" />
        </span>
      </div>
      <button
        type="button"
        onClick={onFullscreen}
        className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/vid:opacity-100"
        aria-label="View fullscreen"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition hover:bg-black/80">
          <Maximize2 className="h-4 w-4 text-white" />
        </span>
      </button>
    </div>
  );
}

export default function AppBrandWizard() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<WizardStep>("url");
  const [appSection, setAppSection] = useState<AppSection>(() => sectionFromPathname(typeof window !== "undefined" ? window.location.pathname : "/app/link-to-ad"));

  const [savedRuns, setSavedRuns] = useState<
    Array<{
      id: string;
      created_at: string;
      store_url: string;
      title: string | null;
      selected_image_url: string | null;
      video_url: string | null;
      generated_image_urls?: string[] | null;
      extracted?: unknown;
    }>
  >([]);
  /** Open Link to Ad and hydrate from this run (Projects). */
  const [linkToAdResumeRunId, setLinkToAdResumeRunId] = useState<string | null>(null);
  /** Remount Link to Ad for a clean session (Return to Link to Ad). */
  const [linkToAdMountKey, setLinkToAdMountKey] = useState(0);
  /**
   * Once the user opens Link to Ad, keep the tree mounted when switching studio tabs
   * (Image / Video / …) so in-flight generations, polling, and step state are not lost.
   */
  const linkToAdKeepAliveRef = useRef(false);
  if (appSection === "link_to_ad") {
    linkToAdKeepAliveRef.current = true;
  }
  /** Latest persisted run id reported by Link to Ad (for recent-run chips). */
  const [linkToAdActiveRunId, setLinkToAdActiveRunId] = useState<string | null>(null);
  const [branchingNormalizedUrl, setBranchingNormalizedUrl] = useState<string | null>(null);
  const [deleteProjectDialog, setDeleteProjectDialog] = useState<{
    storeUrl: string;
    runIds: string[];
    label: string;
  } | null>(null);
  const [selectedProjectNormalizedUrl, setSelectedProjectNormalizedUrl] = useState<string | null>(null);
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  /** While set, ignore pathname→section sync so a stale URL cannot overwrite a sidebar click. */
  const pendingSectionNavRef = useRef<AppSection | null>(null);

  const [storeUrl, setStoreUrl] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Extracted | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [researchNotes, setResearchNotes] = useState<string[]>([]);

  const [quiz, setQuiz] = useState<Quiz>({
    aboutProduct: "",
    problems: "",
    promises: "",
    persona: "",
    angles: "",
    offers: "",
    videoDurationPreference: "15s",
  });
  const [quizPrecisionNote, setQuizPrecisionNote] = useState<string>("");
  const [isQuizAutofilling, setIsQuizAutofilling] = useState(false);

  const [isClassifyingImages, setIsClassifyingImages] = useState(false);
  const [hasClassifiedImages, setHasClassifiedImages] = useState(false);
  const [productOnlyCandidates, setProductOnlyCandidates] = useState<
    Array<{ url: string; reason?: string }>
  >([]);
  const [selectedProductImageUrls, setSelectedProductImageUrls] = useState<string[]>([]);
  const [isUploadingPackshots, setIsUploadingPackshots] = useState(false);
  const [packshotUploadPreviews, setPackshotUploadPreviews] = useState<{ id: string; blob: string }[]>([]);

  const [nanoModel, setNanoModel] = useState<NanoModel>("nano");
  const [imagePrompt, setImagePrompt] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");
  const [isCreatingPerfectImagePrompt, setIsCreatingPerfectImagePrompt] =
    useState(false);
  const [imageGen, setImageGen] = useState<ImageGenState>({ kind: "idle" });
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const imagePromptDisplayBlocks = useMemo(() => {
    const raw = imagePrompt.trim();
    if (!raw) return [] as Array<{
      title: string;
      isStructured: boolean;
      avatar: string;
      scene: string;
      product: string;
      fallback: string;
      technicalTail: string;
    }>;

    const hasLabeledPrompts = /(?:^|\n)\s*PROMPT\s*[123]\s*$/im.test(raw);
    const blocks = hasLabeledPrompts
      ? parseThreeLabeledPrompts(raw).map((t) => t.trim()).filter(Boolean)
      : [raw];

    return blocks.map((block, idx) => {
      const { editable, technicalTail } = splitNanoPromptBodyForEditing(block);
      const parsed = parseNanoEditableSections(editable);
      return {
        title: `Prompt ${idx + 1}`,
        isStructured: parsed.isStructured,
        avatar: parsed.person,
        scene: parsed.scene,
        product: parsed.product,
        fallback: editable.trim(),
        technicalTail: technicalTail.trim(),
      };
    });
  }, [imagePrompt]);

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("template1");
  const [videoPrompt, setVideoPrompt] = useState<string>("");
  const [isBuildingVideoPrompt, setIsBuildingVideoPrompt] = useState(false);
  const [videoGen, setVideoGen] = useState<VideoGenState>({ kind: "idle" });

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxVideoUrl, setLightboxVideoUrl] = useState<string | null>(null);
  const packshotFileInputRef = useRef<HTMLInputElement>(null);

  const [motionVideoRefBlobUrl, setMotionVideoRefBlobUrl] = useState<string | null>(null);
  const [motionVideoFile, setMotionVideoFile] = useState<File | null>(null);
  const [motionVideoUploadedUrl, setMotionVideoUploadedUrl] = useState<string | null>(null);
  const [motionVideoUploadPending, setMotionVideoUploadPending] = useState(false);
  const [motionVideoPosterUrl, setMotionVideoPosterUrl] = useState<string | null>(null);
  const [motionVideoPreviewLoading, setMotionVideoPreviewLoading] = useState(false);
  /** True only after the video element fires onPlaying — guarantees real frames are visible. */
  const [motionVideoPlaying, setMotionVideoPlaying] = useState(false);
  const [motionVideoDetectedDuration, setMotionVideoDetectedDuration] = useState<number | null>(null);
  const [motionCharacterImageUrl, setMotionCharacterImageUrl] = useState<string | null>(null);
  const [motionCharacterFile, setMotionCharacterFile] = useState<File | null>(null);
  const [motionQuality, setMotionQuality] = useState<string>("720p");
  const [motionPrompt, setMotionPrompt] = useState<string>("");
  const [adCloneOutputLanguage, setAdCloneOutputLanguage] = useState<string>(
    DEFAULT_WAVESPEED_HEYGEN_TRANSLATE_LANGUAGE,
  );
  const [translateToolMode, setTranslateToolMode] = useState<TranslateToolMode>(() => {
    if (typeof window === "undefined") return "video_translate";
    return translateModeFromPathname(window.location.pathname) ?? "video_translate";
  });
  const [voiceToolMode, setVoiceToolMode] = useState<VoiceToolMode>(() => {
    if (typeof window === "undefined") return "voice_change";
    return voiceModeFromPathname(window.location.pathname) ?? "voice_change";
  });
  const [voiceHistoryItems, setVoiceHistoryItems] = useState<StudioHistoryItem[]>([]);
  const [elevenVoices, setElevenVoices] = useState<ElevenVoiceOption[]>([]);
  const [elevenVoicesLoading, setElevenVoicesLoading] = useState(false);
  const [elevenVoicesLoadMorePending, setElevenVoicesLoadMorePending] = useState(false);
  const [elevenSharedVoicesPageByLang, setElevenSharedVoicesPageByLang] = useState<Record<string, number>>({});
  const [elevenSharedVoicesHasMoreByLang, setElevenSharedVoicesHasMoreByLang] = useState<Record<string, boolean>>({});
  const [elevenVoiceId, setElevenVoiceId] = useState<string>("");
  const [favoriteElevenVoiceIds, setFavoriteElevenVoiceIds] = useState<string[]>([]);
  const [voiceChangeUploadKind, setVoiceChangeUploadKind] = useState<VoiceChangeUploadKind>("audio");
  const [voiceChangeUploadFile, setVoiceChangeUploadFile] = useState<File | null>(null);
  const [voiceChangeUploadPreviewUrl, setVoiceChangeUploadPreviewUrl] = useState<string | null>(null);
  const [voiceChangeHistoryUrl, setVoiceChangeHistoryUrl] = useState<string>("");
  const [voiceChangePreparing, setVoiceChangePreparing] = useState(false);
  const [voiceChangeModelId, setVoiceChangeModelId] = useState<string>("eleven_multilingual_sts_v2");
  const [voiceChangeOutputFormat, setVoiceChangeOutputFormat] = useState<string>("mp3_44100_128");
  const [voiceChangeEnableLogging, setVoiceChangeEnableLogging] = useState(true);
  const [voiceChangeOptimizeLatency, setVoiceChangeOptimizeLatency] = useState<string>("");
  const [voiceChangeFileFormat, setVoiceChangeFileFormat] = useState<"other" | "pcm_s16le_16">("other");
  const [voiceChangeSeed, setVoiceChangeSeed] = useState<string>("");
  const [voiceChangeRemoveBackgroundNoise, setVoiceChangeRemoveBackgroundNoise] = useState(false);
  const [voiceChangeVoiceSettingsJson, setVoiceChangeVoiceSettingsJson] = useState<string>("");
  /** Language filter for the ElevenLabs voice picker (e.g. "en", "fr", "es"). Empty = all. */
  const [voiceChangeLangFilter, setVoiceChangeLangFilter] = useState<string>("");
  const [voiceChangeVoiceTab, setVoiceChangeVoiceTab] = useState<"all" | "favorites">("all");
  const [motionHistoryItems, setMotionHistoryItems] = useState<StudioHistoryItem[]>([]);
  const [motionServerHistory, setMotionServerHistory] = useState<boolean | null>(null);
  type MotionBilling =
    | { open: false }
    | { open: true; reason: "plan" }
    | { open: true; reason: "credits"; required: number };
  const [motionBilling, setMotionBilling] = useState<MotionBilling>({ open: false });
  const [motionSceneBackground, setMotionSceneBackground] = useState<"video" | "image">("video");
  const [motionBusy, setMotionBusy] = useState(false);
  const motionVideoInputRef = useRef<HTMLInputElement>(null);
  const voiceChangeInputRef = useRef<HTMLInputElement>(null);
  const motionVideoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const motionVideoUploadTokenRef = useRef<string | null>(null);
  const motionVideoBlobUrlRef = useRef<string | null>(null);
  const motionPosterCapturedForUrlRef = useRef<string | null>(null);
  const motionPosterCapturePendingRef = useRef(false);
  const motionPlayCaptureAttemptsRef = useRef(0);
  const motionCharacterInputRef = useRef<HTMLInputElement>(null);
  const { planId, current: creditsBalance, spendCredits, grantCredits } = useCreditsPlan();
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;
  const grantCreditsRef = useRef(grantCredits);
  grantCreditsRef.current = grantCredits;

  const applyRefundHints = useCallback((hints: RefundHint[]) => {
    for (const h of hints) {
      if (h.credits > 0) {
        grantCreditsRef.current(h.credits);
        creditsRef.current += h.credits;
      }
    }
  }, []);

  const languageDisplayNames = useMemo(() => {
    try {
      // Use English UI labels consistently across the app.
      return new Intl.DisplayNames(["en"], { type: "language" });
    } catch {
      return null;
    }
  }, []);

  const formatLanguageCodeLabel = useCallback(
    (code: string): string => {
      const raw = (code || "").trim();
      if (!raw) return "Unknown";
      // Handle locales like "en-US" / "pt_BR" / "zh-Hans".
      const normalized = raw.replace("_", "-").toLowerCase();
      const base = normalized.split("-")[0] || normalized;
      const pretty = languageDisplayNames?.of(base);
      if (pretty && pretty.trim()) return pretty;
      return raw.toUpperCase();
    },
    [languageDisplayNames],
  );

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/elevenlabs/favorite-voices", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { favorites?: string[] };
        if (!res.ok) return;
        if (Array.isArray(json.favorites)) {
          setFavoriteElevenVoiceIds(json.favorites.map((x) => String(x)).filter(Boolean));
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const saveFavoriteElevenVoices = useCallback(async (ids: string[]) => {
    await fetch("/api/elevenlabs/favorite-voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites: ids }),
    });
  }, []);

  const toggleFavoriteElevenVoice = useCallback((voiceId: string) => {
    const id = String(voiceId || "").trim();
    if (!id) return;
    setFavoriteElevenVoiceIds((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((x) => x !== id) : [id, ...prev];
      void saveFavoriteElevenVoices(next);
      return next;
    });
  }, [saveFavoriteElevenVoices]);


  /** Billable seconds: real clip length, or placeholder so 720p ↔ 1080p updates credits before upload. */
  const MOTION_CREDITS_PLACEHOLDER_SEC = 12;
  /** Conservative guardrail for motion-control upload UX. */
  const MOTION_VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
  const historyKindsKey =
    appSection === "ad_clone"
      ? `${STUDIO_GENERATION_KIND_STUDIO_TRANSLATE_VIDEO},studio_video`
      : appSection === "voice"
        ? `${STUDIO_GENERATION_KIND_VOICE_CHANGE},studio_audio`
        : "motion_control";
  const motionVideoPreviewSrc = useMemo(
    () => proxiedMediaSrc(motionVideoUploadedUrl || motionVideoRefBlobUrl),
    [motionVideoUploadedUrl, motionVideoRefBlobUrl],
  );
  const motionBillableSeconds = useMemo(() => {
    const d = motionVideoDetectedDuration;
    if (d != null && Number.isFinite(d) && d > 0) return d;
    return MOTION_CREDITS_PLACEHOLDER_SEC;
  }, [motionVideoDetectedDuration]);
  const motionCreditsUsesEstimate =
    motionVideoDetectedDuration == null ||
    !Number.isFinite(motionVideoDetectedDuration) ||
    motionVideoDetectedDuration <= 0;
  const adCloneTranslateEnabled = appSection === "ad_clone";

  const motionCredits = useMemo(
    () =>
      appSection === "voice"
        ? VOICE_CHANGE_CREDITS_FLAT
        : adCloneTranslateEnabled
        ? calculateWaveSpeedVideoTranslateCredits(motionBillableSeconds)
        : calculateMotionControlCredits({
            quality: motionQuality,
            durationSeconds: motionBillableSeconds,
          }),
    [adCloneTranslateEnabled, appSection, motionQuality, motionBillableSeconds],
  );
  const selectedElevenVoice = useMemo(
    () => elevenVoices.find((voice) => voice.voiceId === elevenVoiceId) ?? null,
    [elevenVoiceId, elevenVoices],
  );
  const readyTranslateVideos = useMemo(
    () =>
      [...motionHistoryItems, ...voiceHistoryItems].filter(
        (item) =>
          item.status === "ready" &&
          Boolean(item.mediaUrl?.trim()) &&
          item.kind !== "audio" &&
          (item.kind === "video" || item.kind === "motion" || isProbablyVideoUrl(item.mediaUrl)),
      ),
    [motionHistoryItems, voiceHistoryItems],
  );

  const isVoiceFrenchish = useCallback((voice: ElevenVoiceOption): boolean => {
    const lang = (voice.labels?.language || voice.language || "").trim().toLowerCase();
    const accent = (voice.labels?.accent || "").trim().toLowerCase();
    const name = (voice.name || "").trim().toLowerCase();
    return (
      lang === "fr" ||
      lang.startsWith("fr-") ||
      accent.includes("french") ||
      accent.includes("france") ||
      accent === "fr" ||
      name.includes("french") ||
      name.includes("français") ||
      name.includes("francais")
    );
  }, []);

  const voiceMatchesLangFilter = useCallback(
    (voice: ElevenVoiceOption, langFilter: string): boolean => {
      const f = (langFilter || "").trim().toLowerCase();
      if (!f) return true;
      if (f === "fr") return isVoiceFrenchish(voice);
      const lang = (voice.labels?.language || voice.language || "").trim().toLowerCase();
      return lang === f || lang.startsWith(`${f}-`);
    },
    [isVoiceFrenchish],
  );

  /** All unique language codes present in the loaded ElevenLabs voice library. */
  const elevenVoiceLanguages = useMemo(
    () =>
      [
        ...new Set(
          elevenVoices
            .map((v) => (v.labels?.language || v.language || "").trim().toLowerCase())
            .filter((l): l is string => Boolean(l)),
        ),
        ...(elevenVoices.some((v) => isVoiceFrenchish(v)) ? ["fr"] : []),
      ].sort(),
    [elevenVoices, isVoiceFrenchish],
  );

  /** Voice list filtered by the selected language (or all voices when filter is empty). */
  const filteredElevenVoicesBase = useMemo(
    () => (voiceChangeLangFilter ? elevenVoices.filter((v) => voiceMatchesLangFilter(v, voiceChangeLangFilter)) : elevenVoices),
    [elevenVoices, voiceChangeLangFilter, voiceMatchesLangFilter],
  );

  const filteredElevenVoices = useMemo(() => {
    const base = filteredElevenVoicesBase;
    const favoritesSet = new Set(favoriteElevenVoiceIds);
    const byTab =
      voiceChangeVoiceTab === "favorites" ? base.filter((v) => favoritesSet.has(v.voiceId)) : base;
    return [...byTab].sort((a, b) => {
      const af = favoritesSet.has(a.voiceId) ? 1 : 0;
      const bf = favoritesSet.has(b.voiceId) ? 1 : 0;
      if (af !== bf) return bf - af;
      return a.name.localeCompare(b.name);
    });
  }, [favoriteElevenVoiceIds, filteredElevenVoicesBase, voiceChangeVoiceTab]);

  const elevenVoiceLangFilterKey = (voiceChangeLangFilter || "__all__").toLowerCase();
  const elevenVoiceLangHasMore = elevenSharedVoicesHasMoreByLang[elevenVoiceLangFilterKey] ?? true;

  const translateLanguagesFiltered = useMemo(() => {
    const base = [...(WAVESPEED_HEYGEN_TRANSLATE_LANGUAGES as readonly string[])];
    const hasStandalone = new Set(base);
    const variantsByRoot = new Map<string, string[]>();
    for (const lang of base) {
      const m = /^(.+?)\s+\(.+\)$/.exec(lang);
      if (!m) continue;
      const root = m[1]!.trim();
      const list = variantsByRoot.get(root) ?? [];
      list.push(lang);
      variantsByRoot.set(root, list);
    }
    const deduped = base.filter((lang) => {
      const m = /^(.+?)\s+\(.+\)$/.exec(lang);
      if (!m) return true;
      const root = m[1]!.trim();
      const variants = variantsByRoot.get(root) ?? [];
      // Keep regional variants only when there are multiple choices.
      if (hasStandalone.has(root) && variants.length === 1) return false;
      return true;
    });
    return deduped.sort((a, b) => a.localeCompare(b));
  }, []);

  const mergeServerHistoryWithLocalPending = useCallback(
    (serverItems: StudioHistoryItem[], prevItems: StudioHistoryItem[]): StudioHistoryItem[] => {
      const serverIds = new Set(serverItems.map((i) => i.id));
      const now = Date.now();
      const optimisticKeepMs = 5 * 60 * 1000;
      const keepLocal = prevItems.filter(
        (i) =>
          !serverIds.has(i.id) &&
          now - i.createdAt < optimisticKeepMs &&
          (i.status === "generating" || i.status === "ready" || i.status === "failed"),
      );
      return [...serverItems, ...keepLocal].sort((a, b) => b.createdAt - a.createdAt);
    },
    [],
  );


  const isVoiceSection = appSection === "voice";
  const setActiveHistoryItems = isVoiceSection ? setVoiceHistoryItems : setMotionHistoryItems;

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/studio/generations?kind=${encodeURIComponent(historyKindsKey)}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        setMotionServerHistory(false);
        setActiveHistoryItems([]);
        return;
      }
      if (!res.ok) {
        setMotionServerHistory(false);
        setActiveHistoryItems([]);
        return;
      }
      const json = (await res.json()) as { data?: StudioHistoryItem[]; refundHints?: RefundHint[] };
      setMotionServerHistory(true);
      setActiveHistoryItems((prev) =>
        mergeServerHistoryWithLocalPending(json.data ?? [], prev),
      );
      const hints = json.refundHints ?? [];
      if (hints.length) {
        applyRefundHints(hints);
        toast.message("Credits refunded", { description: "A studio generation failed after charge." });
      }
    })();
  }, [applyRefundHints, historyKindsKey, setActiveHistoryItems]);

  useEffect(() => {
    if (motionServerHistory !== true) return;

    const tick = () => {
      void (async () => {
        const res = await fetch("/api/studio/generations/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: historyKindsKey,
            personalApiKey: getPersonalApiKey() ?? undefined,
          }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: StudioHistoryItem[]; refundHints?: RefundHint[] };
        if (Array.isArray(json.data)) {
          setActiveHistoryItems((prev) =>
            mergeServerHistoryWithLocalPending(json.data ?? [], prev),
          );
        }
        const hints = json.refundHints ?? [];
        if (hints.length) {
          applyRefundHints(hints);
          toast.message("Credits refunded", { description: "A studio generation failed after charge." });
        }
      })();
    };

    tick();
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [applyRefundHints, historyKindsKey, mergeServerHistoryWithLocalPending, motionServerHistory, setActiveHistoryItems]);

  useEffect(() => {
    return () => {
      if (voiceChangeUploadPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(voiceChangeUploadPreviewUrl);
    };
  }, [voiceChangeUploadPreviewUrl]);

  useEffect(() => {
    if (appSection !== "ad_clone" && appSection !== "voice") return;
    if (elevenVoices.length > 0 || elevenVoicesLoading) return;
    setElevenVoicesLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/elevenlabs/voices?sharedPage=0&sharedPageSize=100", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          voices?: ElevenVoiceOption[];
          sharedHasMore?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error || "Could not load voices");
        const voices = Array.isArray(json.voices) ? json.voices : [];
        setElevenVoices(voices);
        setElevenSharedVoicesHasMoreByLang({ __all__: Boolean(json.sharedHasMore) });
        setElevenSharedVoicesPageByLang({ __all__: 0 });
        setElevenVoiceId((prev) => prev || voices[0]?.voiceId || "");
      } catch (err) {
        toast.error("Could not load voices.", {
          description: userMessageFromCaughtError(err, "Please try again in a moment."),
        });
      } finally {
        setElevenVoicesLoading(false);
      }
    })();
  }, [appSection, elevenVoices.length, elevenVoicesLoading]);

  const loadMoreElevenVoices = useCallback(async () => {
    if (elevenVoicesLoadMorePending) return;
    const langKey = (voiceChangeLangFilter || "__all__").toLowerCase();
    const hasMoreForFilter = elevenSharedVoicesHasMoreByLang[langKey] ?? true;
    if (!hasMoreForFilter) return;
    const currentPageForFilter = elevenSharedVoicesPageByLang[langKey] ?? -1;
    const nextPage = currentPageForFilter + 1;
    setElevenVoicesLoadMorePending(true);
    try {
      const params = new URLSearchParams({
        sharedPage: String(nextPage),
        sharedPageSize: "10",
        includeAccount: "false",
      });
      if (langKey !== "__all__") params.set("language", voiceChangeLangFilter.trim().toLowerCase());
      const res = await fetch(`/api/elevenlabs/voices?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        voices?: ElevenVoiceOption[];
        sharedHasMore?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Could not load more voices");
      const more = Array.isArray(json.voices) ? json.voices : [];
      setElevenVoices((prev) => {
        const byId = new Map<string, ElevenVoiceOption>();
        for (const v of prev) byId.set(v.voiceId, v);
        for (const v of more) byId.set(v.voiceId, v);
        return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
      });
      setElevenSharedVoicesHasMoreByLang((prev) => ({
        ...prev,
        [langKey]: Boolean(json.sharedHasMore),
      }));
      setElevenSharedVoicesPageByLang((prev) => ({
        ...prev,
        [langKey]: nextPage,
      }));
    } catch (err) {
      toast.error("Could not load more voices.", {
        description: userMessageFromCaughtError(err, "Please try again in a moment."),
      });
    } finally {
      setElevenVoicesLoadMorePending(false);
    }
  }, [
    elevenSharedVoicesHasMoreByLang,
    elevenSharedVoicesPageByLang,
    elevenVoicesLoadMorePending,
    voiceChangeLangFilter,
  ]);

  const applyMotionCharacterFile = useCallback((file: File) => {
    try {
      assertStudioImageUpload(file);
    } catch (e) {
      toast.error("Image incompatible", {
        description: userMessageFromCaughtError(e, "Ce fichier n’est pas utilisable."),
      });
      return;
    }
    const url = URL.createObjectURL(file);
    setMotionCharacterFile(file);
    setMotionCharacterImageUrl(url);
    toast.success("Character image selected", { description: file.name });
  }, []);

  useEffect(() => {
    if (appSection !== "motion_control" && appSection !== "ad_clone") return;
    const onPaste = (event: ClipboardEvent) => {
      const files = clipboardImageFiles(event);
      if (!files.length) return;
      event.preventDefault();
      applyMotionCharacterFile(files[0]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [appSection, applyMotionCharacterFile]);

  /** Revoke motion video blob only when this URL is replaced or cleared (not when the other slot changes). */
  useEffect(() => {
    return () => {
      if (motionVideoRefBlobUrl?.startsWith("blob:")) URL.revokeObjectURL(motionVideoRefBlobUrl);
    };
  }, [motionVideoRefBlobUrl]);

  useEffect(() => {
    return () => {
      if (motionVideoPosterUrl?.startsWith("blob:")) URL.revokeObjectURL(motionVideoPosterUrl);
    };
  }, [motionVideoPosterUrl]);

  motionVideoBlobUrlRef.current = motionVideoPreviewSrc;

  const tryCaptureMotionPosterFromEl = useCallback((v: HTMLVideoElement) => {
    const blobUrl = motionVideoBlobUrlRef.current;
    if (
      !blobUrl ||
      motionPosterCapturedForUrlRef.current === blobUrl ||
      motionPosterCapturePendingRef.current
    ) {
      return;
    }
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    const maxSide = 720;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    } catch {
      return;
    }
    motionPosterCapturePendingRef.current = true;
    canvas.toBlob(
      (blob) => {
        motionPosterCapturePendingRef.current = false;
        if (!blob || motionVideoBlobUrlRef.current !== blobUrl) return;
        motionPosterCapturedForUrlRef.current = blobUrl;
        setMotionVideoPosterUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      },
      "image/jpeg",
      0.85,
    );
  }, []);

  const tryPlayThenCapturePoster = useCallback(() => {
    const v = motionVideoPreviewRef.current;
    const blobUrl = motionVideoBlobUrlRef.current;
    if (!v || !blobUrl || motionPosterCapturedForUrlRef.current === blobUrl) return;
    if (motionPlayCaptureAttemptsRef.current >= 5) return;
    motionPlayCaptureAttemptsRef.current += 1;
    const afterFrame = () => {
      tryCaptureMotionPosterFromEl(v);
      try {
        v.pause();
      } catch {
        /* ignore */
      }
    };
    void v
      .play()
      .then(() => {
        if (typeof v.requestVideoFrameCallback === "function") {
          v.requestVideoFrameCallback(() => {
            requestAnimationFrame(afterFrame);
          });
        } else {
          requestAnimationFrame(afterFrame);
        }
      })
      .catch(() => {
        /* autoplay blocked or codec issue */
      });
  }, [tryCaptureMotionPosterFromEl]);

  useEffect(() => {
    motionPosterCapturedForUrlRef.current = null;
    motionPosterCapturePendingRef.current = false;
    motionPlayCaptureAttemptsRef.current = 0;
    setMotionVideoPosterUrl(null);
    setMotionVideoPlaying(false);
  }, [motionVideoPreviewSrc]);

  /** Safety net: if onPlaying never fires (autoplay blocked, slow codec), stop the spinner after 3 s. */
  useEffect(() => {
    if (!motionVideoPreviewSrc) return;
    const id = window.setTimeout(() => {
      setMotionVideoPlaying((prev) => {
        if (prev) return prev; // already playing — no-op
        // Force-show whatever frame is available and stop spinner.
        const v = motionVideoPreviewRef.current;
        if (v) {
          try { v.currentTime = Math.min(0.1, v.duration || 0.1); } catch { /* ignore */ }
        }
        return true;
      });
      setMotionVideoPreviewLoading(false);
    }, 3000);
    return () => window.clearTimeout(id);
  }, [motionVideoPreviewSrc]);

  /** Some codecs only expose frames after a short play(); retry if poster still missing. */
  useEffect(() => {
    if (!motionVideoPreviewSrc) return;
    const id1 = window.setTimeout(() => {
      if (motionPosterCapturedForUrlRef.current === motionVideoBlobUrlRef.current) return;
      tryPlayThenCapturePoster();
    }, 350);
    const id2 = window.setTimeout(() => {
      if (motionPosterCapturedForUrlRef.current === motionVideoBlobUrlRef.current) return;
      tryPlayThenCapturePoster();
    }, 1400);
    return () => {
      window.clearTimeout(id1);
      window.clearTimeout(id2);
    };
  }, [motionVideoPreviewSrc, tryPlayThenCapturePoster]);

  useEffect(() => {
    return () => {
      if (motionCharacterImageUrl?.startsWith("blob:")) URL.revokeObjectURL(motionCharacterImageUrl);
    };
  }, [motionCharacterImageUrl]);

  const clearMotionVideoReference = useCallback(() => {
    motionVideoUploadTokenRef.current = null;
    setMotionVideoFile(null);
    setMotionVideoUploadedUrl(null);
    setMotionVideoUploadPending(false);
    setMotionVideoRefBlobUrl(null);
    setMotionVideoPosterUrl(null);
    setMotionVideoDetectedDuration(null);
    setMotionVideoPreviewLoading(false);
  }, []);

  const clearMotionCharacterImage = useCallback(() => {
    setMotionCharacterFile(null);
    setMotionCharacterImageUrl(null);
  }, []);

  const clearVoiceChangeUpload = useCallback(() => {
    setVoiceChangeUploadFile(null);
    setVoiceChangeUploadKind("audio");
    setVoiceChangeUploadPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setVoiceChangeHistoryUrl("");
  }, []);

  const motionSectionRef = useRef<"ad_clone" | "voice" | "motion_control" | null>(null);
  useEffect(() => {
    const current = appSection === "ad_clone" || appSection === "voice" || appSection === "motion_control" ? appSection : null;
    const previous = motionSectionRef.current;
    motionSectionRef.current = current;
    if (!current || !previous || current === previous) return;
    clearMotionVideoReference();
    if (current === "motion_control") clearVoiceChangeUpload();
  }, [appSection, clearMotionVideoReference, clearVoiceChangeUpload]);

  const applyVoiceChangeUploadFile = useCallback((file: File) => {
    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    const kind: VoiceChangeUploadKind =
      type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(name) ? "video" : "audio";

    // Upload should win over history selection.
    setVoiceChangeHistoryUrl("");
    setVoiceChangeUploadFile(file);
    setVoiceChangeUploadKind(kind);
    setVoiceChangeUploadPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  const prepareVoiceChangeAudioFile = useCallback(async (): Promise<File> => {
    if (voiceChangeUploadFile) {
      if (voiceChangeUploadFile.size > 50 * 1024 * 1024) {
        throw new Error("File too large for ElevenLabs voice change (max 50 MB).");
      }
      return voiceChangeUploadFile;
    }

    const selected = readyTranslateVideos.find((item) => item.mediaUrl === voiceChangeHistoryUrl);
    if (!selected?.mediaUrl) {
      throw new Error("Add an audio/video file or choose a generated video.");
    }
    const res = await fetch(proxiedMediaSrc(selected.mediaUrl));
    if (!res.ok) throw new Error("Could not download the selected video.");
    const blob = await res.blob();
    return new File([blob], "history-source.mp4", { type: blob.type || "video/mp4" });
  }, [
    readyTranslateVideos,
    voiceChangeHistoryUrl,
    voiceChangeUploadFile,
  ]);

  const currentProductName = useMemo(() => {
    const fromAnalysis = safeString(analysis?.step1_rawSheet ?? "");
    if (extracted?.title) return extracted.title;
    if (fromAnalysis) return fromAnalysis.split("\n")[0]?.slice(0, 120) ?? null;
    return null;
  }, [analysis, extracted?.title]);

  const packshotUrls = useMemo(() => {
    return selectedProductImageUrls;
  }, [selectedProductImageUrls]);

  // Group runs by product URL = "projects". One project = one store URL with all its runs (datas + generations).
  const projects = useMemo(() => {
    const byUrl = new Map<
      string,
      { storeUrl: string; title: string | null; runs: (typeof savedRuns)[number][] }
    >();
    for (const r of savedRuns) {
      const url = typeof r.store_url === "string" ? normalizeUrl(r.store_url) : "";
      if (!url) continue;
      const existing = byUrl.get(url);
      const runEntry = {
        ...r,
        store_url: r.store_url,
      };
      if (existing) {
        existing.runs.push(runEntry);
      } else {
        byUrl.set(url, {
          storeUrl: r.store_url,
          title: r.title ?? null,
          runs: [runEntry],
        });
      }
    }
    // Sort runs inside each project by created_at desc (newest first)
    const out: Array<{ storeUrl: string; normalizedUrl: string; title: string | null; runs: (typeof savedRuns)[number][] }> = [];
    byUrl.forEach((v, normalizedUrl) => {
      const runs = [...v.runs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      out.push({
        storeUrl: v.storeUrl,
        normalizedUrl,
        title: v.title,
        runs,
      });
    });
    out.sort((a, b) => new Date(b.runs[0].created_at).getTime() - new Date(a.runs[0].created_at).getTime());
    return out;
  }, [savedRuns]);

  /** Last 3 Link to Ad runs (any product) for quick switching without leaving this tab. */
  const recentLinkToAdRuns = useMemo(() => {
    return savedRuns
      .filter((r) => runHasLinkToAdUniverse(r.extracted))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3)
      .map((r) => ({
        id: r.id,
        title: r.title,
        storeUrl: r.store_url,
        createdAt: r.created_at,
        thumbUrl: universeThumbFromExtracted(r.extracted) || r.selected_image_url || null,
      }));
  }, [savedRuns]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.normalizedUrl === selectedProjectNormalizedUrl) ?? null,
    [projects, selectedProjectNormalizedUrl],
  );

  useEffect(() => {
    if (!selectedProjectNormalizedUrl) return;
    if (!projects.some((p) => p.normalizedUrl === selectedProjectNormalizedUrl)) {
      setSelectedProjectNormalizedUrl(null);
    }
  }, [projects, selectedProjectNormalizedUrl]);

  function resetForNewProject() {
    setStep("url");
    setRunId(null);
    if (typeof localStorage !== "undefined") localStorage.removeItem(UGC_CURRENT_RUN_KEY);
    setStoreUrl("");
    setExtracted(null);
    setAnalysis(null);
    setResearchNotes([]);
    setQuiz({
      aboutProduct: "",
      problems: "",
      promises: "",
      persona: "",
      angles: "",
      offers: "",
      videoDurationPreference: "15s",
    });
    setSelectedProductImageUrls([]);
    setNanoModel("nano");
    setImagePrompt("");
    setNegativePrompt("");
    setImageGen({ kind: "idle" });
    setSelectedImageUrl(null);
    setSelectedTemplate("template1");
    setVideoPrompt("");
    setIsBuildingVideoPrompt(false);
    setVideoGen({ kind: "idle" });
    setLightboxUrl(null);
  }

  async function onManualSaveProject() {
    const url = storeUrl.trim();
    if (!url) {
      toast.error("Paste the store URL / product page URL before saving.");
      return;
    }
    await saveRun({
      storeUrl: url,
      title: extracted?.title ?? null,
      extracted,
      analysis,
      quiz,
      packshotUrls,
      imagePrompt,
      negativePrompt,
      generatedImageUrls: imageGen.kind === "success" ? imageGen.urls : undefined,
      selectedImageUrl,
      videoTemplateId: selectedTemplate,
      videoPrompt,
      videoUrl: videoGen.kind === "success" ? videoGen.url : null,
    });
    void refreshMeAndRuns();
    toast.success("Project saved");
  }

  async function refreshMeAndRuns() {
    setIsLoadingRuns(true);
    try {
      const res = await fetch("/api/runs/list", { method: "GET", cache: "no-store" });
      const json = (await res.json()) as { data?: any; error?: string };
      if (!res.ok) throw new Error(json.error || "List runs failed");
      const runs = Array.isArray(json.data) ? json.data : [];
      setSavedRuns(runs);

      const pendingKling = runs.filter((r: { id: string; extracted?: unknown }) => {
        if (!runHasLinkToAdUniverse(r.extracted)) return false;
        const s = readUniverseFromExtracted(r.extracted);
        return universeHasPendingKlingTask(s);
      });
      if (pendingKling.length > 0) {
        void (async () => {
          for (const r of pendingKling as { id: string }[]) {
            try {
              await fetch("/api/runs/finalize-kling", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ runId: r.id }),
              });
            } catch {
              /* ignore */
            }
          }
          try {
            const res2 = await fetch("/api/runs/list", { method: "GET", cache: "no-store" });
            const j2 = (await res2.json()) as { data?: unknown[] };
            if (res2.ok && Array.isArray(j2.data)) {
              setSavedRuns(j2.data as typeof runs);
            }
          } catch {
            /* ignore */
          }
        })();
      }
    } catch (err) {
      // keep UI usable even if Supabase tables aren't created yet
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.message("Runs unavailable", { description: message });
    } finally {
      setIsLoadingRuns(false);
    }
  }

  async function startNewLinkToAdFromProject(
    proj: (typeof projects)[number],
  ) {
    const sourceRun =
      proj.runs.find((r) => runHasLinkToAdUniverse(r.extracted)) ?? proj.runs[0];
    if (!sourceRun || !runHasLinkToAdUniverse(sourceRun.extracted)) {
      toast.error("No Link to Ad data for this project.");
      return;
    }
    const snap = readUniverseFromExtracted(sourceRun.extracted);
    if (!snap) {
      toast.error("Could not read Link to Ad state.");
      return;
    }
    if (!snap.scriptsText.trim()) {
      toast.error("Generate scripts on an existing run first.");
      return;
    }
    setBranchingNormalizedUrl(proj.normalizedUrl);
    try {
      const branched = branchUniverseForNewAd(snap);
      const base = cloneExtractedBase(sourceRun.extracted);
      const extracted = { ...base, __universe: branched };
      const packUrls = productUrlsForGpt({
        pageUrl: proj.storeUrl.trim(),
        neutralUploadUrl: branched.neutralUploadUrl,
        candidateUrls:
          branched.productOnlyImageUrls && branched.productOnlyImageUrls.length > 0
            ? branched.productOnlyImageUrls
            : branched.cleanCandidate?.url
              ? [branched.cleanCandidate.url]
              : [],
        fallbackUrl: branched.fallbackImageUrl,
      });
      const res = await fetch("/api/runs/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeUrl: proj.storeUrl,
          title: proj.title ?? sourceRun.title ?? null,
          extracted,
          packshotUrls: packUrls.length ? packUrls.slice(0, 12) : undefined,
          imagePrompt: "",
          selectedImageUrl: null,
          generatedImageUrls: [],
          videoPrompt: "",
          videoUrl: null,
        }),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error || "Failed to create run.");
      await refreshMeAndRuns();
      setRunId(json.runId);
      if (typeof localStorage !== "undefined") localStorage.setItem(UGC_CURRENT_RUN_KEY, json.runId);
      setStoreUrl(proj.storeUrl);
      setLinkToAdResumeRunId(json.runId);
      setAppSectionNav("link_to_ad");
      toast.success("New ad: pick a marketing angle.");
    } catch (err) {
      toast.error("Error", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setBranchingNormalizedUrl(null);
    }
  }

  async function executeDeleteProject(storeUrl: string, runIdsInProject: string[]) {
    setDeleteProjectLoading(true);
    try {
      const res = await fetch("/api/runs/delete-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl }),
      });
      const json = (await res.json()) as { deleted?: number; error?: string };
      if (!res.ok) throw new Error(json.error || "Delete failed");
      toast.success(`Project deleted (${json.deleted ?? 0} run(s))`);
      if (runId && runIdsInProject.includes(runId)) {
        setRunId(null);
        if (typeof localStorage !== "undefined") localStorage.removeItem(UGC_CURRENT_RUN_KEY);
      }
      if (linkToAdResumeRunId && runIdsInProject.includes(linkToAdResumeRunId)) {
        setLinkToAdResumeRunId(null);
      }
      setDeleteProjectDialog(null);
      void refreshMeAndRuns();
    } catch (err) {
      toast.error("Deletion failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setDeleteProjectLoading(false);
    }
  }

  async function saveRun(partial: {
    storeUrl?: string;
    title?: string | null;
    extracted?: unknown;
    analysis?: unknown;
    quiz?: unknown;
    packshotUrls?: string[];
    imagePrompt?: string;
    negativePrompt?: string;
    generatedImageUrls?: string[];
    selectedImageUrl?: string | null;
    videoTemplateId?: string | null;
    videoPrompt?: string;
    videoUrl?: string | null;
  }) {
    try {
      const res = await fetch("/api/runs/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: runId ?? undefined,
          ...partial,
        }),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error || "Save failed");
      if (!runId) setRunId(json.runId);
      if (json.runId) localStorage.setItem(UGC_CURRENT_RUN_KEY, json.runId);
    } catch (err) {
      // don't block the flow if saving fails
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.message("Save failed", { description: message });
    }
  }

  async function loadRun(id: string) {
    try {
      const res = await fetch(`/api/runs/get?runId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = (await res.json()) as { data?: any; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Load run failed");
      const r = json.data;
      setRunId(r.id);
      localStorage.setItem(UGC_CURRENT_RUN_KEY, r.id);
      setStoreUrl(r.store_url ?? "");
      setExtracted(r.extracted ?? null);
      setAnalysis(r.analysis ?? null);
      setQuiz((q) => ({
        ...q,
        ...(r.quiz ?? {}),
      }));
      setSelectedProductImageUrls(Array.isArray(r.packshot_urls) ? r.packshot_urls : []);
      setImagePrompt(r.image_prompt ?? "");
      setNegativePrompt(r.negative_prompt ?? "");
      if (Array.isArray(r.generated_image_urls) && r.generated_image_urls.length > 0) {
        setImageGen({ kind: "success", urls: r.generated_image_urls });
      } else {
        setImageGen({ kind: "idle" });
      }
      setSelectedImageUrl(r.selected_image_url ?? null);
      setSelectedTemplate((r.video_template_id as any) ?? "template1");
      setVideoPrompt(r.video_prompt ?? "");
      if (typeof r.video_url === "string" && r.video_url.length > 0) {
        setVideoGen({ kind: "success", url: r.video_url });
      } else {
        setVideoGen({ kind: "idle" });
      }

      setStep(r.video_url ? "video" : r.selected_image_url ? "image" : r.analysis ? "quiz" : "url");

      // If this run contains a Link to Ad Universe snapshot, auto-hydrate the component.
      if (runHasLinkToAdUniverse(r.extracted)) {
        setLinkToAdResumeRunId(r.id);
      }

      toast.success("Run loaded");
    } catch (err) {
      localStorage.removeItem(UGC_CURRENT_RUN_KEY);
      toast.error("Load error", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  useEffect(() => {
    const runIdFromUrl = searchParams.get("project");
    const savedRunId = typeof localStorage !== "undefined" ? localStorage.getItem(UGC_CURRENT_RUN_KEY) : null;
    const initialRunId = (runIdFromUrl && runIdFromUrl.trim()) || (savedRunId && savedRunId.trim()) || null;
    if (initialRunId) {
      void loadRun(initialRunId);
    }
    void refreshMeAndRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (runId) localStorage.setItem(UGC_CURRENT_RUN_KEY, runId);
    else if (typeof localStorage !== "undefined") localStorage.removeItem(UGC_CURRENT_RUN_KEY);
  }, [runId]);

  const setAppSectionNav = useCallback(
    (s: AppSection, extra?: string) => {
      pendingSectionNavRef.current = s;
      setAppSection(s);
      const projectId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("project") : null;
      const newPath = sectionToPath(s, projectId, extra);
      if (typeof window !== "undefined" && window.location.pathname + window.location.search !== newPath) {
        window.history.pushState(null, "", newPath);
      }
    },
    [],
  );

  /**
   * Called when the user clicks "Change Voice" on a video in ANY history panel.
   * Navigates to the voice changer and pre-loads the video.
   */
  const handleChangeVoiceFromHistory = useCallback(
    (item: StudioHistoryItem) => {
      if (!item.mediaUrl) return;
      setVoiceHistoryItems((prev) => {
        if (prev.some((i) => i.mediaUrl === item.mediaUrl)) return prev;
        return [{ ...item, kind: "video" as const }, ...prev];
      });
      setAppSectionNav("voice");
      setVoiceToolMode("voice_change");
      setVoiceChangeUploadFile(null);
      setVoiceChangeHistoryUrl(item.mediaUrl);
      setVoiceChangeUploadKind("video");
      setVoiceChangeUploadPreviewUrl(proxiedMediaSrc(item.mediaUrl));
      toast.message("Video loaded", { description: "Select a voice and generate." });
    },
    [setAppSectionNav],
  );

  /** Sync section state from pathname (handles browser back/forward & direct URL access). */
  useLayoutEffect(() => {
    const sec = sectionFromPathname(pathname);
    const pending = pendingSectionNavRef.current;
    if (pending !== null) {
      if (sec === pending) pendingSectionNavRef.current = null;
      return;
    }
    setAppSection((prev) => (prev === sec ? prev : sec));

    const tm = translateModeFromPathname(pathname);
    if (tm) setTranslateToolMode(tm);
    const vm = voiceModeFromPathname(pathname);
    if (vm) setVoiceToolMode(vm);
  }, [pathname]);

  /** Browser back/forward: re-derive section from the new URL. */
  useEffect(() => {
    const onPop = () => {
      const sec = sectionFromPathname(window.location.pathname);
      setAppSection((prev) => (prev === sec ? prev : sec));
      const tm = translateModeFromPathname(window.location.pathname);
      if (tm) setTranslateToolMode(tm);
      const vm = voiceModeFromPathname(window.location.pathname);
      if (vm) setVoiceToolMode(vm);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!deleteProjectDialog || deleteProjectLoading) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeleteProjectDialog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteProjectDialog, deleteProjectLoading]);

  /** Finalize KIE/Kling videos that finished while the user was on another tab (client polling had stopped). */
  useEffect(() => {
    if (appSection !== "projects") return;
    void refreshMeAndRuns();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSection]);

  useEffect(() => {
    if (appSection !== "projects") return;
    let cancelled = false;
    void (async () => {
      try {
        const listRes = await fetch("/api/runs/list", { method: "GET", cache: "no-store" });
        const json = (await listRes.json()) as {
          data?: Array<{ id: string; extracted?: unknown }>;
          error?: string;
        };
        if (!listRes.ok || !Array.isArray(json.data)) return;
        const runs = json.data;
        const pending = runs.filter((r) => {
          if (!runHasLinkToAdUniverse(r.extracted)) return false;
          const s = readUniverseFromExtracted(r.extracted);
          return universeHasPendingKlingTask(s);
        });
        for (const r of pending) {
          if (cancelled) return;
          try {
            await fetch("/api/runs/finalize-kling", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ runId: r.id }),
            });
          } catch {
            /* ignore */
          }
        }
        if (!cancelled) {
          await refreshMeAndRuns();
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when opening Projects
  }, [appSection]);

  /** Keep the browser URL in sync with appSection + runId (path-based). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname.startsWith("/app")) return;

    const voiceExtra =
      appSection === "voice" && voiceToolMode === "create_voice" ? "create" : undefined;
    const projectId = runId || searchParams.get("project") || null;
    const wantPath = sectionToPath(appSection, projectId, voiceExtra);
    const cur = window.location.pathname + window.location.search;
    if (cur !== wantPath) {
      window.history.replaceState(null, "", wantPath);
    }
  }, [runId, appSection, pathname, voiceToolMode, searchParams]);

  async function onExtract() {
    const url = storeUrl.trim();
    if (!url) {
      toast.error("Paste a store URL / product page URL.");
      return;
    }

    // Fast path: if we already have a saved run for this product URL, reuse it
    // to avoid re-scraping / re-analyzing and speed up UGC creation.
    if (savedRuns.length > 0) {
      const target = normalizeUrl(url);
      const existing = savedRuns
        .filter((r) => typeof r.store_url === "string" && normalizeUrl(r.store_url) === target)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        )[0];
      if (existing) {
        await loadRun(existing.id);
        toast.success("Product already analyzed loaded from history");
        return;
      }
    }

    setIsExtracting(true);
    setExtracted(null);
    setAnalysis(null);
    setResearchNotes([]);

    try {
      const res = await fetch("/api/store/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json()) as { error?: string } & Partial<Extracted>;
      if (!res.ok) throw new Error(json.error || "Extract failed");
      setExtracted(json as Extracted);
      setStep("analysis");
      toast.success("Extraction OK");
      setRunId(null);
      if (typeof localStorage !== "undefined") localStorage.removeItem(UGC_CURRENT_RUN_KEY);
      await saveRun({
        storeUrl: url,
        title: (json as any)?.title ?? null,
        extracted: json,
      });
      void refreshMeAndRuns();
    } catch (err) {
      toast.error("Extraction error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsExtracting(false);
    }
  }

  async function onAnalyze() {
    if (!extracted) return;
    setIsAnalyzing(true);
    setAnalysis(null);
    setResearchNotes([]);

    try {
      const res = await fetch("/api/gpt/brand-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extracted),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Analyze failed");
      setAnalysis(json.data);

      const rn = json.data?.researchNotes;
      if (Array.isArray(rn)) setResearchNotes(rn.map((x: any) => String(x)));

      const pre = json.data?.quizPrefill ?? {};
      setQuiz((q) => ({
        ...q,
        aboutProduct: safeString(pre.aboutProduct, q.aboutProduct),
        problems: safeString(pre.problems, q.problems),
        promises: safeString(pre.promises, q.promises),
        persona: safeString(pre.persona, q.persona),
        angles: safeString(pre.angles, q.angles),
        offers: safeString(pre.offers, q.offers),
        videoDurationPreference:
          pre.videoDurationPreference === "20s" || pre.videoDurationPreference === "30s"
            ? pre.videoDurationPreference
            : "15s",
      }));

      setStep("quiz");
      toast.success("Analyse OK");
      await saveRun({
        storeUrl: extracted.url,
        title: extracted.title,
        extracted,
        analysis: json.data,
        quiz: {
          aboutProduct: safeString(pre.aboutProduct, quiz.aboutProduct),
          problems: safeString(pre.problems, quiz.problems),
          promises: safeString(pre.promises, quiz.promises),
          persona: safeString(pre.persona, quiz.persona),
          angles: safeString(pre.angles, quiz.angles),
          offers: safeString(pre.offers, quiz.offers),
          videoDurationPreference:
            pre.videoDurationPreference === "20s" || pre.videoDurationPreference === "30s"
              ? pre.videoDurationPreference
              : "15s",
        },
      });
      void refreshMeAndRuns();
    } catch (err) {
      toast.error("Analyse error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function onAutoFillQuiz() {
    if (!extracted) return;
    setIsQuizAutofilling(true);
    setQuizPrecisionNote("");
    try {
      const res = await fetch("/api/gpt/quiz-autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: extracted.url,
          title: extracted.title,
          description: extracted.description,
          snippets: extracted.snippets,
          signals: extracted.signals,
          excerpt: extracted.excerpt,
        }),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Autofill failed");
      setQuiz((q) => ({
        ...q,
        aboutProduct: String(json.data.aboutProduct ?? q.aboutProduct),
        problems: String(json.data.problems ?? q.problems),
        promises: String(json.data.promises ?? q.promises),
        persona: String(json.data.persona ?? q.persona),
        angles: String(json.data.angles ?? q.angles),
        offers: String(json.data.offers ?? q.offers),
        videoDurationPreference:
          json.data.videoDurationPreference === "20s" || json.data.videoDurationPreference === "30s"
            ? json.data.videoDurationPreference
            : "15s",
      }));
      setQuizPrecisionNote(
        String(
          json.data.precisionNote ??
            "Auto-fill from URL is helpful, but it will be more precise if you write it yourself.",
        ),
      );
      toast.success("Quiz auto-rempli");
      await saveRun({ quiz: { ...quiz, ...(json.data ?? {}) } });
      void refreshMeAndRuns();
    } catch (err) {
      toast.error("Quiz autofill error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsQuizAutofilling(false);
    }
  }

  async function onFindProductOnlyImages() {
    if (!extracted?.images?.length) return;
    setIsClassifyingImages(true);
    setHasClassifiedImages(true);
    setProductOnlyCandidates([]);
    setSelectedProductImageUrls([]);
    try {
      const res = await fetch("/api/gpt/images-classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl: extracted.url,
          imageUrls: extracted.images,
        }),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Image classify failed");
      const candidates = Array.isArray(json.data.productOnlyUrls) ? json.data.productOnlyUrls : [];
      const normalizedCandidates = candidates
        .filter((x: any) => typeof x?.url === "string")
        .map((x: any) => ({
          url: String(x.url),
          reason: x.reason ? String(x.reason) : undefined,
        }));
      setProductOnlyCandidates(normalizedCandidates);
      const defaults = candidates
        .filter((x: any) => typeof x?.url === "string")
        .slice(0, 2)
        .map((x: any) => String(x.url));
      setSelectedProductImageUrls(defaults);
      await saveRun({ packshotUrls: defaults });
      void refreshMeAndRuns();
      if (normalizedCandidates.length === 0) {
        toast.message("No product-only images detected", {
          description:
            "The site may not have clean packshots. You can continue with the extracted images.",
        });
      } else {
        toast.success("Product-only images detected", {
          description: `${normalizedCandidates.length} candidate(s)`,
        });
      }
    } catch (err) {
      toast.error("Image classify error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsClassifyingImages(false);
    }
  }

  async function onUploadPackshots(files: FileList | null) {
    if (!files || files.length === 0) return;
    const slice = Array.from(files).slice(0, 8);
    const pendingRows = slice.map((file) => ({
      id: crypto.randomUUID(),
      blob: URL.createObjectURL(file),
      file,
    }));
    setPackshotUploadPreviews((p) => [...p, ...pendingRows.map(({ id, blob }) => ({ id, blob }))]);
    setIsUploadingPackshots(true);
    try {
      const urls: string[] = [];
      for (const row of pendingRows) {
        try {
          assertStudioImageUpload(row.file);
          const fd = new FormData();
          fd.set("file", row.file);
          const res = await fetch("/api/uploads", { method: "POST", body: fd });
          const raw = await res.text();
          let json: { error?: string; url?: string } = {};
          try {
            if (raw.length > 0) json = JSON.parse(raw) as { error?: string; url?: string };
          } catch {
            throw new Error(
              res.ok ? "Invalid server response" : `Upload failed (${res.status}): ${raw.slice(0, 200)}`,
            );
          }
          if (!res.ok || !json.url) {
            throw new Error(json.error || `Upload failed for ${row.file.name}`);
          }
          urls.push(json.url);
        } catch (err) {
          toast.error("Upload error", {
            description: userMessageFromCaughtError(err, "Try again with JPEG, PNG, or WebP."),
          });
        } finally {
          URL.revokeObjectURL(row.blob);
          setPackshotUploadPreviews((p) => p.filter((x) => x.id !== row.id));
        }
      }
      if (urls.length) {
        setSelectedProductImageUrls((prev) => {
          const merged = [...prev];
          for (const u of urls) {
            if (!merged.includes(u)) merged.push(u);
          }
          return merged.slice(0, 8);
        });
        toast.success("Packshots uploaded", { description: `${urls.length} image(s)` });
        await saveRun({ packshotUrls: [...packshotUrls, ...urls].slice(0, 8) });
        void refreshMeAndRuns();
      }
    } finally {
      setIsUploadingPackshots(false);
    }
  }

  async function copyToClipboard(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch (err) {
      toast.error("Copy failed", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  async function onGenerateImagePrompt() {
    if (!extracted || !analysis) return;
    if (packshotUrls.length === 0) {
      toast.error("Add at least 1 product-only image (packshot).", {
        description:
          "If the AI finds nothing, upload 2–4 product angles (front, side, back) for better results.",
      });
      return;
    }
    setIsCreatingPerfectImagePrompt(true);
    try {
      const productImagesForGpt = packshotUrlsForGpt(
        extracted.url,
        packshotUrls,
        Array.isArray(extracted.images) && typeof extracted.images[0] === "string" ? extracted.images[0] : null,
      );
      const res = await fetch("/api/gpt/image-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: extracted.url,
          analysis,
          productName: extracted.title,
          productImages:
            productImagesForGpt.length > 0
              ? productImagesForGpt
              : packshotUrls.length > 0
                ? packshotUrls
                : extracted.images,
          quiz: { persona: quiz.persona, videoDurationPreference: quiz.videoDurationPreference },
        }),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Image prompt failed");
      setImagePrompt(String(json.data.imagePrompt ?? ""));
      setNegativePrompt(String(json.data.negativePrompt ?? ""));
      toast.success("Image prompt ready");
      await saveRun({
        packshotUrls,
        imagePrompt: String(json.data.imagePrompt ?? ""),
        negativePrompt: String(json.data.negativePrompt ?? ""),
      });
      void refreshMeAndRuns();
    } catch (err) {
      toast.error("Image prompt error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
    finally {
      setIsCreatingPerfectImagePrompt(false);
    }
  }

  async function onGenerateImage() {
    if (!extracted) return;
    if (!imagePrompt.trim()) {
      toast.error("Generate the image prompt first.");
      return;
    }
    if (packshotUrls.length === 0) {
      toast.error("Missing product-only images (packshots).", {
        description:
          "Upload 2–4 product-only angles (front, side, back) and retry generation.",
      });
      return;
    }

    await saveRun({
      storeUrl: extracted.url,
      title: extracted.title ?? null,
      extracted,
      analysis,
      quiz,
      packshotUrls,
      imagePrompt,
      negativePrompt,
    });

    setImageGen({ kind: "submitting" });
    setSelectedImageUrl(null);

    try {
      const nanoRefUrl = pickPackshotForNanoBanana(
        extracted.url,
        packshotUrls,
        Array.isArray(extracted.images) && typeof extracted.images[0] === "string" ? extracted.images[0] : null,
      );
      if (!nanoRefUrl) {
        toast.error("No valid HTTPS product image for NanoBanana (packshot required).");
        setImageGen({ kind: "idle" });
        return;
      }
      const res = await fetch("/api/nanobanana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountPlan: planId,
          model: nanoModel,
          prompt: imagePrompt,
          imageUrls: [nanoRefUrl],
          numImages: 1,
          imageSize: "9:16",
          aspectRatio: "9:16",
          resolution: "2K",
          personalApiKey: getPersonalApiKey(),
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "NanoBanana generate failed");
      setImageGen({ kind: "polling", taskId: json.taskId });
      toast.success("Image task created", { description: json.taskId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setImageGen({ kind: "error", message });
      toast.error("Image error", { description: message });
    }
  }

  useEffect(() => {
    if (imageGen.kind !== "polling") return;
    const taskId = imageGen.taskId;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const pk = getPersonalApiKey();
        const qs = pk ? `&personalApiKey=${encodeURIComponent(pk)}` : "";
        const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${qs}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json()) as any;
        if (!res.ok || !json.data) throw new Error(json.error || "Polling failed");
        if (cancelled) return;

        const s = json.data.successFlag ?? 0;
        if (s === 0) return;
        if (s === 1) {
          const resp = json.data.response ?? {};
          const candidates: unknown[] = [
            (resp as any).resultImageUrl,
            (resp as any).resultUrls,
            (resp as any).resultUrl,
            (resp as any).result_url,
            (resp as any).resultImageUrls,
          ];
          const urls = candidates.flatMap((v) => {
            if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
            if (typeof v === "string") return [v];
            return [];
          });
          if (!urls?.length) throw new Error("Image succeeded but result image URL is missing.");
          setImageGen({ kind: "success", urls });
          setSelectedImageUrl(urls[0]);
          void saveRun({ generatedImageUrls: urls, selectedImageUrl: urls[0] });
          void refreshMeAndRuns();
          if (interval) clearInterval(interval);
          interval = null;
          return;
        }
        throw new Error(json.data.errorMessage || `Image failed: ${String(s)}`);
      } catch (err) {
        if (cancelled) return;
        setImageGen({ kind: "error", message: err instanceof Error ? err.message : "Unknown error." });
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
  }, [imageGen]);

  async function onBuildVideoPrompt() {
    if (!extracted || !analysis) return;
    if (!selectedImageUrl) {
      toast.error("Select the generated image first.");
      return;
    }

    setIsBuildingVideoPrompt(true);
    try {
      const res = await fetch("/api/gpt/video-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: extracted.url,
          analysis,
          quiz,
          templateId: selectedTemplate,
          productName: extracted.title,
        }),
      });
      const json = (await res.json()) as { error?: string; data?: any };
      if (!res.ok || !json.data) throw new Error(json.error || "Template fill failed");
      setVideoPrompt(String(json.data.filledPrompt ?? ""));
      toast.success("Template filled");
      await saveRun({
        videoTemplateId: selectedTemplate,
        videoPrompt: String(json.data.filledPrompt ?? ""),
      });
      void refreshMeAndRuns();
    } catch (err) {
      toast.error("Template error", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
    finally {
      setIsBuildingVideoPrompt(false);
    }
  }

  async function onGenerateVideo() {
    if (!selectedImageUrl) return;
    if (!videoPrompt.trim()) {
      toast.error("Generate the video prompt (template) first.");
      return;
    }

    await saveRun({
      storeUrl: extracted?.url,
      title: extracted?.title ?? null,
      extracted,
      analysis,
      quiz,
      packshotUrls,
      imagePrompt,
      negativePrompt,
      generatedImageUrls: imageGen.kind === "success" ? imageGen.urls : undefined,
      selectedImageUrl,
      videoTemplateId: selectedTemplate,
      videoPrompt,
    });

    setVideoGen({ kind: "submitting" });
    try {
      // Kling 3.0 Standard, 15s, always with native audio ON.
      const duration =
        quiz.videoDurationPreference === "15s"
          ? 15
          : quiz.videoDurationPreference === "20s"
            ? 15
            : 15;
      const promptWithAudio = withAudioHint(videoPrompt);
      const res = await fetch("/api/kling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountPlan: planId,
          marketModel: "kling-3.0/video",
          prompt: promptWithAudio,
          imageUrl: selectedImageUrl,
          duration,
          mode: "std", // 720p Standard
          sound: true,
          personalApiKey: getPersonalApiKey(),
        }),
      });
      const json = (await res.json()) as { taskId?: string; error?: string };
      if (!res.ok || !json.taskId) throw new Error(json.error || "Video generate failed");
      setVideoGen({ kind: "polling", taskId: json.taskId });
      toast.success("Video task created", { description: json.taskId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setVideoGen({ kind: "error", message });
      toast.error("Video error", { description: message });
    }
  }

  useEffect(() => {
    if (videoGen.kind !== "polling") return;
    const taskId = videoGen.taskId;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const vk = getPersonalApiKey();
        const vq = vk ? `&personalApiKey=${encodeURIComponent(vk)}` : "";
        const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}${vq}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await res.json()) as any;
        if (!res.ok || !json.data) throw new Error(json.error || "Polling failed");
        if (cancelled) return;

        const s = json.data.status ?? "IN_PROGRESS";
        if (s === "IN_PROGRESS") return;
        if (s === "SUCCESS") {
          const url = json.data.response?.[0];
          if (!url) throw new Error("Video succeeded but response[0] missing.");
          setVideoGen({ kind: "success", url });
          void saveRun({ videoUrl: url });
          void refreshMeAndRuns();
          if (interval) clearInterval(interval);
          interval = null;
          return;
        }
        throw new Error(json.data.error_message || `Video failed: ${String(s)}`);
      } catch (err) {
        if (cancelled) return;
        setVideoGen({ kind: "error", message: err instanceof Error ? err.message : "Unknown error." });
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
  }, [videoGen]);

  const videoDownloadHref = useMemo(() => {
    if (videoGen.kind !== "success") return null;
    return `/api/download?url=${encodeURIComponent(videoGen.url)}`;
  }, [videoGen]);

  return (
    <>
      <StudioShell
        studioSection={appSection}
        onStudioSectionChange={setAppSectionNav}
        studioProjectId={runId}
      >
        <section className="space-y-6 px-6 py-6 md:px-8">
          <div className="space-y-6">
            {appSection === "projects" ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">My Projects</h2>
                    <p className="mt-0.5 text-[13px] text-white/45">
                      {projects.length} brand{projects.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAppSectionNav("link_to_ad"); }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/40 bg-violet-500/15 text-violet-200 transition-all duration-200 hover:border-violet-400/60 hover:bg-violet-500/25 hover:shadow-[0_0_20px_rgba(139,92,246,0.2)]"
                    title="New Link to Ad"
                  >
                    <Plus className="h-5 w-5" strokeWidth={2.25} />
                  </button>
                </div>

                {projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                      <Sparkles className="h-6 w-6 text-violet-300/70" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/70">No projects yet</p>
                      <p className="mt-1 max-w-xs text-[13px] text-white/40">
                        Use Link to Ad with a store URL to create your first brand project.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setAppSectionNav("link_to_ad"); }}
                      className="mt-1 inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/15 px-5 py-2.5 text-[13px] font-semibold text-violet-100 transition-all duration-200 hover:border-violet-400/50 hover:bg-violet-500/25"
                    >
                      <Plus className="h-4 w-4" />
                      Create your first ad
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">
                    {!selectedProject ? (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {projects.map((proj) => {
                          const latestRun = proj.runs[0];
                          const isUniverse = runHasLinkToAdUniverse(latestRun.extracted);
                          const isActive =
                            proj.runs.some(
                              (r) => runId === r.id || linkToAdResumeRunId === r.id,
                            ) ||
                            (storeUrl.trim() && normalizeUrl(storeUrl) === proj.normalizedUrl);

                          const allImages = proj.runs.flatMap((r) => collectProjectRunImageUrls(r));
                          const heroImg = universeThumbFromExtracted(latestRun.extracted) || latestRun.selected_image_url || allImages[0] || null;
                          const secondaryImgs = allImages.filter((u) => u !== heroImg).slice(0, 2);

                          let faviconUrl: string | null = null;
                          try {
                            const h = new URL(proj.storeUrl).hostname;
                            faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64`;
                          } catch { /* ignore */ }

                          return (
                            <button
                              key={proj.normalizedUrl}
                              type="button"
                              onClick={() => setSelectedProjectNormalizedUrl(proj.normalizedUrl)}
                              className={cn(
                                "group relative flex flex-col overflow-hidden rounded-2xl border text-left transition-all duration-200",
                                isActive
                                  ? "border-violet-400/60 bg-gradient-to-b from-violet-500/[0.08] to-[#0b0912]/90 shadow-[0_0_24px_rgba(139,92,246,0.12)]"
                                  : "border-white/[0.08] bg-[#0c0a14]/90 hover:border-white/15 hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
                              )}
                            >
                              {heroImg ? (
                                <div className="relative h-36 w-full overflow-hidden bg-[#100d17]">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={heroImg}
                                    alt=""
                                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-[#0c0a14] via-transparent to-transparent" />
                                  {secondaryImgs.length > 0 ? (
                                    <div className="absolute bottom-2 right-2 flex gap-1">
                                      {secondaryImgs.map((src) => (
                                        <div key={src} className="h-8 w-8 overflow-hidden rounded-md border border-white/15 shadow-sm">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="flex h-28 w-full items-center justify-center bg-gradient-to-b from-[#16141f] to-[#0c0a14]">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                                    <Sparkles className="h-5 w-5 text-violet-300/50" />
                                  </div>
                                </div>
                              )}

                              <div className="flex flex-1 flex-col gap-3 p-4">
                                <div className="flex items-start gap-3">
                                  {faviconUrl ? (
                                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.06]">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={faviconUrl}
                                        alt=""
                                        className="h-5 w-5 object-contain"
                                        referrerPolicy="no-referrer"
                                        onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
                                      />
                                    </div>
                                  ) : null}
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] font-semibold leading-tight text-white">
                                      {proj.title ? proj.title : proj.storeUrl}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-white/35">{proj.storeUrl}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 text-[11px]">
                                  <span className={cn(
                                    "rounded-full px-2.5 py-0.5 font-medium",
                                    isUniverse
                                      ? "border border-violet-400/25 bg-violet-500/10 text-violet-200/80"
                                      : "border border-white/10 bg-white/[0.04] text-white/50",
                                  )}>
                                    {isUniverse ? "Link to Ad" : "Classic"}
                                  </span>
                                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 font-medium text-white/50">
                                    {proj.runs.length} ad{proj.runs.length > 1 ? "s" : ""}
                                  </span>
                                  <span className="ml-auto text-[10px] text-white/30">
                                    {new Date(latestRun.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      ) : (
                        (() => {
                          const proj = selectedProject;
                          const latestRun = proj.runs[0];
                          const isUniverse = runHasLinkToAdUniverse(latestRun.extracted);
                          const isActive =
                            proj.runs.some(
                              (r) => runId === r.id || linkToAdResumeRunId === r.id,
                            ) ||
                            (storeUrl.trim() && normalizeUrl(storeUrl) === proj.normalizedUrl);
                          const runIdsInProject = proj.runs.map((r) => r.id);
                          const projectRunMedia = proj.runs.map((run) => ({
                            run,
                            images: collectProjectRunImageUrls(run),
                            videos: collectProjectRunVideoUrls(run),
                          }));
                          return (
                            <div
                              key={proj.normalizedUrl}
                              className={`group relative overflow-hidden rounded-2xl border text-left transition ${
                                isActive
                                  ? "border-violet-400/70 bg-gradient-to-b from-violet-500/[0.12] to-[#0b0912]/90"
                                  : "border-white/10 bg-[#0b0912]/80 hover:border-white/15"
                              }`}
                            >
                              <div className="flex items-center justify-between border-b border-white/10 bg-black/30 px-4 py-3">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="border border-white/20 bg-black/50 text-white/85 hover:bg-black/70"
                                  onClick={() => setSelectedProjectNormalizedUrl(null)}
                                >
                                  Back to brands
                                </Button>
                              </div>
                              <div className="flex flex-col gap-1 border-b border-white/10 bg-black/20 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/80">
                                    Brand dashboard
                                  </p>
                                  <div className="mt-1 truncate text-base font-semibold text-white">
                                    {proj.title ? proj.title : proj.storeUrl}
                                  </div>
                                  <a
                                    href={proj.storeUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 block truncate text-xs text-cyan-300/90 underline-offset-2 hover:underline"
                                  >
                                    {proj.storeUrl}
                                  </a>
                                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/50">
                                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5">
                                      {isUniverse ? "Link to Ad" : "Classic"}
                                    </span>
                                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5">
                                      {proj.runs.length} ad{proj.runs.length > 1 ? "s" : ""} / generations
                                    </span>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  {isUniverse ? (
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="secondary"
                                      className="h-9 w-9 border border-violet-400/45 bg-violet-500/20 text-white hover:bg-violet-500/35"
                                      title="New ad: marketing angles"
                                      disabled={branchingNormalizedUrl === proj.normalizedUrl}
                                      onClick={() => void startNewLinkToAdFromProject(proj)}
                                    >
                                      {branchingNormalizedUrl === proj.normalizedUrl ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Plus className="h-5 w-5" strokeWidth={2.25} />
                                      )}
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="secondary"
                                    className="h-9 w-9 border border-white/15 bg-black/60 text-white/80 hover:bg-destructive/90 hover:text-white"
                                    title="Delete project"
                                    onClick={() =>
                                      setDeleteProjectDialog({
                                        storeUrl: proj.storeUrl,
                                        runIds: runIdsInProject,
                                        label: proj.title ? proj.title : proj.storeUrl,
                                      })
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="px-4 pt-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Your ads</p>
                                <p className="mt-0.5 text-[11px] text-white/35">
                                  Thumbnails below — click one to continue in Link to Ad with that generation.
                                </p>
                              </div>
                              <div className="flex gap-2 overflow-x-auto px-4 pb-4 pt-2 [-webkit-overflow-scrolling:touch]">
                                {proj.runs.map((run) => {
                                  const runIsUniverse = runHasLinkToAdUniverse(run.extracted);
                                  const prev = runGenerationPreview(run);
                                  const runActive = runId === run.id || linkToAdResumeRunId === run.id;
                                  return (
                                    <button
                                      key={run.id}
                                      type="button"
                                      onClick={() => {
                                        if (runIsUniverse) {
                                          setRunId(run.id);
                                          if (typeof localStorage !== "undefined") {
                                            localStorage.setItem(UGC_CURRENT_RUN_KEY, run.id);
                                          }
                                          setAppSectionNav("link_to_ad");
                                          setLinkToAdResumeRunId(run.id);
                                          return;
                                        }
                                        void loadRun(run.id);
                                      }}
                                      className={`flex w-[5.75rem] shrink-0 flex-col gap-1 rounded-lg border p-0.5 text-left transition ${
                                        runActive
                                          ? "border-violet-400/80 bg-violet-500/15"
                                          : "border-white/10 bg-black/25 hover:border-white/30"
                                      }`}
                                    >
                                      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-[#100d17]">
                                        {prev?.kind === "image" ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={prev.url}
                                            alt=""
                                            className="h-full w-full object-cover"
                                          />
                                        ) : prev?.kind === "video" ? (
                                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-violet-950/90 to-black">
                                            <Play className="h-7 w-7 text-white/75" fill="currentColor" />
                                          </div>
                                        ) : (
                                          <div className="flex h-full items-center justify-center text-[10px] text-white/35">
                                            Draft
                                          </div>
                                        )}
                                      </div>
                                      <span className="truncate px-0.5 text-center text-[10px] leading-tight text-white/50">
                                        {new Date(run.created_at).toLocaleDateString(undefined, {
                                          month: "short",
                                          day: "numeric",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="space-y-5 border-t border-white/10 px-4 pb-4 pt-4">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Images</p>
                                  <p className="mt-0.5 text-[11px] text-white/35">
                                    Grouped by ad — packshots, NanoBanana frames, and wizard renders saved on each run.
                                  </p>
                                  {projectRunMedia.every((x) => x.images.length === 0) ? (
                                    <p className="mt-2 text-xs text-white/40">No images on this brand yet.</p>
                                  ) : (
                                    <div className="mt-3 space-y-4">
                                      {projectRunMedia.map(({ run, images }) =>
                                        images.length === 0 ? null : (
                                          <div key={`proj-imgs-${run.id}`}>
                                            <p className="mb-1.5 text-[10px] text-white/40">
                                              Ad ·{" "}
                                              {new Date(run.created_at).toLocaleString(undefined, {
                                                dateStyle: "medium",
                                                timeStyle: "short",
                                              })}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                              {images.map((src) => (
                                                <div
                                                  key={src}
                                                  className="group/img relative h-24 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#100d17] transition-all duration-200 hover:border-violet-400/40 hover:shadow-[0_0_16px_rgba(139,92,246,0.15)]"
                                                >
                                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                                  <img
                                                    src={src}
                                                    alt=""
                                                    className="h-full w-full object-cover transition-transform duration-300 group-hover/img:scale-105"
                                                    referrerPolicy="no-referrer"
                                                  />
                                                  <div className="pointer-events-none absolute inset-0 bg-black/0 transition-all duration-200 group-hover/img:bg-black/30" />
                                                  <button
                                                    type="button"
                                                    onClick={() => setLightboxUrl(src)}
                                                    className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/img:opacity-100"
                                                    aria-label="View fullscreen"
                                                  >
                                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition hover:bg-black/80">
                                                      <Maximize2 className="h-3.5 w-3.5 text-white" />
                                                    </span>
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Videos</p>
                                  <p className="mt-0.5 text-[11px] text-white/35">
                                    Grouped by ad — Kling outputs and classic wizard videos stored on each run.
                                  </p>
                                  {projectRunMedia.every((x) => x.videos.length === 0) ? (
                                    <p className="mt-2 text-xs text-white/40">No generated videos on this brand yet.</p>
                                  ) : (
                                    <div className="mt-3 space-y-4">
                                      {projectRunMedia.map(({ run, videos }) =>
                                        videos.length === 0 ? null : (
                                          <div key={`proj-vids-${run.id}`}>
                                            <p className="mb-1.5 text-[10px] text-white/40">
                                              Ad ·{" "}
                                              {new Date(run.created_at).toLocaleString(undefined, {
                                                dateStyle: "medium",
                                                timeStyle: "short",
                                              })}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                              {videos.map((src) => (
                                                <ProjectVideoCard key={src} src={src} onFullscreen={() => setLightboxVideoUrl(src)} />
                                              ))}
                                            </div>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {isUniverse &&
                              proj.runs.some((r) => {
                                if (!runHasLinkToAdUniverse(r.extracted)) return false;
                                const u = readUniverseFromExtracted(r.extracted);
                                return Boolean(u?.summaryText?.trim() || u?.scriptsText?.trim());
                              }) ? (
                                <div className="space-y-4 border-t border-white/10 px-4 pb-5 pt-4">
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                      Brand content &amp; angles
                                    </p>
                                    <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-white/40">
                                      For each ad: tweak the brief (core story + optional full scan), then edit angles as
                                      factors. Add a 4th angle or clear one you dislike — changes sync with Link to Ad.
                                    </p>
                                  </div>
                                  {proj.runs.map((run) => {
                                    if (!runHasLinkToAdUniverse(run.extracted)) return null;
                                    const snap = readUniverseFromExtracted(run.extracted);
                                    if (!snap) return null;
                                    if (!snap.summaryText?.trim() && !snap.scriptsText?.trim()) return null;
                                    return (
                                      <div
                                        key={`universe-edit-${run.id}`}
                                        className="rounded-xl border border-white/10 bg-black/35 p-4 shadow-sm shadow-black/20"
                                      >
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                                          <div>
                                            <p className="text-xs font-semibold text-white/85">
                                              Ad ·{" "}
                                              {new Date(run.created_at).toLocaleString(undefined, {
                                                dateStyle: "medium",
                                                timeStyle: "short",
                                              })}
                                            </p>
                                            <p className="mt-0.5 text-[10px] text-white/40">
                                              Brief + three angle factor sets for this generation.
                                            </p>
                                          </div>
                                        </div>
                                        <ProjectRunBrandBriefEditor
                                          runId={run.id}
                                          storeUrl={run.store_url}
                                          title={run.title}
                                          extracted={run.extracted}
                                          summaryText={snap.summaryText}
                                          onSaved={() => void refreshMeAndRuns()}
                                        />
                                        {snap.scriptsText?.trim() ? (
                                          <ProjectRunScriptsEditor
                                            runId={run.id}
                                            storeUrl={run.store_url}
                                            title={run.title}
                                            extracted={run.extracted}
                                            scriptsText={snap.scriptsText}
                                            angleLabels={snap.angleLabels}
                                            brandBrief={snap.summaryText}
                                            productImageUrls={snap.productOnlyImageUrls ?? null}
                                            onSaved={() => void refreshMeAndRuns()}
                                          />
                                        ) : (
                                          <p className="text-[11px] text-white/40">
                                            Angles not generated yet for this ad. Open it in Link to Ad and run Generate.
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}
              </div>
            ) : null}

            {appSection === "motion_control" || appSection === "ad_clone" || appSection === "voice" ? (
              <div className="space-y-2">
                <div className="flex flex-col gap-3 overflow-x-hidden lg:flex-row lg:items-start lg:gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
                    <div className="flex min-w-0 w-full flex-col lg:basis-1/4 lg:max-w-[24rem] lg:flex-none lg:shrink-0 lg:min-h-0 lg:overflow-hidden">
                      <div className="studio-params-scroll flex min-w-0 flex-col gap-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-10">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
                        {appSection === "voice" ? "Voice" : appSection === "ad_clone" ? "Translate" : "Motion control"}
                      </p>
                      <div className="rounded-2xl border border-white/10 bg-[#101014] p-3 space-y-3">
                        {appSection === "voice" ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => { setVoiceToolMode("voice_change"); setAppSectionNav("voice"); }}
                                className={cn(
                                  "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                                  voiceToolMode === "voice_change"
                                    ? "border-violet-400/40 bg-violet-500/15 text-white"
                                    : "border-white/10 bg-black/20 text-white/60 hover:bg-white/[0.04]",
                                )}
                              >
                                Voice Change
                              </button>
                              <button
                                type="button"
                                onClick={() => { setVoiceToolMode("create_voice"); setAppSectionNav("voice", "create"); }}
                                className={cn(
                                  "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                                  voiceToolMode === "create_voice"
                                    ? "border-violet-400/40 bg-violet-500/15 text-white"
                                    : "border-white/10 bg-black/20 text-white/60 hover:bg-white/[0.04]",
                                )}
                              >
                                Create Voice
                              </button>
                            </div>
                            {voiceToolMode === "create_voice" ? (
                              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-10 text-center">
                                <Sparkles className="h-8 w-8 text-violet-400/60" />
                                <p className="text-sm font-semibold text-white/80">Create Voice</p>
                                <p className="max-w-xs text-xs leading-relaxed text-white/45">
                                  Clone your own voice or create a custom AI voice from a sample recording. Coming soon.
                                </p>
                              </div>
                            ) : null}
                            {voiceToolMode === "voice_change" ? (
                            <>
                            <input
                              ref={voiceChangeInputRef}
                              type="file"
                              accept={VOICE_CHANGE_UPLOAD_ACCEPT}
                              className="sr-only"
                              onChange={(e) => {
                                const f = e.target.files?.[0] ?? null;
                                if (!f) return;
                                applyVoiceChangeUploadFile(f);
                                e.currentTarget.value = "";
                              }}
                            />
                            <div className="space-y-2">
                              <div
                                role="button"
                                tabIndex={0}
                                onKeyDown={(ev) => {
                                  if (ev.key === "Enter" || ev.key === " ") {
                                    ev.preventDefault();
                                    voiceChangeInputRef.current?.click();
                                  }
                                }}
                                onClick={() => voiceChangeInputRef.current?.click()}
                                className="relative flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-white/20 bg-[#0c0c10] text-white/50 transition hover:border-violet-400/40 hover:bg-white/[0.03]"
                              >
                                {voiceChangeUploadPreviewUrl ? (
                                  voiceChangeUploadKind === "video" ? (
                                    // eslint-disable-next-line jsx-a11y/media-has-caption
                                    <video
                                      src={voiceChangeUploadPreviewUrl}
                                      controls
                                      playsInline
                                      className="absolute inset-0 h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex w-full max-w-md flex-col items-center gap-3 p-3">
                                      <p className="text-xs font-medium text-white">
                                        {voiceChangeUploadFile?.name || "Selected audio file"}
                                      </p>
                                      <audio controls preload="metadata" className="w-full">
                                        <source src={voiceChangeUploadPreviewUrl} />
                                      </audio>
                                    </div>
                                  )
                                ) : (
                                  <>
                                    <Play className="h-6 w-6 opacity-55" />
                                    <span className="text-[11px] font-semibold text-white/80">Add source media</span>
                                    <span className="text-[10px] text-white/40">Audio or video</span>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-[11px] text-white/45">
                                  {voiceChangeUploadFile?.name
                                    || (voiceChangeHistoryUrl
                                      ? readyTranslateVideos.find((i) => i.mediaUrl === voiceChangeHistoryUrl)?.label ?? "History video"
                                      : "No uploaded source")}
                                </p>
                                {voiceChangeUploadPreviewUrl ? (
                                  <button
                                    type="button"
                                    onClick={clearVoiceChangeUpload}
                                    className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-white/65 transition hover:bg-white/[0.04]"
                                  >
                                    Remove
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {!voiceChangeUploadPreviewUrl ? (
                              <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                                <Select
                                  value={voiceChangeHistoryUrl}
                                  onValueChange={(v) => {
                                    setVoiceChangeUploadFile(null);
                                    setVoiceChangeHistoryUrl(v);
                                    setVoiceChangeUploadKind("video");
                                    setVoiceChangeUploadPreviewUrl(proxiedMediaSrc(v));
                                  }}
                                >
                                  <SelectTrigger className="h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                                    <SelectValue
                                      placeholder="Pick from your Translate history"
                                    />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className={studioSelectContentClass}>
                                    {readyTranslateVideos.map((item) => (
                                      <SelectItem key={item.id} value={item.mediaUrl!} className={studioSelectItemClass}>
                                        {item.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                            </>
                            ) : null}
                          </div>
                        ) : (
                        <div className={cn("grid gap-2", appSection === "ad_clone" ? "grid-cols-1" : "grid-cols-2")}>
                          <input
                            ref={motionVideoInputRef}
                            type="file"
                            accept={STUDIO_VIDEO_FILE_ACCEPT}
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              if (!f) return;
                              const maxBytes =
                                appSection === "ad_clone" ? 300 * 1024 * 1024 : MOTION_VIDEO_MAX_BYTES;
                              if (f.size > maxBytes) {
                                toast.error("Video file is too large.", {
                                  description:
                                    appSection === "ad_clone"
                                      ? "Upload a lighter clip (<= 300 MB). For larger files, use a public URL workflow."
                                      : "Please upload a lighter clip (<= 100 MB) and keep motion-control videos short (3-30s).",
                                });
                                e.currentTarget.value = "";
                                return;
                              }
                              try {
                                assertStudioVideoUpload(f);
                              } catch (err) {
                                toast.error("Unsupported video", {
                                  description: userMessageFromCaughtError(err, "Unsupported file."),
                                });
                                e.currentTarget.value = "";
                                return;
                              }
                              const uploadToken = crypto.randomUUID();
                              motionVideoUploadTokenRef.current = uploadToken;
                              setMotionVideoFile(f);
                              setMotionVideoUploadedUrl(null);
                              setMotionVideoUploadPending(true);
                              setMotionVideoPreviewLoading(true);
                              setMotionVideoPlaying(false);
                              setMotionVideoDetectedDuration(null);
                              const blobUrl = URL.createObjectURL(f);
                              setMotionVideoRefBlobUrl(blobUrl);
                              void uploadFileToCdn(f, { kind: "video" })
                                .then((url) => {
                                  if (motionVideoUploadTokenRef.current !== uploadToken) return;
                                  setMotionVideoUploadedUrl(url);
                                })
                                .catch((err) => {
                                  if (motionVideoUploadTokenRef.current !== uploadToken) return;
                                  toast.error("Could not upload the video.", {
                                    description: userMessageFromCaughtError(
                                      err,
                                      "Try again or choose MP4 / MOV / WebM.",
                                    ),
                                  });
                                })
                                .finally(() => {
                                  if (motionVideoUploadTokenRef.current !== uploadToken) return;
                                  setMotionVideoUploadPending(false);
                                });
                              toast.success("Video reference selected", { description: f.name });
                              e.currentTarget.value = "";
                            }}
                          />
                          <div className="relative">
                            <div
                              role="button"
                              tabIndex={0}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  motionVideoInputRef.current?.click();
                                }
                              }}
                              onClick={() => motionVideoInputRef.current?.click()}
                              className="relative flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-white/20 bg-[#0c0c10] text-white/50 transition hover:border-violet-400/40 hover:bg-white/[0.03]"
                            >
                              {motionVideoPreviewSrc ? (
                                <>
                                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                  <video
                                    key={motionVideoPreviewSrc}
                                    ref={motionVideoPreviewRef}
                                    src={motionVideoPreviewSrc}
                                    className="absolute inset-0 z-[1] h-full w-full object-cover"
                                    muted
                                    playsInline
                                    controls
                                    autoPlay
                                    loop
                                    poster={motionVideoPosterUrl ?? undefined}
                                    preload="auto"
                                    onLoadedMetadata={(ev) => {
                                      const v = ev.currentTarget;
                                      const raw = Number(v.duration);
                                      const dur =
                                        Number.isFinite(raw) && raw > 0
                                          ? Math.min(120, Math.max(1, Math.round(raw)))
                                          : null;
                                      setMotionVideoDetectedDuration(dur);
                                      // Force decoding a real frame for reliable preview thumbnails.
                                      if (Number.isFinite(raw) && raw > 0.12) {
                                        try {
                                          v.currentTime = 0.1;
                                        } catch {
                                          /* ignore seek failure */
                                        }
                                      }
                                      // Metadata is enough to enable user playback controls.
                                      setMotionVideoPreviewLoading(false);
                                      void v.play().catch(() => {});
                                    }}
                                    onLoadedData={() => {
                                      setMotionVideoPlaying(true);
                                      setMotionVideoPreviewLoading(false);
                                      const v = motionVideoPreviewRef.current;
                                      if (v) tryCaptureMotionPosterFromEl(v);
                                    }}
                                    onCanPlay={(ev) => {
                                      setMotionVideoPreviewLoading(false);
                                      void ev.currentTarget.play().catch(() => {});
                                    }}
                                    onSeeked={(ev) => {
                                      setMotionVideoPlaying(true);
                                      setMotionVideoPreviewLoading(false);
                                      tryCaptureMotionPosterFromEl(ev.currentTarget);
                                    }}
                                    onPlaying={(ev) => {
                                      setMotionVideoPlaying(true);
                                      setMotionVideoPreviewLoading(false);
                                      tryCaptureMotionPosterFromEl(ev.currentTarget);
                                    }}
                                    onTimeUpdate={(ev) => {
                                      const v = ev.currentTarget;
                                      const url = motionVideoBlobUrlRef.current;
                                      if (!url || motionPosterCapturedForUrlRef.current === url) return;
                                      if (v.currentTime > 0.02 && v.videoWidth > 0) {
                                        tryCaptureMotionPosterFromEl(v);
                                      }
                                    }}
                                    onError={() => {
                                      setMotionVideoPreviewLoading(false);
                                    }}
                                  />
                                  <UploadBusyOverlay
                                    active={motionVideoPreviewLoading && !motionVideoPlaying}
                                    label="Loading..."
                                    className="rounded-xl"
                                  />
                                  {motionVideoUploadPending ? (
                                    <span className="absolute left-2 top-2 z-[2] rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white/85">
                                      Uploading...
                                    </span>
                                  ) : null}
                                  {motionVideoDetectedDuration && motionVideoPlaying ? (
                                    <span className="absolute bottom-2 z-[2] rounded-md bg-black/70 px-2 py-1 text-[10px] font-medium text-white">
                                      {motionVideoDetectedDuration}s
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  <Play className="h-8 w-8 opacity-50" />
                                  <span className="text-xs font-medium text-white/45">
                                    {appSection === "ad_clone" ? "Add a video to translate" : "Add motion to copy"}
                                  </span>
                                  <span className="text-[10px] text-white/30">
                                    {appSection === "ad_clone" ? "MP4, MOV, or WebM" : "Video duration: 3–30 seconds"}
                                  </span>
                                </>
                              )}
                            </div>
                            {motionVideoPreviewSrc ? (
                              <button
                                type="button"
                                aria-label="Remove motion reference video"
                                className="absolute right-1.5 top-1.5 z-[5] flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white/90 shadow-md backdrop-blur-sm transition hover:bg-red-500/90 hover:text-white"
                                onClick={(ev) => {
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                  clearMotionVideoReference();
                                }}
                              >
                                <X className="h-4 w-4" aria-hidden />
                              </button>
                            ) : null}
                          </div>

                          {appSection !== "ad_clone" ? (
                            <>
                              <input
                                ref={motionCharacterInputRef}
                                type="file"
                                accept={STUDIO_IMAGE_FILE_ACCEPT}
                                className="sr-only"
                                onChange={(e) => {
                                  const f = e.target.files?.[0] ?? null;
                                  if (!f) return;
                                  applyMotionCharacterFile(f);
                                  e.currentTarget.value = "";
                                }}
                              />
                              <div className="relative">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(ev) => {
                                    if (ev.key === "Enter" || ev.key === " ") {
                                      ev.preventDefault();
                                      motionCharacterInputRef.current?.click();
                                    }
                                  }}
                                  onClick={() => motionCharacterInputRef.current?.click()}
                                  className="relative flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-white/20 bg-[#0c0c10] text-white/50 transition hover:border-violet-400/40 hover:bg-white/[0.03]"
                                >
                                  {motionCharacterImageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={motionCharacterImageUrl}
                                      alt="Character"
                                      className="absolute inset-0 h-full w-full object-cover"
                                    />
                                  ) : (
                                    <>
                                      <Plus className="h-8 w-8 opacity-50" />
                                      <span className="text-xs font-medium text-white/45">Add your character</span>
                                      <span className="text-[10px] text-white/30">Image with visible face and body</span>
                                    </>
                                  )}
                                </div>
                                {motionCharacterImageUrl ? (
                                  <button
                                    type="button"
                                    aria-label="Remove character image"
                                    className="absolute right-1.5 top-1.5 z-[5] flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white/90 shadow-md backdrop-blur-sm transition hover:bg-red-500/90 hover:text-white"
                                    onClick={(ev) => {
                                      ev.preventDefault();
                                      ev.stopPropagation();
                                      clearMotionCharacterImage();
                                    }}
                                  >
                                    <X className="h-4 w-4" aria-hidden />
                                  </button>
                                ) : null}
                              </div>
                            </>
                          ) : null}
                        </div>
                        )}

                        {appSection === "ad_clone" || appSection === "voice" ? (
                          appSection === "voice" ? (
                            <div className="space-y-3">
                              <div className="rounded-xl border border-white/10 bg-black/20 p-2.5 space-y-2">
                                <Label className="text-xs text-white/45">Voice</Label>
                                <p className="text-[10px] leading-snug text-white/35">
                                  ElevenLabs voice library — filter by language and listen to the sample.
                                </p>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setVoiceChangeVoiceTab("all")}
                                    className={cn(
                                      "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                                      voiceChangeVoiceTab === "all"
                                        ? "border-violet-400/40 bg-violet-500/15 text-white"
                                        : "border-white/10 bg-black/20 text-white/60 hover:bg-white/[0.04]",
                                    )}
                                  >
                                    All
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setVoiceChangeVoiceTab("favorites")}
                                    className={cn(
                                      "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                                      voiceChangeVoiceTab === "favorites"
                                        ? "border-violet-400/40 bg-violet-500/15 text-white"
                                        : "border-white/10 bg-black/20 text-white/60 hover:bg-white/[0.04]",
                                    )}
                                  >
                                    Favorites
                                  </button>
                                </div>

                                {/* Language filter */}
                                <Select value={voiceChangeLangFilter || "__all__"} onValueChange={(v) => {
                                  setVoiceChangeLangFilter(v === "__all__" ? "" : v);
                                  setElevenVoiceId("");
                                }}>
                                  <SelectTrigger className="h-10 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                                    <SelectValue placeholder="All languages" />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className={studioSelectContentClass}>
                                    <SelectItem value="__all__" className={studioSelectItemClass}>
                                      🌐 All languages
                                    </SelectItem>
                                    {elevenVoiceLanguages.map((lang) => (
                                      <SelectItem key={lang} value={lang} className={studioSelectItemClass}>
                                        {formatLanguageCodeLabel(lang)}{" "}
                                        <span className="ml-1 text-[10px] text-white/25">({lang.toUpperCase()})</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {/* Voice picker */}
                                <Select value={elevenVoiceId} onValueChange={setElevenVoiceId}>
                                  <SelectTrigger className="h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                                    <SelectValue
                                      placeholder={
                                        elevenVoicesLoading
                                          ? "Loading voices..."
                                          : filteredElevenVoices.length === 0
                                            ? "No voice for this language"
                                            : "Choose a voice"
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className={studioSelectContentClass}>
                                    {filteredElevenVoices.map((voice) => (
                                      <SelectItem key={voice.voiceId} value={voice.voiceId} className={studioSelectItemClass}>
                                        <span className="flex w-full items-center justify-between gap-2">
                                          <span className="flex min-w-0 items-center gap-2">
                                            <span className="truncate">{voice.name}</span>
                                            {(voice.labels?.language || voice.language) ? (
                                              <span className="text-[10px] text-white/35">
                                                {formatLanguageCodeLabel((voice.labels?.language || voice.language || "").trim())}
                                              </span>
                                            ) : null}
                                            {voice.labels?.gender ? (
                                              <span className="text-[10px] text-white/25">
                                                {voice.labels.gender.charAt(0).toUpperCase() + voice.labels.gender.slice(1)}
                                              </span>
                                            ) : null}
                                          </span>
                                          <button
                                            type="button"
                                            aria-label={favoriteElevenVoiceIds.includes(voice.voiceId) ? "Unfavorite voice" : "Favorite voice"}
                                            onPointerDown={(ev) => {
                                              ev.preventDefault();
                                              ev.stopPropagation();
                                              // Radix Select closes/unmounts items on pointer interactions.
                                              // Toggle on pointerdown so the UI updates immediately.
                                              toggleFavoriteElevenVoice(voice.voiceId);
                                            }}
                                            onKeyDown={(ev) => {
                                              if (ev.key !== "Enter" && ev.key !== " ") return;
                                              ev.preventDefault();
                                              ev.stopPropagation();
                                              toggleFavoriteElevenVoice(voice.voiceId);
                                            }}
                                            className={cn(
                                              "flex h-7 w-7 items-center justify-center rounded-md border transition",
                                              favoriteElevenVoiceIds.includes(voice.voiceId)
                                                ? "border-violet-400/40 bg-violet-500/15 text-violet-200"
                                                : "border-white/10 bg-black/20 text-white/45 hover:bg-white/[0.04]",
                                            )}
                                          >
                                            {/** Lucide icons default to fill="none"; set fill explicitly for a solid favorite state. */}
                                            <Star
                                              className={cn(
                                                "h-4 w-4",
                                                favoriteElevenVoiceIds.includes(voice.voiceId) ? "text-violet-200" : "",
                                              )}
                                              fill={favoriteElevenVoiceIds.includes(voice.voiceId) ? "currentColor" : "none"}
                                            />
                                          </button>
                                        </span>
                                      </SelectItem>
                                    ))}
                                    {voiceChangeVoiceTab === "all" && elevenVoiceLangHasMore ? (
                                      <div className="mt-1 border-t border-white/10 p-1">
                                        <button
                                          type="button"
                                          disabled={elevenVoicesLoadMorePending}
                                          onPointerDown={(ev) => {
                                            ev.preventDefault();
                                            ev.stopPropagation();
                                            void loadMoreElevenVoices();
                                          }}
                                          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.04] disabled:opacity-40"
                                        >
                                          {elevenVoicesLoadMorePending ? "Loading..." : "Load 10 more voices"}
                                        </button>
                                      </div>
                                    ) : null}
                                  </SelectContent>
                                </Select>

                                {/* Sample audio preview */}
                                {selectedElevenVoice?.previewUrl ? (
                                  <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                                    <p className="mb-1 text-[9px] uppercase tracking-wide text-white/35">Sample — {selectedElevenVoice.name}</p>
                                    <SampleAudioPlayer src={selectedElevenVoice.previewUrl} />
                                  </div>
                                ) : null}

                              </div>

                              {/* Advanced settings hidden for now */}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                                <Label className="text-xs text-white/45">Target language</Label>
                                <p className="mt-0.5 text-[10px] leading-snug text-white/35">
                                  Choose the output language from all supported languages.
                                </p>
                                <Select value={adCloneOutputLanguage} onValueChange={setAdCloneOutputLanguage}>
                                  <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                                    <SelectValue placeholder="Choose a language" />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className={studioSelectContentClass}>
                                    {translateLanguagesFiltered.map((language) => (
                                      <SelectItem key={language} value={language} className={studioSelectItemClass}>
                                        <span className="flex items-center justify-between gap-3">
                                          <span className="truncate">{language}</span>
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center">
                              <StudioSingleModelCard
                                hideMeta
                                label="Kling 3.0 Motion Control"
                                icon="kling"
                                resolution="1080p"
                                durationRange="3s–30s"
                              />
                            </div>
                            {!isPersonalApiActive() && motionControlUpgradeMessage(planId) ? (
                              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-100/90">
                                {motionControlUpgradeMessage(planId)}
                              </p>
                            ) : null}

                            <div>
                              <Label className="text-xs text-white/45">Scene control mode</Label>
                              <p className="mt-0.5 text-[10px] leading-snug text-white/35">
                                Choose the background source: reference motion video or character image.
                              </p>
                              <Select
                                value={motionSceneBackground}
                                onValueChange={(v) => setMotionSceneBackground(v as "video" | "image")}
                              >
                                <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent position="popper" className={studioSelectContentClass}>
                                  <SelectItem value="video" className={studioSelectItemClass}>
                                    Video
                                  </SelectItem>
                                  <SelectItem value="image" className={studioSelectItemClass}>
                                    Image
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-xs text-white/45">Quality</Label>
                              <p className="mt-0.5 text-[10px] leading-snug text-white/35">
                                720p and 1080p use different credit costs (shown on Generate).
                              </p>
                              <Select value={motionQuality} onValueChange={setMotionQuality}>
                                <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                                  <SelectValue placeholder="Quality" />
                                </SelectTrigger>
                                <SelectContent position="popper" className={studioSelectContentClass}>
                                  <SelectItem value="720p" className={studioSelectItemClass}>
                                    720p
                                  </SelectItem>
                                  <SelectItem value="1080p" className={studioSelectItemClass}>
                                    1080p
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <details className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                              <summary className="cursor-pointer text-xs font-semibold text-white/70">Advanced</summary>
                              <div className="mt-2 space-y-2">
                                <Label className="text-xs text-white/45">Optional prompt</Label>
                                <p className="text-[10px] leading-snug text-white/35">
                                  Optional text sent to Kling Motion Control (`prompt`, max 2500 characters).
                                </p>
                                <Textarea
                                  value={motionPrompt}
                                  onChange={(e) => setMotionPrompt(e.target.value)}
                                  placeholder="Example: The character dances with subtle upper-body motion."
                                  className="min-h-[84px] w-full resize-none rounded-xl border-white/15 bg-[#0a0a0d] text-xs text-white placeholder:text-white/35"
                                  rows={4}
                                />
                              </div>
                            </details>
                          </div>
                        )}
                      </div>

                      <Button
                        type="button"
                        disabled={
                          motionBusy ||
                          voiceChangePreparing ||
                          motionServerHistory !== true ||
                          (appSection === "ad_clone" && !motionVideoRefBlobUrl) ||
                          (appSection === "voice" &&
                            ((!voiceChangeUploadFile && !voiceChangeHistoryUrl) ||
                              !elevenVoiceId.trim())) ||
                          (appSection !== "ad_clone" && appSection !== "voice" && !motionVideoRefBlobUrl) ||
                          (appSection !== "ad_clone" && appSection !== "voice" &&
                            !isPersonalApiActive() &&
                            Boolean(motionControlUpgradeMessage(planId))) ||
                          (appSection === "ad_clone" &&
                            !adCloneOutputLanguage.trim())
                        }
                        className="h-14 w-full rounded-2xl border border-violet-300/40 bg-violet-500 text-lg font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none disabled:opacity-50"
                        onClick={() => {
                          const mcGate = motionControlUpgradeMessage(planId);
                          const motionPersonal = isPersonalApiActive();
                          const motionCreditBypass = isPlatformCreditBypassActive();
                          const isTranslate = appSection === "ad_clone";
                          const isVoiceChange = appSection === "voice";
                          if (motionServerHistory === null) {
                              toast.message("Loading your library...", {
                              description: "Wait a moment, then try again.",
                            });
                            return;
                          }
                          if (motionServerHistory !== true) {
                            toast.error("Backend sync unavailable. Refresh the page and try again.");
                            return;
                          }
                          if (isVoiceChange) {
                            if (!elevenVoiceId.trim()) {
                              toast.error("Choose a voice first.");
                              return;
                            }
                            if (!voiceChangeUploadFile && !voiceChangeHistoryUrl) {
                              toast.error("Add audio/video or choose a generated video.");
                              return;
                            }
                          }
                          if (appSection !== "ad_clone" && appSection !== "voice" && !motionPersonal && mcGate) {
                            setMotionBilling({ open: true, reason: "plan" });
                            return;
                          }
                          if (appSection !== "ad_clone" && appSection !== "voice" && !motionCharacterImageUrl) {
                            toast.error("Choose a character image first.");
                            return;
                          }
                          if (!isVoiceChange) {
                            if (!motionVideoRefBlobUrl) {
                              toast.error("Choose a reference video first.");
                              return;
                            }
                            if (
                              appSection !== "ad_clone" &&
                              motionVideoDetectedDuration != null &&
                              (motionVideoDetectedDuration < 3 || motionVideoDetectedDuration > 30)
                            ) {
                              toast.error("Reference video must be between 3 and 30 seconds.");
                              return;
                            }
                          }
                          if (!motionCreditBypass && creditsRef.current < motionCredits) {
                            setMotionBilling({ open: true, reason: "credits", required: motionCredits });
                            return;
                          }
                          const jobId = crypto.randomUUID();
                          const poster =
                            isVoiceChange
                              ? undefined
                              : appSection === "ad_clone"
                                ? motionVideoPosterUrl ?? undefined
                                : motionCharacterImageUrl ?? undefined;
                          const startedAt = Date.now();
                          const historyLabel = isVoiceChange
                            ? `Voice change (${selectedElevenVoice?.name || "custom"})`
                            : isTranslate
                              ? `Translation (${adCloneOutputLanguage})`
                              : "Motion control";
                          const bgSource =
                            motionSceneBackground === "video" ? "input_video" : "input_image";
                          const setHistoryTarget = isVoiceChange ? setVoiceHistoryItems : setMotionHistoryItems;
                          setHistoryTarget((prev) => [
                            {
                              id: jobId,
                              kind: isVoiceChange ? "audio" : "motion",
                              status: "generating",
                              label: historyLabel,
                              posterUrl: poster,
                              createdAt: startedAt,
                            },
                            ...prev,
                          ]);
                          const voiceChangeCredits = VOICE_CHANGE_CREDITS_FLAT;
                          const platformChargeMotion = motionCreditBypass
                            ? 0
                            : isVoiceChange
                              ? voiceChangeCredits
                              : motionCredits;

                          if (!motionCreditBypass) {
                            const toSpend = isVoiceChange ? voiceChangeCredits : motionCredits;
                            spendCredits(toSpend);
                            creditsRef.current = Math.max(0, creditsRef.current - toSpend);
                          }
                          setMotionBusy(true);
                          void (async () => {
                            try {
                              if (isVoiceChange) {
                                setVoiceChangePreparing(true);
                                toast.message("Preparing file...");
                                const audioFile = await prepareVoiceChangeAudioFile();

                                if (audioFile.size > 50 * 1024 * 1024) {
                                  throw new Error(
                                    `File is too large (${(audioFile.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`,
                                  );
                                }

                                if (voiceChangeVoiceSettingsJson.trim()) {
                                  JSON.parse(voiceChangeVoiceSettingsJson);
                                }

                                toast.message("Uploading file...");

                                // 1. Get a signed upload URL from Supabase
                                const signedRes = await fetch("/api/uploads/signed-url", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    filename: audioFile.name || "input.mp4",
                                    contentType: audioFile.type || "video/mp4",
                                  }),
                                });
                                const signedJson = await signedRes.json();
                                if (!signedRes.ok || !signedJson.signedUrl) {
                                  throw new Error(signedJson.error || "Could not get upload URL.");
                                }

                                // 2. Upload directly to Supabase Storage (no body size limit)
                                const uploadRes = await fetch(signedJson.signedUrl, {
                                  method: "PUT",
                                  headers: { "Content-Type": audioFile.type || "video/mp4" },
                                  body: audioFile,
                                });
                                if (!uploadRes.ok) {
                                  throw new Error(`Upload failed (HTTP ${uploadRes.status}).`);
                                }

                                toast.message("Converting voice & merging...", {
                                  description: "This may take up to a minute.",
                                });

                                // 3. Send storage path + params (server downloads via admin client)
                                const res = await fetch("/api/elevenlabs/speech-to-speech", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    storagePath: signedJson.path,
                                    voiceId: elevenVoiceId,
                                    voiceName: selectedElevenVoice?.name || "",
                                    modelId: voiceChangeModelId.trim(),
                                    outputFormat: voiceChangeOutputFormat,
                                    enableLogging: voiceChangeEnableLogging,
                                    removeBackgroundNoise: voiceChangeRemoveBackgroundNoise,
                                    fileFormat: voiceChangeFileFormat,
                                    optimizeStreamingLatency: voiceChangeOptimizeLatency.trim() || undefined,
                                    seed: voiceChangeSeed.trim() || undefined,
                                    voiceSettingsJson: voiceChangeVoiceSettingsJson.trim() || undefined,
                                    personalElevenLabsApiKey: getPersonalElevenLabsApiKey() || undefined,
                                  }),
                                });

                                let json: { rowId?: string; mediaUrl?: string; kind?: string; error?: string };
                                try {
                                  json = await res.json();
                                } catch {
                                  const text = await res.text().catch(() => "");
                                  throw new Error(`Server error (${res.status}): ${text.slice(0, 200) || "unexpected response"}`);
                                }

                                if (!res.ok || !json.rowId) {
                                  throw new Error(json.error || "Voice change failed.");
                                }

                                const resultIsVideo = json.kind === "video";
                                setVoiceHistoryItems((prev) =>
                                  prev.map((i) =>
                                    i.id === jobId
                                      ? {
                                          ...i,
                                          id: json.rowId!,
                                          mediaUrl: json.mediaUrl,
                                          kind: resultIsVideo ? "video" : "audio",
                                          status: "ready",
                                          label: `Voice changed — ${selectedElevenVoice?.name ?? "custom"}`,
                                          studioGenerationKind: STUDIO_GENERATION_KIND_VOICE_CHANGE,
                                        }
                                      : i,
                                  ),
                                );
                                toast.success(resultIsVideo ? "Video ready!" : "Voice change complete", {
                                  description: resultIsVideo
                                    ? "The video with the new voice is in your history."
                                    : "Audio is available in your history.",
                                });
                                return;
                              }

                              toast.message(
                                appSection === "ad_clone" ? "Uploading video..." : "Uploading references...",
                              );
                              if (!motionVideoRefBlobUrl && !motionVideoUploadedUrl && !motionVideoFile) {
                                throw new Error("No reference video selected.");
                              }
                              const videoHttps = motionVideoUploadedUrl
                                ? motionVideoUploadedUrl
                                : motionVideoFile
                                  ? await uploadFileToCdn(motionVideoFile, { kind: "video" })
                                  : await uploadBlobUrlToCdn(
                                      motionVideoRefBlobUrl!,
                                      "motion-ref.mp4",
                                      "video/mp4",
                                      { kind: "video" },
                                    );
                              const res =
                                appSection === "ad_clone"
                                  ? await fetch("/api/wavespeed/video-translate", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        videoUrl: videoHttps,
                                        outputLanguage: adCloneOutputLanguage,
                                      }),
                                    })
                                  : await fetch("/api/kling/motion-control", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        accountPlan: planId,
                                        imageUrl: motionCharacterImageUrl
                                          ? await uploadBlobUrlToCdn(
                                              motionCharacterImageUrl,
                                              "motion-character.jpg",
                                              "image/jpeg",
                                              { kind: "image" },
                                            ).catch(async () => {
                                              if (motionCharacterFile)
                                                return uploadFileToCdn(motionCharacterFile, { kind: "image" });
                                              if (/^https?:\/\//i.test(motionCharacterImageUrl)) return motionCharacterImageUrl;
                                              if (motionCharacterImageUrl.startsWith("/")) {
                                                return `${window.location.origin}${motionCharacterImageUrl}`;
                                              }
                                              throw new Error("Could not prepare character image");
                                            })
                                          : "",
                                        videoUrl: videoHttps,
                                        prompt: motionPrompt.trim() || undefined,
                                        quality: motionQuality,
                                        characterOrientation: "image",
                                        backgroundSource: bgSource,
                                        personalApiKey: getPersonalApiKey(),
                                      }),
                                    });
                              const json = (await res.json()) as { taskId?: string; error?: string };
                              if (!res.ok || !json.taskId) {
                                throw new Error(
                                  json.error || (appSection === "ad_clone" ? "Translation failed" : "Motion control failed"),
                                );
                              }
                              const provider = appSection === "ad_clone" ? WAVESPEED_PROVIDER : "kie-market";
                              const generationKind =
                                appSection === "ad_clone"
                                  ? STUDIO_GENERATION_KIND_STUDIO_TRANSLATE_VIDEO
                                  : "motion_control";
                              const model =
                                appSection === "ad_clone"
                                  ? `wavespeed:heygen_translate:${adCloneOutputLanguage}`
                                  : `kling:motion_control:${motionQuality}:${motionSceneBackground}`;
                              const motionInputUrls = [videoHttps].filter(Boolean);
                              const rowId = await registerStudioGenerationClient({
                                kind: generationKind,
                                label: historyLabel,
                                taskId: json.taskId,
                                provider,
                                model,
                                creditsCharged: platformChargeMotion,
                                personalApiKey: getPersonalApiKey() ?? undefined,
                                inputUrls: motionInputUrls.length > 0 ? motionInputUrls : undefined,
                              });
                              if (rowId) {
                                setMotionHistoryItems((prev) =>
                                  prev.map((i) =>
                                    i.id === jobId
                                      ? { ...i, id: rowId, studioGenerationKind: generationKind }
                                      : i,
                                  ),
                                );
                              }
                              toast.message(
                                appSection === "ad_clone" ? "Translation started" : "Motion control started",
                              );
                            } catch (err) {
                              const msg =
                                err instanceof Error
                                  ? err.message || "Unknown error"
                                  : typeof err === "string"
                                    ? err
                                    : "Unknown error";
                              refundPlatformCredits(platformChargeMotion, grantCredits, creditsRef);
                              toast.error(msg);
                              (isVoiceChange ? setVoiceHistoryItems : setMotionHistoryItems)((prev) =>
                                prev.map((i) =>
                                  i.id === jobId && i.status === "generating"
                                    ? {
                                        ...i,
                                        status: "failed",
                                        errorMessage: msg,
                                        creditsRefunded: platformChargeMotion > 0,
                                      }
                                    : i,
                                ),
                              );
                            } finally {
                              setVoiceChangePreparing(false);
                              setMotionBusy(false);
                            }
                          })();
                        }}
                      >
                        <span className="inline-flex items-center gap-2">
                          {appSection === "voice"
                            ? "Change voice"
                            : appSection === "ad_clone"
                              ? "Translate"
                              : "Generate"}
                          <Sparkles className="h-5 w-5" />
                          {appSection === "voice" ? (
                            <>
                              <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums">
                                {motionCredits}
                              </span>
                              <span className="text-sm font-normal text-white/80">credits</span>
                            </>
                          ) : (
                            <>
                              <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums">
                                {motionCredits}
                              </span>
                              {motionCreditsUsesEstimate ? (
                                <span className="text-[10px] font-normal text-white/50">
                                  ~{motionBillableSeconds}s estimated
                                </span>
                              ) : (
                                <span className="text-[10px] font-normal text-white/50">{motionBillableSeconds}s</span>
                              )}
                            </>
                          )}
                        </span>
                      </Button>
                      </div>
                    </div>

                    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col lg:basis-3/4 lg:flex-none lg:min-h-0 lg:overflow-hidden">
                      <StudioOutputPane
                        title=""
                        hasOutput
                        output={
                          <StudioGenerationsHistory
                            items={appSection === "voice" ? voiceHistoryItems : motionHistoryItems}
                            empty={<StudioEmptyExamples variant="motion" />}
                            mediaLabel={appSection === "voice" ? "Voice" : appSection === "ad_clone" ? "Translation" : "Motion"}
                            onItemDeleted={(id) =>
                              appSection === "voice"
                                ? setVoiceHistoryItems((prev) => prev.filter((i) => i.id !== id))
                                : setMotionHistoryItems((prev) => prev.filter((i) => i.id !== id))
                            }
                            onChangeVoice={handleChangeVoiceFromHistory}
                          />
                        }
                        empty={null}
                      />
                    </div>
                  </div>

                <StudioBillingDialog
                  open={motionBilling.open}
                  onOpenChange={(o) => {
                    if (!o) setMotionBilling({ open: false });
                  }}
                  planId={planId}
                  studioMode="video"
                  variant={
                    !motionBilling.open
                      ? { kind: "credits", currentCredits: 0, requiredCredits: 0 }
                      : motionBilling.reason === "plan"
                        ? { kind: "plan", blockedModelId: "kling-3.0/video" }
                        : {
                            kind: "credits",
                            currentCredits: creditsBalance,
                            requiredCredits: motionBilling.required,
                          }
                  }
                />
              </div>
            ) : null}

            {appSection === "avatar" ? (
              <Card className="gap-2 border-white/10 bg-[#0b0912]/85 py-3 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader className="space-y-0 px-6 pb-0 pt-2">
                  <CardTitle className="text-sm">Avatar Creator</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-3 pt-0">
                  <StudioAvatarPanel onChangeVoice={handleChangeVoiceFromHistory} />
                </CardContent>
              </Card>
            ) : null}
            {appSection === "image" ? (
              <Card className="gap-2 border-white/10 bg-[#0b0912]/85 py-3 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader className="space-y-0 px-6 pb-0 pt-2">
                  <CardTitle className="text-sm">Image</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-3 pt-0">
                  <StudioImagePanel />
                </CardContent>
              </Card>
            ) : null}
            {appSection === "video" ? (
              <Card className="gap-2 border-white/10 bg-[#0b0912]/85 py-3 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardContent className="px-6 pb-3 pt-2">
                  <StudioVideoPanel onChangeVoice={handleChangeVoiceFromHistory} />
                </CardContent>
              </Card>
            ) : null}
            {appSection === "upscale" ? (
              <Card className="min-h-0 gap-2 border-white/10 bg-[#0b0912]/85 py-3 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader className="space-y-0 px-6 pb-0 pt-2">
                  <CardTitle className="text-sm">Upscale</CardTitle>
                </CardHeader>
                <CardContent className="min-h-0 px-6 pb-3 pt-0">
                  <StudioUpscalePanel />
                </CardContent>
              </Card>
            ) : null}
            {linkToAdKeepAliveRef.current ? (
              <div
                className={appSection === "link_to_ad" ? "contents" : "hidden"}
                aria-hidden={appSection !== "link_to_ad"}
              >
                <LinkToAdUniverse
                  key={linkToAdMountKey}
                  resumeRunId={linkToAdResumeRunId}
                  onResumeConsumed={() => setLinkToAdResumeRunId(null)}
                  onRunsChanged={() => void refreshMeAndRuns()}
                  recentLinkToAdRuns={recentLinkToAdRuns}
                  activeRunId={linkToAdActiveRunId}
                  onActiveRunIdChange={setLinkToAdActiveRunId}
                  onStartFreshLinkToAdSession={() => {
                    setLinkToAdResumeRunId(null);
                    setLinkToAdMountKey((k) => k + 1);
                    void refreshMeAndRuns();
                  }}
                  onSwitchLinkToAdRun={(runId) => {
                    setLinkToAdResumeRunId(runId);
                  }}
                />
              </div>
            ) : null}

            {appSection === "link_to_ad" && false && step === "url" && (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader>
                  <CardTitle className="text-base">1) URL & extraction</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Store URL</Label>
                    <Input value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} placeholder="https://..." />
                    <Button onClick={onExtract} disabled={isExtracting}>
                      {isExtracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Extract
                    </Button>
                  </div>

                  {!extracted ? (
                    <div className="rounded-md border bg-background/30 p-4 text-sm text-muted-foreground">
                      Paste a URL, then click Extract.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-md border bg-background/30 p-3">
                        <div className="font-medium">{extracted?.title ?? "…"}</div>
                        <div className="text-sm text-muted-foreground">{extracted?.description ?? "…"}</div>
                        <div className="mt-2 text-xs text-muted-foreground break-all">{extracted?.url}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => setStep("analysis")} disabled={!extracted}>
                          Next → Analysis
                        </Button>
                      </div>
                      {extracted?.images?.length ? (
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">
                            Images found: <span className="font-medium">{extracted?.images?.length}</span>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            {extracted?.images?.slice(0, 6).map((u) => (
                              <img
                                key={u}
                                src={u}
                                alt="Extracted"
                                className="h-28 w-full rounded-md border object-cover"
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {appSection === "link_to_ad" && false && step === "analysis" && (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader>
                  <CardTitle className="text-base">2) GPT analysis (1→9)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={onAnalyze} disabled={!extracted || isAnalyzing}>
                      {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Run GPT analysis (1→9)
                    </Button>
                    <Button variant="secondary" onClick={() => setStep("quiz")} disabled={!analysis}>
                      Next → Quiz
                    </Button>
                  </div>

                  {!analysis ? (
                    <div className="rounded-md border bg-background/30 p-4 text-sm text-muted-foreground">
                      Click “Run GPT analysis”.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => copyToClipboard("GPT analysis (JSON)", JSON.stringify(analysis, null, 2))}
                        >
                          Copy GPT JSON
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => copyToClipboard("Step 1 raw sheet", safeString(analysis.step1_rawSheet, ""))}
                        >
                          Copy Step 1
                        </Button>
                      </div>
                      <div className="rounded-md border bg-background/30 p-3 text-sm whitespace-pre-wrap">
                        {safeString(analysis.step1_rawSheet, "")}
                      </div>
                      <div className="rounded-md border bg-background/30 p-3 text-sm">
                        <div className="font-medium mb-1">Positioning</div>
                        <div className="text-muted-foreground">{safeString(analysis.step2_positioning, "…")}</div>
                      </div>
                      {researchNotes.length > 0 ? (
                        <div className="rounded-md border bg-background/30 p-3 text-sm">
                          <div className="font-medium mb-1">GPT research notes</div>
                          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            {researchNotes.slice(0, 8).map((n, i) => (
                              <li key={i}>{n}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {appSection === "link_to_ad" && false && step === "quiz" && (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader>
                  <CardTitle className="text-base">3) Mini quiz (pre-filled)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={onAutoFillQuiz} disabled={!extracted || isQuizAutofilling}>
                      {isQuizAutofilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Auto-fill (from URL)
                    </Button>
                    <Button variant="secondary" onClick={() => setStep("image")} disabled={!analysis}>
                      Next → Image
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {quizPrecisionNote ||
                      "Auto-fill helps you start, but answers are more accurate if you edit them yourself."}
                  </p>

                  <div className="grid gap-3">
                    <Textarea
                      value={quiz.aboutProduct}
                      onChange={(e) => setQuiz((q) => ({ ...q, aboutProduct: e.target.value }))}
                      rows={4}
                      placeholder="1) Tell us about your product..."
                    />
                    <Textarea
                      value={quiz.problems}
                      onChange={(e) => setQuiz((q) => ({ ...q, problems: e.target.value }))}
                      rows={3}
                      placeholder="2) What problem(s) does your product solve?"
                    />
                    <Textarea
                      value={quiz.promises}
                      onChange={(e) => setQuiz((q) => ({ ...q, promises: e.target.value }))}
                      rows={3}
                      placeholder="3) What are its main promises?"
                    />
                    <Textarea
                      value={quiz.persona}
                      onChange={(e) => setQuiz((q) => ({ ...q, persona: e.target.value }))}
                      rows={4}
                      placeholder="4) Describe your target persona (age, situation, desires...)"
                    />
                    <Textarea
                      value={quiz.angles}
                      onChange={(e) => setQuiz((q) => ({ ...q, angles: e.target.value }))}
                      rows={3}
                      placeholder="5) Your main marketing angles?"
                    />
                    <Textarea
                      value={quiz.offers}
                      onChange={(e) => setQuiz((q) => ({ ...q, offers: e.target.value }))}
                      rows={3}
                      placeholder="6) Your current offers (promo, bundle, guarantee, shipping...)"
                    />
                    <div className="space-y-2">
                      <Label>7) Preferred video length</Label>
                      <Select
                        value={quiz.videoDurationPreference}
                        onValueChange={(v) =>
                          setQuiz((q) => ({
                            ...q,
                            videoDurationPreference: v === "20s" || v === "30s" ? v : "15s",
                          }))
                        }
                      >
                        <SelectTrigger className="w-full max-w-xs rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" className={studioSelectContentClass}>
                          <SelectItem value="15s" className={studioSelectItemClass}>
                            15s
                          </SelectItem>
                          <SelectItem value="20s" className={studioSelectItemClass}>
                            20s
                          </SelectItem>
                          <SelectItem value="30s" className={studioSelectItemClass}>
                            30s
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {appSection === "link_to_ad" && false && step === "image" && (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader>
                  <CardTitle className="text-base">4) Prompt → image (NanoBanana)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={onFindProductOnlyImages}
                      disabled={!extracted?.images?.length || isClassifyingImages}
                    >
                      {isClassifyingImages ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Find “product-only” images (AI)
                    </Button>
                    <Select value={nanoModel} onValueChange={(v) => setNanoModel(v as NanoModel)}>
                      <SelectTrigger className="w-[220px] rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" className={studioSelectContentClass}>
                        <SelectItem value="nano" className={studioSelectItemClass}>
                          NanoBanana
                        </SelectItem>
                        <SelectItem value="pro" className={studioSelectItemClass}>
                          NanoBanana Pro
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {productOnlyCandidates.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Select 1–4 packshot images (multi-angle) to help NanoBanana keep the product realistic.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {productOnlyCandidates.slice(0, 6).map((c) => {
                          const selected = selectedProductImageUrls.includes(c.url);
                          return (
                            <button
                              key={c.url}
                              type="button"
                              className={`rounded-md border overflow-hidden text-left transition cursor-pointer ${
                                selected ? "ring-2 ring-primary" : "hover:bg-muted/30"
                              }`}
                              onClick={() => {
                                setSelectedProductImageUrls((prev) => {
                                  const has = prev.includes(c.url);
                                  if (has) return prev.filter((u) => u !== c.url);
                                  if (prev.length >= 4) return [...prev.slice(1), c.url];
                                  return [...prev, c.url];
                                });
                              }}
                            >
                              <img src={c.url} alt="Product-only candidate" className="h-44 w-full object-cover" />
                              <div className="p-2 text-xs text-muted-foreground">
                                <div className="font-medium text-foreground/90">
                                  {c.reason ? c.reason : "Packshot candidate"}
                                </div>
                                <div className="mt-1 break-all opacity-80">{c.url}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : hasClassifiedImages && !isClassifyingImages ? (
                    <div className="rounded-md border bg-background/30 p-3 text-sm text-muted-foreground">
                      No “product-only” packshot detected on this page.
                      <div className="mt-2 text-xs">
                        For best results, upload 2–4 images of the product alone (front, side, back, detail).
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-md border bg-background/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">Upload packshots (produit seul)</div>
                        <div className="text-xs text-muted-foreground">
                          Ideal: 2–4 angles. Formats: jpg/png/webp.
                        </div>
                      </div>
                      <input
                        ref={packshotFileInputRef}
                        type="file"
                        accept={STUDIO_IMAGE_FILE_ACCEPT}
                        multiple
                        className="sr-only"
                        disabled={isUploadingPackshots}
                        onChange={(e) => {
                          onUploadPackshots(e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isUploadingPackshots}
                        onClick={() => packshotFileInputRef.current?.click()}
                        className="cursor-pointer"
                      >
                        {isUploadingPackshots ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Upload images
                      </Button>
                    </div>

                    {packshotUrls.length > 0 || packshotUploadPreviews.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-xs text-muted-foreground mb-2">
                          Packshots selected:{" "}
                          <span className="font-medium">{packshotUrls.length}</span>
                          {packshotUploadPreviews.length > 0 ? (
                            <span className="text-muted-foreground/80">
                              {" "}
                              · uploading {packshotUploadPreviews.length}…
                            </span>
                          ) : null}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-4">
                          {packshotUploadPreviews.map((row) => (
                            <div
                              key={row.id}
                              className="relative h-24 overflow-hidden rounded-md border border-violet-500/40"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={row.blob} alt="" className="h-full w-full object-cover" />
                              <UploadBusyOverlay active className="rounded-md" />
                            </div>
                          ))}
                          {packshotUrls.slice(0, 8).map((u) => (
                            <button
                              key={u}
                              type="button"
                              className="rounded-md border overflow-hidden cursor-pointer hover:opacity-90"
                              onClick={() => setLightboxUrl(u)}
                              title="Click to enlarge"
                            >
                              <img src={u} alt="Packshot" className="h-24 w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-muted-foreground">
                        No packshot selected yet.
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={onGenerateImagePrompt}
                      disabled={
                        !analysis ||
                        !extracted ||
                        isCreatingPerfectImagePrompt ||
                        (imagePrompt.trim().length > 0 && negativePrompt.trim().length > 0)
                      }
                    >
                      {isCreatingPerfectImagePrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {imagePrompt.trim().length > 0 ? "Prompt already generated" : "Create “perfect” image prompt"}
                    </Button>
                    {imagePrompt.trim().length > 0 ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setImagePrompt("");
                          setNegativePrompt("");
                        }}
                      >
                        Regenerate
                      </Button>
                    ) : null}
                    <Button
                      onClick={onGenerateImage}
                      disabled={!extracted || imageGen.kind === "submitting" || imageGen.kind === "polling"}
                    >
                      {imageGen.kind === "submitting" || imageGen.kind === "polling" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Generate image (NanoBanana)
                    </Button>
                    <Button variant="secondary" onClick={() => setStep("video")} disabled={!selectedImageUrl}>
                      Next → Video
                    </Button>
                  </div>

                  <div className="rounded-md border bg-background/30 p-3 text-sm">
                    <div className="font-medium mb-2">Image prompt</div>
                    {!imagePrompt.trim() ? (
                      <div className="whitespace-pre-wrap text-muted-foreground">
                        No prompt yet (use “Create perfect image prompt”).
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {imagePromptDisplayBlocks.map((block, idx) => (
                          <div key={`${block.title}-${idx}`} className="rounded-md border border-white/10 bg-black/15 p-2.5">
                            {imagePromptDisplayBlocks.length > 1 ? (
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/55">
                                {block.title}
                              </div>
                            ) : null}

                            {block.isStructured ? (
                              <div className="space-y-2">
                                <div>
                                  <div className="text-[11px] font-semibold text-white/70">Avatar / person</div>
                                  <div className="whitespace-pre-wrap text-muted-foreground">{block.avatar || "—"}</div>
                                </div>
                                <div>
                                  <div className="text-[11px] font-semibold text-white/70">Scene</div>
                                  <div className="whitespace-pre-wrap text-muted-foreground">{block.scene || "—"}</div>
                                </div>
                                <div>
                                  <div className="text-[11px] font-semibold text-white/70">Product & action</div>
                                  <div className="whitespace-pre-wrap text-muted-foreground">{block.product || "—"}</div>
                                </div>
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap text-muted-foreground">{block.fallback}</div>
                            )}

                            {block.technicalTail ? (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-[11px] font-medium text-white/60">
                                  Technical / negative (hidden by default)
                                </summary>
                                <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                                  {block.technicalTail}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                    {negativePrompt ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer font-medium">Negative</summary>
                        <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{negativePrompt}</div>
                      </details>
                    ) : null}
                  </div>

                  {imageGen.kind === "success" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {(imageGen as Extract<ImageGenState, { kind: "success" }>).urls.map((u) => (
                        <button
                          key={u}
                          type="button"
                          className={`rounded-xl border border-white/10 bg-black/30 text-left cursor-pointer hover:opacity-95 overflow-hidden ${
                            selectedImageUrl === u ? "ring-2 ring-violet-400" : ""
                          }`}
                          onClick={() => {
                            setSelectedImageUrl(u);
                            setLightboxUrl(u);
                          }}
                          title="Click to enlarge"
                        >
                          <div className="aspect-[9/16] w-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={u}
                              alt="Generated"
                              className="h-full w-full object-contain object-center"
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {selectedImageUrl ? (
                    <div className="rounded-md border bg-background/30 p-3 text-xs text-muted-foreground break-all">
                      Selected: {selectedImageUrl}
                    </div>
                  ) : null}

                  {imageGen.kind === "error" ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      {(imageGen as Extract<ImageGenState, { kind: "error" }>).message}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {appSection === "link_to_ad" && false && step === "video" && (
              <Card className="border-white/10 bg-[#0b0912]/85 shadow-[0_0_30px_rgba(139,92,246,0.08)]">
                <CardHeader>
                  <CardTitle className="text-base">5) Template → video (Kling 3.0 Standard)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                Provider: <span className="font-medium">Kling 3.0 Standard</span> (KIE Market), aspect 9:16. 15s, 720p
                Standard, audio ON (voix native).
                  </p>

                  <div className="space-y-2">
                    <Label className="text-xs">Template</Label>
                    <Select value={selectedTemplate} onValueChange={(v) => setSelectedTemplate(v as TemplateId)}>
                      <SelectTrigger className="rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" className={studioSelectContentClass}>
                        {TEMPLATES.map((t) => (
                          <SelectItem key={t.id} value={t.id} className={studioSelectItemClass}>
                            {t.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Best for: {TEMPLATES.find((t) => t.id === selectedTemplate)?.bestFor}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={onBuildVideoPrompt}
                      disabled={
                        !analysis ||
                        !selectedImageUrl ||
                        isBuildingVideoPrompt ||
                        (videoPrompt.trim().length > 0 && videoGen.kind !== "error")
                      }
                    >
                      {isBuildingVideoPrompt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {videoPrompt.trim().length > 0 ? "Prompt already generated" : "Build UGC prompt from template"}
                    </Button>
                    {videoPrompt.trim().length > 0 ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setVideoPrompt("");
                        }}
                      >
                        Regenerate
                      </Button>
                    ) : null}
                    <Button
                      onClick={onGenerateVideo}
                      disabled={!selectedImageUrl || videoGen.kind === "submitting" || videoGen.kind === "polling"}
                    >
                      {videoGen.kind === "submitting" || videoGen.kind === "polling" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Generate the UGC video
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => copyToClipboard("Video prompt", videoPrompt)}
                      disabled={!videoPrompt.trim()}
                    >
                      Copy video prompt
                    </Button>
                  </div>

                  <div className="rounded-md border bg-background/30 p-3 text-sm">
                    <div className="font-medium mb-2">UGC video prompt (template)</div>
                    <Textarea
                      value={videoPrompt}
                      onChange={(e) => setVideoPrompt(e.target.value)}
                      rows={10}
                      placeholder="Click “Build UGC prompt from template”…"
                    />
                  </div>

                  {videoGen.kind === "success" ? (
                    <div className="space-y-3">
                      <div className="rounded-md border bg-background/30 p-3 text-xs text-muted-foreground break-all">
                        Video: {(videoGen as Extract<VideoGenState, { kind: "success" }>).url}
                      </div>
                      <video
                        src={(videoGen as Extract<VideoGenState, { kind: "success" }>).url}
                        controls
                        playsInline
                        className="w-full rounded-md border bg-black"
                      />
                      {videoDownloadHref ? (
                        <Button asChild variant="secondary">
                        <a href={videoDownloadHref ?? undefined}>Download</a>
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {videoGen.kind === "error" ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      {(videoGen as Extract<VideoGenState, { kind: "error" }>).message}
                    </div>
                  ) : null}

                  <div className="rounded-md border bg-background/30 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
                    <div className="font-medium text-sm mb-2">Debug context</div>
                    {JSON.stringify(
                      {
                        step,
                        extracted: extracted
                          ? {
                              url: extracted?.url,
                              title: extracted?.title,
                              images: extracted?.images?.slice(0, 3),
                              prices: extracted?.signals?.prices?.slice(0, 6),
                            }
                          : null,
                        productName: currentProductName,
                        imageGen,
                        videoGen,
                      },
                      null,
                      2,
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </StudioShell>

      {deleteProjectDialog ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => !deleteProjectLoading && setDeleteProjectDialog(null)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            className="w-full max-w-md border-white/15 bg-[#0b0912] shadow-[0_0_60px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="space-y-1">
              <CardTitle id="delete-project-title" className="text-lg">
                Delete this project?
              </CardTitle>
              <p className="text-sm font-normal text-white/60">
                <span className="font-medium text-white/85">{deleteProjectDialog.label}</span>
                <br />
                All generations linked to this store URL will be removed permanently. This cannot be undone.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="border border-white/15 bg-white/5 text-white hover:bg-white/10"
                disabled={deleteProjectLoading}
                onClick={() => setDeleteProjectDialog(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteProjectLoading}
                onClick={() =>
                  void executeDeleteProject(deleteProjectDialog.storeUrl, deleteProjectDialog.runIds)
                }
              >
                {deleteProjectLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete project"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setLightboxUrl(null)}
          role="button"
          tabIndex={0}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-md transition hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
            aria-label="Close"
          >
            <X className="h-4 w-4 text-white" />
          </button>
          <a
            href={lightboxUrl}
            download
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white/80 backdrop-blur-md transition hover:bg-white/20 hover:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
          <div className="mx-auto flex h-full max-w-5xl items-center justify-center px-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Preview"
              className="max-h-[90vh] w-auto max-w-full rounded-xl border border-white/10 bg-black object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}

      {lightboxVideoUrl ? (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setLightboxVideoUrl(null)}
          role="button"
          tabIndex={0}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-md transition hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); setLightboxVideoUrl(null); }}
            aria-label="Close"
          >
            <X className="h-4 w-4 text-white" />
          </button>
          <a
            href={lightboxVideoUrl}
            download
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white/80 backdrop-blur-md transition hover:bg-white/20 hover:text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
          <div
            className="mx-auto flex h-full max-w-3xl items-center justify-center px-4 animate-in fade-in slide-in-from-bottom-3 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={lightboxVideoUrl}
              className="max-h-[85vh] w-auto max-w-full rounded-xl border border-white/10 bg-black shadow-2xl"
              controls
              autoPlay
              playsInline
              preload="auto"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}


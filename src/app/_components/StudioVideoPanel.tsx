"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  ChevronDown,
  CirclePlus,
  Clock,
  Expand,
  HelpCircle,
  ImageIcon,
  Music2,
  Pin,
  Shrink,
  Sparkles,
  Trash2,
  Upload,
  VideoIcon,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AvatarInputCornerBadge } from "@/app/_components/AvatarInputCornerBadge";
import { StudioEmptyExamples, StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import { StudioGenerationsHistory } from "@/app/_components/StudioGenerationsHistory";
import { userMessageFromCaughtError } from "@/lib/generationUserMessage";
import {
  assertStudioAudioUpload,
  assertStudioImageUpload,
  assertStudioVideoUpload,
  fileExtensionLower,
  inferStudioUploadKind,
  STUDIO_AUDIO_FILE_ACCEPT,
  STUDIO_IMAGE_FILE_ACCEPT,
  STUDIO_VIDEO_FILE_ACCEPT,
} from "@/lib/studioUploadValidation";
import {
  isProbablyVideoUrl,
  type StudioHistoryItem,
} from "@/app/_components/StudioGenerationsHistory";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";
import {
  StudioModelPicker,
  studioSelectContentClass,
  studioSelectItemClass,
  type StudioModelPickerItem,
} from "@/app/_components/StudioModelPicker";
import {
  useCreditsPlan,
  getPersonalApiKey,
  getPersonalPiapiApiKey,
  isPersonalApiActive,
  isPlatformCreditBypassActive,
} from "@/app/_components/CreditsPlanContext";
import { mergeStudioHistoryWithServer } from "@/lib/mergeStudioHistoryWithLocal";
import { isKieServableReferenceImageUrl } from "@/lib/kieSoraReferenceImage";
import { linkToAdProductPhotoPickerUrls, readUniverseFromExtracted } from "@/lib/linkToAdUniverse";
import { completeStudioTask, pollKlingVideo, pollVeoVideo } from "@/lib/studioKlingClientPoll";
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";
import { calculateVideoCredits } from "@/lib/linkToAd/generationCredits";
import { calculateStudioVideoEditCredits } from "@/lib/pricing";
import {
  canUseStudioVideoEditPicker,
  canUseStudioVideoModel,
  studioVideoDisplayLabel,
  studioVideoEditPickerDisplayLabel,
  studioVideoEditUpgradeMessage,
  studioVideoUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import { STUDIO_VIDEO_EDIT_PICKER_IDS } from "@/lib/studioVideoEditModels";
import { loadAvatarUrls } from "@/lib/avatarLibrary";
import { AvatarPickerDialog } from "@/app/_components/AvatarPickerDialog";
import { clipboardImageFiles } from "@/lib/clipboardImage";
import { UploadBusyOverlay } from "@/app/_components/UploadBusyOverlay";
import { readStudioHistoryLocal, writeStudioHistoryLocal } from "@/lib/studioHistoryLocalStorage";
import { uploadFileToCdn, type UploadFileKind } from "@/lib/uploadBlobUrlToCdn";
import { cn } from "@/lib/utils";
import { STUDIO_GENERATION_KIND_STUDIO_IMAGE, STUDIO_VIDEO_TAB_KINDS } from "@/lib/studioGenerationKinds";
import {
  SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS,
  SEEDANCE_PREVIEW_MAX_IMAGE_URLS,
  SEEDANCE_PRO_MAX_IMAGE_URLS,
  SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS,
} from "@/lib/piapiSeedance";
import {
  studioVideoDurationRangeLabel,
  studioVideoDurationSecOptions,
  studioVideoIsSeedance2ProPickerId,
  studioVideoIsSeedancePickerId,
  studioVideoShowsAspectRatioCreate,
  studioVideoSupportsMultiShot,
  studioVideoSupportsNativeAudio,
  studioVideoSupportsQualityPicker,
  studioVideoUsesSeedanceCompactReferenceUploads,
  studioVideoUsesSeedanceProOmniMediaUploads,
  STUDIO_VEO_DURATION_HINT,
} from "@/lib/studioVideoModelCapabilities";

const LS_STUDIO_VIDEO_HISTORY = "ugc_studio_video_history_v1";
const LS_STUDIO_VIDEO_ELEMENTS_V1 = "ugc_studio_video_elements_v1";

/** Seedance 2 Pro: reference videos must be MP4 or MOV (not WebM). */
const SEEDANCE_PRO_OMNI_VIDEO_ACCEPT = "video/mp4,video/quicktime,.mp4,.mov";
const SEEDANCE_PRO_OMNI_FILE_ACCEPT = `${STUDIO_IMAGE_FILE_ACCEPT},${SEEDANCE_PRO_OMNI_VIDEO_ACCEPT},${STUDIO_AUDIO_FILE_ACCEPT}`;

/** Kling 3.0 multi-shot: per-shot duration, Market API integer 1–12s each (see Kling 3.0 docs). */
const KLING_MULTI_SHOT_SEC_MIN = 1;
const KLING_MULTI_SHOT_SEC_MAX = 12;
const KLING_MULTI_MAX_SHOTS = 5;

const KLING_SHOT_DURATION_OPTIONS = Array.from(
  { length: KLING_MULTI_SHOT_SEC_MAX - KLING_MULTI_SHOT_SEC_MIN + 1 },
  (_, i) => String(KLING_MULTI_SHOT_SEC_MIN + i),
);

type KlingShotRow = { id: string; prompt: string; durationSec: number };
type KlingElementDraft = {
  id: string;
  name: string;
  description: string;
  urls: string[];
  /** Pinned elements sort first in the list and persist in localStorage. */
  pinned?: boolean;
};

type ElementRefPickState =
  | { open: false }
  | {
      open: true;
      variant: "studio_image" | "studio_video_poster" | "lta_product";
      loading: boolean;
      studioItems: StudioHistoryItem[];
      ltaUrls: string[];
    };

function parseKlingElementDraftsFromJson(raw: string | null): KlingElementDraft[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    const out: KlingElementDraft[] = [];
    for (const row of j) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      const name = typeof o.name === "string" ? o.name : "";
      const description = typeof o.description === "string" ? o.description : "";
      if (!id || !name) continue;
      const urls = Array.isArray(o.urls)
        ? o.urls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
        : [];
      const pinned = o.pinned === true;
      out.push({ id, name, description, urls, ...(pinned ? { pinned: true } : {}) });
    }
    return out.slice(0, 8);
  } catch {
    return [];
  }
}

function sortKlingElementDrafts(drafts: KlingElementDraft[]): KlingElementDraft[] {
  return [...drafts].sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
}

/** Best-effort min size check for remote HTTPS images (CORS failures skip the check). */
function probeHttpsImageMinDimensions(url: string, minW: number, minH: number): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const tid = window.setTimeout(() => resolve(true), 10_000);
    img.onload = () => {
      window.clearTimeout(tid);
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        resolve(true);
        return;
      }
      resolve(img.naturalWidth >= minW && img.naturalHeight >= minH);
    };
    img.onerror = () => {
      window.clearTimeout(tid);
      resolve(true);
    };
    img.src = url;
  });
}
type SeedanceOmniRefItem = { kind: "image" | "video" | "audio"; url: string };

/** True if the prompt contains `@name` (case-insensitive) for Kling element references. */
function promptUsesKlingElementTag(prompt: string, elementName: string): boolean {
  const n = elementName.trim().toLowerCase();
  if (!n) return false;
  return prompt.toLowerCase().includes(`@${n}`);
}

type KlingElementPayloadRow = { name: string; description: string; element_input_urls: string[] };

/** Union of Seedance reference images for slot limits (start / compact strip / omni images + elements + end). */
function countUniqueSeedanceStudioRefs(opts: {
  startUrl: string | null | undefined;
  endUrl: string | null | undefined;
  compactUrls: string[];
  useCompact: boolean;
  omniItems: SeedanceOmniRefItem[];
  useOmni: boolean;
  elements: KlingElementPayloadRow[] | undefined;
}): number {
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const u = String(raw ?? "").trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
  };
  if (opts.useCompact && opts.compactUrls.length) {
    for (const u of opts.compactUrls) add(u);
  } else if (opts.useOmni && opts.omniItems.length) {
    for (const it of opts.omniItems) {
      if (it.kind === "image") add(it.url);
    }
  } else {
    add(opts.startUrl);
  }
  add(opts.endUrl);
  for (const el of opts.elements ?? []) {
    for (const u of el.element_input_urls) add(u);
  }
  return seen.size;
}

const KLING_ELEMENT_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const KLING_ELEMENT_MEDIA_MIN_PX = 300;

/** Kling 3.0: 2+ refs per element; Seedance: 1+ ref per element slot (provider rules). */
function minReferenceUrlsPerVideoElement(modelId: string): number {
  return modelId.startsWith("bytedance/seedance") ? 1 : 2;
}

async function imageFileMeetsMinDimensions(file: File, minW: number, minH: number): Promise<boolean> {
  if (!file.type.startsWith("image/")) return true;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve(img.naturalWidth >= minW && img.naturalHeight >= minH);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const STUDIO_VIDEO_LIBRARY_KIND_PARAM = STUDIO_VIDEO_TAB_KINDS.join(",");

type VideoTab = "create" | "edit";
type VideoPriority = "normal" | "vip";

type VideoModelId =
  | "kling-3.0/video"
  | "kling-2.6/video"
  | "openai/sora-2"
  | "openai/sora-2-pro"
  | "bytedance/seedance-2-preview"
  | "bytedance/seedance-2-fast-preview"
  | "bytedance/seedance-2"
  | "bytedance/seedance-2-fast"
  | "veo3_lite"
  | "veo3_fast"
  | "veo3";

type VideoFamily = "kie" | "veo" | "sora";

const SEEDANCE_STRICT_NO_FACE_MODELS: VideoModelId[] = [
  "bytedance/seedance-2",
  "bytedance/seedance-2-fast",
];

const SEEDANCE_AI_FACE_ONLY_MODELS: VideoModelId[] = [
  "bytedance/seedance-2-preview",
  "bytedance/seedance-2-fast-preview",
];

const SEEDANCE_PREVIEW_MODELS: VideoModelId[] = [
  "bytedance/seedance-2-preview",
  "bytedance/seedance-2-fast-preview",
];
const SEEDANCE_PREVIEW_POLL_MAX_ROUNDS = Math.ceil((12 * 60 * 60 * 1000) / 4000);

const MODEL_OPTIONS: { id: VideoModelId; label: string; family: VideoFamily }[] = [
  { id: "kling-3.0/video", label: "Kling 3.0", family: "kie" },
  { id: "kling-2.6/video", label: "Kling 2.6", family: "kie" },
  { id: "openai/sora-2", label: "Sora 2", family: "sora" },
  { id: "openai/sora-2-pro", label: "Sora 2 Pro", family: "sora" },
  { id: "bytedance/seedance-2-preview", label: "Seedance 2 Preview", family: "kie" },
  { id: "bytedance/seedance-2-fast-preview", label: "Seedance 2 Fast Preview", family: "kie" },
  { id: "bytedance/seedance-2", label: "Seedance 2", family: "kie" },
  { id: "bytedance/seedance-2-fast", label: "Seedance 2 Fast", family: "kie" },
  { id: "veo3_lite", label: "Veo 3.1 Lite", family: "veo" },
  { id: "veo3_fast", label: "Veo 3.1 Fast", family: "veo" },
  { id: "veo3", label: "Veo 3.1 Quality", family: "veo" },
];

const VIDEO_EDIT_MODEL_PICKER_ITEMS: StudioModelPickerItem[] = [
  {
    id: "studio-edit/kling-omni",
    label: "Kling 3.0 Omni Edit",
    icon: "kling",
    exclusive: true,
    resolution: "720p / 1080p",
    durationRange: "3–10s",
    searchText: "kling omni edit",
  },
  {
    id: "studio-edit/kling-o1",
    label: "Kling O1 Video Edit",
    icon: "kling",
    resolution: "720p / 1080p",
    durationRange: "3–10s",
    searchText: "kling o1 video edit",
  },
  {
    id: "studio-edit/motion",
    label: "Kling 3.0 Motion Control",
    icon: "kling",
    resolution: "720p / 1080p",
    durationRange: "3–30s (clip)",
    searchText: "motion control",
  },
  {
    id: "studio-edit/motion-v3",
    label: "Kling 3.0 Motion Control",
    icon: "kling",
    resolution: "720p / 1080p",
    durationRange: "3–30s (clip)",
    searchText: "kling 3 motion",
  },
  {
    id: "studio-edit/grok",
    label: "Grok Imagine Edit",
    icon: "grok",
    resolution: "720p / 1080p",
    durationRange: "3–10s",
    searchText: "grok imagine",
  },
];

const VIDEO_MODEL_PICKER_ITEMS: StudioModelPickerItem[] = [
  {
    id: "kling-3.0/video",
    label: "Kling 3.0",
    icon: "kling",
    exclusive: true,
    hasAudio: true,
    resolution: "720p / 1080p",
    durationRange: studioVideoDurationRangeLabel("kling-3.0/video"),
  },
  {
    id: "kling-2.6/video",
    label: "Kling 2.6",
    icon: "kling",
    hasAudio: true,
    resolution: "720p / 1080p",
    durationRange: studioVideoDurationRangeLabel("kling-2.6/video"),
  },
  {
    id: "openai/sora-2",
    label: "Sora 2",
    icon: "sora",
    resolution: "Standard / stable",
    durationRange: studioVideoDurationRangeLabel("openai/sora-2"),
  },
  {
    id: "openai/sora-2-pro",
    label: "Sora 2 Pro",
    icon: "sora",
    resolution: "Standard / high",
    durationRange: studioVideoDurationRangeLabel("openai/sora-2-pro"),
  },
  {
    id: "bytedance/seedance-2-preview",
    label: "Seedance 2 Preview",
    subtitle: "Early access, longer wait",
    icon: "seedance",
    newBadge: true,
    resolution: "9:16 / 16:9 / 1:1",
    durationRange: studioVideoDurationRangeLabel("bytedance/seedance-2-preview"),
    searchText: "seedance preview provider bytedance",
  },
  {
    id: "bytedance/seedance-2-fast-preview",
    label: "Seedance 2 Fast Preview",
    subtitle: "Fast, lower cost",
    icon: "seedance",
    resolution: "9:16 / 16:9 / 1:1",
    durationRange: studioVideoDurationRangeLabel("bytedance/seedance-2-fast-preview"),
    searchText: "seedance fast preview provider",
  },
  {
    id: "bytedance/seedance-2",
    label: "Seedance 2",
    subtitle: "Pro, higher quality",
    icon: "seedance",
    resolution: "9:16 / 16:9 / 1:1",
    durationRange: studioVideoDurationRangeLabel("bytedance/seedance-2"),
    searchText: "seedance 2 pro piapi",
  },
  {
    id: "bytedance/seedance-2-fast",
    label: "Seedance 2 Fast",
    subtitle: "Fast, lower cost",
    icon: "seedance",
    resolution: "9:16 / 16:9 / 1:1",
    durationRange: studioVideoDurationRangeLabel("bytedance/seedance-2-fast"),
    searchText: "seedance 2 fast piapi",
  },
  {
    id: "veo3_lite",
    label: "Veo 3.1 Lite",
    subtitle: "Lowest cost",
    icon: "veo",
    resolution: "9:16 / 16:9 / Auto",
    durationRange: studioVideoDurationRangeLabel("veo3_lite"),
    searchText: "veo google lite",
  },
  {
    id: "veo3_fast",
    label: "Veo 3.1 Fast",
    icon: "veo",
    resolution: "9:16 / 16:9 / Auto",
    durationRange: studioVideoDurationRangeLabel("veo3_fast"),
    searchText: "veo google fast",
  },
  {
    id: "veo3",
    label: "Veo 3.1 Quality",
    icon: "veo",
    resolution: "9:16 / 16:9 / Auto",
    durationRange: studioVideoDurationRangeLabel("veo3"),
    searchText: "veo google quality flagship",
  },
];

/** First allowed Edit picker when plan changes. */
const VIDEO_EDIT_PICKER_ACCESS_ORDER = [...STUDIO_VIDEO_EDIT_PICKER_IDS];

/** Cheapest first; used to pick a valid model after plan change. */
const VIDEO_MODEL_ACCESS_ORDER: VideoModelId[] = [
  "kling-2.6/video",
  "bytedance/seedance-2-fast-preview",
  "bytedance/seedance-2-fast",
  "bytedance/seedance-2-preview",
  "bytedance/seedance-2",
  "kling-3.0/video",
  "veo3_lite",
  "veo3_fast",
  "veo3",
  "openai/sora-2",
  "openai/sora-2-pro",
];

async function uploadStudioMediaFile(file: File, kind: UploadFileKind): Promise<string> {
  return uploadFileToCdn(file, { kind });
}

function isMotionEditPicker(id: string): boolean {
  return id === "studio-edit/motion" || id === "studio-edit/motion-v3";
}

function VideoUploadSlot({
  url,
  posterUrl,
  uploading,
  onPick,
  onClear,
  disabled,
  requiredLabel,
  hint,
  onDurationSec,
}: {
  url: string | null;
  /** Local blob URL for preview while uploading or before remote URL. */
  posterUrl?: string | null;
  uploading?: boolean;
  onPick: () => void;
  onClear: () => void;
  disabled?: boolean;
  requiredLabel: string;
  hint: string;
  onDurationSec?: (sec: number | null) => void;
}) {
  const hosted = url?.trim() ?? "";
  const displaySrc = (hosted || posterUrl || "").trim() || null;
  const isBlobPreview = Boolean(displaySrc?.startsWith("blob:"));

  if (!displaySrc) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        className="relative flex min-h-[120px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-[#0c0c10] text-white/50 transition hover:border-violet-400/40 hover:bg-white/[0.03] disabled:opacity-50"
      >
        <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.06]">
          <VideoIcon className="h-6 w-6 opacity-60" />
        </span>
        <span className="px-3 text-center text-sm font-semibold text-white/85">{requiredLabel}</span>
        <span className="mt-1 px-3 text-center text-xs text-white/40">{hint}</span>
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/15 bg-black">
      <div className="relative aspect-video max-h-[min(48vh,380px)] w-full bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          key={displaySrc}
          src={displaySrc}
          className="absolute inset-0 h-full w-full object-contain"
          controls
          playsInline
          preload={hosted ? "metadata" : "auto"}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget.duration;
            const n = Number(v);
            if (!Number.isFinite(n) || n <= 0) onDurationSec?.(null);
            else onDurationSec?.(n);
          }}
          onLoadedData={(e) => {
            if (!isBlobPreview) return;
            const v = e.currentTarget;
            try {
              if (v.readyState < 2) return;
              const d = v.duration;
              const t =
                Number.isFinite(d) && d > 0
                  ? Math.min(0.12, Math.max(0.02, d * 0.02))
                  : 0.05;
              v.currentTime = t;
            } catch {
              /* ignore seek errors */
            }
          }}
        />
        <UploadBusyOverlay active={Boolean(uploading)} className="rounded-t-xl" />
      </div>
      <div className="flex gap-2 border-t border-white/10 bg-[#0c0c10] p-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          className="h-9 flex-1 rounded-lg border border-white/15 bg-white/5 text-xs text-white/85 hover:bg-white/10"
          onClick={onPick}
        >
          Replace
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          className="h-9 rounded-lg border border-red-400/25 bg-red-500/15 text-xs text-red-100 hover:bg-red-500/25"
          onClick={onClear}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

function ElementsUploadZone({
  urls,
  max,
  onAdd,
  onRemove,
  disabled,
  pendingPreviewUrl,
  pendingUploading,
}: {
  urls: string[];
  max: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
  pendingPreviewUrl?: string | null;
  pendingUploading?: boolean;
}) {
  return (
    <div className="relative rounded-xl border border-dashed border-white/20 bg-[#0c0c10] p-3">
      <span className="absolute right-2 top-2 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
        Optional
      </span>
      {urls.length === 0 && !pendingPreviewUrl ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          className="flex min-h-[120px] w-full flex-col items-center justify-center text-white/50 transition hover:text-white/70 disabled:opacity-50"
        >
          <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.06]">
            <CirclePlus className="h-6 w-6 opacity-60" />
          </span>
          <span className="text-sm font-semibold text-white/85">Upload images &amp; elements</span>
          <span className="mt-1 text-xs text-white/40">Up to {max} images or elements</span>
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-2 pt-6">
          {urls.map((u, i) => (
            <button
              key={`${u}-${i}`}
              type="button"
              disabled={disabled}
              onClick={() => onRemove(i)}
              className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
                Tap to remove
              </span>
            </button>
          ))}
          {pendingPreviewUrl ? (
            <div className="relative aspect-video overflow-hidden rounded-lg border border-violet-500/30 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingPreviewUrl} alt="" className="h-full w-full object-cover" />
              <UploadBusyOverlay active={Boolean(pendingUploading)} />
            </div>
          ) : null}
          {urls.length < max && !pendingPreviewUrl ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onAdd}
              className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-white/20 text-white/40 hover:border-violet-400/35 hover:text-white/60 disabled:opacity-50"
            >
              <CirclePlus className="h-8 w-8" />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FrameSlot({
  label,
  optional,
  url,
  previewUrl,
  uploading,
  onPick,
  onClear,
  disabled,
  avatarLibraryBadge,
  onAvatarBadgeClick,
}: {
  label: string;
  optional?: boolean;
  url: string | null;
  /** Local blob preview while uploading */
  previewUrl?: string | null;
  uploading?: boolean;
  onPick: () => void;
  onClear: () => void;
  disabled?: boolean;
  /** Avatar-library shortcut in the corner */
  avatarLibraryBadge?: boolean;
  /** Opens avatar picker without triggering file upload / clear */
  onAvatarBadgeClick?: () => void;
}) {
  const display = url || previewUrl;
  const activateSlot = () => {
    if (disabled) return;
    if (display) onClear();
    else onPick();
  };
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={activateSlot}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          activateSlot();
        }
      }}
      className={cn(
        "relative flex aspect-[5/4] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-[#0c0c10] text-white/50 transition hover:border-violet-400/40 hover:bg-white/[0.03]",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      {avatarLibraryBadge ? (
        <AvatarInputCornerBadge
          align={optional ? "left" : "right"}
          onClick={onAvatarBadgeClick}
          disabled={disabled}
        />
      ) : null}
      {optional ? (
        <span className="absolute right-2 top-2 z-[1] rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
          Optional
        </span>
      ) : null}
      {display ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={display} alt="" className="absolute inset-0 h-full w-full rounded-xl object-cover" />
          <UploadBusyOverlay active={Boolean(uploading)} />
        </>
      ) : (
        <>
          <ImageIcon className="mb-2 h-8 w-8 opacity-50" />
          <span className="text-xs font-medium text-white/45">{label}</span>
        </>
      )}
      {display ? (
        <span className="absolute bottom-2 z-[1] rounded-md bg-black/70 px-2 py-1 text-[10px] text-white">Tap to remove</span>
      ) : null}
    </div>
  );
}

/** Aspect label for history thumbnails (Veo “Auto” → 16:9 display default). */
function videoHistoryAspectLabel(family: string, aspect: string, veoAspect: string): string {
  if (family === "veo") {
    if (veoAspect === "16:9" || veoAspect === "9:16") return veoAspect;
    return "16:9";
  }
  return aspect;
}

function isSeedancePreviewModelId(id: string): boolean {
  return id === "bytedance/seedance-2-preview" || id === "bytedance/seedance-2-fast-preview";
}

/** PiAPI preview queue: VIP uses distinct `task_type` via `marketModel` on POST /api/kling/generate. */
function seedancePreviewMarketModelForApi(pickerId: string, priority: VideoPriority): string {
  if (priority !== "vip") return pickerId;
  if (pickerId === "bytedance/seedance-2-preview") return "bytedance/seedance-2-preview-vip";
  if (pickerId === "bytedance/seedance-2-fast-preview") return "bytedance/seedance-2-fast-preview-vip";
  return pickerId;
}

async function registerStudioTask(params: {
  kind: "studio_video";
  label: string;
  taskId: string;
  provider?: string;
  /** Video market model id, edit picker id, or `motion_control`. */
  model?: string;
  creditsCharged: number;
  personalApiKey?: string;
  inputUrls?: string[];
  aspectRatio?: string;
}): Promise<string | undefined> {
  try {
    const res = await fetch("/api/studio/generations/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...params,
        piapiApiKey: getPersonalPiapiApiKey() ?? undefined,
      }),
    });
    if (!res.ok) {
      console.error("[registerStudioTask] server returned", res.status, await res.text().catch(() => ""));
      return undefined;
    }
    const json = (await res.json()) as { data?: { rows?: { id?: string }[] } };
    const id = json.data?.rows?.[0]?.id;
    return typeof id === "string" && id.trim() ? id.trim() : undefined;
  } catch (err) {
    console.error("[registerStudioTask] network error", err);
    return undefined;
  }
}

export default function StudioVideoPanel({
  onChangeVoice,
}: {
  onChangeVoice?: (item: import("@/app/_components/StudioGenerationsHistory").StudioHistoryItem) => void;
}) {
  const { planId, current: creditsBalance, spendCredits, grantCredits } = useCreditsPlan();
  const [serverHistory, setServerHistory] = useState<boolean | null>(null);
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;

  const [tab, setTab] = useState<VideoTab>("create");
  const [startUrl, setStartUrl] = useState<string | null>(null);
  const [endUrl, setEndUrl] = useState<string | null>(null);
  /** Seedance Preview / Fast Preview: 1–4 uploaded refs (replaces start/end frames). */
  const [seedanceCompactRefUrls, setSeedanceCompactRefUrls] = useState<string[]>([]);
  const [seedanceCompactUploadBusy, setSeedanceCompactUploadBusy] = useState(false);
  const seedanceCompactFileRef = useRef<HTMLInputElement>(null);
  /** Seedance 2 / Fast: omni_reference media strip (images, MP4/MOV, MP3/WAV). */
  const [seedanceProOmniItems, setSeedanceProOmniItems] = useState<SeedanceOmniRefItem[]>([]);
  const [seedanceProOmniUploadBusy, setSeedanceProOmniUploadBusy] = useState(false);
  const seedanceProOmniFileRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [multiShot, setMultiShot] = useState(false);
  /** Kling 3.0 multi-shot: per-shot prompts via provider `multi_prompt`. */
  const [klingShots, setKlingShots] = useState<KlingShotRow[]>([
    { id: "shot-1", prompt: "", durationSec: 3 },
  ]);
  const [klingElementDrafts, setKlingElementDrafts] = useState<KlingElementDraft[]>([]);
  const [klingElementsModalOpen, setKlingElementsModalOpen] = useState(false);
  /** Working row for the Create element dialog (add or edit). */
  const [klingElementForm, setKlingElementForm] = useState<KlingElementDraft | null>(null);
  const [klingElementUploadBusy, setKlingElementUploadBusy] = useState(false);
  const klingElementFileRef = useRef<HTMLInputElement>(null);
  const klingElementUploadRowIdRef = useRef<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  /** Set to `true` to lock UI to a single model (e.g. maintenance). */
  const HIDE_VIDEO_MODEL_PICKER = false;
  /** Temporarily hide Video → Edit tab (edit models unavailable). */
  const HIDE_VIDEO_EDIT_TAB = true;
  const FORCED_VIDEO_MODEL_ID: VideoModelId = "openai/sora-2";
  const [modelId, setModelId] = useState<VideoModelId>(VIDEO_MODEL_ACCESS_ORDER[0]!);
  const [videoPriority, setVideoPriority] = useState<VideoPriority>("normal");
  const [duration, setDuration] = useState("10");
  const [aspect, setAspect] = useState("9:16");
  const [klingMode, setKlingMode] = useState<"std" | "pro">("std");
  const [veoAspect, setVeoAspect] = useState<"16:9" | "9:16" | "Auto">("9:16");
  /** Start/end frame uploads only; does not block Generate. */
  const [frameUploadBusy, setFrameUploadBusy] = useState(false);
  const [startFramePreviewBlob, setStartFramePreviewBlob] = useState<string | null>(null);
  const [endFramePreviewBlob, setEndFramePreviewBlob] = useState<string | null>(null);
  const [frameUploadSlot, setFrameUploadSlot] = useState<"start" | "end" | null>(null);
  /** Widen the history / preview column on large screens (not fullscreen). */
  const [wideVideoPreview, setWideVideoPreview] = useState(false);
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);

  const mergeServerWithLocal = useCallback(
    (serverItems: StudioHistoryItem[], prev: StudioHistoryItem[]) =>
      mergeStudioHistoryWithServer(serverItems, prev),
    [],
  );

  const retireInFlightJob = useCallback((_jobId: string, _doneId: string) => {
    // no-op: time-based merge now handles optimistic retention
  }, []);
  const grantCreditsRef = useRef(grantCredits);
  grantCreditsRef.current = grantCredits;

  // Seed historyItems from localStorage on mount so videos appear immediately and
  // survive across reloads even when the server DB write was silently dropped.
  // Must be declared before the server-fetch effect so it runs first.
  useEffect(() => {
    setHistoryItems((prev) => {
      if (prev.length > 0) return prev;
      return readStudioHistoryLocal(LS_STUDIO_VIDEO_HISTORY);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_STUDIO_VIDEO_ELEMENTS_V1) : null;
      const parsed = parseKlingElementDraftsFromJson(raw);
      if (!cancelled && parsed.length) setKlingElementDrafts(sortKlingElementDrafts(parsed));
    } catch {
      /* ignore */
    } finally {
      if (!cancelled) videoElementsLoadedRef.current = true;
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!videoElementsLoadedRef.current) return;
    try {
      window.localStorage.setItem(LS_STUDIO_VIDEO_ELEMENTS_V1, JSON.stringify(klingElementDrafts));
    } catch {
      /* ignore */
    }
  }, [klingElementDrafts]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/studio/generations?kind=${encodeURIComponent(STUDIO_VIDEO_LIBRARY_KIND_PARAM)}`,
        { cache: "no-store" },
      );
      if (res.status === 401) {
        setServerHistory(false);
        // Do NOT wipe historyItems, keep the localStorage seed so the user's
        // previously generated videos remain visible until they re-authenticate.
        return;
      }
      if (!res.ok) {
        setServerHistory(false);
        // On server error, merge localStorage into current state (already seeded on mount)
        // rather than overwriting, to preserve optimistic items from this session.
        setHistoryItems((prev) => {
          const local = readStudioHistoryLocal(LS_STUDIO_VIDEO_HISTORY);
          if (!local.length) return prev;
          if (!prev.length) return local;
          const existingIds = new Set(prev.map((i) => i.id));
          const extra = local.filter((i) => !existingIds.has(i.id));
          if (!extra.length) return prev;
          return [...prev, ...extra].sort((a, b) => b.createdAt - a.createdAt);
        });
        return;
      }
      const json = (await res.json()) as { data?: StudioHistoryItem[]; refundHints?: { jobId: string; credits: number }[] };
      setServerHistory(true);
      const serverItems = json.data ?? [];
      setHistoryItems((prev) => mergeServerWithLocal(serverItems, prev));
      const hints = json.refundHints ?? [];
      if (hints.length) {
        for (const h of hints) {
          if (h.credits > 0) grantCreditsRef.current(h.credits);
        }
        toast.message("Credits refunded", { description: "A studio generation failed after charge." });
      }
    })();
  }, [mergeServerWithLocal]);

  useEffect(() => {
    if (serverHistory !== true) return;

    const tick = () => {
      void (async () => {
        const res = await fetch("/api/studio/generations/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: STUDIO_VIDEO_LIBRARY_KIND_PARAM,
            personalApiKey: getPersonalApiKey() ?? undefined,
            piapiApiKey: getPersonalPiapiApiKey() ?? undefined,
          }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: StudioHistoryItem[]; refundHints?: { jobId: string; credits: number }[] };
        if (Array.isArray(json.data)) {
          setHistoryItems((prev) => mergeServerWithLocal(json.data!, prev));
        }
        const hints = json.refundHints ?? [];
        if (hints.length) {
          for (const h of hints) {
            if (h.credits > 0) grantCreditsRef.current(h.credits);
          }
          toast.message("Credits refunded", { description: "A studio generation failed after charge." });
        }
      })();
    };

    tick();
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [serverHistory, mergeServerWithLocal]);

  useEffect(() => {
    if (serverHistory === null) return;
    writeStudioHistoryLocal(LS_STUDIO_VIDEO_HISTORY, historyItems);
  }, [serverHistory, historyItems]);

  type VideoBilling =
    | { open: false }
    | { open: true; reason: "plan"; blockedId: string; studioMode: "video" | "video_edit" }
    | { open: true; reason: "credits"; required: number; studioMode: "video" | "video_edit" };
  const [billing, setBilling] = useState<VideoBilling>({ open: false });

  const [editPickerId, setEditPickerId] = useState<string>("studio-edit/kling-o1");
  const [editVideoUrl, setEditVideoUrl] = useState<string | null>(null);
  const [editVideoBlobUrl, setEditVideoBlobUrl] = useState<string | null>(null);
  const [editVideoDurationSec, setEditVideoDurationSec] = useState<number | null>(null);
  const [editElementUrls, setEditElementUrls] = useState<string[]>([]);
  const [editPrompt, setEditPrompt] = useState("");
  const [editAutoSettings, setEditAutoSettings] = useState(true);
  const [editKlingMode, setEditKlingMode] = useState<"std" | "pro">("pro");
  /** Motion `background_source` (video backdrop vs still backdrop). */
  const [editSceneBackground, setEditSceneBackground] = useState<"input_video" | "input_image">(
    "input_video",
  );
  const [editMotionImageUrl, setEditMotionImageUrl] = useState<string | null>(null);
  const [editMotionVideoUrl, setEditMotionVideoUrl] = useState<string | null>(null);
  const [editMotionVideoBlobUrl, setEditMotionVideoBlobUrl] = useState<string | null>(null);
  const [editMotionDurationSec, setEditMotionDurationSec] = useState<number | null>(null);
  const [editUploadBusy, setEditUploadBusy] = useState(false);
  const [motionCharPreviewBlob, setMotionCharPreviewBlob] = useState<string | null>(null);
  const [elementUploadPreviewBlob, setElementUploadPreviewBlob] = useState<string | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<string[]>([]);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarPickTarget, setAvatarPickTarget] = useState<
    "create_start" | "create_end" | "edit_motion" | "edit_elements" | "kling_element"
  >("create_start");
  const [elementRefPick, setElementRefPick] = useState<ElementRefPickState>({ open: false });
  const videoElementsLoadedRef = useRef(false);

  const meta = MODEL_OPTIONS.find((m) => m.id === modelId)!;
  const compactSeedanceRefUploads = studioVideoUsesSeedanceCompactReferenceUploads(modelId);
  const seedanceProOmniRefUploads = studioVideoUsesSeedanceProOmniMediaUploads(modelId);
  const isSeedanceStrictNoFaceModel = SEEDANCE_STRICT_NO_FACE_MODELS.includes(modelId);
  const isSeedanceAiFaceOnlyModel = SEEDANCE_AI_FACE_ONLY_MODELS.includes(modelId);
  const isSeedancePreviewModel = SEEDANCE_PREVIEW_MODELS.includes(modelId);
  const seedanceFacePolicyHint = isSeedanceStrictNoFaceModel
    ? "Face input not allowed, even AI"
    : isSeedanceAiFaceOnlyModel
      ? "Only AI faces allowed, no real faces"
      : null;
  const seedancePriorityInfoText =
    "VIP pricing is x2 credits per generation.\n\nPeak hours: From 09:00 to 15:00 GMT, Seedance Preview experiences high traffic. During this period, queue times may extend to several hours.\n\nCurrently outside peak hours: Normal is usually 5-60 min. VIP (fast) is usually 3-5 min.";
  /** Saved elements whose @name appears in the prompt — shown as thumbnail chips above the prompt. */
  const promptElementTagDrafts = useMemo(() => {
    const re = /@([a-zA-Z0-9_]+)\b/g;
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    const p = prompt;
    while ((m = re.exec(p)) !== null) {
      found.add(m[1]!.toLowerCase());
    }
    return klingElementDrafts.filter((d) => {
      const n = d.name.trim().toLowerCase();
      return Boolean(n && found.has(n) && d.urls[0]?.trim());
    });
  }, [prompt, klingElementDrafts]);
  /** Preview Seedance models need a start image; Seedance 2 / Fast support text-only. */
  const startFrameOptional =
    meta.family === "veo" ||
    meta.family === "sora" ||
    modelId === "kling-3.0/video" ||
    modelId === "kling-2.6/video" ||
    studioVideoIsSeedance2ProPickerId(modelId);
  const durationChoices = studioVideoDurationSecOptions(modelId);

  const klingCustomMulti = modelId === "kling-3.0/video" && multiShot;
  const klingMultiTotalSec = useMemo(
    () => klingShots.reduce((a, s) => a + s.durationSec, 0),
    [klingShots],
  );
  const billingDurationSec = klingCustomMulti ? klingMultiTotalSec : Number(duration);

  const baseCredits = useMemo(
    () =>
      calculateVideoCredits({
        modelId,
        duration: billingDurationSec,
        audio: soundOn,
        quality: klingMode,
      }),
    [modelId, billingDurationSec, soundOn, klingMode],
  );
  const credits = useMemo(
    () => (videoPriority === "vip" ? baseCredits * 2 : baseCredits),
    [baseCredits, videoPriority],
  );

  useEffect(() => {
    if (!klingCustomMulti) return;
    setEndUrl(null);
    setEndFramePreviewBlob((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, [klingCustomMulti]);

  useEffect(() => {
    const compact = studioVideoUsesSeedanceCompactReferenceUploads(modelId);
    const proOmni = studioVideoUsesSeedanceProOmniMediaUploads(modelId);
    if (compact) {
      setStartUrl(null);
      setEndUrl(null);
      setStartFramePreviewBlob((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      setEndFramePreviewBlob((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      setSeedanceProOmniItems([]);
      setKlingElementForm(null);
      setKlingElementsModalOpen(false);
    } else if (proOmni) {
      setStartUrl(null);
      setEndUrl(null);
      setStartFramePreviewBlob((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      setEndFramePreviewBlob((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      setSeedanceCompactRefUrls([]);
      setKlingElementForm(null);
      setKlingElementsModalOpen(false);
    } else {
      setSeedanceCompactRefUrls([]);
      setSeedanceProOmniItems([]);
    }
  }, [modelId]);

  const motionEdit = isMotionEditPicker(editPickerId);
  const editCredits = useMemo(
    () =>
      calculateStudioVideoEditCredits({
        editPickerId,
        editDurationSec: editVideoDurationSec ?? 10,
        motionDurationSec: editMotionDurationSec ?? 0,
        quality: editKlingMode,
        autoSettings: editAutoSettings,
      }),
    [editPickerId, editVideoDurationSec, editMotionDurationSec, editKlingMode, editAutoSettings],
  );

  useEffect(() => {
    if (!HIDE_VIDEO_MODEL_PICKER) return;
    if (modelId !== FORCED_VIDEO_MODEL_ID) setModelId(FORCED_VIDEO_MODEL_ID);
    const choices = studioVideoDurationSecOptions(FORCED_VIDEO_MODEL_ID);
    if (!choices.includes(duration)) setDuration(choices[0] ?? "10");
  }, [HIDE_VIDEO_MODEL_PICKER, modelId, duration]);

  useEffect(() => {
    if (HIDE_VIDEO_EDIT_TAB && tab === "edit") setTab("create");
  }, [HIDE_VIDEO_EDIT_TAB, tab]);

  useEffect(() => {
    if (canUseStudioVideoModel(planId, modelId)) return;
    const next = VIDEO_MODEL_ACCESS_ORDER.find((id) => canUseStudioVideoModel(planId, id));
    if (!next) return;
    setModelId(next);
    const choices = studioVideoDurationSecOptions(next);
    setDuration(choices[0] ?? "5");
  }, [planId, modelId]);

  useEffect(() => {
    if (canUseStudioVideoEditPicker(planId, editPickerId)) return;
    const next = VIDEO_EDIT_PICKER_ACCESS_ORDER.find((id) => canUseStudioVideoEditPicker(planId, id));
    if (next) setEditPickerId(next);
  }, [planId, editPickerId]);

  useEffect(() => {
    return () => {
      if (editVideoBlobUrl?.startsWith("blob:")) URL.revokeObjectURL(editVideoBlobUrl);
    };
  }, [editVideoBlobUrl]);

  useEffect(() => {
    return () => {
      if (editMotionVideoBlobUrl?.startsWith("blob:")) URL.revokeObjectURL(editMotionVideoBlobUrl);
    };
  }, [editMotionVideoBlobUrl]);

  useEffect(() => {
    return () => {
      if (startFramePreviewBlob?.startsWith("blob:")) URL.revokeObjectURL(startFramePreviewBlob);
    };
  }, [startFramePreviewBlob]);

  useEffect(() => {
    return () => {
      if (endFramePreviewBlob?.startsWith("blob:")) URL.revokeObjectURL(endFramePreviewBlob);
    };
  }, [endFramePreviewBlob]);

  useEffect(() => {
    return () => {
      if (motionCharPreviewBlob?.startsWith("blob:")) URL.revokeObjectURL(motionCharPreviewBlob);
    };
  }, [motionCharPreviewBlob]);

  useEffect(() => {
    return () => {
      if (elementUploadPreviewBlob?.startsWith("blob:")) URL.revokeObjectURL(elementUploadPreviewBlob);
    };
  }, [elementUploadPreviewBlob]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const urls = await loadAvatarUrls();
      if (!cancelled) setAvatarUrls(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [historyItems]);

  const pickFrame = useCallback((which: "start" | "end") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = STUDIO_IMAGE_FILE_ACCEPT;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const blobUrl = URL.createObjectURL(f);
      setFrameUploadSlot(which);
      if (which === "start") {
        setStartFramePreviewBlob((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return blobUrl;
        });
      } else {
        setEndFramePreviewBlob((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return blobUrl;
        });
      }
      setFrameUploadBusy(true);
      try {
        const u = await uploadStudioMediaFile(f, "image");
        if (which === "start") setStartUrl(u);
        else setEndUrl(u);
        toast.success("Frame uploaded");
      } catch (e) {
        toast.error("Upload failed", {
          description: userMessageFromCaughtError(e, "Use JPEG, PNG, WebP, or GIF."),
        });
      } finally {
        URL.revokeObjectURL(blobUrl);
        if (which === "start") setStartFramePreviewBlob(null);
        else setEndFramePreviewBlob(null);
        setFrameUploadBusy(false);
        setFrameUploadSlot(null);
      }
    };
    input.click();
  }, []);

  const pickKlingElementImage = useCallback((rowId: string) => {
    klingElementUploadRowIdRef.current = rowId;
    klingElementFileRef.current?.click();
  }, []);

  const handleKlingElementsModalOpenChange = useCallback((open: boolean) => {
    setKlingElementsModalOpen(open);
    if (!open) setKlingElementForm(null);
  }, []);

  const openKlingElementsModal = useCallback(() => {
    if (klingElementDrafts.length >= 3) {
      setKlingElementForm(null);
    } else if (klingElementDrafts.length === 0) {
      setKlingElementForm({
        id: crypto.randomUUID(),
        name: "element_1",
        description: "",
        urls: [],
      });
    } else {
      setKlingElementForm(null);
    }
    setKlingElementsModalOpen(true);
  }, [klingElementDrafts.length]);

  const editKlingElementInModal = useCallback((el: KlingElementDraft) => {
    setKlingElementForm({ ...el, urls: [...el.urls] });
    setKlingElementsModalOpen(true);
  }, []);

  const removeKlingElementDraft = useCallback((id: string) => {
    setKlingElementDrafts((prev) => prev.filter((d) => d.id !== id));
    setKlingElementForm((form) => (form?.id === id ? null : form));
  }, []);

  const saveKlingElementForm = useCallback(() => {
    if (!klingElementForm) return;
    const name = klingElementForm.name.trim();
    if (!name) {
      toast.error("Name required", { description: "Enter an element name." });
      return;
    }
    const minUrls = minReferenceUrlsPerVideoElement(modelId);
    const urlCount = klingElementForm.urls.length;
    if (urlCount < minUrls || urlCount > 4) {
      toast.error("Media required", {
        description:
          minUrls <= 1
            ? "Add 1–4 reference images for this element."
            : "Add 2–4 reference images (required by Kling 3.0 for element references).",
      });
      return;
    }
    if (modelId === "kling-3.0/video" && !klingElementForm.description.trim()) {
      toast.error("Description required", {
        description: "Kling 3.0 needs a description for each element reference.",
      });
      return;
    }
    const id = klingElementForm.id;
    const isEdit = klingElementDrafts.some((d) => d.id === id);
    if (!isEdit && klingElementDrafts.length >= 3) {
      toast.error("Maximum 3 elements", { description: "Remove an element to add another." });
      return;
    }
    const committed: KlingElementDraft = {
      ...klingElementForm,
      name,
      description: klingElementForm.description.trim(),
    };
    const next = sortKlingElementDrafts(
      isEdit ? klingElementDrafts.map((d) => (d.id === id ? committed : d)) : [...klingElementDrafts, committed],
    );
    setKlingElementDrafts(next);
    toast.success(isEdit ? "Element updated" : "Element saved");
    if (next.length >= 3) {
      setKlingElementsModalOpen(false);
      setKlingElementForm(null);
    } else {
      setKlingElementForm({
        id: crypto.randomUUID(),
        name: `element_${next.length + 1}`,
        description: "",
        urls: [],
      });
    }
  }, [klingElementForm, klingElementDrafts, modelId]);

  const onKlingElementFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const rowId = klingElementUploadRowIdRef.current;
    e.target.value = "";
    if (!file || !rowId) return;
    if (file.size > KLING_ELEMENT_MEDIA_MAX_BYTES) {
      toast.error("File too large", { description: "Each image must be 10MB or less." });
      klingElementUploadRowIdRef.current = null;
      return;
    }
    const dimsOk = await imageFileMeetsMinDimensions(
      file,
      KLING_ELEMENT_MEDIA_MIN_PX,
      KLING_ELEMENT_MEDIA_MIN_PX,
    );
    if (!dimsOk) {
      toast.error("Image too small", {
        description: `Use images at least ${KLING_ELEMENT_MEDIA_MIN_PX}×${KLING_ELEMENT_MEDIA_MIN_PX}px.`,
      });
      klingElementUploadRowIdRef.current = null;
      return;
    }
    setKlingElementUploadBusy(true);
    try {
      const u = await uploadStudioMediaFile(file, "image");
      setKlingElementForm((prev) => {
        if (!prev || prev.id !== rowId || prev.urls.length >= 4) return prev;
        return { ...prev, urls: [...prev.urls, u] };
      });
      toast.success("Image added");
    } catch (err) {
      toast.error("Upload failed", {
        description: userMessageFromCaughtError(err, "Use JPEG, PNG, WebP, or GIF."),
      });
    } finally {
      setKlingElementUploadBusy(false);
      klingElementUploadRowIdRef.current = null;
    }
  }, []);

  const onSeedanceCompactFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > KLING_ELEMENT_MEDIA_MAX_BYTES) {
      toast.error("File too large", { description: "Each image must be 10MB or less." });
      return;
    }
    const dimsOk = await imageFileMeetsMinDimensions(
      file,
      KLING_ELEMENT_MEDIA_MIN_PX,
      KLING_ELEMENT_MEDIA_MIN_PX,
    );
    if (!dimsOk) {
      toast.error("Image too small", {
        description: `Use images at least ${KLING_ELEMENT_MEDIA_MIN_PX}×${KLING_ELEMENT_MEDIA_MIN_PX}px.`,
      });
      return;
    }
    setSeedanceCompactUploadBusy(true);
    try {
      const u = await uploadStudioMediaFile(file, "image");
      setSeedanceCompactRefUrls((prev) =>
        prev.length >= SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS ? prev : [...prev, u],
      );
      toast.success("Image added");
    } catch (err) {
      toast.error("Upload failed", {
        description: userMessageFromCaughtError(err, "Use JPEG, PNG, WebP, or GIF."),
      });
    } finally {
      setSeedanceCompactUploadBusy(false);
    }
  }, []);

  const onSeedanceProOmniFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (seedanceProOmniItems.length >= SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS) return;

    const inferred = inferStudioUploadKind(file);
    let kind: UploadFileKind = inferred;
    try {
      if (inferred === "image") {
        assertStudioImageUpload(file);
        if (file.size > KLING_ELEMENT_MEDIA_MAX_BYTES) {
          toast.error("File too large", { description: "Each image must be 10MB or less." });
          return;
        }
        const dimsOk = await imageFileMeetsMinDimensions(
          file,
          KLING_ELEMENT_MEDIA_MIN_PX,
          KLING_ELEMENT_MEDIA_MIN_PX,
        );
        if (!dimsOk) {
          toast.error("Image too small", {
            description: `Use images at least ${KLING_ELEMENT_MEDIA_MIN_PX}×${KLING_ELEMENT_MEDIA_MIN_PX}px.`,
          });
          return;
        }
      } else if (inferred === "video") {
        const ext = fileExtensionLower(file);
        const mime = file.type || "";
        const okProVideo =
          ext === ".mp4" ||
          ext === ".mov" ||
          mime === "video/mp4" ||
          mime === "video/quicktime";
        if (!okProVideo) {
          toast.error("Video format", {
            description: "Seedance 2 reference videos must be MP4 or MOV (not WebM).",
          });
          return;
        }
        assertStudioVideoUpload(file);
        kind = "video";
      } else {
        assertStudioAudioUpload(file);
        kind = "audio";
      }
    } catch (err) {
      toast.error("Invalid file", {
        description: err instanceof Error ? err.message : "Choose another file.",
      });
      return;
    }

    setSeedanceProOmniUploadBusy(true);
    try {
      const u = await uploadStudioMediaFile(file, kind);
      setSeedanceProOmniItems((prev) =>
        prev.length >= SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS
          ? prev
          : [...prev, { kind: inferred === "image" ? "image" : inferred === "video" ? "video" : "audio", url: u }],
      );
      toast.success("Media added");
    } catch (err) {
      toast.error("Upload failed", {
        description: userMessageFromCaughtError(err, "Try again."),
      });
    } finally {
      setSeedanceProOmniUploadBusy(false);
    }
  }, [seedanceProOmniItems.length]);

  const applyAvatarToStartFrame = useCallback((avatarUrl: string) => {
    const u = avatarUrl.trim();
    if (!u) return;
    setStartUrl(u);
    toast.success("Avatar set as start frame");
  }, []);

  const applyAvatarToEndFrame = useCallback((avatarUrl: string) => {
    const u = avatarUrl.trim();
    if (!u) return;
    setEndUrl(u);
    toast.success("Avatar set as end frame");
  }, []);

  const applyAvatarToMotionCharacter = useCallback((avatarUrl: string) => {
    const u = avatarUrl.trim();
    if (!u) return;
    setEditMotionImageUrl(u);
    toast.success("Avatar set as character image");
  }, []);

  const applyAvatarToElements = useCallback((avatarUrl: string) => {
    const u = avatarUrl.trim();
    if (!u) return;
    setEditElementUrls((prev) => (prev.includes(u) ? prev : [...prev, u].slice(0, 4)));
    toast.success("Avatar added to elements");
  }, []);

  const applyAvatarToKlingElement = useCallback((avatarUrl: string) => {
    const u = avatarUrl.trim();
    if (!u) return;
    setKlingElementForm((prev) => {
      if (!prev || prev.urls.length >= 4 || prev.urls.includes(u)) return prev;
      return { ...prev, urls: [...prev.urls, u] };
    });
    toast.success("Image added to element");
  }, []);

  const tryAddHttpsImageToKlingElementForm = useCallback(async (rawUrl: string): Promise<boolean> => {
    const u = rawUrl.trim();
    if (!isKieServableReferenceImageUrl(u)) {
      toast.error("Invalid image URL", {
        description: "Use a reachable HTTPS (or HTTP) image URL for element references.",
      });
      return false;
    }
    const dimsOk = await probeHttpsImageMinDimensions(u, KLING_ELEMENT_MEDIA_MIN_PX, KLING_ELEMENT_MEDIA_MIN_PX);
    if (!dimsOk) {
      toast.error("Image too small", {
        description: `Use images at least ${KLING_ELEMENT_MEDIA_MIN_PX}×${KLING_ELEMENT_MEDIA_MIN_PX}px.`,
      });
      return false;
    }
    let added = false;
    setKlingElementForm((prev) => {
      if (!prev || prev.urls.length >= 4 || prev.urls.includes(u)) return prev;
      added = true;
      return { ...prev, urls: [...prev.urls, u] };
    });
    if (added) toast.success("Image added to element");
    else toast.message("Could not add image", { description: "Slot full or duplicate URL." });
    return added;
  }, []);

  const beginElementRefPick = useCallback(
    async (variant: "studio_image" | "studio_video_poster" | "lta_product") => {
      if (!klingElementForm) {
        toast.error("Add or edit an element first.", { description: "Open the element form below." });
        return;
      }
      if (klingElementForm.urls.length >= 4) return;

      setElementRefPick({ open: true, variant, loading: true, studioItems: [], ltaUrls: [] });

      try {
        if (variant === "lta_product") {
          const res = await fetch("/api/runs/list", { cache: "no-store" });
          if (!res.ok) {
            const t = await res.text().catch(() => "");
            throw new Error(t || `HTTP ${res.status}`);
          }
          const json = (await res.json()) as { data?: { extracted?: unknown }[] };
          const rows = json.data ?? [];
          const urlSet = new Set<string>();
          for (const row of rows.slice(0, 120)) {
            const snap = readUniverseFromExtracted(row.extracted);
            if (!snap) continue;
            for (const x of linkToAdProductPhotoPickerUrls(snap)) {
              const t = x.trim();
              if (t) urlSet.add(t);
            }
          }
          setElementRefPick((prev) =>
            prev.open && prev.variant === variant
              ? { ...prev, loading: false, ltaUrls: [...urlSet], studioItems: [] }
              : prev,
          );
          return;
        }

        const kind =
          variant === "studio_image" ? STUDIO_GENERATION_KIND_STUDIO_IMAGE : ("studio_video" as const);
        const res = await fetch(`/api/studio/generations?kind=${encodeURIComponent(kind)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as { data?: StudioHistoryItem[] };
        const rows = json.data ?? [];
        const picks =
          variant === "studio_image"
            ? rows.filter(
                (r) =>
                  r.kind === "image" &&
                  r.status === "ready" &&
                  Boolean(r.mediaUrl?.trim()) &&
                  !isProbablyVideoUrl(r.mediaUrl),
              )
            : rows.filter(
                (r) =>
                  r.kind === "video" &&
                  r.status === "ready" &&
                  Boolean(r.posterUrl?.trim()) &&
                  isKieServableReferenceImageUrl(r.posterUrl),
              );
        setElementRefPick((prev) =>
          prev.open && prev.variant === variant ? { ...prev, loading: false, studioItems: picks, ltaUrls: [] } : prev,
        );
      } catch (e) {
        toast.error(
          variant === "lta_product" ? "Could not load Link to Ad photos" : "Could not load library",
          { description: userMessageFromCaughtError(e, "Try again.") },
        );
        setElementRefPick({ open: false });
      }
    },
    [klingElementForm],
  );

  const toggleElementPin = useCallback((id: string) => {
    setKlingElementDrafts((prev) =>
      sortKlingElementDrafts(prev.map((d) => (d.id === id ? { ...d, pinned: !d.pinned } : d))),
    );
  }, []);

  const onPickAvatar = useCallback(
    (url: string) => {
      if (avatarPickTarget === "edit_motion") {
        applyAvatarToMotionCharacter(url);
        return;
      }
      if (avatarPickTarget === "kling_element") {
        applyAvatarToKlingElement(url);
        return;
      }
      if (avatarPickTarget === "edit_elements") {
        applyAvatarToElements(url);
        return;
      }
      if (avatarPickTarget === "create_end") {
        applyAvatarToEndFrame(url);
        return;
      }
      applyAvatarToStartFrame(url);
    },
    [
      avatarPickTarget,
      applyAvatarToMotionCharacter,
      applyAvatarToKlingElement,
      applyAvatarToElements,
      applyAvatarToStartFrame,
      applyAvatarToEndFrame,
    ],
  );

  const pickEditSourceVideo = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = STUDIO_VIDEO_FILE_ACCEPT;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const blobUrl = URL.createObjectURL(f);
      setEditVideoBlobUrl(blobUrl);
      setEditVideoUrl(null);
      setEditVideoDurationSec(null);
      setEditUploadBusy(true);
      try {
        const u = await uploadStudioMediaFile(f, "video");
        setEditVideoUrl(u);
        setEditVideoBlobUrl(null);
        toast.success("Video uploaded");
      } catch (e) {
        toast.error("Upload failed", {
          description: userMessageFromCaughtError(e, "Use MP4, MOV, or WebM."),
        });
        setEditVideoBlobUrl(null);
      } finally {
        setEditUploadBusy(false);
      }
    };
    input.click();
  }, []);

  const clearEditSourceVideo = useCallback(() => {
    if (editVideoBlobUrl?.startsWith("blob:")) URL.revokeObjectURL(editVideoBlobUrl);
    setEditVideoBlobUrl(null);
    setEditVideoUrl(null);
    setEditVideoDurationSec(null);
  }, [editVideoBlobUrl]);

  const pickMotionCharacter = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = STUDIO_IMAGE_FILE_ACCEPT;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const blobUrl = URL.createObjectURL(f);
      setMotionCharPreviewBlob((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return blobUrl;
      });
      setEditUploadBusy(true);
      try {
        const u = await uploadStudioMediaFile(f, "image");
        setEditMotionImageUrl(u);
        toast.success("Image uploaded");
      } catch (e) {
        toast.error("Upload failed", {
          description: userMessageFromCaughtError(e, "Use JPEG, PNG, WebP, or GIF."),
        });
      } finally {
        URL.revokeObjectURL(blobUrl);
        setMotionCharPreviewBlob(null);
        setEditUploadBusy(false);
      }
    };
    input.click();
  }, []);

  const pickMotionReferenceVideo = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = STUDIO_VIDEO_FILE_ACCEPT;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const blobUrl = URL.createObjectURL(f);
      setEditMotionVideoBlobUrl(blobUrl);
      setEditMotionVideoUrl(null);
      setEditMotionDurationSec(null);
      setEditUploadBusy(true);
      try {
        const u = await uploadStudioMediaFile(f, "video");
        setEditMotionVideoUrl(u);
        setEditMotionVideoBlobUrl(null);
        toast.success("Motion video uploaded");
      } catch (e) {
        toast.error("Upload failed", {
          description: userMessageFromCaughtError(e, "Use MP4, MOV, or WebM."),
        });
        setEditMotionVideoBlobUrl(null);
      } finally {
        setEditUploadBusy(false);
      }
    };
    input.click();
  }, []);

  const clearMotionReferenceVideo = useCallback(() => {
    if (editMotionVideoBlobUrl?.startsWith("blob:")) URL.revokeObjectURL(editMotionVideoBlobUrl);
    setEditMotionVideoBlobUrl(null);
    setEditMotionVideoUrl(null);
    setEditMotionDurationSec(null);
  }, [editMotionVideoBlobUrl]);

  const pickElementImage = useCallback(() => {
    if (editElementUrls.length >= 4) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = STUDIO_IMAGE_FILE_ACCEPT;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const blobUrl = URL.createObjectURL(f);
      setElementUploadPreviewBlob((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return blobUrl;
      });
      setEditUploadBusy(true);
      try {
        const u = await uploadStudioMediaFile(f, "image");
        setEditElementUrls((prev) => (prev.length >= 4 ? prev : [...prev, u]));
        toast.success("Image added");
      } catch (e) {
        toast.error("Upload failed", {
          description: userMessageFromCaughtError(e, "Use JPEG, PNG, WebP, or GIF."),
        });
      } finally {
        URL.revokeObjectURL(blobUrl);
        setElementUploadPreviewBlob(null);
        setEditUploadBusy(false);
      }
    };
    input.click();
  }, [editElementUrls.length]);

  const onPasteImage = useCallback(
    async (file: File) => {
      if (tab === "create") {
        const which: "start" | "end" = !startUrl ? "start" : !endUrl ? "end" : "start";
        const blobUrl = URL.createObjectURL(file);
        setFrameUploadSlot(which);
        if (which === "start") {
          setStartFramePreviewBlob((prev) => {
            if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
            return blobUrl;
          });
        } else {
          setEndFramePreviewBlob((prev) => {
            if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
            return blobUrl;
          });
        }
        setFrameUploadBusy(true);
        try {
          const u = await uploadStudioMediaFile(file, "image");
          if (!startUrl) {
            setStartUrl(u);
            toast.success("Start frame pasted");
          } else if (!endUrl) {
            setEndUrl(u);
            toast.success("End frame pasted");
          } else {
            setStartUrl(u);
            toast.success("Start frame replaced from paste");
          }
        } catch (e) {
          toast.error("Paste failed", {
            description: userMessageFromCaughtError(e, "Use JPEG, PNG, WebP, or GIF."),
          });
        } finally {
          URL.revokeObjectURL(blobUrl);
          if (which === "start") setStartFramePreviewBlob(null);
          else setEndFramePreviewBlob(null);
          setFrameUploadBusy(false);
          setFrameUploadSlot(null);
        }
        return;
      }

      if (motionEdit) {
        const blobUrl = URL.createObjectURL(file);
        setMotionCharPreviewBlob((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return blobUrl;
        });
        setEditUploadBusy(true);
        try {
          const u = await uploadStudioMediaFile(file, "image");
          setEditMotionImageUrl(u);
          toast.success("Character image pasted");
        } catch (e) {
          toast.error("Paste failed", {
            description: userMessageFromCaughtError(e, "Use JPEG, PNG, WebP, or GIF."),
          });
        } finally {
          URL.revokeObjectURL(blobUrl);
          setMotionCharPreviewBlob(null);
          setEditUploadBusy(false);
        }
        return;
      }

      const blobUrl = URL.createObjectURL(file);
      setElementUploadPreviewBlob((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return blobUrl;
      });
      setEditUploadBusy(true);
      try {
        const u = await uploadStudioMediaFile(file, "image");
        setEditElementUrls((prev) => (prev.length >= 4 ? prev : [...prev, u]));
        toast.success("Element image pasted");
      } catch (e) {
        toast.error("Paste failed", {
          description: userMessageFromCaughtError(e, "Use JPEG, PNG, WebP, or GIF."),
        });
      } finally {
        URL.revokeObjectURL(blobUrl);
        setElementUploadPreviewBlob(null);
        setEditUploadBusy(false);
      }
    },
    [endUrl, motionEdit, startUrl, tab],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = clipboardImageFiles(event);
      if (!files.length) return;
      event.preventDefault();
      void onPasteImage(files[0]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onPasteImage]);

  const insertNextImageToken = useCallback(() => {
    const n = Math.min(4, editElementUrls.length + 1);
    const idx = Math.max(1, n);
    setEditPrompt((p) => `${p}${p && !/\s$/.test(p) ? " " : ""}@Image${idx} `);
  }, [editElementUrls.length]);

  const generateEdit = () => {
    const p = editPrompt.trim();
    if (!p) {
      toast.error("Describe the change you want.");
      return;
    }

    if (motionEdit) {
      if (!editMotionImageUrl || !editMotionVideoUrl) {
        toast.error("Add a character image and a motion reference video.");
        return;
      }
      if (
        editMotionDurationSec == null ||
        !Number.isFinite(editMotionDurationSec) ||
        editMotionDurationSec <= 0
      ) {
        toast.error("Could not read motion video duration. Re-upload the clip.");
        return;
      }
      if (editMotionDurationSec < 3 || editMotionDurationSec > 30) {
        toast.error("La video de reference doit durer entre 3 et 30 secondes.");
        return;
      }
    } else {
      if (!editVideoUrl) {
        toast.error("Upload a video to edit.");
        return;
      }
      if (
        editVideoDurationSec != null &&
        Number.isFinite(editVideoDurationSec) &&
        (editVideoDurationSec < 3 || editVideoDurationSec > 10)
      ) {
        toast.error("Clip length should be between 3 and 10 seconds for video edit models.");
        return;
      }
    }

    const gate = studioVideoEditUpgradeMessage(planId, editPickerId);
    if (!isPersonalApiActive() && gate) {
      setBilling({ open: true, reason: "plan", blockedId: editPickerId, studioMode: "video_edit" });
      return;
    }
    const creditBypass = isPlatformCreditBypassActive();
    if (!creditBypass && creditsRef.current < editCredits) {
      setBilling({ open: true, reason: "credits", required: editCredits, studioMode: "video_edit" });
      return;
    }

    const jobId = crypto.randomUUID();
    const label = p;
    const platformChargeEdit = creditBypass ? 0 : editCredits;
    if (!creditBypass) {
      spendCredits(editCredits);
      creditsRef.current = Math.max(0, creditsRef.current - editCredits);
    }
    const startedAt = Date.now();
    const poster =
      motionEdit && editMotionImageUrl
        ? editMotionImageUrl
        : editElementUrls[0] ?? undefined;
    setHistoryItems((prev) => [
      {
        id: jobId,
        kind: "video",
        status: "generating",
        label,
        posterUrl: poster,
        createdAt: startedAt,
        model: motionEdit ? "motion_control" : editPickerId,
        modelLabel: motionEdit ? "Motion control" : studioVideoEditPickerDisplayLabel(editPickerId),
        aspectRatio: aspect,
      },
      ...prev,
    ]);

    const snap = {
      planId,
      editPickerId,
      prompt: p,
      motionEdit,
      editVideoUrl,
      editElementUrls: [...editElementUrls],
      editMotionImageUrl,
      editMotionVideoUrl,
      editKlingMode,
      editAutoSettings,
      editSceneBackground,
    };

    // Track the DB-registered generation id so the catch block can decide whether
    // to refund inline (no row yet) or let the background poll sweep handle it
    // (row exists → sweep atomically marks credits_refund_hint_sent=true, preventing double-refund).
    let currentEditStudioGenId: string | null = null;
    void (async () => {
      try {
        const editPKey = getPersonalApiKey();
        if (snap.motionEdit) {
          const res = await fetch("/api/kling/motion-control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountPlan: snap.planId,
              motionFamily: "kling-3.0",
              imageUrl: snap.editMotionImageUrl,
              videoUrl: snap.editMotionVideoUrl,
              quality: snap.editKlingMode === "pro" ? "1080p" : "720p",
              backgroundSource: snap.editSceneBackground,
              prompt: snap.prompt,
              personalApiKey: editPKey,
            }),
          });
          const json = (await res.json()) as { taskId?: string; error?: string };
          if (!res.ok || !json.taskId) throw new Error(json.error || "Motion control failed");
          const studioGenId = await registerStudioTask({
            kind: "studio_video",
            label,
            taskId: json.taskId,
            model: "motion_control",
            creditsCharged: platformChargeEdit,
            personalApiKey: editPKey,
            inputUrls: [snap.editMotionImageUrl, snap.editMotionVideoUrl].filter(Boolean) as string[],
            aspectRatio: aspect,
          });
          currentEditStudioGenId = studioGenId ?? null;
          setHistoryItems((prev) =>
            prev.map((i) =>
              i.id === jobId
                ? {
                    ...i,
                    externalTaskId: json.taskId,
                    ...(studioGenId ? { studioGenerationId: studioGenId } : {}),
                  }
                : i,
            ),
          );
          toast.message("Motion control started", { description: "Polling…" });
          const url = await pollKlingVideo(json.taskId, editPKey, getPersonalPiapiApiKey() ?? undefined);
          void completeStudioTask(json.taskId, url);
          const doneAt = Date.now();
          const doneId = `${jobId}-done-${doneAt}`;
          retireInFlightJob(jobId, doneId);
          setHistoryItems((prev) => {
            const rest = prev.filter((i) => i.id !== jobId);
            return [
              {
                id: doneId,
                kind: "video",
                status: "ready",
                label,
                mediaUrl: url,
                posterUrl: snap.editMotionImageUrl ?? undefined,
                createdAt: doneAt,
                model: "motion_control",
                modelLabel: "Motion control",
                studioGenerationId: studioGenId,
                aspectRatio: aspect,
              },
              ...rest,
            ];
          });
          toast.success("Video ready");
          return;
        }

        const res = await fetch("/api/kling/video-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountPlan: snap.planId,
            editPickerId: snap.editPickerId,
            prompt: snap.prompt,
            videoUrl: snap.editVideoUrl,
            imageUrls: snap.editElementUrls.length ? snap.editElementUrls : undefined,
            quality: snap.editKlingMode,
            autoSettings: snap.editAutoSettings,
            keepAudio: true,
            personalApiKey: editPKey,
          }),
        });
        const json = (await res.json()) as { taskId?: string; error?: string };
        if (!res.ok || !json.taskId) throw new Error(json.error || "Video edit failed");
        const studioGenId = await registerStudioTask({
          kind: "studio_video",
          label,
          taskId: json.taskId,
          model: snap.editPickerId,
          creditsCharged: platformChargeEdit,
          personalApiKey: editPKey,
          inputUrls: [snap.editVideoUrl, ...(snap.editElementUrls || [])].filter(Boolean) as string[],
          aspectRatio: aspect,
        });
        currentEditStudioGenId = studioGenId ?? null;
        setHistoryItems((prev) =>
          prev.map((i) =>
            i.id === jobId
              ? {
                  ...i,
                  externalTaskId: json.taskId,
                  ...(studioGenId ? { studioGenerationId: studioGenId } : {}),
                }
              : i,
          ),
        );
        toast.message("Edit started", { description: "Polling provider…" });
        const url = await pollKlingVideo(json.taskId, editPKey, getPersonalPiapiApiKey() ?? undefined);
        void completeStudioTask(json.taskId, url);
        const doneAt = Date.now();
        const doneId = `${jobId}-done-${doneAt}`;
        retireInFlightJob(jobId, doneId);
        setHistoryItems((prev) => {
          const rest = prev.filter((i) => i.id !== jobId);
          return [
            {
              id: doneId,
              kind: "video",
              status: "ready",
              label,
              mediaUrl: url,
              posterUrl: snap.editElementUrls[0] ?? undefined,
              createdAt: doneAt,
              model: snap.editPickerId,
              modelLabel: studioVideoEditPickerDisplayLabel(snap.editPickerId),
              studioGenerationId: studioGenId,
              aspectRatio: aspect,
            },
            ...rest,
          ];
        });
        toast.success("Video ready");
      } catch (e) {
        const msg = userMessageFromCaughtError(e, "Something went wrong while generating. Please try again.");
        // Only refund immediately when no DB row was registered.
        // If a row was registered, the background poll sweep atomically handles the refund
        // (credits_refund_hint_sent=true) to prevent double-charging the ledger.
        if (!currentEditStudioGenId) {
          refundPlatformCredits(platformChargeEdit, grantCredits, creditsRef);
        }
        toast.error(msg);
        setHistoryItems((prev) =>
          prev.map((i) =>
            i.id === jobId && i.status === "generating"
              ? {
                  ...i,
                  status: "failed",
                  errorMessage: msg,
                  creditsRefunded: platformChargeEdit > 0,
                }
              : i,
          ),
        );
      }
    })();
  };

  const generate = () => {
    const klingCustom = modelId === "kling-3.0/video" && multiShot;

    let label: string;
    let promptForJob: string;

    if (klingCustom) {
      if (endUrl) {
        toast.error("Multi-shot uses the start frame only. Clear the end frame.");
        return;
      }
      if (klingShots.some((s) => !s.prompt.trim())) {
        toast.error("Add a prompt for every shot.");
        return;
      }
      for (let i = 0; i < klingShots.length; i++) {
        const sec = klingShots[i]!.durationSec;
        if (
          !Number.isInteger(sec) ||
          sec < KLING_MULTI_SHOT_SEC_MIN ||
          sec > KLING_MULTI_SHOT_SEC_MAX
        ) {
          toast.error(
            `Shot ${i + 1}: duration must be ${KLING_MULTI_SHOT_SEC_MIN}–${KLING_MULTI_SHOT_SEC_MAX} seconds (Kling 3.0 API).`,
          );
          return;
        }
      }
      const total = klingShots.reduce((a, s) => a + s.durationSec, 0);
      if (total < 3 || total > 15) {
        toast.error(`Shot lengths must sum to 3–15 seconds (currently ${total}s).`);
        return;
      }
      promptForJob = klingShots[0]!.prompt.trim();
      label = klingShots
        .map((s) => s.prompt.trim())
        .join(" · ")
        .slice(0, 140);
    } else {
      const p = prompt.trim();
      if (!p) {
        toast.error("Describe your video.");
        return;
      }
      promptForJob = p;
      label = p;
    }

    if (
      meta.family === "kie" &&
      modelId !== "kling-3.0/video" &&
      modelId !== "kling-2.6/video" &&
      !startUrl &&
      !studioVideoIsSeedance2ProPickerId(modelId) &&
      !compactSeedanceRefUploads &&
      !seedanceProOmniRefUploads
    ) {
      toast.error("Add a start frame image for this model.");
      return;
    }
    if (compactSeedanceRefUploads) {
      const n = seedanceCompactRefUrls.length;
      if (n < 1) {
        toast.error("Add 1–4 reference images (upload).");
        return;
      }
      if (n > SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS) {
        toast.error(`At most ${SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS} reference images.`);
        return;
      }
    }
    if (seedanceProOmniRefUploads && seedanceProOmniItems.length > 0) {
      if (seedanceProOmniItems.every((x) => x.kind === "audio")) {
        toast.error("Audio-only is not allowed", {
          description: "Add at least one image or video (Seedance omni_reference).",
        });
        return;
      }
      if (seedanceProOmniItems.length > SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS) {
        toast.error(`At most ${SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS} media files.`);
        return;
      }
    }
    const gate = studioVideoUpgradeMessage(planId, modelId);
    if (!isPersonalApiActive() && gate) {
      setBilling({ open: true, reason: "plan", blockedId: modelId, studioMode: "video" });
      return;
    }
    const creditBypassCreate = isPlatformCreditBypassActive();
    if (!creditBypassCreate && creditsRef.current < credits) {
      setBilling({ open: true, reason: "credits", required: credits, studioMode: "video" });
      return;
    }

    const supportsReferenceElements =
      modelId === "kling-3.0/video" || modelId.startsWith("bytedance/seedance");
    const minElUrls = minReferenceUrlsPerVideoElement(modelId);
    const klingElementsPayloadEarly =
      supportsReferenceElements && klingElementDrafts.length
        ? klingElementDrafts
            .filter((r) => r.name.trim() && r.urls.length >= minElUrls)
            .map((r) => ({
              name: r.name.trim(),
              description: r.description.trim() || r.name.trim(),
              element_input_urls: r.urls.slice(0, 4),
            }))
        : undefined;
    const seedanceImageForElements =
      String(startUrl ?? "").trim() ||
      (compactSeedanceRefUploads ? String(seedanceCompactRefUrls[0] ?? "").trim() : "") ||
      (seedanceProOmniRefUploads
        ? String(seedanceProOmniItems.find((i) => i.kind === "image")?.url ?? "").trim()
        : "");
    if (supportsReferenceElements && klingElementsPayloadEarly?.length) {
      if (modelId === "kling-3.0/video" && !String(startUrl ?? "").trim()) {
        toast.error("Add a start frame image when using Elements.", {
          description: "Kling 3.0 requires image_urls[0] for element references.",
        });
        return;
      }
      if (modelId.startsWith("bytedance/seedance") && !seedanceImageForElements) {
        toast.error("Add a reference image for @image1 when using Elements.", {
          description:
            "Use the start frame, compact uploads, or at least one image in omni references, then @image2, @image3, … for extras.",
        });
        return;
      }
    }
    if (modelId.startsWith("bytedance/seedance") && klingElementsPayloadEarly?.length) {
      const maxSlots = modelId.includes("preview")
        ? SEEDANCE_PREVIEW_MAX_IMAGE_URLS
        : SEEDANCE_PRO_MAX_IMAGE_URLS;
      const n = countUniqueSeedanceStudioRefs({
        startUrl,
        endUrl,
        compactUrls: seedanceCompactRefUrls,
        useCompact: compactSeedanceRefUploads,
        omniItems: seedanceProOmniItems,
        useOmni: seedanceProOmniRefUploads,
        elements: klingElementsPayloadEarly,
      });
      if (n > maxSlots) {
        toast.error(`Too many reference images (${n}).`, {
          description: `This Seedance model accepts at most ${maxSlots} unique URLs (start, optional end, and element images).`,
        });
        return;
      }
    }
    if (modelId === "kling-3.0/video" && klingElementsPayloadEarly?.length && !klingCustom) {
      const p = prompt.trim();
      for (const el of klingElementsPayloadEarly) {
        if (!promptUsesKlingElementTag(p, el.name)) {
          toast.error(`Mention @${el.name} in your prompt`, {
            description: "So the model knows which element to apply (same idea as Higgsfield-style @references).",
          });
          return;
        }
      }
    }

    const jobId = crypto.randomUUID();
    const platformChargeCreate = creditBypassCreate ? 0 : credits;
    if (!creditBypassCreate) {
      spendCredits(credits);
      creditsRef.current = Math.max(0, creditsRef.current - credits);
    }
    const startedAt = Date.now();
    const historyAspect = videoHistoryAspectLabel(meta.family, aspect, veoAspect);
    const seedanceCreatePosterUrl =
      seedanceCompactRefUrls[0] ??
      seedanceProOmniItems.find((i) => i.kind === "image")?.url ??
      seedanceProOmniItems.find((i) => i.kind === "video")?.url ??
      startUrl ??
      undefined;
    setHistoryItems((prev) => [
      {
        id: jobId,
        kind: "video",
        status: "generating",
        label,
        posterUrl: seedanceCreatePosterUrl,
        createdAt: startedAt,
        model: modelId,
        modelLabel: studioVideoDisplayLabel(modelId),
        aspectRatio: historyAspect,
      },
      ...prev,
    ]);

    const klingElementsPayload = klingElementsPayloadEarly;

    const snap = {
      family: meta.family,
      modelId,
      planId,
      prompt: promptForJob,
      startUrl,
      endUrl,
      seedanceCompactRefUrls: compactSeedanceRefUploads ? [...seedanceCompactRefUrls] : undefined,
      seedanceOmniMedia:
        seedanceProOmniRefUploads && seedanceProOmniItems.length
          ? seedanceProOmniItems.map((x) => ({ type: x.kind, url: x.url }))
          : undefined,
      duration,
      veoAspect,
      aspect,
      klingMode,
      soundOn,
      multiShot,
      multiShotCustom: klingCustom,
      klingShots: klingCustom ? klingShots.map((s) => ({ ...s })) : undefined,
      klingElementsPayload,
      historyAspect,
      videoPriority,
    };

    // Track the DB-registered generation id so the catch block can decide whether
    // to refund inline (no row yet) or let the background poll sweep handle it
    // (row exists → sweep atomically marks credits_refund_hint_sent=true, preventing double-refund).
    let currentCreateStudioGenId: string | null = null;
    void (async () => {
      try {
        const pKey = getPersonalApiKey();
        const piKey = getPersonalPiapiApiKey() ?? undefined;
        if (snap.family === "sora") {
          const res = await fetch("/api/kling/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountPlan: snap.planId,
              marketModel: snap.modelId,
              prompt: snap.prompt,
              imageUrl: snap.startUrl ?? undefined,
              duration: Number(snap.duration),
              aspectRatio: snap.aspect as "16:9" | "9:16" | "1:1",
              mode:
                snap.modelId === "openai/sora-2-pro" || snap.modelId === "openai/sora-2"
                  ? snap.klingMode
                  : undefined,
              personalApiKey: pKey,
            }),
          });
          const json = (await res.json()) as { taskId?: string; error?: string };
          if (!res.ok || !json.taskId)
            throw new Error(json.error || (snap.modelId === "openai/sora-2-pro" ? "Sora 2 Pro failed" : "Sora 2 failed"));
          const studioGenId = await registerStudioTask({
            kind: "studio_video",
            label,
            taskId: json.taskId,
            model: snap.modelId,
            creditsCharged: platformChargeCreate,
            personalApiKey: pKey,
            inputUrls: snap.startUrl ? [snap.startUrl] : undefined,
            aspectRatio: snap.historyAspect,
          });
          currentCreateStudioGenId = studioGenId ?? null;
          setHistoryItems((prev) =>
            prev.map((i) =>
              i.id === jobId
                ? {
                    ...i,
                    externalTaskId: json.taskId,
                    ...(studioGenId ? { studioGenerationId: studioGenId } : {}),
                  }
                : i,
            ),
          );
          toast.message(
            snap.modelId === "openai/sora-2-pro" ? "Sora 2 Pro started" : "Sora 2 started",
            { description: "Rendering…" },
          );
          const url = await pollKlingVideo(
            json.taskId,
            pKey,
            piKey,
            isSeedancePreviewModelId(snap.modelId)
              ? {
                  maxRounds: SEEDANCE_PREVIEW_POLL_MAX_ROUNDS,
                  timeoutMessage: "Seedance Preview generation is still processing after 12 hours.",
                }
              : undefined,
          );
          void completeStudioTask(json.taskId, url);
          const doneAt = Date.now();
          const doneId = `${jobId}-done-${doneAt}`;
          retireInFlightJob(jobId, doneId);
          setHistoryItems((prev) => {
            const rest = prev.filter((i) => i.id !== jobId);
            return [
              {
                id: doneId,
                kind: "video",
                status: "ready",
                label,
                mediaUrl: url,
                posterUrl: snap.startUrl ?? undefined,
                createdAt: doneAt,
                model: snap.modelId,
                modelLabel: studioVideoDisplayLabel(snap.modelId),
                studioGenerationId: studioGenId,
                aspectRatio: snap.historyAspect,
              },
              ...rest,
            ];
          });
          toast.success("Video ready");
          return;
        }

        if (snap.family === "veo") {
          const urls = [snap.startUrl, snap.endUrl].filter(Boolean) as string[];
          const generationType: "TEXT_2_VIDEO" | "FIRST_AND_LAST_FRAMES_2_VIDEO" =
            urls.length > 0 ? "FIRST_AND_LAST_FRAMES_2_VIDEO" : "TEXT_2_VIDEO";

          const res = await fetch("/api/kie/veo/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountPlan: snap.planId,
              prompt: snap.prompt,
              model: snap.modelId,
              aspectRatio: snap.veoAspect,
              generationType,
              imageUrls: urls.length ? urls : undefined,
              personalApiKey: pKey,
            }),
          });
          const json = (await res.json()) as { taskId?: string; provider?: string; error?: string };
          if (!res.ok || !json.taskId) throw new Error(json.error || "Veo failed");
          const studioGenId = await registerStudioTask({
            kind: "studio_video",
            label,
            taskId: json.taskId,
            provider: json.provider,
            model: snap.modelId,
            creditsCharged: platformChargeCreate,
            personalApiKey: pKey,
            inputUrls: urls.length ? urls : undefined,
            aspectRatio: snap.historyAspect,
          });
          currentCreateStudioGenId = studioGenId ?? null;
          setHistoryItems((prev) =>
            prev.map((i) =>
              i.id === jobId
                ? {
                    ...i,
                    externalTaskId: json.taskId,
                    ...(studioGenId ? { studioGenerationId: studioGenId } : {}),
                  }
                : i,
            ),
          );
          toast.message("Veo started", { description: "Rendering…" });
          const url = await pollVeoVideo(json.taskId, pKey);
          void completeStudioTask(json.taskId, url);
          const doneAt = Date.now();
          const doneId = `${jobId}-done-${doneAt}`;
          retireInFlightJob(jobId, doneId);
          setHistoryItems((prev) => {
            const rest = prev.filter((i) => i.id !== jobId);
            return [
              {
                id: doneId,
                kind: "video",
                status: "ready",
                label,
                mediaUrl: url,
                posterUrl: snap.startUrl ?? undefined,
                createdAt: doneAt,
                model: snap.modelId,
                modelLabel: studioVideoDisplayLabel(snap.modelId),
                studioGenerationId: studioGenId,
                aspectRatio: snap.historyAspect,
              },
              ...rest,
            ];
          });
          toast.success("Video ready");
          return;
        }

        const isKling30 = snap.modelId === "kling-3.0/video";
        const isKling26 = snap.modelId === "kling-2.6/video";
        const isSora2Pro = snap.modelId === "openai/sora-2-pro";
        const kling30MultiActive =
          isKling30 &&
          snap.multiShotCustom === true &&
          Array.isArray(snap.klingShots) &&
          snap.klingShots.length > 0;
        const klingDurationSec = kling30MultiActive
          ? snap.klingShots!.reduce((a, s) => a + s.durationSec, 0)
          : Number(snap.duration);
        const compactSnapRefs = snap.seedanceCompactRefUrls;
        const omniSnap = snap.seedanceOmniMedia;
        const klingGenerateBody: Record<string, unknown> = {
          accountPlan: snap.planId,
          marketModel: seedancePreviewMarketModelForApi(snap.modelId, snap.videoPriority),
          prompt: snap.prompt,
          duration: klingDurationSec,
          aspectRatio:
            (isKling30 || isKling26) && !snap.startUrl
              ? snap.aspect
              : studioVideoIsSeedancePickerId(snap.modelId) &&
                  (Boolean(snap.startUrl) ||
                    studioVideoIsSeedance2ProPickerId(snap.modelId) ||
                    (Array.isArray(compactSnapRefs) && compactSnapRefs.length > 0) ||
                    (Array.isArray(omniSnap) && omniSnap.length > 0))
                ? snap.aspect
                : undefined,
          sound: studioVideoSupportsNativeAudio(snap.modelId) ? snap.soundOn : undefined,
          mode: isKling30 || isKling26 || isSora2Pro ? snap.klingMode : undefined,
          personalApiKey: pKey,
          piapiApiKey: piKey,
        };
        if (Array.isArray(omniSnap) && omniSnap.length) {
          klingGenerateBody.seedanceOmniMedia = omniSnap;
        } else if (compactSnapRefs?.length) {
          klingGenerateBody.seedancePreviewImageUrls = compactSnapRefs;
        } else {
          klingGenerateBody.imageUrl = snap.startUrl ?? undefined;
          if (snap.endUrl?.trim()) klingGenerateBody.endImageUrl = snap.endUrl.trim();
        }
        if (kling30MultiActive) {
          klingGenerateBody.multiShots = true;
          klingGenerateBody.multiPrompt = snap.klingShots!.map((s) => ({
            prompt: s.prompt.trim(),
            duration: Math.round(Number(s.durationSec)),
          }));
        }
        const supportsKlingElementsOnApi = isKling30 || snap.modelId.startsWith("bytedance/seedance");
        if (supportsKlingElementsOnApi && snap.klingElementsPayload?.length) {
          klingGenerateBody.klingElements = snap.klingElementsPayload;
        }
        const res = await fetch("/api/kling/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(klingGenerateBody),
        });
        const json = (await res.json()) as { taskId?: string; provider?: string; error?: string };
        if (!res.ok || !json.taskId) throw new Error(json.error || "Video task failed");
        const studioGenId = await registerStudioTask({
          kind: "studio_video",
          label,
          taskId: json.taskId,
          provider: json.provider,
          model: snap.modelId,
          creditsCharged: platformChargeCreate,
          personalApiKey: pKey,
          inputUrls: snap.seedanceOmniMedia?.length
            ? snap.seedanceOmniMedia.map((x) => x.url)
            : snap.seedanceCompactRefUrls?.length
              ? snap.seedanceCompactRefUrls
              : snap.startUrl
                ? [snap.startUrl]
                : undefined,
          aspectRatio: snap.historyAspect,
        });
        currentCreateStudioGenId = studioGenId ?? null;
        setHistoryItems((prev) =>
          prev.map((i) =>
            i.id === jobId
              ? {
                  ...i,
                  externalTaskId: json.taskId,
                  ...(studioGenId ? { studioGenerationId: studioGenId } : {}),
                }
              : i,
          ),
        );
        toast.message("Generation started", { description: "Polling provider…" });
        const url = await pollKlingVideo(
          json.taskId,
          pKey,
          piKey,
          isSeedancePreviewModelId(snap.modelId)
            ? {
                maxRounds: SEEDANCE_PREVIEW_POLL_MAX_ROUNDS,
                timeoutMessage: "Seedance Preview generation is still processing after 12 hours.",
              }
            : undefined,
        );
        void completeStudioTask(json.taskId, url);
        const doneAt = Date.now();
        const doneId = `${jobId}-done-${doneAt}`;
        retireInFlightJob(jobId, doneId);
        setHistoryItems((prev) => {
          const rest = prev.filter((i) => i.id !== jobId);
          return [
            {
              id: doneId,
              kind: "video",
              status: "ready",
              label,
              mediaUrl: url,
              posterUrl:
                snap.seedanceOmniMedia?.find((x) => x.type === "image")?.url ??
                snap.seedanceOmniMedia?.[0]?.url ??
                snap.seedanceCompactRefUrls?.[0] ??
                snap.startUrl ??
                undefined,
              createdAt: doneAt,
              model: snap.modelId,
              modelLabel: studioVideoDisplayLabel(snap.modelId),
              studioGenerationId: studioGenId,
              aspectRatio: snap.historyAspect,
            },
            ...rest,
          ];
        });
        toast.success("Video ready");
      } catch (e) {
        const msg = userMessageFromCaughtError(e, "Something went wrong while generating. Please try again.");
        // Only refund immediately when no DB row was registered.
        // If a row was registered, the background poll sweep atomically handles the refund
        // (credits_refund_hint_sent=true) to prevent double-charging the ledger.
        if (!currentCreateStudioGenId) {
          refundPlatformCredits(platformChargeCreate, grantCredits, creditsRef);
        }
        toast.error(msg);
        setHistoryItems((prev) =>
          prev.map((i) =>
            i.id === jobId && i.status === "generating"
              ? {
                  ...i,
                  status: "failed",
                  errorMessage: msg,
                  creditsRefunded: platformChargeCreate > 0,
                }
              : i,
          ),
        );
      }
    })();
  };

  const paramsColumnClass = wideVideoPreview
    ? "flex min-w-0 w-full flex-col gap-2 lg:basis-[22%] lg:max-w-[16rem] lg:min-w-[12rem] lg:flex-none lg:shrink-0 lg:min-h-0 lg:overflow-hidden"
    : "flex min-w-0 w-full flex-col gap-2 lg:basis-[30%] lg:max-w-[28rem] lg:flex-none lg:shrink-0 lg:min-h-0 lg:overflow-hidden";

  const outputHistoryColumn = (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden",
        wideVideoPreview && "lg:min-h-[min(68vh,720px)]",
      )}
    >
      <div className="mb-1 flex shrink-0 items-center justify-end gap-2 lg:mb-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 rounded-lg border border-white/15 bg-white/5 px-3 text-[11px] font-medium text-white/80 hover:bg-white/10"
          onClick={() => setWideVideoPreview((v) => !v)}
          aria-pressed={wideVideoPreview}
        >
          {wideVideoPreview ? (
            <span className="inline-flex items-center gap-1.5">
              <Shrink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Default layout
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Expand className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Larger preview
            </span>
          )}
        </Button>
      </div>
      <StudioOutputPane
        title=""
        hasOutput
        output={
          <StudioGenerationsHistory
            items={historyItems}
            empty={<StudioEmptyExamples variant="video" />}
            mediaLabel="Video"
            onItemDeleted={(id) => setHistoryItems((prev) => prev.filter((i) => i.id !== id))}
            onChangeVoice={onChangeVoice}
          />
        }
        empty={null}
      />
    </div>
  );

  const generateBtnClass =
    "h-12 w-full rounded-xl border border-violet-300/40 bg-violet-500 text-base font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Video</span>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={`h-7 rounded-md px-2.5 text-[11px] font-semibold ${tab === "create" ? "bg-white text-black hover:bg-white/90" : "border-white/15 bg-white/5 text-white"}`}
            onClick={() => setTab("create")}
          >
            Create
          </Button>
          {!HIDE_VIDEO_EDIT_TAB ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={`h-7 rounded-md px-2.5 text-[11px] font-semibold ${tab === "edit" ? "bg-white text-black hover:bg-white/90" : "border-white/15 bg-white/5 text-white"}`}
              onClick={() => setTab("edit")}
            >
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      {tab === "edit" && !HIDE_VIDEO_EDIT_TAB ? (
        <div className="flex flex-col gap-3 overflow-x-hidden lg:flex-row lg:items-start lg:gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
          <div className={paramsColumnClass}>
            <div className="studio-params-scroll flex min-w-0 flex-col gap-2 overflow-y-auto lg:h-full lg:min-h-0 lg:flex-1 lg:pb-10">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Edit prompt</p>
            <div className="rounded-2xl border border-white/10 bg-[#101014] p-3 space-y-3">
              {motionEdit ? (
                <div className="grid grid-cols-1 gap-2">
                  <FrameSlot
                    label="Character image"
                    avatarLibraryBadge
                    url={editMotionImageUrl}
                    previewUrl={motionCharPreviewBlob}
                    uploading={editUploadBusy && Boolean(motionCharPreviewBlob)}
                    disabled={editUploadBusy}
                    onPick={pickMotionCharacter}
                    onAvatarBadgeClick={() => {
                      setAvatarPickTarget("edit_motion");
                      setAvatarPickerOpen(true);
                    }}
                    onClear={() => {
                      setEditMotionImageUrl(null);
                      setMotionCharPreviewBlob((prev) => {
                        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
                        return null;
                      });
                    }}
                  />
                  <VideoUploadSlot
                    url={editMotionVideoUrl}
                    posterUrl={editMotionVideoBlobUrl}
                    uploading={editUploadBusy && Boolean(editMotionVideoBlobUrl) && !editMotionVideoUrl}
                    disabled={editUploadBusy}
                    onPick={pickMotionReferenceVideo}
                    onClear={clearMotionReferenceVideo}
                    requiredLabel="Motion video"
                    hint="Duration: 3–30 secs"
                    onDurationSec={setEditMotionDurationSec}
                  />
                  {/* Saved avatars: corner badge on the image input. */}
                </div>
              ) : (
                <>
                  <VideoUploadSlot
                    url={editVideoUrl}
                    posterUrl={editVideoBlobUrl}
                    uploading={editUploadBusy && Boolean(editVideoBlobUrl) && !editVideoUrl}
                    disabled={editUploadBusy}
                    onPick={pickEditSourceVideo}
                    onClear={clearEditSourceVideo}
                    requiredLabel="Upload a video to edit"
                    hint="Duration required: 3–10 secs"
                    onDurationSec={setEditVideoDurationSec}
                  />
                  <ElementsUploadZone
                    urls={editElementUrls}
                    max={4}
                    disabled={editUploadBusy}
                    onAdd={pickElementImage}
                    onRemove={(i) => setEditElementUrls((prev) => prev.filter((_, j) => j !== i))}
                    pendingPreviewUrl={elementUploadPreviewBlob}
                    pendingUploading={editUploadBusy && Boolean(elementUploadPreviewBlob)}
                  />
                  {/* Saved avatars: corner badge on the image input(s). */}
                </>
              )}
              {motionEdit ? (
                <div className="rounded-xl border border-white/10 bg-[#101014] p-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Parametres avances</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-white/45">Prompt</Label>
                    <Textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="Describe background and scene details - e.g., 'A corgi runs in' or 'Snowy park setting'. Motion is controlled by your reference video."
                      className="min-h-[100px] w-full resize-none rounded-xl border-white/10 bg-[#0a0a0d] px-3 py-3 text-sm text-white placeholder:text-white/35 focus-visible:ring-0"
                      rows={4}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <Label className="text-xs text-white/45">Prompt</Label>
                  <Textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Describe the change you want, like 'Make it snow'. Add elements using @"
                    className="mt-2 min-h-[120px] w-full resize-none rounded-xl border-white/10 bg-[#0a0a0d] px-3 py-3 text-sm text-white placeholder:text-white/35 focus-visible:ring-0"
                    rows={4}
                  />
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-full border-white/15 bg-white/5 text-xs text-white/70 hover:bg-white/10"
                      onClick={insertNextImageToken}
                    >
                      <AtSign className="mr-1 h-3.5 w-3.5" />
                      Elements
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Parameters</p>
            <div className="rounded-2xl border border-white/10 bg-[#101014] p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs text-white/45">Auto settings</Label>
                <button
                  type="button"
                  onClick={() => setEditAutoSettings((a) => !a)}
                  className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
                    editAutoSettings
                      ? "border-emerald-400/50 bg-emerald-500/45"
                      : "border-white/15 bg-white/10"
                  }`}
                  aria-pressed={editAutoSettings}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${
                      editAutoSettings ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div>
                  <StudioModelPicker
                    value={editPickerId}
                    items={VIDEO_EDIT_MODEL_PICKER_ITEMS}
                    triggerVariant="bar"
                    panelMode="dropdown"
                    hideMeta
                    isItemLocked={(id) =>
                      !isPersonalApiActive() && !canUseStudioVideoEditPicker(planId, id)
                    }
                    onLockedPick={(id) => {
                      setBilling({ open: true, reason: "plan", blockedId: id, studioMode: "video_edit" });
                    }}
                    onChange={(v) => setEditPickerId(v)}
                    featuredTitle="All models"
                  />
              </div>

              {!editAutoSettings ? (
                <div>
                  <Label className="text-xs text-white/45">Quality</Label>
                  <Select
                    value={editKlingMode}
                    onValueChange={(v) => setEditKlingMode(v as "std" | "pro")}
                  >
                    <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" className={studioSelectContentClass}>
                      <SelectItem value="std" className={studioSelectItemClass}>
                        720p
                      </SelectItem>
                      <SelectItem value="pro" className={studioSelectItemClass}>
                        1080p
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {motionEdit ? (
                <div>
                  <Label className="text-xs text-white/45">Background source</Label>
                  <p className="mt-0.5 text-[10px] leading-snug text-white/35">
                    Kling 3.0 Motion Control, KIE <span className="text-white/55">background_source</span>.
                  </p>
                  <Select
                    value={editSceneBackground}
                    onValueChange={(v) =>
                      setEditSceneBackground(v as "input_video" | "input_image")
                    }
                  >
                    <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" className={studioSelectContentClass}>
                      <SelectItem value="input_video" className={studioSelectItemClass}>
                        Video background (motion clip)
                      </SelectItem>
                      <SelectItem value="input_image" className={studioSelectItemClass}>
                        Image background (character still)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <Button type="button" onClick={() => generateEdit()} className={generateBtnClass}>
              <span className="inline-flex items-center gap-2">
                Generate
                <Sparkles className="h-5 w-5" />
                <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums">{editCredits}</span>
              </span>
            </Button>
            </div>
          </div>

          {outputHistoryColumn}
        </div>
      ) : (
        <div className="flex flex-col gap-3 overflow-x-hidden lg:flex-row lg:items-start lg:gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
          <div className={paramsColumnClass}>
            <div className="studio-params-scroll flex min-w-0 flex-col gap-2 overflow-y-auto lg:h-full lg:min-h-0 lg:flex-1 lg:pb-10">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Create prompt</p>
            <div className="rounded-2xl border border-white/10 bg-[#101014] p-3">
              {compactSeedanceRefUploads ? (
                <div>
                  <Label className="text-xs text-white/65">
                    Reference images <span className="text-rose-400" aria-hidden="true">*</span>
                  </Label>
                  <p className="mt-1 text-[10px] leading-snug text-white/40">
                    Seedance Preview / Fast Preview: ordered reference <span className="text-white/55">images only</span>{" "}
                    in this layout (1–4 uploads). Mixed video/audio for Preview uses provider VIP task types, not this
                    strip — see docs. Use <span className="text-white/55">Seedance 2 / Fast</span> for image + video +
                    audio in Reference media.
                  </p>
                  <input
                    ref={seedanceCompactFileRef}
                    type="file"
                    accept={STUDIO_IMAGE_FILE_ACCEPT}
                    className="hidden"
                    onChange={onSeedanceCompactFileChange}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {seedanceCompactRefUrls.map((u, ui) => (
                      <button
                        key={`seed-compact-${ui}-${u.slice(-32)}`}
                        type="button"
                        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10"
                        onClick={() => setSeedanceCompactRefUrls((prev) => prev.filter((_, j) => j !== ui))}
                        title="Remove image"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                    {seedanceCompactRefUrls.length < SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS ? (
                      <button
                        type="button"
                        disabled={seedanceCompactUploadBusy}
                        onClick={() => seedanceCompactFileRef.current?.click()}
                        className="flex min-h-[120px] min-w-[min(100%,280px)] flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-[#0c0c10] px-4 py-6 text-white/45 transition hover:border-violet-400/35 hover:bg-white/[0.02] hover:text-white/65 disabled:opacity-50"
                      >
                        <Upload className="h-8 w-8 opacity-70" strokeWidth={1.5} aria-hidden />
                        <span className="text-center text-sm font-medium text-white/70">
                          {seedanceCompactRefUrls.length === 0
                            ? "Click to upload (1–4 images)"
                            : `Add image (${seedanceCompactRefUrls.length}/${SEEDANCE_COMPACT_PREVIEW_MAX_IMAGE_URLS})`}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : seedanceProOmniRefUploads ? (
                <div>
                  <Label className="text-xs text-white/65">Reference media</Label>
                  <p className="mt-1 text-[10px] leading-snug text-white/40">
                    Seedance 2 / Fast — optional <span className="text-white/55">omni_reference</span> (provider): add{" "}
                    <span className="text-white/55">images, short video (MP4/MOV), and audio (MP3/WAV)</span> together.
                    Use <span className="text-white/55">@imageN</span>, <span className="text-white/55">@videoN</span>,{" "}
                    <span className="text-white/55">@audioN</span> in the prompt, or tags are prepended when missing.
                    Audio still needs at least one image or video. Leave empty for text-only video.
                  </p>
                  <input
                    ref={seedanceProOmniFileRef}
                    type="file"
                    accept={SEEDANCE_PRO_OMNI_FILE_ACCEPT}
                    className="hidden"
                    onChange={onSeedanceProOmniFileChange}
                  />
                  <button
                    type="button"
                    disabled={
                      seedanceProOmniUploadBusy ||
                      seedanceProOmniItems.length >= SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS
                    }
                    onClick={() => seedanceProOmniFileRef.current?.click()}
                    className="relative mt-2 flex min-h-[132px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/22 bg-[#0c0c10] px-4 py-5 text-white/45 transition hover:border-violet-400/35 hover:bg-white/[0.02] hover:text-white/65 disabled:opacity-50"
                  >
                    <span className="flex items-center justify-center">
                      <span className="-mr-1 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/55">
                        <ImageIcon className="h-[18px] w-[18px] text-white/70" aria-hidden />
                      </span>
                      <span className="z-[1] flex h-11 w-11 items-center justify-center rounded-full border border-white/18 bg-black/70">
                        <VideoIcon className="h-5 w-5 text-white/78" aria-hidden />
                      </span>
                      <span className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/55">
                        <Music2 className="h-[18px] w-[18px] text-white/70" aria-hidden />
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-white/80">Upload media</span>
                    <span className="text-xs font-medium text-white/50">Image, video or audio</span>
                    <span className="max-w-[20rem] text-center text-[10px] leading-snug text-white/35">
                      Images (JPEG/PNG/WebP/GIF), video MP4/MOV, audio MP3/WAV — max{" "}
                      {SEEDANCE_PRO_OMNI_MAX_MEDIA_ITEMS} files. Audio requires at least one image or video.
                    </span>
                  </button>
                  {seedanceProOmniItems.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {seedanceProOmniItems.map((it, ui) => (
                        <button
                          key={`seed-omni-${ui}-${it.url.slice(-28)}`}
                          type="button"
                          className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/45"
                          onClick={() => setSeedanceProOmniItems((prev) => prev.filter((_, j) => j !== ui))}
                          title="Remove"
                        >
                          {it.kind === "image" ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={it.url} alt="" className="h-full w-full object-cover" />
                            </>
                          ) : it.kind === "video" ? (
                            <>
                              <VideoIcon className="h-7 w-7 text-white/55" aria-hidden />
                              <span className="mt-0.5 text-[9px] text-white/42">Video</span>
                            </>
                          ) : (
                            <>
                              <Music2 className="h-7 w-7 text-white/55" aria-hidden />
                              <span className="mt-0.5 text-[9px] text-white/42">Audio</span>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <FrameSlot
                    label="Start frame"
                    optional={startFrameOptional}
                    avatarLibraryBadge
                    url={startUrl}
                    previewUrl={startFramePreviewBlob}
                    uploading={frameUploadBusy && frameUploadSlot === "start"}
                    disabled={frameUploadBusy}
                    onPick={() => pickFrame("start")}
                    onAvatarBadgeClick={() => {
                      setAvatarPickTarget("create_start");
                      setAvatarPickerOpen(true);
                    }}
                    onClear={() => {
                      setStartUrl(null);
                      setStartFramePreviewBlob((prev) => {
                        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
                        return null;
                      });
                    }}
                  />
                  <FrameSlot
                    label="End frame"
                    optional
                    avatarLibraryBadge
                    url={endUrl}
                    previewUrl={endFramePreviewBlob}
                    uploading={frameUploadBusy && frameUploadSlot === "end"}
                    disabled={frameUploadBusy || klingCustomMulti}
                    onPick={() => pickFrame("end")}
                    onAvatarBadgeClick={() => {
                      setAvatarPickTarget("create_end");
                      setAvatarPickerOpen(true);
                    }}
                    onClear={() => {
                      setEndUrl(null);
                      setEndFramePreviewBlob((prev) => {
                        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
                        return null;
                      });
                    }}
                  />
                </div>
              )}
              {seedanceFacePolicyHint ? (
                <p className="mt-2 text-[10px] leading-snug text-white/45">{seedanceFacePolicyHint}</p>
              ) : null}
              {klingCustomMulti ? (
                <p className="mt-3 text-[10px] leading-snug text-white/38">
                  Multi-shot: define each scene below in Parameters. Start frame only, end frame is disabled.
                </p>
              ) : (
                <>
                  {promptElementTagDrafts.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {promptElementTagDrafts.map((el) => (
                        <div
                          key={el.id}
                          className="inline-flex max-w-full items-center gap-2 rounded-lg border border-white/14 bg-black/45 py-1 pl-1 pr-2.5 shadow-sm"
                        >
                          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={el.urls[0]!} alt="" className="h-full w-full object-cover" />
                          </span>
                          <span className="truncate text-xs font-medium text-white/88">{el.name.trim()}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      modelId === "kling-3.0/video" &&
                      klingElementDrafts.some((d) => d.name.trim() && d.urls.length >= minReferenceUrlsPerVideoElement(modelId))
                        ? "Describe the scene and use @element_name for each saved element (e.g. @product, @model)."
                        : modelId.startsWith("bytedance/seedance") &&
                            klingElementDrafts.some(
                              (d) => d.name.trim() && d.urls.length >= minReferenceUrlsPerVideoElement(modelId),
                            )
                          ? "Describe the video. Reference extra images with @image2, @image3, … (start frame is @image1), or we prepend tags if you omit them."
                          : "Describe your video, like 'A woman walking through a neon-lit city'."
                    }
                    className={cn(
                      "min-h-[120px] w-full resize-none border-white/10 bg-[#0a0a0d] px-3 py-3 text-sm text-white placeholder:text-white/35 focus-visible:ring-0",
                      promptElementTagDrafts.length > 0 ? "mt-2" : "mt-4",
                    )}
                    rows={4}
                  />
                  {(modelId === "kling-3.0/video" && !klingCustomMulti) ||
                  modelId.startsWith("bytedance/seedance") ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1.5 rounded-full border-white/15 bg-black/30 px-3 text-[11px] text-white/80 hover:bg-white/[0.06]"
                          onClick={openKlingElementsModal}
                        >
                          <AtSign className="h-3 w-3" aria-hidden />
                          Elements
                        </Button>
                        <span className="max-w-[min(100%,20rem)] text-[10px] leading-snug text-white/38">
                          {modelId === "kling-3.0/video" ? (
                            <>
                              Optional elements: 2–4 images each (upload, avatar, or studio — provider rule). Use{" "}
                              <span className="text-white/55">@name</span> in the prompt.
                            </>
                          ) : (
                            <>
                              Optional elements: image URLs only (1–4 per element).{" "}
                              {studioVideoIsSeedance2ProPickerId(modelId) ? (
                                <>
                                  For mixed <span className="text-white/55">image + video + audio</span>, use Reference
                                  media above — not inside Elements.
                                </>
                              ) : (
                                <>
                                  Preview path here is <span className="text-white/55">images only</span>; video/audio
                                  on Preview follows provider VIP rules.
                                </>
                              )}{" "}
                              Start frame <span className="text-white/55">@image1</span>, extras{" "}
                              <span className="text-white/55">@image2</span>… (max{" "}
                              {modelId.includes("preview")
                                ? SEEDANCE_PREVIEW_MAX_IMAGE_URLS
                                : SEEDANCE_PRO_MAX_IMAGE_URLS}{" "}
                              images; provider may add tags if omitted).
                            </>
                          )}
                        </span>
                      </div>
                      {klingElementDrafts.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {klingElementDrafts.map((el) => (
                            <span
                              key={el.id}
                              className="rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-200/90"
                            >
                              @{el.name.trim() || "-"}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Parameters</p>
            <div className="rounded-2xl border border-white/10 bg-[#101014] p-3 space-y-3">
              {HIDE_VIDEO_MODEL_PICKER ? null : (
                <div>
                  <StudioModelPicker
                    value={modelId}
                    items={VIDEO_MODEL_PICKER_ITEMS}
                    triggerVariant="bar"
                    panelMode="dropdown"
                    hideMeta
                    isItemLocked={(id) => !isPersonalApiActive() && !canUseStudioVideoModel(planId, id)}
                    onLockedPick={(id) => {
                      setBilling({ open: true, reason: "plan", blockedId: id, studioMode: "video" });
                    }}
                    onChange={(v) => {
                      const next = v as VideoModelId;
                      setModelId(next);
                      const choices = studioVideoDurationSecOptions(next);
                      if (choices.length && !choices.includes(duration)) setDuration(choices[0]!);
                    }}
                    featuredTitle="Video models"
                  />
                  {isSeedanceStrictNoFaceModel ? (
                    <div className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-white/45">
                      <span title="Seedance blocks face inputs (including AI faces) due to anti-deepfake policy.">
                        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                      </span>
                      <span>Face input policy (anti-deepfake): this model does not accept face input, even AI.</span>
                    </div>
                  ) : null}
                </div>
              )}

              {isSeedancePreviewModel ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-white/45">Priority</Label>
                    <div className="group relative">
                      <button
                        type="button"
                        aria-label="Priority info"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] font-bold text-white/55 transition hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/45"
                      >
                        ?
                      </button>
                      <div className="pointer-events-none absolute left-0 z-20 mt-1 hidden w-72 whitespace-pre-line rounded-lg border border-white/15 bg-[#111118] p-2.5 text-[10px] leading-snug text-white/80 shadow-xl group-hover:block group-focus-within:block">
                        {seedancePriorityInfoText}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
                    {(["normal", "vip"] as const).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setVideoPriority(tier)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                          videoPriority === tier
                            ? "border border-violet-400/60 bg-violet-500/15 text-white"
                            : "border border-white/10 bg-black/20 text-white/65 hover:border-white/20",
                        )}
                      >
                        {tier === "vip" ? "VIP" : "Normal"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {studioVideoSupportsMultiShot(modelId) ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Label className="text-xs text-white/45">Multi-shot</Label>
                      <button
                        type="button"
                        title="Create several shots and combine them into one video (max 15s total)"
                        aria-label="Create several shots and combine them into one video (max 15s total)"
                        className="inline-flex shrink-0 cursor-help rounded p-0.5 text-white/35 transition hover:text-white/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/45"
                      >
                        <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMultiShot((m) => !m)}
                      className={cn(
                        "relative h-7 w-12 shrink-0 rounded-full border transition",
                        multiShot
                          ? "border-violet-400/55 bg-violet-500/45"
                          : "border-white/15 bg-white/10",
                      )}
                      aria-pressed={multiShot}
                      aria-label="Toggle multi-shot"
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all",
                          multiShot ? "left-5" : "left-0.5",
                        )}
                      />
                    </button>
                  </div>
                  {multiShot ? (
                    <div className="space-y-2">
                      <div className="max-h-[min(50vh,22rem)] space-y-2 overflow-y-auto pr-0.5 studio-params-scroll">
                        {klingShots.map((row, idx) => (
                          <div
                            key={row.id}
                            className="rounded-xl border border-white/10 bg-black/25 p-2.5 space-y-2"
                          >
                            <div className="text-[11px] font-medium text-violet-300/85">
                              Shot {idx + 1}
                            </div>
                            <Textarea
                              value={row.prompt}
                              onChange={(e) => {
                                const v = e.target.value;
                                setKlingShots((prev) =>
                                  prev.map((s) => (s.id === row.id ? { ...s, prompt: v } : s)),
                                );
                              }}
                              placeholder={
                                idx === 0
                                  ? "Describe the first scene you imagine, with details."
                                  : `Describe scene ${idx + 1}…`
                              }
                              maxLength={500}
                              rows={3}
                              className="min-h-[72px] w-full resize-none border-white/10 bg-[#0a0a0d] px-2.5 py-2 text-xs text-white placeholder:text-white/35 focus-visible:ring-0"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-white/45">
                                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                <Select
                                  value={String(row.durationSec)}
                                  onValueChange={(v) => {
                                    const n = Number(v);
                                    setKlingShots((prev) =>
                                      prev.map((s) =>
                                        s.id === row.id ? { ...s, durationSec: n } : s,
                                      ),
                                    );
                                  }}
                                >
                                  <SelectTrigger className="h-8 w-[4.5rem] rounded-lg border-white/12 bg-[#0a0a0d] text-xs text-white">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent position="popper" className={studioSelectContentClass}>
                                    {KLING_SHOT_DURATION_OPTIONS.map((d) => (
                                      <SelectItem key={d} value={d} className={studioSelectItemClass}>
                                        {d}s
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1 rounded-full border-white/15 bg-black/30 px-2.5 text-[11px] text-white/80 hover:bg-white/[0.06]"
                                  onClick={openKlingElementsModal}
                                >
                                  <AtSign className="h-3 w-3" aria-hidden />
                                  Elements
                                </Button>
                                {klingShots.length > 1 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-white/45 hover:bg-white/[0.06] hover:text-rose-300"
                                    aria-label={`Remove shot ${idx + 1}`}
                                    onClick={() =>
                                      setKlingShots((prev) => prev.filter((s) => s.id !== row.id))
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 w-full gap-1.5 rounded-xl border-dashed border-white/20 bg-transparent text-xs text-white/70 hover:bg-white/[0.04]"
                        disabled={klingShots.length >= KLING_MULTI_MAX_SHOTS}
                        onClick={() =>
                          setKlingShots((prev) => [
                            ...prev,
                            {
                              id: crypto.randomUUID(),
                              prompt: "",
                              durationSec: 3,
                            },
                          ])
                        }
                      >
                        <CirclePlus className="h-4 w-4" />
                        Add shot
                      </Button>
                      <p
                        className={cn(
                          "text-[11px] tabular-nums",
                          klingMultiTotalSec >= 3 && klingMultiTotalSec <= 15
                            ? "text-emerald-300/90"
                            : "text-amber-200/90",
                        )}
                      >
                            Total {klingMultiTotalSec}s, each shot 1–12s; sum must be 3–15s (Kling 3.0 API).
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {meta.family === "veo" ? (
                <>
                  <div>
                    <Label className="text-xs text-white/45">Duration</Label>
                    <p className="mt-2 rounded-xl border border-white/10 bg-[#0a0a0d] px-3 py-3 text-sm text-white/75 leading-snug">
                      {STUDIO_VEO_DURATION_HINT}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-white/45">Aspect ratio</Label>
                    <Select value={veoAspect} onValueChange={(v) => setVeoAspect(v as typeof veoAspect)}>
                      <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" className={studioSelectContentClass}>
                        <SelectItem value="9:16" className={studioSelectItemClass}>
                          9:16
                        </SelectItem>
                        <SelectItem value="16:9" className={studioSelectItemClass}>
                          16:9
                        </SelectItem>
                        <SelectItem value="Auto" className={studioSelectItemClass}>
                          Auto
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  {!(modelId === "kling-3.0/video" && multiShot) ? (
                    <div>
                      <Label className="text-xs text-white/45">Duration</Label>
                      <Select value={duration} onValueChange={setDuration}>
                        <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" className={studioSelectContentClass}>
                          {durationChoices.map((d) => (
                            <SelectItem key={d} value={d} className={studioSelectItemClass}>
                              {d}s
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {studioVideoShowsAspectRatioCreate(
                    modelId,
                    Boolean(startUrl) ||
                      (compactSeedanceRefUploads && seedanceCompactRefUrls.length > 0) ||
                      (seedanceProOmniRefUploads && seedanceProOmniItems.length > 0),
                  ) ? (
                    <div>
                      <Label className="text-xs text-white/45">Aspect ratio</Label>
                      <Select value={aspect} onValueChange={setAspect}>
                        <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" className={studioSelectContentClass}>
                          <SelectItem value="9:16" className={studioSelectItemClass}>
                            9:16
                          </SelectItem>
                          <SelectItem value="16:9" className={studioSelectItemClass}>
                            16:9
                          </SelectItem>
                          <SelectItem value="1:1" className={studioSelectItemClass}>
                            1:1
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {studioVideoSupportsQualityPicker(modelId) ? (
                    <div>
                      <Label className="text-xs text-white/45">Quality</Label>
                      <Select value={klingMode} onValueChange={(v) => setKlingMode(v as "std" | "pro")}>
                        <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" className={studioSelectContentClass}>
                          {modelId === "openai/sora-2" ? (
                            <>
                              <SelectItem value="std" className={studioSelectItemClass}>
                                Standard
                              </SelectItem>
                              <SelectItem value="pro" className={studioSelectItemClass}>
                                Stable
                              </SelectItem>
                            </>
                          ) : modelId === "openai/sora-2-pro" ? (
                            <>
                              <SelectItem value="std" className={studioSelectItemClass}>
                                Standard
                              </SelectItem>
                              <SelectItem value="pro" className={studioSelectItemClass}>
                                High
                              </SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="std" className={studioSelectItemClass}>
                                720p
                              </SelectItem>
                              <SelectItem value="pro" className={studioSelectItemClass}>
                                1080p
                              </SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </>
              )}

              {studioVideoSupportsNativeAudio(modelId) ? (
                <div>
                  <Label className="text-xs text-white/45">Audio</Label>
                  <button
                    type="button"
                    onClick={() => setSoundOn((s) => !s)}
                    className={`mt-2 flex h-12 w-full items-center justify-center rounded-xl border px-3 text-sm font-medium transition ${
                      soundOn
                        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                        : "border-white/15 bg-[#0a0a0d] text-white/55"
                    }`}
                  >
                    {soundOn ? "🔊 Audio on" : "🔇 Audio off"}
                  </button>
                </div>
              ) : null}
            </div>

            <Button type="button" onClick={() => generate()} className={generateBtnClass}>
              <span className="inline-flex items-center gap-2">
                Generate
                <Sparkles className="h-5 w-5" />
                <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums">{credits}</span>
              </span>
            </Button>
            </div>
          </div>

          {outputHistoryColumn}
        </div>
      )}

      <input
        ref={klingElementFileRef}
        type="file"
        accept={STUDIO_IMAGE_FILE_ACCEPT}
        className="hidden"
        onChange={onKlingElementFileChange}
      />
      <Dialog.Root open={klingElementsModalOpen} onOpenChange={handleKlingElementsModalOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/70 backdrop-blur-[3px] transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[221] w-[min(92vw,420px)] max-h-[min(85vh,640px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#14141a] to-[#0a0a0e] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.04)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] data-[state=closed]:slide-out-to-bottom-1 data-[state=open]:slide-in-from-bottom-1 data-[state=open]:duration-200 data-[state=closed]:duration-150">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
              <Dialog.Title className="pr-2 text-[17px] font-semibold tracking-tight text-white">
                Create element
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1.5 text-white/45 transition hover:bg-white/[0.06] hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </Dialog.Close>
            </div>

            <div className="space-y-4 px-5 py-4">
              <Dialog.Description className="text-xs leading-relaxed text-white/45">
                {modelId === "kling-3.0/video" ? (
                  <>
                    <span className="text-white/55">Kling 3.0:</span> put{" "}
                    <span className="text-white/65">@element_name</span> in your prompt (main or multi-shot). Each element
                    needs <span className="text-white/65">2–4</span> images (provider rule). Up to{" "}
                    <span className="text-white/65">3</span> elements. Add references via upload,{" "}
                    <span className="text-white/55">Avatar library</span>,{" "}
                    <span className="text-white/55">Create → Image</span>,{" "}
                    <span className="text-white/55">Create → Video</span> (poster frame), or{" "}
                    <span className="text-white/55">Link to Ad</span> product photos from saved runs. Images are checked for
                    HTTPS reachability and minimum size ({KLING_ELEMENT_MEDIA_MIN_PX}px).
                  </>
                ) : modelId.startsWith("bytedance/seedance") ? (
                  <>
                    <span className="text-white/55">Seedance elements:</span> same{" "}
                    <span className="text-white/65">@image1</span> / <span className="text-white/65">@image2</span>… order
                    as the flattened URL list. Up to <span className="text-white/65">3</span> named elements,{" "}
                    <span className="text-white/65">1–4</span> images each.{" "}
                    <span className="text-white/55">Seedance 2 / Fast (Pro)</span> also supports mixed{" "}
                    <span className="text-white/65">image + video + audio</span> in the main Reference media strip (not
                    inside Elements). <span className="text-white/55">Preview</span> models here use{" "}
                    <span className="text-white/65">images only</span> for the compact frame list; video/audio on Preview
                    requires provider VIP task types per PiAPI docs.
                  </>
                ) : (
                  <>
                    Use <span className="text-white/65">@element_name</span> or image tags as required by the selected
                    model. Up to 3 elements.
                  </>
                )}
              </Dialog.Description>

              {klingElementDrafts.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/35">
                    Saved elements
                  </p>
                  <ul className="space-y-2">
                    {sortKlingElementDrafts(klingElementDrafts).map((el) => (
                      <li
                        key={el.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          {el.urls[0] ? (
                            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/12 bg-black/50">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={el.urls[0]} alt="" className="h-full w-full object-cover" />
                            </span>
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/40 text-[10px] text-white/35">
                              —
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-white/90">@{el.name.trim() || "-"}</p>
                            <p className="truncate text-[10px] text-white/40">
                              {el.description.trim() ? el.description.trim() : "No description"} · {el.urls.length}{" "}
                              image{el.urls.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-8 w-8 p-0 text-white/55 hover:bg-white/[0.06]",
                              el.pinned && "text-amber-300/95",
                            )}
                            title={el.pinned ? "Unpin" : "Pin to top"}
                            aria-label={el.pinned ? "Unpin element" : "Pin element"}
                            onClick={() => toggleElementPin(el.id)}
                          >
                            <Pin className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-[11px] text-white/70 hover:bg-white/[0.06]"
                            onClick={() => editKlingElementInModal(el)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-[11px] text-rose-300/90 hover:bg-white/[0.06] hover:text-rose-200"
                            onClick={() => removeKlingElementDraft(el.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!klingElementForm && klingElementDrafts.length >= 3 ? (
                <p className="text-xs text-white/50">
                  Remove an element above to add a new one.
                </p>
              ) : null}

              {!klingElementForm && klingElementDrafts.length < 3 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full rounded-xl border-white/15 bg-transparent text-sm text-white/80 hover:bg-white/[0.04]"
                  onClick={() =>
                    setKlingElementForm({
                      id: crypto.randomUUID(),
                      name: `element_${klingElementDrafts.length + 1}`,
                      description: "",
                      urls: [],
                    })
                  }
                >
                  Add element
                </Button>
              ) : null}

              {klingElementForm ? (
                <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="kling-element-name" className="text-xs text-white/65">
                      Name <span className="text-rose-400" aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="kling-element-name"
                      value={klingElementForm.name}
                      onChange={(e) =>
                        setKlingElementForm((f) => (f ? { ...f, name: e.target.value } : f))
                      }
                      placeholder="Enter element name"
                      className="h-10 border-white/10 bg-[#0a0a0d] text-sm text-white placeholder:text-white/35"
                      autoComplete="off"
                      aria-required
                    />
                  </div>
                  {modelId === "kling-3.0/video" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="kling-element-desc" className="text-xs text-white/65">
                        Description <span className="text-rose-400" aria-hidden="true">*</span>
                      </Label>
                      <Textarea
                        id="kling-element-desc"
                        value={klingElementForm.description}
                        onChange={(e) =>
                          setKlingElementForm((f) => (f ? { ...f, description: e.target.value } : f))
                        }
                        placeholder="Describe this element for the provider (required by Kling 3.0)."
                        rows={4}
                        className="min-h-[88px] w-full resize-none border-white/10 bg-[#0a0a0d] text-sm text-white placeholder:text-white/35 focus-visible:ring-0"
                        aria-required
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label className="text-xs text-white/65">
                      Media <span className="text-rose-400" aria-hidden="true">*</span>
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-white/15 bg-black/30 px-2.5 text-[11px] text-white/75 hover:bg-white/[0.06]"
                        disabled={klingElementUploadBusy || klingElementForm.urls.length >= 4}
                        onClick={() => {
                          setAvatarPickTarget("kling_element");
                          setAvatarPickerOpen(true);
                        }}
                      >
                        Avatar library
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-white/15 bg-black/30 px-2.5 text-[11px] text-white/75 hover:bg-white/[0.06]"
                        disabled={
                          klingElementUploadBusy ||
                          (elementRefPick.open && elementRefPick.loading) ||
                          klingElementForm.urls.length >= 4
                        }
                        onClick={() => void beginElementRefPick("studio_image")}
                      >
                        Studio images
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-white/15 bg-black/30 px-2.5 text-[11px] text-white/75 hover:bg-white/[0.06]"
                        disabled={
                          klingElementUploadBusy ||
                          (elementRefPick.open && elementRefPick.loading) ||
                          klingElementForm.urls.length >= 4
                        }
                        onClick={() => void beginElementRefPick("studio_video_poster")}
                      >
                        Video posters
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-white/15 bg-black/30 px-2.5 text-[11px] text-white/75 hover:bg-white/[0.06]"
                        disabled={
                          klingElementUploadBusy ||
                          (elementRefPick.open && elementRefPick.loading) ||
                          klingElementForm.urls.length >= 4
                        }
                        onClick={() => void beginElementRefPick("lta_product")}
                      >
                        Link to Ad products
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {klingElementForm.urls.map((u, ui) => (
                        <button
                          key={`${klingElementForm.id}-img-${ui}`}
                          type="button"
                          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10"
                          onClick={() =>
                            setKlingElementForm((f) =>
                              f ? { ...f, urls: f.urls.filter((_, j) => j !== ui) } : f,
                            )
                          }
                          title="Remove image"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                      {klingElementForm.urls.length < 4 ? (
                        <button
                          type="button"
                          disabled={klingElementUploadBusy}
                          onClick={() => pickKlingElementImage(klingElementForm.id)}
                          className="flex min-h-[120px] min-w-[min(100%,280px)] flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-[#0c0c10] px-4 py-6 text-white/45 transition hover:border-violet-400/35 hover:bg-white/[0.02] hover:text-white/65 disabled:opacity-50"
                        >
                          <Upload className="h-8 w-8 opacity-70" strokeWidth={1.5} aria-hidden />
                          <span className="text-center text-sm font-medium text-white/70">
                            Click to upload images
                          </span>
                        </button>
                      ) : null}
                    </div>
                    <p className="text-[10px] leading-snug text-white/40">
                      Images: JPEG, PNG, WebP, or GIF, at least {KLING_ELEMENT_MEDIA_MIN_PX}×
                      {KLING_ELEMENT_MEDIA_MIN_PX}px, max {Math.round(KLING_ELEMENT_MEDIA_MAX_BYTES / (1024 * 1024))}MB
                      each.{" "}
                      {modelId.startsWith("bytedance/seedance")
                        ? "1–4 images per element."
                        : "2–4 images per element (Kling 3.0)."}
                    </p>
                  </div>

                  {modelId.startsWith("bytedance/seedance") ? (
                    <details
                      key={`kling-el-adv-${klingElementForm.id}`}
                      className="group mt-3 rounded-lg border border-white/[0.08] bg-black/30"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
                        <span>Advanced</span>
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-white/45 transition group-open:rotate-180"
                          aria-hidden
                        />
                      </summary>
                      <div className="space-y-1.5 border-t border-white/[0.06] px-3 pb-3 pt-2">
                        <Label htmlFor="kling-element-desc-seed" className="text-xs text-white/55">
                          Description <span className="text-white/35">(optional)</span>
                        </Label>
                        <Textarea
                          id="kling-element-desc-seed"
                          value={klingElementForm.description}
                          onChange={(e) =>
                            setKlingElementForm((f) => (f ? { ...f, description: e.target.value } : f))
                          }
                          placeholder="Optional, extra context (defaults to the name if empty)."
                          rows={4}
                          className="min-h-[88px] w-full resize-none border-white/10 bg-[#0a0a0d] text-sm text-white placeholder:text-white/35 focus-visible:ring-0"
                        />
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-white/[0.06] bg-[#0c0c10]/95 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3">
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl border-white/[0.12] bg-transparent text-white/75 hover:bg-white/[0.05]"
                >
                  Cancel
                </Button>
              </Dialog.Close>
              {klingElementForm ? (
                <Button
                  type="button"
                  disabled={klingElementUploadBusy}
                  onClick={() => saveKlingElementForm()}
                  className="h-10 rounded-xl border border-violet-400/35 bg-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.18)] hover:bg-violet-400"
                >
                  Save
                </Button>
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={elementRefPick.open}
        onOpenChange={(o) => {
          if (!o) setElementRefPick({ open: false });
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[225] bg-black/70 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[226] w-[min(92vw,480px)] max-h-[min(85vh,560px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101014] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Dialog.Title className="text-base font-semibold text-white">
                {elementRefPick.open
                  ? elementRefPick.variant === "studio_image"
                    ? "Studio images"
                    : elementRefPick.variant === "studio_video_poster"
                      ? "Studio videos (posters)"
                      : "Link to Ad product photos"
                  : "Pick reference"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/[0.06] hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Pick an image URL to attach to the current element. Remote images are checked for HTTPS reachability and
              minimum dimensions when possible.
            </Dialog.Description>
            {!elementRefPick.open ? null : elementRefPick.loading ? (
              <p className="py-8 text-center text-sm text-white/50">Loading…</p>
            ) : elementRefPick.variant === "lta_product" ? (
              elementRefPick.ltaUrls.length === 0 ? (
                <p className="py-6 text-sm leading-relaxed text-white/55">
                  No Link to Ad product thumbnails found on recent runs. Finish a Link to Ad flow (product preview +
                  photos), then try again.
                </p>
              ) : (
                <div className="max-h-[min(52vh,380px)] overflow-y-auto studio-params-scroll pr-1">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {elementRefPick.ltaUrls.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          void (async () => {
                            const ok = await tryAddHttpsImageToKlingElementForm(u);
                            if (ok) setElementRefPick({ open: false });
                          })();
                        }}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-white/12 bg-black/40 transition hover:border-violet-400/45"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-full w-full object-cover" />
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 py-1.5 text-[10px] font-medium text-white/90 opacity-0 transition group-hover:opacity-100">
                          Add
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : elementRefPick.studioItems.length === 0 ? (
              <p className="py-6 text-sm leading-relaxed text-white/55">
                {elementRefPick.variant === "studio_image" ? (
                  <>
                    No completed studio images yet. Generate images in{" "}
                    <span className="font-medium text-white/75">Create → Image</span>, then try again.
                  </>
                ) : (
                  <>
                    No completed studio videos with a poster yet. Generate video in{" "}
                    <span className="font-medium text-white/75">Create → Video</span>, then pick its poster here.
                  </>
                )}
              </p>
            ) : (
              <div className="max-h-[min(52vh,380px)] overflow-y-auto studio-params-scroll pr-1">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {elementRefPick.studioItems.map((item) => {
                    const u =
                      elementRefPick.variant === "studio_video_poster"
                        ? (item.posterUrl ?? "").trim()
                        : (item.mediaUrl ?? "").trim();
                    if (!u) return null;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          void (async () => {
                            const ok = await tryAddHttpsImageToKlingElementForm(u);
                            if (ok) setElementRefPick({ open: false });
                          })();
                        }}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-white/12 bg-black/40 transition hover:border-violet-400/45"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-full w-full object-cover" />
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 py-1.5 text-[10px] font-medium text-white/90 opacity-0 transition group-hover:opacity-100">
                          Add
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <StudioBillingDialog
        open={billing.open}
        onOpenChange={(o) => {
          if (!o) setBilling({ open: false });
        }}
        planId={planId}
        studioMode={billing.open ? billing.studioMode : "video"}
        variant={
          !billing.open
            ? { kind: "credits", currentCredits: 0, requiredCredits: 0 }
            : billing.reason === "plan"
              ? { kind: "plan", blockedModelId: billing.blockedId }
              : { kind: "credits", currentCredits: creditsBalance, requiredCredits: billing.required }
        }
      />
      <AvatarPickerDialog
        open={avatarPickerOpen}
        onOpenChange={setAvatarPickerOpen}
        avatarUrls={avatarUrls}
        onPick={onPickAvatar}
        title={
          avatarPickTarget === "kling_element"
            ? "Choose image for element"
            : avatarPickTarget === "edit_elements"
              ? "Choose image for video edit"
              : avatarPickTarget === "edit_motion"
                ? "Choose character image"
                : avatarPickTarget === "create_end"
                  ? "Choose avatar for end frame"
                  : "Choose avatar for start frame"
        }
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AtSign, CirclePlus, Expand, ImageIcon, Shrink, Sparkles, VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AvatarInputCornerBadge } from "@/app/_components/AvatarInputCornerBadge";
import { StudioEmptyExamples, StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import { StudioGenerationsHistory } from "@/app/_components/StudioGenerationsHistory";
import { userMessageFromCaughtError } from "@/lib/generationUserMessage";
import {
  STUDIO_IMAGE_FILE_ACCEPT,
  STUDIO_VIDEO_FILE_ACCEPT,
} from "@/lib/studioUploadValidation";
import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
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
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";
import { calculateVideoCredits } from "@/lib/linkToAd/generationCredits";
import {
  calculateStudioVideoEditCredits,
  VEO_3_1_FAST,
  VEO_3_1_QUALITY,
} from "@/lib/pricing";
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
import { STUDIO_VIDEO_TAB_KINDS } from "@/lib/studioGenerationKinds";

const LS_STUDIO_VIDEO_HISTORY = "ugc_studio_video_history_v1";

const STUDIO_VIDEO_LIBRARY_KIND_PARAM = STUDIO_VIDEO_TAB_KINDS.join(",");

type VideoTab = "create" | "edit";

type VideoModelId =
  | "kling-3.0/video"
  | "kling-2.6/video"
  | "openai/sora-2"
  | "openai/sora-2-pro"
  | "bytedance/seedance-2-preview"
  | "bytedance/seedance-2-fast-preview"
  | "veo3_fast"
  | "veo3";

type VideoFamily = "kie" | "veo" | "sora";

const MODEL_OPTIONS: { id: VideoModelId; label: string; family: VideoFamily }[] = [
  { id: "kling-3.0/video", label: "Kling 3.0", family: "kie" },
  { id: "kling-2.6/video", label: "Kling 2.6", family: "kie" },
  { id: "openai/sora-2", label: "Sora 2", family: "sora" },
  { id: "openai/sora-2-pro", label: "Sora 2 Pro", family: "sora" },
  { id: "bytedance/seedance-2-preview", label: "Seedance 2 Preview", family: "kie" },
  { id: "bytedance/seedance-2-fast-preview", label: "Seedance 2 Turbo Preview", family: "kie" },
  { id: "veo3_fast", label: "Veo 3.1 Fast", family: "veo" },
  { id: "veo3", label: "Veo 3.1", family: "veo" },
];

const VIDEO_EDIT_MODEL_PICKER_ITEMS: StudioModelPickerItem[] = [
  {
    id: "studio-edit/kling-omni",
    label: "Kling 3.0 Omni Edit",
    subtitle: "Edit videos with text prompts",
    icon: "kling",
    exclusive: true,
    resolution: "720p / 1080p",
    durationRange: "3–10s",
    searchText: "kling omni edit",
  },
  {
    id: "studio-edit/kling-o1",
    label: "Kling O1 Video Edit",
    subtitle: "Generate with elements and references",
    icon: "kling",
    resolution: "720p / 1080p",
    durationRange: "3–10s",
    searchText: "kling o1 video edit",
  },
  {
    id: "studio-edit/motion",
    label: "Kling 3.0 Motion Control",
    subtitle: "Control motion with video references",
    icon: "kling",
    resolution: "720p / 1080p",
    durationRange: "3–30s",
    searchText: "motion control",
  },
  {
    id: "studio-edit/motion-v3",
    label: "Kling 3.0 Motion Control",
    subtitle: "Transfer motion from video to image",
    icon: "kling",
    resolution: "720p / 1080p",
    durationRange: "3–30s",
    searchText: "kling 3 motion",
  },
  {
    id: "studio-edit/grok",
    label: "Grok Imagine Edit",
    subtitle: "Edit videos with text prompts",
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
    resolution: "1080p",
    durationRange: "3–15s",
  },
  {
    id: "kling-2.6/video",
    label: "Kling 2.6",
    icon: "kling",
    hasAudio: true,
    resolution: "1080p",
    durationRange: "5–10s",
  },
  {
    id: "openai/sora-2",
    label: "Sora 2",
    icon: "sora",
    resolution: "1080p",
    durationRange: "10–15s",
  },
  {
    id: "openai/sora-2-pro",
    label: "Sora 2 Pro",
    icon: "sora",
    resolution: "1080p",
    durationRange: "10–15s",
  },
  {
    id: "bytedance/seedance-2-preview",
    label: "Seedance 2 Preview",
    subtitle: "PiAPI · image → video",
    icon: "seedance",
    newBadge: true,
    resolution: "1080p",
    durationRange: "5–15s",
    searchText: "seedance preview piapi bytedance",
  },
  {
    id: "bytedance/seedance-2-fast-preview",
    label: "Seedance 2 Turbo Preview",
    subtitle: "PiAPI · faster preview",
    icon: "seedance",
    resolution: "1080p",
    durationRange: "5–15s",
    searchText: "seedance turbo fast preview piapi",
  },
  {
    id: "veo3_fast",
    label: "Veo 3.1 Fast",
    subtitle: `Veo 3.1 · Fast · ${VEO_3_1_FAST.credits} credits / video`,
    icon: "veo",
    resolution: "1080p",
    durationRange: "5–10s",
  },
  {
    id: "veo3",
    label: "Veo 3.1",
    subtitle: `Veo 3.1 · Quality · ${VEO_3_1_QUALITY.credits} credits / video`,
    icon: "veo",
    resolution: "1080p",
    durationRange: "5–10s",
  },
];

/** First allowed Edit picker when plan changes. */
const VIDEO_EDIT_PICKER_ACCESS_ORDER = [...STUDIO_VIDEO_EDIT_PICKER_IDS];

/** Cheapest first; used to pick a valid model after plan change. */
const VIDEO_MODEL_ACCESS_ORDER: VideoModelId[] = [
  "kling-2.6/video",
  "bytedance/seedance-2-fast-preview",
  "bytedance/seedance-2-preview",
  "veo3_fast",
  "kling-3.0/video",
  "veo3",
  "openai/sora-2",
  "openai/sora-2-pro",
];

function getDurationChoices(modelId: VideoModelId): string[] {
  switch (modelId) {
    case "kling-3.0/video":
      return ["5", "10", "12", "15"];
    case "kling-2.6/video":
      return ["5", "10"];
    case "openai/sora-2":
      return ["10", "15"];
    case "openai/sora-2-pro":
      return ["10", "15"];
    case "bytedance/seedance-2-preview":
    case "bytedance/seedance-2-fast-preview":
      return ["5", "10", "15"];
    default:
      return ["5", "10"];
  }
}

function modelHasQuality(id: VideoModelId): boolean {
  return (
    id === "kling-3.0/video" ||
    id === "kling-2.6/video" ||
    id === "openai/sora-2" ||
    id === "openai/sora-2-pro"
  );
}

function modelHasAudio(id: VideoModelId): boolean {
  return id === "kling-3.0/video" || id === "kling-2.6/video";
}

function modelHasMultiShot(id: VideoModelId): boolean {
  return id === "kling-3.0/video";
}

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
}) {
  try {
    await fetch("/api/studio/generations/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...params,
        piapiApiKey: getPersonalPiapiApiKey() ?? undefined,
      }),
    });
  } catch {
    /* history registration should not block generation */
  }
}

async function pollKlingVideo(
  taskId: string,
  personalApiKey?: string,
  piapiApiKey?: string,
): Promise<string> {
  const p = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  const pi = piapiApiKey ? `&piapiApiKey=${encodeURIComponent(piapiApiKey)}` : "";
  const keyParam = `${p}${pi}`;
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}${keyParam}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { status?: string; response?: string[]; error_message?: string | null };
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Kling status failed");
    const st = json.data?.status;
    if (st === "SUCCESS") {
      const u = json.data?.response?.[0];
      if (!u) throw new Error("No video URL");
      return u;
    }
    if (st === "FAILED") throw new Error(json.data?.error_message || "Kling failed");
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Kling timeout");
}

async function pollVeoVideo(taskId: string, personalApiKey?: string): Promise<string> {
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`/api/kie/veo/status?taskId=${encodeURIComponent(taskId)}${keyParam}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { successFlag?: number; errorMessage?: string | null; response?: { resultUrls?: string[] } };
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Veo status failed");
    const d = json.data;
    if (!d) throw new Error("No data");
    if (d.successFlag === 1) {
      const u = d.response?.resultUrls?.[0];
      if (!u) throw new Error("No video URL");
      return u;
    }
    if (d.successFlag === 2 || d.successFlag === 3) {
      throw new Error(d.errorMessage || "Veo generation failed");
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Veo timeout");
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
  const [prompt, setPrompt] = useState("");
  const [multiShot, setMultiShot] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  /** Set to `true` to lock UI to a single model (e.g. maintenance). */
  const HIDE_VIDEO_MODEL_PICKER = false;
  /** Temporarily hide Video → Edit tab (edit models unavailable). */
  const HIDE_VIDEO_EDIT_TAB = true;
  const FORCED_VIDEO_MODEL_ID: VideoModelId = "openai/sora-2";
  const [modelId, setModelId] = useState<VideoModelId>(VIDEO_MODEL_ACCESS_ORDER[0]!);
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
  /** Client-side optimistic job IDs that must survive server poll replacements. */
  const inFlightJobsRef = useRef<Set<string>>(new Set());
  const grantCreditsRef = useRef(grantCredits);
  grantCreditsRef.current = grantCredits;

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/studio/generations?kind=${encodeURIComponent(STUDIO_VIDEO_LIBRARY_KIND_PARAM)}`,
        { cache: "no-store" },
      );
      if (res.status === 401) {
        setServerHistory(false);
        setHistoryItems([]);
        return;
      }
      if (!res.ok) {
        setServerHistory(false);
        setHistoryItems(readStudioHistoryLocal(LS_STUDIO_VIDEO_HISTORY));
        return;
      }
      const json = (await res.json()) as { data?: StudioHistoryItem[]; refundHints?: { jobId: string; credits: number }[] };
      setServerHistory(true);
      const serverItems = json.data ?? [];
      setHistoryItems((prev) => {
        const optimistic = prev.filter((i) => inFlightJobsRef.current.has(i.id));
        if (!optimistic.length) return serverItems;
        const serverIds = new Set(serverItems.map((s) => s.id));
        const kept = optimistic.filter((o) => !serverIds.has(o.id));
        return [...kept, ...serverItems];
      });
      const hints = json.refundHints ?? [];
      if (hints.length) {
        for (const h of hints) {
          if (h.credits > 0) grantCreditsRef.current(h.credits);
        }
        toast.message("Credits refunded", { description: "A studio generation failed after charge." });
      }
    })();
  }, []);

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
          const serverItems = json.data;
          setHistoryItems((prev) => {
            const optimistic = prev.filter((i) => inFlightJobsRef.current.has(i.id));
            if (!optimistic.length) return serverItems;
            const serverIds = new Set(serverItems.map((s) => s.id));
            const kept = optimistic.filter((o) => !serverIds.has(o.id));
            return [...kept, ...serverItems];
          });
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
  }, [serverHistory]);

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
    "create_start" | "create_end" | "edit_motion" | "edit_elements"
  >("create_start");

  const meta = MODEL_OPTIONS.find((m) => m.id === modelId)!;
  /** Seedance / non-Kling KIE models need a start image; Veo, Sora, Kling 2.6/3.0 text-to-video do not. */
  const startFrameOptional =
    meta.family === "veo" ||
    meta.family === "sora" ||
    modelId === "kling-3.0/video" ||
    modelId === "kling-2.6/video";
  const durationChoices = getDurationChoices(modelId);

  const credits = useMemo(
    () =>
      calculateVideoCredits({
        modelId,
        duration: Number(duration),
        audio: soundOn,
        quality: klingMode,
      }),
    [modelId, duration, soundOn, klingMode],
  );

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
    const choices = getDurationChoices(FORCED_VIDEO_MODEL_ID);
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
    const choices = getDurationChoices(next);
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
        toast.error("Échec de l’upload", {
          description: userMessageFromCaughtError(e, "Utilise JPEG, PNG, WebP ou GIF."),
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

  const onPickAvatar = useCallback(
    (url: string) => {
      if (avatarPickTarget === "edit_motion") {
        applyAvatarToMotionCharacter(url);
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
        toast.error("Échec de l’upload", {
          description: userMessageFromCaughtError(e, "Utilise MP4, MOV ou WebM."),
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
        toast.error("Échec de l’upload", {
          description: userMessageFromCaughtError(e, "Utilise JPEG, PNG, WebP ou GIF."),
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
        toast.error("Échec de l’upload", {
          description: userMessageFromCaughtError(e, "Utilise MP4, MOV ou WebM."),
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
        toast.error("Échec de l’upload", {
          description: userMessageFromCaughtError(e, "Utilise JPEG, PNG, WebP ou GIF."),
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
          toast.error("Échec du collage", {
            description: userMessageFromCaughtError(e, "Utilise JPEG, PNG, WebP ou GIF."),
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
          toast.error("Échec du collage", {
            description: userMessageFromCaughtError(e, "Utilise JPEG, PNG, WebP ou GIF."),
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
        toast.error("Échec du collage", {
          description: userMessageFromCaughtError(e, "Utilise JPEG, PNG, WebP ou GIF."),
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
    inFlightJobsRef.current.add(jobId);
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

    void (async () => {
      try {
        const editPKey = getPersonalApiKey();
        if (snap.motionEdit) {
          const res = await fetch("/api/kling/motion-control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountPlan: snap.planId,
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
          await registerStudioTask({
            kind: "studio_video",
            label,
            taskId: json.taskId,
            model: "motion_control",
            creditsCharged: platformChargeEdit,
            personalApiKey: editPKey,
            inputUrls: [snap.editMotionImageUrl, snap.editMotionVideoUrl].filter(Boolean) as string[],
          });
          toast.message("Motion control started", { description: "Polling…" });
          const url = await pollKlingVideo(json.taskId, editPKey, getPersonalPiapiApiKey() ?? undefined);
          const doneAt = Date.now();
          inFlightJobsRef.current.delete(jobId);
          setHistoryItems((prev) => {
            const rest = prev.filter((i) => i.id !== jobId);
            return [
              {
                id: `${jobId}-done-${doneAt}`,
                kind: "video",
                status: "ready",
                label,
                mediaUrl: url,
                posterUrl: snap.editMotionImageUrl ?? undefined,
                createdAt: doneAt,
                model: "motion_control",
                modelLabel: "Motion control",
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
        await registerStudioTask({
          kind: "studio_video",
          label,
          taskId: json.taskId,
          model: snap.editPickerId,
          creditsCharged: platformChargeEdit,
          personalApiKey: editPKey,
          inputUrls: [snap.editVideoUrl, ...(snap.editElementUrls || [])].filter(Boolean) as string[],
        });
        toast.message("Edit started", { description: "Polling provider…" });
        const url = await pollKlingVideo(json.taskId, editPKey, getPersonalPiapiApiKey() ?? undefined);
        const doneAt = Date.now();
        inFlightJobsRef.current.delete(jobId);
        setHistoryItems((prev) => {
          const rest = prev.filter((i) => i.id !== jobId);
          return [
            {
              id: `${jobId}-done-${doneAt}`,
              kind: "video",
              status: "ready",
              label,
              mediaUrl: url,
              posterUrl: snap.editElementUrls[0] ?? undefined,
              createdAt: doneAt,
              model: snap.editPickerId,
              modelLabel: studioVideoEditPickerDisplayLabel(snap.editPickerId),
            },
            ...rest,
          ];
        });
        toast.success("Video ready");
      } catch (e) {
        const msg = userMessageFromCaughtError(e, "Something went wrong while generating. Please try again.");
        refundPlatformCredits(platformChargeEdit, grantCredits, creditsRef);
        toast.error(msg);
        inFlightJobsRef.current.delete(jobId);
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
    const p = prompt.trim();
    if (!p) {
      toast.error("Describe your video.");
      return;
    }
    if (meta.family === "kie" && modelId !== "kling-3.0/video" && modelId !== "kling-2.6/video" && !startUrl) {
      toast.error("Add a start frame image for this model.");
      return;
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

    const jobId = crypto.randomUUID();
    inFlightJobsRef.current.add(jobId);
    const label = p;
    const platformChargeCreate = creditBypassCreate ? 0 : credits;
    if (!creditBypassCreate) {
      spendCredits(credits);
      creditsRef.current = Math.max(0, creditsRef.current - credits);
    }
    const startedAt = Date.now();
    setHistoryItems((prev) => [
      {
        id: jobId,
        kind: "video",
        status: "generating",
        label,
        posterUrl: startUrl ?? undefined,
        createdAt: startedAt,
        model: modelId,
        modelLabel: studioVideoDisplayLabel(modelId),
      },
      ...prev,
    ]);

    const snap = {
      family: meta.family,
      modelId,
      planId,
      prompt: p,
      startUrl,
      endUrl,
      duration,
      veoAspect,
      aspect,
      klingMode,
      soundOn,
      multiShot,
    };

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
          await registerStudioTask({
            kind: "studio_video",
            label,
            taskId: json.taskId,
            model: snap.modelId,
            creditsCharged: platformChargeCreate,
            personalApiKey: pKey,
            inputUrls: snap.startUrl ? [snap.startUrl] : undefined,
          });
          toast.message(
            snap.modelId === "openai/sora-2-pro" ? "Sora 2 Pro started" : "Sora 2 started",
            { description: "Rendering…" },
          );
          const url = await pollKlingVideo(json.taskId, pKey, piKey);
          const doneAt = Date.now();
          inFlightJobsRef.current.delete(jobId);
          setHistoryItems((prev) => {
            const rest = prev.filter((i) => i.id !== jobId);
            return [
              {
                id: `${jobId}-done-${doneAt}`,
                kind: "video",
                status: "ready",
                label,
                mediaUrl: url,
                posterUrl: snap.startUrl ?? undefined,
                createdAt: doneAt,
                model: snap.modelId,
                modelLabel: studioVideoDisplayLabel(snap.modelId),
              },
              ...rest,
            ];
          });
          toast.success("Video ready");
          return;
        }

        if (snap.family === "veo") {
          const urls = [snap.startUrl, snap.endUrl].filter(Boolean) as string[];
          let generationType: "TEXT_2_VIDEO" | "FIRST_AND_LAST_FRAMES_2_VIDEO" | "REFERENCE_2_VIDEO" =
            "TEXT_2_VIDEO";
          if (urls.length >= 2) generationType = "FIRST_AND_LAST_FRAMES_2_VIDEO";
          else if (urls.length === 1) generationType = "REFERENCE_2_VIDEO";

          const res = await fetch("/api/kie/veo/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accountPlan: snap.planId,
              prompt: snap.prompt,
              model: snap.modelId === "veo3" ? "veo3" : "veo3_fast",
              aspectRatio: snap.veoAspect,
              generationType,
              imageUrls: urls.length ? urls : undefined,
              personalApiKey: pKey,
            }),
          });
          const json = (await res.json()) as { taskId?: string; error?: string };
          if (!res.ok || !json.taskId) throw new Error(json.error || "Veo failed");
          await registerStudioTask({
            kind: "studio_video",
            label,
            taskId: json.taskId,
            model: snap.modelId,
            creditsCharged: platformChargeCreate,
            personalApiKey: pKey,
            inputUrls: urls.length ? urls : undefined,
          });
          toast.message("Veo started", { description: "Rendering…" });
          const url = await pollVeoVideo(json.taskId, pKey);
          const doneAt = Date.now();
          inFlightJobsRef.current.delete(jobId);
          setHistoryItems((prev) => {
            const rest = prev.filter((i) => i.id !== jobId);
            return [
              {
                id: `${jobId}-done-${doneAt}`,
                kind: "video",
                status: "ready",
                label,
                mediaUrl: url,
                posterUrl: snap.startUrl ?? undefined,
                createdAt: doneAt,
                model: snap.modelId,
                modelLabel: studioVideoDisplayLabel(snap.modelId),
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
        const isSeedancePreview =
          snap.modelId === "bytedance/seedance-2-preview" ||
          snap.modelId === "bytedance/seedance-2-fast-preview";
        const res = await fetch("/api/kling/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountPlan: snap.planId,
            marketModel: snap.modelId,
            prompt: snap.prompt,
            imageUrl: snap.startUrl ?? undefined,
            duration: Number(snap.duration),
            aspectRatio:
              (isKling30 || isKling26) && !snap.startUrl
                ? snap.aspect
                : isSeedancePreview && snap.startUrl
                  ? snap.aspect
                  : undefined,
            sound: modelHasAudio(snap.modelId) ? snap.soundOn : undefined,
            mode: isKling30 || isKling26 || isSora2Pro ? snap.klingMode : undefined,
            multiShots: isKling30 ? snap.multiShot : undefined,
            personalApiKey: pKey,
            piapiApiKey: piKey,
          }),
        });
        const json = (await res.json()) as { taskId?: string; provider?: string; error?: string };
        if (!res.ok || !json.taskId) throw new Error(json.error || "Video task failed");
        await registerStudioTask({
          kind: "studio_video",
          label,
          taskId: json.taskId,
          provider: json.provider,
          model: snap.modelId,
          creditsCharged: platformChargeCreate,
          personalApiKey: pKey,
          inputUrls: snap.startUrl ? [snap.startUrl] : undefined,
        });
        toast.message("Generation started", { description: "Polling provider…" });
        const url = await pollKlingVideo(json.taskId, pKey, piKey);
        const doneAt = Date.now();
        inFlightJobsRef.current.delete(jobId);
        setHistoryItems((prev) => {
          const rest = prev.filter((i) => i.id !== jobId);
          return [
            {
              id: `${jobId}-done-${doneAt}`,
              kind: "video",
              status: "ready",
              label,
              mediaUrl: url,
              posterUrl: snap.startUrl ?? undefined,
              createdAt: doneAt,
              model: snap.modelId,
              modelLabel: studioVideoDisplayLabel(snap.modelId),
            },
            ...rest,
          ];
        });
        toast.success("Video ready");
      } catch (e) {
        const msg = userMessageFromCaughtError(e, "Something went wrong while generating. Please try again.");
        refundPlatformCredits(platformChargeCreate, grantCredits, creditsRef);
        toast.error(msg);
        inFlightJobsRef.current.delete(jobId);
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
                  {/* Avatar library is accessible via the corner badge on the image input. */}
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
                  {/* Avatar library is accessible via the corner badge on the image input(s). */}
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
                  <p className="text-[10px] leading-snug text-white/35">
                    Describe background and scene details. Motion is controlled by your reference video.
                  </p>
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
                  <p className="mt-0.5 text-[10px] leading-snug text-white/35">
                    Select the mode you want — credits update accordingly.
                  </p>
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
                  <Label className="text-xs text-white/45">Scene control</Label>
                  <p className="mt-0.5 text-[10px] leading-snug text-white/35">
                    Background driven by the motion clip vs the character still ({" "}
                    <code className="text-white/45">background_source</code>).
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
                        Video
                      </SelectItem>
                      <SelectItem value="input_image" className={studioSelectItemClass}>
                        Image
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
                  disabled={frameUploadBusy}
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
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your video, like 'A woman walking through a neon-lit city'."
                className="mt-4 min-h-[120px] w-full resize-none border-white/10 bg-[#0a0a0d] px-3 py-3 text-sm text-white placeholder:text-white/35 focus-visible:ring-0"
                rows={4}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                  ✨ Studio
                </span>
              </div>
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
                      const choices = getDurationChoices(next);
                      if (!choices.includes(duration)) setDuration(choices[0]);
                    }}
                    featuredTitle="Video models"
                  />
                </div>
              )}

              {modelHasMultiShot(modelId) ? (
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs text-white/45">Multi-shot</Label>
                  <button
                    type="button"
                    onClick={() => setMultiShot((m) => !m)}
                    className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
                      multiShot
                        ? "border-violet-400/50 bg-violet-500/40"
                        : "border-white/15 bg-white/10"
                    } disabled:opacity-40`}
                    aria-pressed={multiShot}
                  >
                    <span
                      className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${
                        multiShot ? "left-5" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
              ) : null}

              {meta.family === "veo" ? (
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
              ) : (
                <>
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
                  {((modelId === "kling-3.0/video" || modelId === "kling-2.6/video") && !startUrl) ||
                  ((modelId === "bytedance/seedance-2-preview" ||
                    modelId === "bytedance/seedance-2-fast-preview") &&
                    Boolean(startUrl)) ? (
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
                  {modelHasQuality(modelId) ? (
                    <div>
                      <Label className="text-xs text-white/45">Quality</Label>
                      <p className="mt-0.5 text-[10px] leading-snug text-white/35">
                        {modelId === "openai/sora-2"
                          ? "Standard or Stable (stable uses the higher quality tier — credits update accordingly)."
                          : modelId === "openai/sora-2-pro"
                            ? "Standard or High (Pro). Credits match the Sora 2 Pro sheet."
                            : modelId === "kling-2.6/video"
                              ? "Pick a mode — credits update accordingly."
                              : "Pick a mode — credits update accordingly."}
                      </p>
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

              {modelHasAudio(modelId) ? (
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
        title="Choose avatar for video upload"
      />
    </div>
  );
}

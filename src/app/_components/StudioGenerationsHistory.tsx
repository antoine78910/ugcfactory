"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, FolderOpen, Info, LayoutGrid, List, Loader2, Mic, Sparkles, Trash2, Volume2, Wand2, X } from "lucide-react";
import { CreditCostBadge } from "@/app/_components/CreditCostBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StudioUpscaleDiscreteSlider } from "@/app/_components/StudioUpscaleDiscreteSlider";
import VideoCard from "@/app/_components/VideoCard";
import { isStudioGenerationRowId } from "@/lib/studioGenerationRowId";
import { proxiedMediaSrc } from "@/lib/mediaProxyUrl";
import { isStudioSeedreamImagePickerId, studioImageModelSupportsResolutionPicker } from "@/lib/studioImageModels";
import { formatDisplayCredits } from "@/lib/creditLedgerTicks";
import { studioImageCreditsChargedTotal, VOICE_CHANGE_CREDITS_FLAT } from "@/lib/pricing";
import { studioHistoryAspectRatioCssValue } from "@/lib/studioHistoryAspect";

export type StudioHistoryMediaKind = "image" | "video" | "motion" | "audio";

export type StudioHistoryItem = {
  id: string;
  kind: StudioHistoryMediaKind;
  status: "generating" | "ready" | "failed";
  /** Prompt or short description */
  label: string;
  mediaUrl?: string;
  /** Optional poster (e.g. motion reference) */
  posterUrl?: string;
  errorMessage?: string;
  /** Show “Credits refunded” pill (e.g. after a failed run) */
  creditsRefunded?: boolean;
  createdAt: number;
  /** When row comes from `studio_generations` (avatar, studio_image, …). */
  studioGenerationKind?: string;
  /** Input image/video URLs used for this generation. */
  inputUrls?: string[];
  /** Backend model / picker id (optional). */
  model?: string;
  /** Human-readable model name for UI (optional). */
  modelLabel?: string;
  /** Aspect chosen in Studio (e.g. 16:9, 9:16, 3:4) — drives history thumbnail frame. */
  aspectRatio?: string;
  /**
   * Supabase `studio_generations.id` from `/api/studio/generations/register`.
   * Used to hide a stale “processing” server row when the client already has a ready item with media.
   */
  studioGenerationId?: string;
  /** Provider task id (KIE / PiAPI) — used to restore in-flight rows after reload. */
  externalTaskId?: string;
};

function formatHistoryDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function groupByDate(items: StudioHistoryItem[]): { date: string; rows: StudioHistoryItem[] }[] {
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
  const map = new Map<string, StudioHistoryItem[]>();
  for (const item of sorted) {
    const d = formatHistoryDate(item.createdAt);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(item);
  }
  const groups = [...map.entries()].map(([date, rows]) => ({ date, rows }));
  groups.sort((a, b) => (b.rows[0]?.createdAt ?? 0) - (a.rows[0]?.createdAt ?? 0));
  return groups;
}

export function isProbablyVideoUrl(url: string | undefined): boolean {
  const u = (url || "").trim().toLowerCase();
  if (!u) return false;
  // Common direct video extensions + blob urls.
  if (u.startsWith("blob:")) return true;
  return (
    u.includes(".mp4") ||
    u.includes(".mov") ||
    u.includes(".webm") ||
    u.includes("video/mp4") ||
    u.includes("video/quicktime") ||
    u.includes("video/webm")
  );
}

export function isProbablyAudioUrl(url: string | undefined): boolean {
  const u = (url || "").trim().toLowerCase();
  if (!u) return false;
  return (
    u.includes(".mp3") ||
    u.includes(".wav") ||
    u.includes(".m4a") ||
    u.includes(".ogg") ||
    u.includes(".opus") ||
    u.includes(".aac") ||
    u.includes("audio/")
  );
}

export type StudioImageLightboxEditModelOption = { value: string; label: string };

/** Image tab: edit open image with same fields as Studio (NanoBanana + Seedream image-to-image). */
export type StudioImageLightboxEditConfig = {
  nanoAspectOptions: readonly string[];
  proAspectOptions: readonly string[];
  /** Seedream unified pickers — same list as Studio main panel (no `auto`). */
  seedreamAspectOptions: readonly string[];
  resolutionOptions: readonly ("1K" | "2K" | "4K")[];
  seedModel: string;
  /** Models shown in the lightbox edit dropdown (e.g. nano, pro, Seedream I2I). */
  editModelOptions: StudioImageLightboxEditModelOption[];
  seedAspect: string;
  seedResolution: "1K" | "2K" | "4K";
  onSubmitEdit: (payload: {
    sourceUrl: string;
    prompt: string;
    model: string;
    aspectRatio: string;
    resolution: "1K" | "2K" | "4K";
  }) => void;
};

/** Studio Images: Topaz image upscale from history lightbox. */
export type StudioImageLightboxUpscaleConfig = {
  /** Kie factors 2 / 4 / 8 → 2K / 4K / 8K (not video-style 1×/2×/4×). */
  upscaleFactorOptions?: readonly ("2" | "4" | "8")[];
  seedFactor?: "2" | "4" | "8";
  creditsFor: (factor: string) => number;
  onSubmitUpscale: (payload: { sourceUrl: string; upscaleFactor: string }) => void;
};

type Props = {
  items: StudioHistoryItem[];
  empty: ReactNode;
  /** Shown in generating subtitle */
  mediaLabel?: string;
  /** Studio Images: Nano Banana image-to-image from history lightbox */
  imageLightboxEdit?: StudioImageLightboxEditConfig;
  imageLightboxUpscale?: StudioImageLightboxUpscaleConfig;
  /**
   * Failed rows fade out after `delayMs`, then `onDismissFailed(id)` is called so the parent can remove them.
   * Defaults: delay 3s, fade ~700ms.
   */
  failedAutoDismiss?: boolean | { delayMs?: number; fadeMs?: number };
  onDismissFailed?: (id: string) => void;
  /** Remove item from UI; when the row is saved in Supabase, it is deleted on the server first. */
  onItemDeleted?: (id: string) => void;
  /** Called when the user wants to change the voice of a video item. */
  onChangeVoice?: (item: StudioHistoryItem) => void;
};

export function StudioGenerationsHistory({
  items,
  empty,
  mediaLabel = "Generation",
  imageLightboxEdit,
  imageLightboxUpscale,
  failedAutoDismiss,
  onDismissFailed,
  onItemDeleted,
  onChangeVoice,
}: Props) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [zoom, setZoom] = useState(100);
  const [lightboxItem, setLightboxItem] = useState<{
    sourceId: string;
    url: string;
    poster?: string;
    kind: "image" | "video" | "audio";
    prompt: string;
    inputUrls?: string[];
    modelLabel?: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editModel, setEditModel] = useState<string>("pro");
  const [editAspect, setEditAspect] = useState("3:4");
  const [editResolution, setEditResolution] = useState<"1K" | "2K" | "4K">("2K");
  const [upscaleFactor, setUpscaleFactor] = useState<"2" | "4" | "8">("2");
  const lightboxVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!lightboxItem?.url || !imageLightboxEdit) return;
    setEditPrompt("");
    const seed = imageLightboxEdit.seedModel;
    const allowed = new Set(imageLightboxEdit.editModelOptions.map((o) => o.value));
    setEditModel(allowed.has(seed) ? seed : "pro");
    setEditAspect(imageLightboxEdit.seedAspect);
    setEditResolution(imageLightboxEdit.seedResolution);
  }, [lightboxItem?.url, imageLightboxEdit]);

  useEffect(() => {
    if (!lightboxItem?.url || !imageLightboxUpscale) return;
    const seed = imageLightboxUpscale.seedFactor ?? "2";
    setUpscaleFactor(seed);
  }, [lightboxItem?.url, imageLightboxUpscale]);

  const editAspectOptions = useMemo(() => {
    if (!imageLightboxEdit) return [];
    if (editModel === "nano") return [...imageLightboxEdit.nanoAspectOptions];
    if (editModel === "pro") return [...imageLightboxEdit.proAspectOptions];
    if (isStudioSeedreamImagePickerId(editModel)) return [...imageLightboxEdit.seedreamAspectOptions];
    if (editModel === "google_nano_banana") return [...imageLightboxEdit.nanoAspectOptions];
    return [...imageLightboxEdit.nanoAspectOptions];
  }, [editModel, imageLightboxEdit]);

  useEffect(() => {
    if (!lightboxItem?.url || !imageLightboxEdit) return;
    const allowed = new Set(editAspectOptions as readonly string[]);
    if (allowed.size > 0 && !allowed.has(editAspect)) {
      setEditAspect(
        editModel === "nano" || editModel === "google_nano_banana"
          ? "auto"
          : "3:4",
      );
    }
  }, [editModel, editAspect, editAspectOptions, lightboxItem?.url, imageLightboxEdit]);

  const failedDismissCfg = useMemo(() => {
    if (!failedAutoDismiss) return null;
    if (failedAutoDismiss === true) return { delayMs: 3000, fadeMs: 700 };
    return {
      delayMs: failedAutoDismiss.delayMs ?? 3000,
      fadeMs: failedAutoDismiss.fadeMs ?? 700,
    };
  }, [failedAutoDismiss]);

  const [fadingFailedIds, setFadingFailedIds] = useState<Record<string, boolean>>({});
  const failedDismissTimersRef = useRef<
    Map<string, { fade: ReturnType<typeof setTimeout>; remove: ReturnType<typeof setTimeout> }>
  >(new Map());
  const onDismissFailedRef = useRef(onDismissFailed);
  onDismissFailedRef.current = onDismissFailed;

  useEffect(() => {
    if (!failedDismissCfg || !onDismissFailed) return;

    const failedIds = new Set(items.filter((i) => i.status === "failed").map((i) => i.id));

    for (const [id, t] of failedDismissTimersRef.current) {
      if (!failedIds.has(id)) {
        clearTimeout(t.fade);
        clearTimeout(t.remove);
        failedDismissTimersRef.current.delete(id);
        setFadingFailedIds((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }

    const { delayMs, fadeMs } = failedDismissCfg;
    for (const id of failedIds) {
      if (failedDismissTimersRef.current.has(id)) continue;

      const fadeTimer = setTimeout(() => {
        setFadingFailedIds((prev) => ({ ...prev, [id]: true }));
      }, delayMs);

      const removeTimer = setTimeout(() => {
        failedDismissTimersRef.current.delete(id);
        onDismissFailedRef.current?.(id);
        setFadingFailedIds((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, delayMs + fadeMs);

      failedDismissTimersRef.current.set(id, { fade: fadeTimer, remove: removeTimer });
    }
  }, [items, failedDismissCfg, onDismissFailed]);

  useEffect(() => {
    return () => {
      for (const t of failedDismissTimersRef.current.values()) {
        clearTimeout(t.fade);
        clearTimeout(t.remove);
      }
      failedDismissTimersRef.current.clear();
    };
  }, []);

  const [lightboxPortalReady, setLightboxPortalReady] = useState(false);
  useEffect(() => {
    setLightboxPortalReady(true);
  }, []);

  useEffect(() => {
    if (!lightboxItem) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightboxItem]);

  const deleteHistoryEntry = useCallback(
    async (id: string, studioGenerationKind?: string) => {
      if (!onItemDeleted) return;
      if (!window.confirm("Remove this generation from your library?")) return;
      setDeletingId(id);
      try {
        const needsServer =
          Boolean(studioGenerationKind) || isStudioGenerationRowId(id);
        if (needsServer) {
          const res = await fetch(`/api/studio/generations/${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          if (res.status === 401) {
            toast.error("Sign in to remove saved generations.");
            return;
          }
          if (!res.ok && res.status !== 404) {
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            toast.error(typeof j.error === "string" && j.error.trim() ? j.error : "Could not delete.");
            return;
          }
        }
        onItemDeleted(id);
        setLightboxItem((prev) => (prev?.sourceId === id ? null : prev));
      } finally {
        setDeletingId(null);
      }
    },
    [onItemDeleted],
  );

  const handleDeleteItem = useCallback(
    (item: StudioHistoryItem) => {
      void deleteHistoryEntry(item.id, item.studioGenerationKind);
    },
    [deleteHistoryEntry],
  );

  const grouped = useMemo(() => groupByDate(items), [items]);
  const lightboxMediaUrl = lightboxItem?.url ? proxiedMediaSrc(lightboxItem.url) : "";
  const lightboxPosterUrl = lightboxItem?.poster ? proxiedMediaSrc(lightboxItem.poster) : undefined;
  const isLightboxVideo = Boolean(
    lightboxItem &&
      (lightboxItem.kind === "video" || isProbablyVideoUrl(lightboxItem.url)) &&
      !isProbablyAudioUrl(lightboxItem.url),
  );


  const cardWidthClass =
    view === "grid"
      ? cn(
          "w-[min(100%,11.5rem)] shrink-0 sm:w-[min(100%,13rem)]",
          zoom <= 90 && "sm:w-[min(100%,11.5rem)]",
          zoom >= 110 && "sm:w-[min(100%,14.5rem)]",
        )
      : "w-full shrink-0";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      {/* Top bar: History + view controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.08] px-3 py-2 text-sm font-semibold text-white"
          >
            <FolderOpen className="h-4 w-4 text-white/80" aria-hidden />
            History
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/35">
            <span className="hidden sm:inline">Zoom</span>
            <input
              type="range"
              min={85}
              max={115}
              step={5}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1 w-20 cursor-pointer accent-violet-400 sm:w-28"
            />
            <span className="tabular-nums text-white/45">{zoom}%</span>
          </label>
          <div className="flex rounded-lg border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "rounded-md p-2 transition",
                view === "list" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70",
              )}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn(
                "rounded-md p-2 transition",
                view === "grid" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70",
              )}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="studio-sidebar-scroll mt-4 min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex min-h-[min(360px,50vh)] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-6">
            {empty}
          </div>
        ) : (
          <div className="space-y-8">
          {grouped.map(({ date, rows }) => (
            <section key={date}>
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="inline-flex h-4 w-4 shrink-0 rounded border border-white/20 bg-white/[0.04]"
                  aria-hidden
                />
                <h3 className="text-sm font-semibold tracking-tight text-white/90">{date}</h3>
              </div>
              <div
                className={cn(
                  view === "grid"
                    ? "flex flex-wrap gap-4"
                    : "flex flex-col gap-4",
                )}
              >
                {rows.map((item) => {
                  const canShowResultMedia =
                    Boolean(item.mediaUrl?.trim()) &&
                    item.status !== "failed" &&
                    (item.status === "ready" || item.status === "generating");
                  const failedAutoFade =
                    Boolean(failedDismissCfg && item.status === "failed" && onDismissFailed);
                  const isFadingOutFailed = Boolean(failedAutoFade && fadingFailedIds[item.id]);
                  return (
                  <article
                    key={item.id}
                    className={cn(
                      "flex flex-col gap-2",
                      view === "list" && "sm:flex-row sm:items-stretch sm:gap-4",
                      cardWidthClass,
                      failedAutoFade && "ease-in-out will-change-[opacity,transform]",
                      failedAutoFade && !isFadingOutFailed && "opacity-100",
                      failedAutoFade && isFadingOutFailed && "translate-y-1 scale-[0.98] opacity-0",
                    )}
                    style={
                      failedAutoFade && failedDismissCfg
                        ? {
                            transitionProperty: "opacity, transform",
                            transitionDuration: `${failedDismissCfg.fadeMs}ms`,
                          }
                        : undefined
                    }
                  >
                    <div
                      className={cn(
                        "group/media relative w-full overflow-hidden rounded-xl border border-white/[0.12] bg-[#12121a] shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
                        view === "list" && "sm:w-44 sm:shrink-0",
                      )}
                      style={{
                        aspectRatio: studioHistoryAspectRatioCssValue(item.aspectRatio, item.kind),
                      }}
                    >
                      {onItemDeleted ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteItem(item);
                          }}
                          disabled={deletingId === item.id}
                          className="absolute left-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white/80 opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-red-950/80 hover:text-white group-hover/media:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-40"
                          aria-label="Remove from library"
                          title="Remove from library"
                        >
                          {deletingId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                      ) : null}
                      {item.status === "generating" && !item.mediaUrl?.trim() ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#1a1a24] to-[#0d0d12] p-3">
                          {item.posterUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.posterUrl}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover opacity-25"
                            />
                          ) : null}
                          <div className="absolute inset-0 animate-pulse bg-gradient-to-t from-violet-500/15 to-transparent" />
                          <Loader2 className="relative h-8 w-8 animate-spin text-violet-300" aria-hidden />
                          <p className="relative text-center text-[11px] font-medium leading-snug text-white/55">
                            {mediaLabel}…
                          </p>
                        </div>
                      ) : null}
                      {item.status === "failed" ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#14141c] p-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/40">
                            <X className="h-6 w-6 text-white/35" strokeWidth={2} />
                          </div>
                          <div className="studio-sidebar-scroll max-h-[min(11rem,42%)] w-full space-y-1 overflow-y-auto px-1">
                            <p className="text-center text-[9px] font-semibold uppercase tracking-wider text-white/35">
                              Reason
                            </p>
                            <p className="text-center text-[11px] leading-snug text-white/55">
                              {item.errorMessage || "Generation failed"}
                            </p>
                          </div>
                        </div>
                      ) : null}
                      {canShowResultMedia && item.mediaUrl && item.kind === "audio" ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#171721] to-[#0c0c12] p-4">
                          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
                            <Volume2 className="h-8 w-8 text-violet-200/80" aria-hidden />
                          </div>
                          <audio controls preload="metadata" className="studio-native-audio w-full max-w-[14rem]">
                            <source src={item.mediaUrl} />
                          </audio>
                          <a
                            href={`/api/download?url=${encodeURIComponent(item.mediaUrl)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[11px] font-medium text-white/80 transition hover:bg-black/75 hover:text-white"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            Download audio
                          </a>
                        </div>
                      ) : null}
                      {onChangeVoice &&
                      canShowResultMedia &&
                      item.mediaUrl &&
                      item.kind !== "audio" &&
                      (item.kind !== "image" || isProbablyVideoUrl(item.mediaUrl)) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeVoice(item);
                          }}
                          className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/65 text-white/80 opacity-0 shadow-sm backdrop-blur-sm transition hover:bg-violet-950/80 hover:text-violet-200 group-hover/media:opacity-100 focus-visible:opacity-100"
                          aria-label="Change voice"
                          title="Change voice"
                        >
                          <Mic className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      ) : null}
                      {canShowResultMedia &&
                      item.mediaUrl &&
                      item.kind !== "audio" &&
                      (item.kind !== "image" || isProbablyVideoUrl(item.mediaUrl)) ? (
                        <VideoCard
                          src={item.mediaUrl}
                          poster={item.posterUrl}
                          className="h-full w-full rounded-none border-0"
                          aspectClassName=""
                          enableLightbox={false}
                          onOpenFullscreen={() => {
                            setLightboxItem({
                              sourceId: item.id,
                              url: item.mediaUrl!,
                              poster: item.posterUrl,
                              kind: "video",
                              prompt: item.label || "",
                              inputUrls: item.inputUrls,
                              modelLabel: item.modelLabel,
                            });
                          }}
                        />
                      ) : null}

                      {canShowResultMedia && item.kind === "image" && item.mediaUrl && !isProbablyVideoUrl(item.mediaUrl) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              if (!item.mediaUrl) return;
                              setLightboxItem({
                                sourceId: item.id,
                                url: item.mediaUrl,
                                poster: item.posterUrl,
                                kind: "image",
                                prompt: item.label || "",
                                inputUrls: item.inputUrls,
                                modelLabel: item.modelLabel,
                              });
                            }}
                            className="block h-full w-full"
                            aria-label="Open image fullscreen"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.mediaUrl}
                              alt=""
                              className="h-full w-full object-cover object-center"
                            />
                          </button>
                          <a
                            href={`/api/download?url=${encodeURIComponent(item.mediaUrl)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/75 opacity-0 transition hover:bg-black/75 hover:text-white group-hover/media:opacity-100 focus-visible:opacity-100"
                            aria-label="Download image"
                            title="Download"
                          >
                            <Download className="h-4 w-4" aria-hidden />
                          </a>
                        </>
                      ) : null}
                      {(item.status === "ready" || item.status === "generating") && !item.mediaUrl?.trim() && item.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.posterUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "min-w-0 space-y-2",
                        view === "list" && "flex flex-1 flex-col justify-center py-1",
                      )}
                    >
                      <p className="line-clamp-2 text-xs leading-snug text-white/50">{item.label}</p>
                      {item.modelLabel ? (
                        <p className="line-clamp-1 text-[10px] font-medium uppercase tracking-wide text-violet-300/85">
                          {item.modelLabel}
                        </p>
                      ) : null}
                      {item.status === "failed" ? (
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/35 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-200/90">
                            <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                            Failed
                          </span>
                          {item.creditsRefunded ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                              <Info className="h-3 w-3" aria-hidden />
                              Credits refunded
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
                })}
              </div>
            </section>
          ))}
          </div>
        )}
      </div>
      {lightboxPortalReady && lightboxItem
        ? createPortal(
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 p-2 backdrop-blur-sm animate-in fade-in duration-200 sm:p-4"
          onClick={() => setLightboxItem(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen preview"
        >
          <button
            type="button"
            className="absolute right-3 top-3 z-[402] inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur-md transition-all duration-200 hover:bg-white/20 hover:text-white sm:right-5 sm:top-5"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxItem(null);
            }}
            aria-label="Close preview"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <div
            className={cn(
              "flex min-h-0 w-full flex-col gap-4 lg:max-h-[min(92vh,920px)] lg:flex-row lg:items-stretch lg:gap-5",
              isLightboxVideo
                ? "max-w-[min(1820px,calc(100vw-0.5rem))]"
                : "max-w-[min(1400px,calc(100vw-1rem))]",
              "animate-in fade-in slide-in-from-bottom-3 duration-300 ease-out motion-reduce:animate-none",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#111118]/95 to-black/70 p-2 shadow-[0_32px_100px_rgba(0,0,0,0.6)] sm:p-4 lg:min-h-[min(88vh,900px)]">
              {lightboxItem.kind === "audio" || isProbablyAudioUrl(lightboxItem.url) ? (
                <div className="flex w-full max-w-xl flex-col items-center justify-center gap-5 rounded-2xl border border-white/[0.12] bg-[#111119] p-8">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
                    <Volume2 className="h-10 w-10 text-violet-200/80" aria-hidden />
                  </div>
                  <audio controls autoPlay preload="metadata" className="studio-native-audio w-full">
                    <source src={lightboxMediaUrl} />
                  </audio>
                </div>
              ) : lightboxItem.kind === "video" || isProbablyVideoUrl(lightboxItem.url) ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  ref={lightboxVideoRef}
                  src={lightboxMediaUrl}
                  poster={lightboxPosterUrl}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[min(78vh,880px)] w-full max-w-full rounded-lg object-contain object-center lg:max-h-[min(88vh,900px)]"
                />
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={lightboxMediaUrl}
                    alt="Fullscreen generation preview"
                    className="max-h-[min(78vh,880px)] w-full max-w-full object-contain object-center transition-transform duration-300 ease-out lg:max-h-[min(88vh,900px)]"
                  />
                </>
              )}
            </div>

            <aside
              className={cn(
                "studio-sidebar-scroll flex max-h-[min(52vh,480px)] w-full shrink-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0e0e16]/97 p-4 shadow-2xl lg:max-h-none lg:w-[min(100%,22rem)] lg:max-w-[22rem]",
              )}
            >
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                <div className="mb-2 text-[13px] font-semibold text-white/85">Prompt</div>
                <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-white/55">
                  {lightboxItem.prompt?.trim() ? lightboxItem.prompt.trim() : "—"}
                </p>
                {lightboxItem.modelLabel ? (
                  <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">
                    Model · {lightboxItem.modelLabel}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                {isLightboxVideo && onChangeVoice ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const foundItem = items.find((i) => i.id === lightboxItem.sourceId);
                      if (foundItem) {
                        onChangeVoice(foundItem);
                        setLightboxItem(null);
                      }
                    }}
                    className="group/cv inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/15 px-4 py-2.5 text-[13px] font-semibold text-violet-100 transition-all duration-200 hover:border-violet-400/50 hover:bg-violet-500/25 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]"
                  >
                    <Mic className="h-4 w-4 shrink-0 text-violet-300 transition-transform duration-200 group-hover/cv:scale-110" aria-hidden />
                    Change Voice
                    <CreditCostBadge
                      amount={VOICE_CHANGE_CREDITS_FLAT}
                      className="ml-auto bg-violet-500/20 text-violet-200/90"
                    />
                  </button>
                ) : null}

                <a
                  href={`/api/download?url=${encodeURIComponent(lightboxItem.url)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-2.5 text-[13px] font-semibold text-white/80 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.09] hover:text-white"
                >
                  <Download className="h-4 w-4 shrink-0" aria-hidden />
                  Download
                </a>

                {onItemDeleted ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rowKind = items.find((i) => i.id === lightboxItem.sourceId)?.studioGenerationKind;
                      void deleteHistoryEntry(lightboxItem.sourceId, rowKind);
                    }}
                    disabled={deletingId === lightboxItem.sourceId}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-2.5 text-[13px] font-semibold text-red-200/80 transition-all duration-200 hover:border-red-500/35 hover:bg-red-500/[0.12] hover:text-red-100 disabled:opacity-40"
                  >
                    {deletingId === lightboxItem.sourceId ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    Remove
                  </button>
                ) : null}
              </div>

              {lightboxItem.inputUrls && lightboxItem.inputUrls.length > 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#14141c]/80 p-3.5">
                  <div className="mb-2 text-sm font-semibold text-white/90">
                    {lightboxItem.inputUrls.length === 1 ? "Input" : "Inputs"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {lightboxItem.inputUrls.map((inputUrl, idx) => {
                      const isVideo = /\.(mp4|mov|webm|mkv|m4v)/i.test(inputUrl);
                      return (
                        <a
                          key={idx}
                          href={inputUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="group/input relative block overflow-hidden rounded-lg border border-white/10 bg-black/40 transition hover:border-white/25"
                        >
                          {isVideo ? (
                            <video
                              src={inputUrl}
                              muted
                              playsInline
                              preload="metadata"
                              className="h-20 w-20 object-cover"
                            />
                          ) : (
                            <img
                              src={inputUrl}
                              alt={`Input ${idx + 1}`}
                              className="h-20 w-20 object-cover"
                            />
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {lightboxItem.kind === "image" &&
              !isProbablyVideoUrl(lightboxItem.url) &&
              (imageLightboxUpscale || imageLightboxEdit) ? (
                <>
                {imageLightboxUpscale ? (
                  <div className="rounded-xl border border-white/10 bg-[#14141c]/80 p-3">
                    <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-white/90">
                      <Wand2 className="h-4 w-4 text-violet-300" aria-hidden />
                      Topaz image upscale
                    </div>
                    <p className="mb-2 text-[11px] leading-snug text-white/45">
                      Sharper, higher-resolution output. Billing follows the selected scale (2K / 4K / 8K tier).
                    </p>
                    <div className="space-y-2">
                      <StudioUpscaleDiscreteSlider
                        label="Output tier"
                        value={upscaleFactor}
                        options={imageLightboxUpscale.upscaleFactorOptions ?? (["2", "4", "8"] as const)}
                        tickLabels={(imageLightboxUpscale.upscaleFactorOptions ?? (["2", "4", "8"] as const)).map(
                          (opt) => (opt === "8" ? "8K" : opt === "4" ? "4K" : "2K"),
                        )}
                        onChange={(v) => setUpscaleFactor(v as "2" | "4" | "8")}
                      />
                      <Button
                        type="button"
                        className="h-11 w-full border border-violet-400/35 bg-violet-600 text-white shadow-[0_4px_0_0_rgba(76,29,149,0.55)] transition-colors duration-200 hover:bg-violet-500"
                        onClick={() => {
                          if (!lightboxItem?.url) return;
                          imageLightboxUpscale.onSubmitUpscale({
                            sourceUrl: lightboxItem.url,
                            upscaleFactor,
                          });
                          setLightboxItem(null);
                        }}
                      >
                        Run upscale · {imageLightboxUpscale.creditsFor(upscaleFactor)} credits
                      </Button>
                    </div>
                  </div>
                ) : null}

                {imageLightboxEdit ? (
                  <div className="rounded-xl border border-white/10 bg-[#14141c]/80 p-3.5">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/90">
                      <Sparkles className="h-4 w-4 text-violet-300" aria-hidden />
                      Edit image (image → image)
                    </div>
                    <p className="mb-3 text-[11px] leading-snug text-white/45">
                      Prompt and aspect ratio match Studio; quality (resolution) only appears for models that expose
                      it. The open image is the reference.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-white/40">Edit prompt</Label>
                        <Textarea
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          placeholder="Describe what to change (e.g. swap background, add props, fix lighting…)"
                          className="mt-1.5 min-h-[88px] border-white/10 bg-black/40 text-sm text-white placeholder:text-white/30"
                          rows={3}
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-1">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-white/40">Model</Label>
                          <Select value={editModel} onValueChange={setEditModel}>
                            <SelectTrigger className="mt-1.5 h-10 border-white/15 bg-black/40 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[min(320px,50vh)]">
                              {imageLightboxEdit.editModelOptions.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-white/40">Aspect ratio</Label>
                          <Select value={editAspect} onValueChange={setEditAspect}>
                            <SelectTrigger className="mt-1.5 h-10 border-white/15 bg-black/40 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[min(280px,50vh)]">
                              {editAspectOptions.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {studioImageModelSupportsResolutionPicker(editModel) ? (
                          <div>
                            <Label className="text-[10px] uppercase tracking-wide text-white/40">Resolution</Label>
                            <Select
                              value={editResolution}
                              onValueChange={(v) => setEditResolution(v as "1K" | "2K" | "4K")}
                            >
                              <SelectTrigger className="mt-1.5 h-10 border-white/15 bg-black/40 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(imageLightboxEdit.resolutionOptions ?? ["1K", "2K", "4K"]).map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {r}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        className="h-11 w-full border border-violet-400/40 bg-violet-600 text-white transition-colors duration-200 hover:bg-violet-500"
                        onClick={() => {
                          const p = editPrompt.trim();
                          if (!p) {
                            toast.error("Enter an edit prompt.");
                            return;
                          }
                          if (!lightboxItem?.url) return;
                          imageLightboxEdit.onSubmitEdit({
                            sourceUrl: lightboxItem.url,
                            prompt: p,
                            model: editModel,
                            aspectRatio: editAspect,
                            resolution: studioImageModelSupportsResolutionPicker(editModel)
                              ? editResolution
                              : "2K",
                          });
                          setLightboxItem(null);
                        }}
                      >
                        Run edit ·{" "}
                        {formatDisplayCredits(
                          studioImageCreditsChargedTotal({
                            studioModel: editModel,
                            resolution: studioImageModelSupportsResolutionPicker(editModel)
                              ? editResolution
                              : "2K",
                            numImages: 1,
                          }),
                        )}{" "}
                        credits
                      </Button>
                    </div>
                  </div>
                ) : null}
                </>
              ) : null}
            </aside>
          </div>
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}

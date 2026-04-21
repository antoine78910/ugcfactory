"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  useCreditsPlan,
  getPersonalApiKey,
  getPersonalPiapiApiKey,
  isPlatformCreditBypassActive,
} from "@/app/_components/CreditsPlanContext";
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";
import { Play, Plus, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudioEmptyExamples, StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import { StudioGenerationsHistory } from "@/app/_components/StudioGenerationsHistory";
import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";
import { StudioModelPicker, type StudioModelPickerItem } from "@/app/_components/StudioModelPicker";
import { StudioUpscaleDiscreteSlider } from "@/app/_components/StudioUpscaleDiscreteSlider";
import {
  KIE_TOPAZ_IMAGE_UPSCALE_MODEL,
  KIE_TOPAZ_VIDEO_UPSCALE_MODEL,
  topazImageUpscaleCredits,
  topazImageUpscaleKieFactorToTierLabel,
  topazVideoUpscaleCredits,
} from "@/lib/pricing";
import { registerStudioGenerationClient } from "@/lib/registerStudioGenerationClient";
import { mergeStudioHistoryWithServer } from "@/lib/mergeStudioHistoryWithLocal";
import { UploadBusyOverlay } from "@/app/_components/UploadBusyOverlay";
import { userMessageFromCaughtError } from "@/lib/generationUserMessage";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import {
  assertStudioVideoUpload,
  FORMAT_HINT_VIDEO,
  STUDIO_IMAGE_FILE_ACCEPT,
  STUDIO_VIDEO_FILE_ACCEPT,
} from "@/lib/studioUploadValidation";

async function uploadFile(file: File, kind: "image" | "video"): Promise<string> {
  return uploadFileToCdn(file, { kind });
}

type RefundHint = { jobId: string; credits: number };

function applyRefundHints(
  hints: RefundHint[],
  grantCredits: (n: number) => void,
  creditsRef: { current: number },
) {
  for (const h of hints) {
    if (h.credits > 0) {
      grantCredits(h.credits);
      creditsRef.current += h.credits;
    }
  }
}

type UpscalePickerId = "upscale/video" | "upscale/image";

type VideoAspectPreset = "9:16" | "16:9" | "1:1";

function videoAspectBoxClass(preset: VideoAspectPreset): string {
  if (preset === "16:9") return "aspect-video";
  if (preset === "1:1") return "aspect-square";
  return "aspect-[9/16]";
}

const VIDEO_UPSCALE_OPTIONS = ["1", "2", "4"] as const;
const VIDEO_UPSCALE_TICKS = ["1×", "2×", "4×"] as const;
const IMAGE_TIER_OPTIONS = ["2", "4", "8"] as const;
const IMAGE_TIER_TICKS = ["2K", "4K", "8K"] as const;

const UPSCALE_MODEL_PICKER_ITEMS: StudioModelPickerItem[] = [
  {
    id: "upscale/video",
    label: "Video upscale",
    icon: "google",
    resolution: "Up to 4x",
    durationRange: "1s–10min",
    searchText: "topaz video upscale kie",
  },
  {
    id: "upscale/image",
    label: "Image upscale",
    icon: "google",
    resolution: "High-res image output",
    durationRange: "Single image",
    searchText: "topaz image upscale",
  },
];

export default function StudioUpscalePanel() {
  const { planId, current: creditsBalance, spendCredits, grantCredits } = useCreditsPlan();
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;

  const [videoUrl, setVideoUrl] = useState("");
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState("");
  // Video duration is only known after metadata is loaded; keep it null until then.
  const [durationSec, setDurationSec] = useState<number | null>(null);
  /** Video Topaz: 1× / 2× / 4× (Kie `topaz/video-upscale`). */
  const [videoUpscaleFactor, setVideoUpscaleFactor] = useState<"1" | "2" | "4">("2");
  /** Image Topaz: Kie factors 2 / 4 / 8 → 2K / 4K / 8K tiers (`topaz/image-upscale`). */
  const [imageUpscaleTier, setImageUpscaleTier] = useState<"2" | "4" | "8">("2");
  /** Preview / dropzone framing only (short-form default); does not change Topaz output. */
  const [videoAspectPreset, setVideoAspectPreset] = useState<VideoAspectPreset>("9:16");
  const [upscalePickerId, setUpscalePickerId] = useState<UpscalePickerId>("upscale/video");
  const [busy, setBusy] = useState(false);
  const [videoPreviewBlob, setVideoPreviewBlob] = useState<string | null>(null);
  const [imagePreviewBlob, setImagePreviewBlob] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);
  /** null = loading auth/history status; true = backend history/poll active. */
  const [serverHistory, setServerHistory] = useState<boolean | null>(null);
  type Bill = { open: false } | { open: true; required: number };
  const [billing, setBilling] = useState<Bill>({ open: false });
  const grantCreditsRef = useRef(grantCredits);
  grantCreditsRef.current = grantCredits;

  const credits = useMemo(() => {
    if (upscalePickerId === "upscale/image") return topazImageUpscaleCredits(imageUpscaleTier);
    if (durationSec == null) return 0;
    return topazVideoUpscaleCredits(durationSec, videoUpscaleFactor);
  }, [upscalePickerId, durationSec, imageUpscaleTier, videoUpscaleFactor]);

  const probeDuration = useCallback((url: string) => {
    if (!url) return;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      const d = Number(v.duration);
      if (Number.isFinite(d) && d > 0) setDurationSec(Math.min(600, Math.max(1, Math.ceil(d))));
      v.removeAttribute("src");
      v.load();
    };
    v.onerror = () => {};
    v.src = url;
  }, []);

  /** Revoke blob URLs only after React drops them from state. */
  useEffect(() => {
    return () => {
      if (videoPreviewBlob?.startsWith("blob:")) URL.revokeObjectURL(videoPreviewBlob);
      if (imagePreviewBlob?.startsWith("blob:")) URL.revokeObjectURL(imagePreviewBlob);
    };
  }, [videoPreviewBlob, imagePreviewBlob]);

  /** Blob preview wins while present (upload in progress), then hosted URL. */
  const previewSrc =
    upscalePickerId === "upscale/image"
      ? imagePreviewBlob || imageUrl.trim() || ""
      : videoPreviewBlob || videoUrl.trim() || "";

  useEffect(() => {
    if (upscalePickerId !== "upscale/video") return;
    if (!previewSrc) return;
    setDurationSec(null);
    probeDuration(previewSrc);
  }, [upscalePickerId, previewSrc, probeDuration]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/studio/generations?kind=studio_upscale", { cache: "no-store" });
      if (res.status === 401) {
        setServerHistory(false);
        setHistoryItems([]);
        return;
      }
      if (!res.ok) {
        setServerHistory(false);
        setHistoryItems([]);
        return;
      }
      const json = (await res.json()) as { data?: StudioHistoryItem[]; refundHints?: RefundHint[] };
      setServerHistory(true);
      setHistoryItems(json.data ?? []);
      const hints = json.refundHints ?? [];
      if (hints.length) {
        applyRefundHints(hints, grantCreditsRef.current, creditsRef);
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
            kind: "studio_upscale",
            personalApiKey: getPersonalApiKey() ?? undefined,
            piapiApiKey: getPersonalPiapiApiKey() ?? undefined,
          }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: StudioHistoryItem[]; refundHints?: RefundHint[] };
        if (Array.isArray(json.data)) {
          setHistoryItems((prev) => mergeStudioHistoryWithServer(json.data ?? [], prev));
        }
        const hints = json.refundHints ?? [];
        if (hints.length) {
          applyRefundHints(hints, grantCreditsRef.current, creditsRef);
          toast.message("Credits refunded", { description: "A studio generation failed after charge." });
        }
      })();
    };

    tick();
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [serverHistory]);

  const onVideoFileSelected = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!f) return;
    try {
      assertStudioVideoUpload(f);
    } catch (err) {
      toast.error("Vidéo non prise en charge", {
        description: userMessageFromCaughtError(err, FORMAT_HINT_VIDEO),
      });
      return;
    }
    const blobUrl = URL.createObjectURL(f);
    setVideoPreviewBlob(blobUrl);
    setImagePreviewBlob(null);
    setImageUrl("");
    setBusy(true);
    void uploadFile(f, "video")
      .then((url) => {
        setVideoUrl(url);
        toast.success("Video importee");
        setVideoPreviewBlob(null);
      })
      .catch((err) => {
        toast.error("Échec de l’import", {
          description: userMessageFromCaughtError(err, "Utilise MP4, MOV ou WebM."),
        });
      })
      .finally(() => {
        setBusy(false);
      });
  }, []);

  const onImageFileSelected = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!f) return;
    const blobUrl = URL.createObjectURL(f);
    setImagePreviewBlob(blobUrl);
    setVideoPreviewBlob(null);
    setVideoUrl("");
    setBusy(true);
    void uploadFile(f, "image")
      .then((url) => {
        setImageUrl(url);
        toast.success("Image importee");
        setImagePreviewBlob(null);
      })
      .catch((err) => {
        toast.error("Échec de l’import", {
          description: userMessageFromCaughtError(err, "Utilise JPEG, PNG, WebP ou GIF."),
        });
      })
      .finally(() => setBusy(false));
  }, []);

  const generate = () => {
    if (serverHistory === null) {
      toast.message("Chargement de ta bibliotheque…", { description: "Attends un instant puis reessaie." });
      return;
    }
    if (serverHistory !== true) {
      toast.error("Sync backend indisponible. Recharge la page puis reessaie.");
      return;
    }
    if (upscalePickerId === "upscale/video" && durationSec == null) {
      toast.message("Loading video duration…", { description: "Please wait a moment, then try again." });
      return;
    }

    const creditBypass = isPlatformCreditBypassActive();
    if (!creditBypass && creditsRef.current < credits) {
      setBilling({ open: true, required: credits });
      return;
    }

    const startedAt = Date.now();
    const jobId = crypto.randomUUID();
    const platformCharge = creditBypass ? 0 : credits;

    const isImage = upscalePickerId === "upscale/image";
    const inputUrl = (isImage ? imageUrl : videoUrl).trim();
    if (!inputUrl || !/^https?:\/\//i.test(inputUrl)) {
      toast.error(isImage ? "Upload a source image first." : "Upload a source video first.");
      return;
    }

    const label = isImage
      ? `Image upscale · ${topazImageUpscaleKieFactorToTierLabel(imageUpscaleTier)}`
      : `Video upscale · ${videoUpscaleFactor}×`;

    if (!creditBypass) {
      spendCredits(credits);
      creditsRef.current = Math.max(0, creditsRef.current - credits);
    }

    setHistoryItems((prev) => [
      {
        id: jobId,
        kind: isImage ? "image" : "video",
        status: "generating",
        label,
        createdAt: startedAt,
        model: isImage ? KIE_TOPAZ_IMAGE_UPSCALE_MODEL : KIE_TOPAZ_VIDEO_UPSCALE_MODEL,
        modelLabel: isImage ? "Image upscale" : "Video upscale",
        aspectRatio: isImage ? "1:1" : videoAspectPreset,
      },
      ...prev,
    ]);

    void (async () => {
      try {
        const upPKey = getPersonalApiKey();
        const endpoint = isImage ? "/api/kie/upscale/image" : "/api/kie/upscale/video";
        const body = isImage
          ? { imageUrl: inputUrl, upscaleFactor: imageUpscaleTier, personalApiKey: upPKey }
          : { videoUrl: inputUrl, upscaleFactor: videoUpscaleFactor, personalApiKey: upPKey };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { taskId?: string; model?: string; error?: string };
        if (!res.ok || !json.taskId) throw new Error(json.error || "Upscale request failed");

        const rowId = await registerStudioGenerationClient({
          kind: "studio_upscale",
          label,
          taskId: json.taskId,
          model:
            json.model?.trim() ||
            (isImage ? KIE_TOPAZ_IMAGE_UPSCALE_MODEL : KIE_TOPAZ_VIDEO_UPSCALE_MODEL),
          creditsCharged: platformCharge,
          personalApiKey: upPKey,
          inputUrls: inputUrl ? [inputUrl] : undefined,
          aspectRatio: isImage ? "1:1" : videoAspectPreset,
        });
        setHistoryItems((prev) =>
          prev.map((i) =>
            i.id === jobId
              ? {
                  ...i,
                  ...(rowId ? { id: rowId } : {}),
                  externalTaskId: json.taskId,
                  studioGenerationKind: "studio_upscale",
                }
              : i,
          ),
        );
        if (!rowId) {
          toast.warning("Could not save job to library", {
            description:
              "Upscale may still be running on the provider. Reload in a minute or run the studio_generations aspect_ratio migration in Supabase.",
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error";
        refundPlatformCredits(platformCharge, grantCredits, creditsRef);
        toast.error(msg);
        setHistoryItems((prev) =>
          prev.map((i) =>
            i.id === jobId && i.status === "generating"
              ? { ...i, status: "failed", errorMessage: msg, creditsRefunded: platformCharge > 0 }
              : i,
          ),
        );
      }
    })();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Upscale</span>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={`h-7 rounded-md px-2.5 text-[11px] font-semibold ${upscalePickerId === "upscale/video" ? "bg-white text-black hover:bg-white/90" : "border-white/15 bg-white/5 text-white"}`}
            onClick={() => {
              setUpscalePickerId("upscale/video");
              setDurationSec(null);
              setVideoAspectPreset("9:16");
              setImagePreviewBlob(null);
              setImageUrl("");
            }}
          >
            Video
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={`h-7 rounded-md px-2.5 text-[11px] font-semibold ${upscalePickerId === "upscale/image" ? "bg-white text-black hover:bg-white/90" : "border-white/15 bg-white/5 text-white"}`}
            onClick={() => {
              setUpscalePickerId("upscale/image");
              setVideoPreviewBlob(null);
              setVideoUrl("");
            }}
          >
            Image
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
        <div className="flex min-h-0 min-w-0 w-full flex-col gap-2 lg:h-full lg:basis-[30%] lg:max-w-[28rem] lg:flex-none lg:shrink-0 lg:overflow-hidden">
          {/*
            Stretch + h-full so this column matches the row height; min-h-0 lets flex-1 shrink.
            Scroll params only; CTA stays in view at the bottom (no clip from items-start + overflow).
          */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:min-h-0 lg:h-full">
          <div className="studio-params-scroll flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto pb-2 max-h-[min(86vh,calc(100dvh-5rem))] lg:min-h-0 lg:max-h-none lg:flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Upscale model</p>
          <div className="rounded-2xl border border-white/10 bg-[#101014] p-3">
            <StudioModelPicker
              value={upscalePickerId}
              items={UPSCALE_MODEL_PICKER_ITEMS}
              triggerVariant="bar"
              hideMeta
              panelMode="dropdown"
              featuredTitle="Upscale models"
              onChange={(v) => setUpscalePickerId(v as UpscalePickerId)}
            />
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Source &amp; billing</p>
          <div className="rounded-2xl border border-white/10 bg-[#101014] p-3 sm:p-4 space-y-2">
            <Label className="text-xs text-white/45">
              {upscalePickerId === "upscale/image" ? "Source image" : "Source video"}
            </Label>
            {upscalePickerId === "upscale/image" ? (
              <div className="space-y-2">
                <input
                  type="file"
                  accept={STUDIO_IMAGE_FILE_ACCEPT}
                  className="sr-only"
                  disabled={busy}
                  onChange={onImageFileSelected}
                  ref={(el) => {
                    // keep a stable ref-like handle without adding another useRef
                    (window as unknown as { __upscaleImageInput?: HTMLInputElement | null }).__upscaleImageInput = el;
                  }}
                />
                <div className="relative w-full max-w-md">
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        if (busy) return;
                        (window as unknown as { __upscaleImageInput?: HTMLInputElement | null }).__upscaleImageInput?.click();
                      }
                    }}
                    onClick={() => {
                      if (busy) return;
                      (window as unknown as { __upscaleImageInput?: HTMLInputElement | null }).__upscaleImageInput?.click();
                    }}
                    className={`relative flex aspect-[3/4] w-full max-h-[min(52vh,420px)] cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-white/20 bg-[#0c0c10] text-white/50 transition hover:border-violet-400/40 hover:bg-white/[0.03] ${busy ? "pointer-events-none opacity-60" : ""}`}
                  >
                    {previewSrc ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewSrc}
                          alt="Source for upscale"
                          className="absolute inset-0 z-[1] h-full w-full bg-black object-contain"
                        />
                        <UploadBusyOverlay active={busy} className="rounded-xl" />
                      </>
                    ) : (
                      <>
                        <Plus className="h-8 w-8 opacity-50" aria-hidden />
                        <span className="text-xs font-medium text-white/45">Add an image to upscale</span>
                        <span className="text-[10px] text-white/30">JPEG, PNG, WebP, or GIF</span>
                      </>
                    )}
                  </div>
                  {previewSrc && imageUrl.trim() && !imagePreviewBlob ? (
                    <button
                      type="button"
                      aria-label="Remove image"
                      className="absolute right-1.5 top-1.5 z-[5] flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white/90 shadow-md backdrop-blur-sm transition hover:bg-red-500/90 hover:text-white"
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        setImageUrl("");
                        setImagePreviewBlob(null);
                      }}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-white/45">Format</Label>
                  <Select
                    value={videoAspectPreset}
                    onValueChange={(v) => setVideoAspectPreset(v as VideoAspectPreset)}
                  >
                    <SelectTrigger className="mt-1.5 h-10 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#0c0c10] text-white">
                      <SelectItem value="9:16">9:16 (short)</SelectItem>
                      <SelectItem value="16:9">16:9</SelectItem>
                      <SelectItem value="1:1">1:1</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <input
                  ref={videoFileInputRef}
                  type="file"
                  accept={STUDIO_VIDEO_FILE_ACCEPT}
                  className="sr-only"
                  disabled={busy}
                  onChange={onVideoFileSelected}
                />
                <div className="relative w-full max-w-md">
                  <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        if (!busy) videoFileInputRef.current?.click();
                      }
                    }}
                    onClick={() => {
                      if (!busy) videoFileInputRef.current?.click();
                    }}
                    className={`relative flex ${videoAspectBoxClass(videoAspectPreset)} w-full max-h-[min(52vh,420px)] cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-white/20 bg-[#0c0c10] text-white/50 transition hover:border-violet-400/40 hover:bg-white/[0.03] ${busy ? "pointer-events-none opacity-60" : ""}`}
                  >
                    {previewSrc ? (
                      <>
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <video
                          key={previewSrc}
                          src={previewSrc}
                          className="absolute inset-0 z-[1] h-full w-full bg-black object-contain"
                          controls
                          playsInline
                          preload="metadata"
                          onLoadedData={(ev) => {
                            const v = ev.currentTarget;
                            if (!v.src.startsWith("blob:")) return;
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
                        <UploadBusyOverlay active={busy} className="rounded-xl" />
                      </>
                    ) : (
                      <>
                        <Play className="h-8 w-8 opacity-50" aria-hidden />
                        <span className="text-xs font-medium text-white/45">Add a video to upscale</span>
                        <span className="text-[10px] text-white/30">MP4, MOV, or WebM</span>
                      </>
                    )}
                  </div>
                  {previewSrc && videoUrl.trim() && !videoPreviewBlob ? (
                    <button
                      type="button"
                      aria-label="Remove video"
                      className="absolute right-1.5 top-1.5 z-[5] flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white/90 shadow-md backdrop-blur-sm transition hover:bg-red-500/90 hover:text-white"
                      onClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        setVideoUrl("");
                        setVideoPreviewBlob(null);
                        setDurationSec(null);
                      }}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
            )}
            {upscalePickerId === "upscale/image" ? (
              <StudioUpscaleDiscreteSlider
                label="Output tier"
                value={imageUpscaleTier}
                options={IMAGE_TIER_OPTIONS}
                tickLabels={IMAGE_TIER_TICKS}
                onChange={(v) => setImageUpscaleTier(v as "2" | "4" | "8")}
              />
            ) : (
              <StudioUpscaleDiscreteSlider
                label="Upscale factor"
                value={videoUpscaleFactor}
                options={VIDEO_UPSCALE_OPTIONS}
                tickLabels={VIDEO_UPSCALE_TICKS}
                onChange={(v) => setVideoUpscaleFactor(v as "1" | "2" | "4")}
              />
            )}
          </div>

          </div>

          <div className="shrink-0 border-t border-white/10 pt-3 lg:border-t-0 lg:pt-0">
          <Button
            type="button"
            disabled={
              busy || serverHistory !== true || (upscalePickerId === "upscale/video" && durationSec == null)
            }
            onClick={generate}
            className="h-14 w-full overflow-hidden rounded-2xl border border-violet-300/40 bg-violet-500 text-base font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none disabled:opacity-50 sm:text-lg"
          >
            <span className="inline-flex w-full min-w-0 flex-wrap items-center justify-center gap-1.5 px-2 sm:flex-nowrap sm:gap-2">
              <Wand2 className="h-5 w-5" />
              <span className="min-w-0 truncate">
                {upscalePickerId === "upscale/image" ? "Upscale image" : "Upscale video"}
              </span>
              <Sparkles className="h-5 w-5" />
              {upscalePickerId === "upscale/image" || durationSec !== null ? (
                <>
                  <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums">{credits}</span>
                  <span className="text-xs font-normal text-white/80 sm:text-sm">credits</span>
                </>
              ) : null}
            </span>
          </Button>
          </div>
          </div>
        </div>

        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
          <StudioOutputPane
            title=""
            hasOutput
            output={
              <StudioGenerationsHistory
                items={historyItems}
                empty={<StudioEmptyExamples variant="upscale" />}
                mediaLabel={upscalePickerId === "upscale/image" ? "Image" : "Video"}
                onItemDeleted={(id) => setHistoryItems((prev) => prev.filter((i) => i.id !== id))}
              />
            }
            empty={null}
          />
        </div>

        <StudioBillingDialog
          open={billing.open}
          onOpenChange={(o) => {
            if (!o) setBilling({ open: false });
          }}
          planId={planId}
          studioMode="video"
          variant={
            !billing.open
              ? { kind: "credits", currentCredits: 0, requiredCredits: 0 }
              : { kind: "credits", currentCredits: creditsBalance, requiredCredits: billing.required }
          }
        />
      </div>
    </div>
  );
}

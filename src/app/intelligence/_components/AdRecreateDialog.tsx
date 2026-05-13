"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Rocket,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { TTAd } from "@/lib/intelligenceProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compressImageFileForUpload } from "@/lib/compressImageFileForUpload";
import { uploadFileToCdn, uploadBlobUrlToCdn } from "@/lib/uploadBlobUrlToCdn";
import { STUDIO_IMAGE_FILE_ACCEPT } from "@/lib/studioUploadValidation";
import { guardedFetch } from "@/lib/guardedFetch";
import { completeStudioTask, pollKlingVideo } from "@/lib/studioKlingClientPoll";
import {
  buildDenseSampleTimeline,
  type DenseFramePoint,
  type ReferenceShot,
} from "@/lib/intelligenceRecreateShotAnalysis";
import {
  getPersonalApiKey,
  getPersonalPiapiApiKey,
  useCreditsPlanOptional,
} from "@/app/_components/CreditsPlanContext";
import { cn } from "@/lib/utils";
import { registerStudioGenerationClient } from "@/lib/registerStudioGenerationClient";
import { STUDIO_GENERATION_KIND_INTELLIGENCE_RECREATION } from "@/lib/studioGenerationKinds";

const MAX_PRODUCT_IMAGES = 3;

const SEEDANCE_RECREATE_MODEL = "bytedance/seedance-2" as const;

type ClipType = "talking_head" | "product_unboxing" | "faceless_lifestyle" | "app_promo" | "custom";
type AspectRatio = "9:16" | "1:1" | "16:9";

const CLIP_TYPE_OPTIONS: { value: ClipType; label: string; description: string }[] = [
  {
    value: "talking_head",
    label: "Talking head",
    description: "A creator speaks selfie-style about the product.",
  },
  {
    value: "product_unboxing",
    label: "Product unboxing",
    description: "Opening packaging and reacting to the product.",
  },
  {
    value: "faceless_lifestyle",
    label: "Faceless lifestyle",
    description: "Aesthetic shots — hands, lifestyle, no face.",
  },
  {
    value: "app_promo",
    label: "App promo",
    description: "Talk about an app + show it on the phone.",
  },
  {
    value: "custom",
    label: "Free-form",
    description: "Let the AI infer the format from the reference.",
  },
];

type Step = "intake" | "review" | "running";

type ProductSlot = { id: string; previewUrl: string; cdnUrl: string | null; uploading: boolean };

type GenerationOutcome =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "success"; videoUrl: string; taskId: string }
  | { kind: "error"; message: string };

type ShotAnalysisState =
  | { kind: "idle" }
  | { kind: "extracting" }
  | { kind: "analyzing" }
  | { kind: "ready"; shots: ReferenceShot[]; keyframes: ReferenceShot[]; analyzedFrameCount: number }
  | { kind: "failed"; message: string };

function newProductSlotId(): string {
  return `p-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Video load timeout.")), 20000);
    const done = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    video.onloadeddata = done;
    video.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Video load error."));
    };
  });
}

async function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, 2500);
    video.onseeked = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    video.currentTime = timeSec;
  });
}

function frameDataUrlFromVideo(video: HTMLVideoElement, maxSide: number, quality: number): string {
  const width = video.videoWidth || 480;
  const height = video.videoHeight || 854;
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function extractDenseFramesFromVideo(
  video: HTMLVideoElement,
  timestamps: number[],
): Promise<Array<{ timestampSec: number; dataUrl: string }>> {
  const out: Array<{ timestampSec: number; dataUrl: string }> = [];
  for (const timestampSec of timestamps) {
    await seekVideo(video, timestampSec);
    out.push({
      timestampSec,
      dataUrl: frameDataUrlFromVideo(video, 320, 0.55),
    });
  }
  return out;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  limit: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  const out = new Array<TOutput>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

export function AdRecreateDialog({
  ad,
  open,
  onOpenChange,
  brandName,
}: {
  ad: TTAd | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandName?: string;
}) {
  const credits = useCreditsPlanOptional();
  const planId = credits?.planId ?? "free";

  const [step, setStep] = useState<Step>("intake");
  const [clipType, setClipType] = useState<ClipType>("talking_head");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [productDescription, setProductDescription] = useState("");
  const [productSlots, setProductSlots] = useState<ProductSlot[]>([]);

  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");

  const [generation, setGeneration] = useState<GenerationOutcome>({ kind: "idle" });

  // First frame of the competitor's video — extracted automatically when dialog opens.
  const [firstFrameDataUrl, setFirstFrameDataUrl] = useState<string | null>(null);
  const [firstFrameCdnUrl, setFirstFrameCdnUrl] = useState<string | null>(null);
  const [frameExtracting, setFrameExtracting] = useState(false);
  const [shotAnalysis, setShotAnalysis] = useState<ShotAnalysisState>({ kind: "idle" });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!open) {
      cancelRef.current = true;
      return;
    }
    cancelRef.current = false;
    setStep("intake");
    setClipType("talking_head");
    setAspectRatio("9:16");
    setProductDescription("");
    setProductSlots([]);
    setDraftBusy(false);
    setDraftError(null);
    setPrompt("");
    setGeneration({ kind: "idle" });
    setFirstFrameDataUrl(null);
    setFirstFrameCdnUrl(null);
    setShotAnalysis({ kind: "idle" });

    // Auto-extract the competitor video's first frame for the start-image and style analysis.
    const videoUrl = ad?.videoUrl?.trim();
    if (!videoUrl) return;
    setFrameExtracting(true);

    void (async () => {
      try {
        // Fetch via proxy to avoid CORS restrictions on competitor CDN URLs.
        const res = await fetch(`/api/download?url=${encodeURIComponent(videoUrl)}`, { cache: "no-store" });
        if (!res.ok || cancelRef.current) return;
        const blob = await res.blob();
        if (cancelRef.current) return;
        const objectUrl = URL.createObjectURL(blob);
        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.src = objectUrl;
        await waitForVideoReady(video);
        if (cancelRef.current) { URL.revokeObjectURL(objectUrl); return; }
        await seekVideo(video, 0);
        if (cancelRef.current) { URL.revokeObjectURL(objectUrl); return; }
        const dataUrl = frameDataUrlFromVideo(video, 720, 0.85);
        if (cancelRef.current) return;
        setFirstFrameDataUrl(dataUrl);
        let startFrameUrl: string | null = null;
        // Upload to CDN so the server can use it as a start-frame and reference.
        try {
          startFrameUrl = await uploadBlobUrlToCdn(dataUrl, "competitor-first-frame.jpg", "image/jpeg", {
            kind: "image",
          });
          if (!cancelRef.current) setFirstFrameCdnUrl(startFrameUrl);
        } catch {
          // CDN upload failed — script generation will proceed without the start frame.
        }
        if (!cancelRef.current) setFrameExtracting(false);

        try {
          setShotAnalysis({ kind: "extracting" });
          const timeline = buildDenseSampleTimeline(video.duration || 10);
          const denseFrames = await extractDenseFramesFromVideo(video, timeline);
          if (cancelRef.current) return;
          const uploadedFrames = await mapWithConcurrency(denseFrames, 4, async (frame, index) => {
            if (frame.timestampSec === 0 && startFrameUrl) {
              return { timestampSec: frame.timestampSec, imageUrl: startFrameUrl };
            }
            const imageUrl = await uploadBlobUrlToCdn(
              frame.dataUrl,
              `competitor-analysis-frame-${index + 1}.jpg`,
              "image/jpeg",
              { kind: "image" },
            );
            return { timestampSec: frame.timestampSec, imageUrl };
          });
          if (cancelRef.current) return;
          setShotAnalysis({ kind: "analyzing" });
          const analysisRes = await fetch("/api/intelligence/recreate/analyze-shots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              frames: uploadedFrames satisfies DenseFramePoint[],
              durationSec: video.duration || 10,
              ad: {
                headline: ad?.headline ?? ad?.title,
                body: ad?.body ?? ad?.text,
                platform: ad?.platform,
              },
            }),
          });
          const analysisJson = (await analysisRes.json().catch(() => ({}))) as {
            shots?: ReferenceShot[];
            keyframes?: ReferenceShot[];
            analyzedFrameCount?: number;
            error?: string;
          };
          if (!analysisRes.ok || !Array.isArray(analysisJson.shots) || !Array.isArray(analysisJson.keyframes)) {
            throw new Error(analysisJson.error || `Shot analysis failed (HTTP ${analysisRes.status}).`);
          }
          if (!cancelRef.current) {
            setShotAnalysis({
              kind: "ready",
              shots: analysisJson.shots,
              keyframes: analysisJson.keyframes,
              analyzedFrameCount:
                typeof analysisJson.analyzedFrameCount === "number"
                  ? analysisJson.analyzedFrameCount
                  : uploadedFrames.length,
            });
          }
        } catch (error) {
          if (!cancelRef.current) {
            const message = error instanceof Error ? error.message : "High-fidelity analysis unavailable.";
            setShotAnalysis({ kind: "failed", message });
          }
        } finally {
          video.pause();
          video.removeAttribute("src");
          video.load();
          URL.revokeObjectURL(objectUrl);
        }
      } catch {
        // Silently ignore extraction failures; the dialog still works.
      } finally {
        if (!cancelRef.current) setFrameExtracting(false);
      }
    })();
  }, [open, ad?.id, ad?.videoUrl, ad?.headline, ad?.title, ad?.body, ad?.text, ad?.platform]);

  const referenceImageUrls = useMemo(() => {
    if (!ad) return [] as string[];
    const out: string[] = [];
    // Prefer the extracted first frame (most accurate style reference); fall back to static thumbnails.
    if (firstFrameCdnUrl) {
      out.push(firstFrameCdnUrl);
    }
    if (shotAnalysis.kind === "ready") {
      for (const shot of shotAnalysis.keyframes) {
        const url = shot.keyFrameUrl?.trim();
        if (url && /^https?:\/\//i.test(url) && !out.includes(url)) out.push(url);
      }
    }
    if (out.length === 0) {
      const candidates = [ad.previewUrl, ad.thumbnailUrl, ad.imageUrl];
      for (const raw of candidates) {
        if (typeof raw !== "string") continue;
        const u = raw.trim();
        if (u && /^https?:\/\//i.test(u) && !out.includes(u)) out.push(u);
      }
    }
    return out;
  }, [ad, firstFrameCdnUrl, shotAnalysis]);

  const productCdnUrls = useMemo(
    () => productSlots.map((s) => s.cdnUrl).filter((u): u is string => Boolean(u && u.trim())),
    [productSlots],
  );

  const anyUploading = productSlots.some((s) => s.uploading);
  const analysisBusy = shotAnalysis.kind === "extracting" || shotAnalysis.kind === "analyzing";
  const canDraft =
    !anyUploading &&
    !frameExtracting &&
    !analysisBusy &&
    (productCdnUrls.length > 0 || productDescription.trim().length > 0);

  const handlePickFiles = useCallback(() => fileInputRef.current?.click(), []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const room = MAX_PRODUCT_IMAGES - productSlots.length;
    if (room <= 0) {
      toast.message(`Up to ${MAX_PRODUCT_IMAGES} product images.`);
      return;
    }
    const incoming = Array.from(files).slice(0, room);

    const newSlots: ProductSlot[] = incoming.map((file) => ({
      id: newProductSlotId(),
      previewUrl: URL.createObjectURL(file),
      cdnUrl: null,
      uploading: true,
    }));

    setProductSlots((prev) => [...prev, ...newSlots]);

    await Promise.all(
      incoming.map(async (file, idx) => {
        const slotId = newSlots[idx].id;
        try {
          const compressed = await compressImageFileForUpload(file);
          const cdnUrl = await uploadFileToCdn(compressed, { kind: "image" });
          setProductSlots((prev) =>
            prev.map((s) => (s.id === slotId ? { ...s, cdnUrl, uploading: false } : s)),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed.";
          toast.error(`Upload failed: ${message}`);
          setProductSlots((prev) => prev.filter((s) => s.id !== slotId));
        }
      }),
    );
  }, [productSlots.length]);

  const removeSlot = useCallback((id: string) => {
    setProductSlots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target?.previewUrl?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(target.previewUrl);
        } catch {}
      }
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const draftScript = useCallback(async () => {
    if (!ad) return;
    if (!canDraft) {
      setDraftError("Add a product image or short description first.");
      return;
    }
    setDraftBusy(true);
    setDraftError(null);
    try {
      const res = await fetch("/api/intelligence/recreate/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad: {
            headline: ad.headline ?? ad.title,
            body: ad.body ?? ad.text,
            platform: ad.platform,
          },
          videoFirstFrameUrl: firstFrameCdnUrl ?? undefined,
          referenceImageUrls,
          productImageUrls: productCdnUrls,
          productDescription: productDescription.trim(),
          clipType,
          aspectRatio,
          durationSec: 10,
          shotAnalysis:
            shotAnalysis.kind === "ready"
              ? {
                  shots: shotAnalysis.shots,
                  keyframes: shotAnalysis.keyframes,
                  analyzedFrameCount: shotAnalysis.analyzedFrameCount,
                }
              : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { prompt?: string; error?: string };
      if (!res.ok || !json.prompt) {
        throw new Error(json.error || `Draft failed (HTTP ${res.status}).`);
      }
      setPrompt(json.prompt);
      setStep("review");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not draft the script.";
      setDraftError(message);
    } finally {
      setDraftBusy(false);
    }
  }, [ad, canDraft, firstFrameCdnUrl, referenceImageUrls, productCdnUrls, productDescription, clipType, aspectRatio, shotAnalysis]);

  const regenerateDraft = useCallback(() => {
    setStep("intake");
    setPrompt("");
    setDraftError(null);
  }, []);

  const launchGeneration = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      toast.error("The prompt is empty.");
      return;
    }
    if (productCdnUrls.length === 0) {
      toast.error("Add at least one product image before generating.");
      return;
    }

    setStep("running");
    setGeneration({ kind: "running" });

    const personalApiKey = getPersonalApiKey();
    const piapiApiKey = getPersonalPiapiApiKey();

    const payload: Record<string, unknown> = {
      accountPlan: planId,
      marketModel: SEEDANCE_RECREATE_MODEL,
      prompt: trimmedPrompt,
      duration: 10,
      aspectRatio,
      sound: true,
      videoResolution: "720p",
      personalApiKey: personalApiKey ?? undefined,
      piapiApiKey: piapiApiKey ?? undefined,
    };

    // Build Seedance media refs: competitor first frame (style/start) + product images.
    // Bundle all as seedanceOmniMedia so the model has both the visual opening and the product.
    const omniRefs: { type: "image"; url: string }[] = [
      ...(firstFrameCdnUrl ? [{ type: "image" as const, url: firstFrameCdnUrl }] : []),
      ...productCdnUrls.map((url) => ({ type: "image" as const, url })),
    ];
    if (omniRefs.length > 1) {
      payload.seedanceOmniMedia = omniRefs;
    } else if (omniRefs.length === 1) {
      // Single reference: use as first_frame_url (dedicated start-frame mode).
      payload.imageUrl = omniRefs[0].url;
    }

    try {
      const { blocked, response } = await guardedFetch("/api/kling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (blocked) {
        setGeneration({ kind: "idle" });
        setStep("review");
        return;
      }
      const json = (await response.json().catch(() => ({}))) as { taskId?: string; error?: string };
      if (!response.ok || !json.taskId) {
        throw new Error(json.error || `Generation failed (HTTP ${response.status}).`);
      }
      const recreateInputUrls = productCdnUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
      const recreateLabel = trimmedPrompt.slice(0, 200) || "Intelligence recreate video";
      const registerPromise = registerStudioGenerationClient({
        kind: STUDIO_GENERATION_KIND_INTELLIGENCE_RECREATION,
        label: recreateLabel,
        taskId: json.taskId,
        provider: "kie-market",
        model: SEEDANCE_RECREATE_MODEL,
        creditsCharged: 0,
        personalApiKey: personalApiKey ?? undefined,
        piapiApiKey: piapiApiKey ?? undefined,
        inputUrls: recreateInputUrls.length > 0 ? recreateInputUrls : undefined,
        aspectRatio,
      }).catch(() => null);
      const videoUrl = await pollKlingVideo(
        json.taskId,
        personalApiKey ?? undefined,
        piapiApiKey ?? undefined,
      );
      if (cancelRef.current) return;
      void registerPromise;
      void completeStudioTask(json.taskId, videoUrl);
      setGeneration({ kind: "success", videoUrl, taskId: json.taskId });
      // Store recreate in DB for the user's Intelligence history.
      fetch("/api/intelligence/recreations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "ad_recreate",
          sourceAdId: ad?.id ?? null,
          sourceBrand: brandName ?? null,
          sourcePlatform: ad?.platform ?? null,
          sourceHook: (ad?.headline ?? ad?.title ?? null) as string | null,
          prompt: trimmedPrompt,
          model: SEEDANCE_RECREATE_MODEL,
          taskId: json.taskId,
          outputVideoUrl: videoUrl,
          meta: {
            aspectRatio,
            clipType,
            productImageUrls: productCdnUrls,
            productDescription: productDescription.trim() || null,
          },
        }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({})) as { error?: string };
            console.error("Recreation save failed:", r.status, body);
            toast.error(`Recreation not saved: ${body.error ?? `HTTP ${r.status}`}`);
          }
        })
        .catch((err: unknown) => {
          console.error("Recreation save network error:", err);
          toast.error("Recreation could not be saved (network error).");
        });
      toast.success("Recreate ready.");
    } catch (err) {
      if (cancelRef.current) return;
      const message = err instanceof Error ? err.message : "Generation failed.";
      setGeneration({ kind: "error", message });
      toast.error(`Generation failed: ${message}`);
    }
  }, [prompt, productCdnUrls, planId, aspectRatio, firstFrameCdnUrl, ad?.id, ad?.platform, ad?.headline, ad?.title, brandName, clipType, productDescription]);

  const headerSubtitle = useMemo(() => {
    if (!ad) return "";
    const hook = (ad.headline ?? ad.title ?? "").trim();
    const platform = ad.platform ?? "ad";
    if (hook && brandName) return `${brandName} · ${platform} — "${hook.slice(0, 80)}"`;
    if (hook) return `${platform} — "${hook.slice(0, 80)}"`;
    if (brandName) return `${brandName} · ${platform}`;
    return platform;
  }, [ad, brandName]);

  if (!ad) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] flex max-h-[92dvh] w-[min(960px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0912] text-white shadow-2xl"
          onPointerDownOutside={(e) => {
            if (step === "running" && generation.kind === "running") e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (step === "running" && generation.kind === "running") e.preventDefault();
          }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-violet-400/30 bg-violet-500/10 text-violet-200">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <Dialog.Title className="text-sm font-semibold tracking-tight text-white">
                  Recreate this ad with your product
                </Dialog.Title>
                <Dialog.Description className="line-clamp-1 text-[11px] text-white/55">
                  {headerSubtitle}
                </Dialog.Description>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60 transition hover:border-violet-400/40 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Stepper step={step} />

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {step === "intake" && (
              <IntakeStep
                ad={ad}
                firstFrameDataUrl={firstFrameDataUrl}
                frameExtracting={frameExtracting}
                shotAnalysis={shotAnalysis}
                referenceImageUrls={referenceImageUrls}
                productSlots={productSlots}
                onPickFiles={handlePickFiles}
                onRemoveSlot={removeSlot}
                productDescription={productDescription}
                onProductDescriptionChange={setProductDescription}
                clipType={clipType}
                onClipTypeChange={setClipType}
                aspectRatio={aspectRatio}
                onAspectRatioChange={setAspectRatio}
                anyUploading={anyUploading}
              />
            )}

            {step === "review" && (
              <ReviewStep
                prompt={prompt}
                onPromptChange={setPrompt}
                onRegenerate={regenerateDraft}
                ad={ad}
                firstFrameDataUrl={firstFrameDataUrl}
                shotAnalysis={shotAnalysis}
                referenceImageUrls={referenceImageUrls}
                productImageUrls={productCdnUrls}
              />
            )}

            {step === "running" && (
              <RunningStep generation={generation} onRetry={() => setStep("review")} />
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/40 px-5 py-3">
            <div className="text-[11px] text-white/40">
              {step === "intake" &&
                (frameExtracting
                  ? "Extracting video start frame…"
                  : shotAnalysis.kind === "extracting"
                    ? "Extracting dense analysis frames…"
                    : shotAnalysis.kind === "analyzing"
                      ? "Analyzing shots…"
                      : shotAnalysis.kind === "ready"
                        ? `Step 1 of 3 — High-fidelity analysis ready ✓ · ${shotAnalysis.shots.length} shots`
                        : firstFrameCdnUrl
                          ? "Step 1 of 3 — Start frame ready ✓ — Add your product"
                          : "Step 1 of 3 — Add your product")}
              {step === "review" && "Step 2 of 3 — Review the script"}
              {step === "running" && "Step 3 of 3 — Generating with Seedance 2.0"}
            </div>
            <div className="flex items-center gap-2">
              {step === "review" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("intake")}
                  className="text-white/70 hover:text-white"
                >
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  Back
                </Button>
              )}
              {step === "intake" && (
                <Button
                  size="sm"
                  onClick={draftScript}
                  disabled={!canDraft || draftBusy || frameExtracting || analysisBusy}
                  className="bg-violet-400 text-black hover:bg-violet-300"
                >
                  {draftBusy || frameExtracting || analysisBusy ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {frameExtracting
                    ? "Extracting start frame…"
                    : shotAnalysis.kind === "extracting"
                      ? "Extracting frames…"
                      : shotAnalysis.kind === "analyzing"
                        ? "Analyzing shots…"
                        : draftBusy
                          ? "Drafting recreate script…"
                          : "Draft the script"}
                </Button>
              )}
              {step === "review" && (
                <Button
                  size="sm"
                  onClick={launchGeneration}
                  disabled={!prompt.trim() || productCdnUrls.length === 0}
                  className="bg-violet-400 text-black hover:bg-violet-300"
                >
                  <Rocket className="mr-1.5 h-3.5 w-3.5" />
                  Approve and generate
                </Button>
              )}
              {step === "running" && generation.kind === "success" && (
                <Button
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="bg-violet-400 text-black hover:bg-violet-300"
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Done
                </Button>
              )}
            </div>
          </div>

          {draftError && step === "intake" && (
            <div className="border-t border-rose-500/30 bg-rose-500/10 px-5 py-2 text-[11px] text-rose-200">
              {draftError}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={STUDIO_IMAGE_FILE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Stepper({ step }: { step: Step }) {
  const items: { id: Step; label: string }[] = [
    { id: "intake", label: "Your product" },
    { id: "review", label: "Review script" },
    { id: "running", label: "Generate" },
  ];
  const idx = items.findIndex((i) => i.id === step);
  return (
    <div className="flex items-center gap-2 border-b border-white/10 bg-black/30 px-5 py-2">
      {items.map((it, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <div key={it.id} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold",
                done && "border-violet-400/50 bg-violet-400/20 text-violet-100",
                active && "border-violet-400/70 bg-violet-400 text-black",
                !done && !active && "border-white/15 bg-white/5 text-white/40",
              )}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-[11px] font-medium",
                active ? "text-white" : "text-white/45",
              )}
            >
              {it.label}
            </span>
            {i < items.length - 1 && <div className="mx-1 h-px w-6 bg-white/10" />}
          </div>
        );
      })}
    </div>
  );
}

function IntakeStep({
  ad,
  firstFrameDataUrl,
  frameExtracting,
  shotAnalysis,
  referenceImageUrls,
  productSlots,
  onPickFiles,
  onRemoveSlot,
  productDescription,
  onProductDescriptionChange,
  clipType,
  onClipTypeChange,
  aspectRatio,
  onAspectRatioChange,
  anyUploading,
}: {
  ad: TTAd;
  firstFrameDataUrl: string | null;
  frameExtracting: boolean;
  shotAnalysis: ShotAnalysisState;
  referenceImageUrls: string[];
  productSlots: ProductSlot[];
  onPickFiles: () => void;
  onRemoveSlot: (id: string) => void;
  productDescription: string;
  onProductDescriptionChange: (v: string) => void;
  clipType: ClipType;
  onClipTypeChange: (v: ClipType) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (v: AspectRatio) => void;
  anyUploading: boolean;
}) {
  const reference = firstFrameDataUrl ?? referenceImageUrls[0];
  return (
    <div className="grid gap-5 md:grid-cols-[260px_1fr]">
      <section className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
          Reference ad
          {firstFrameDataUrl && (
            <span className="ml-2 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-200">
              start frame
            </span>
          )}
          {shotAnalysis.kind === "ready" && (
            <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200">
              {shotAnalysis.shots.length} shots detected
            </span>
          )}
        </p>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <div className="relative aspect-[9/16] w-full bg-black">
            {frameExtracting && !reference ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-white/40">
                <Loader2 className="h-5 w-5 animate-spin text-violet-300" />
                Extracting start frame…
              </div>
            ) : reference ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={reference}
                alt={ad.headline ?? ad.title ?? "Reference"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
                No preview
              </div>
            )}
            {frameExtracting && reference && (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-black/70 px-3 py-1.5 text-[10px] text-violet-200">
                <Loader2 className="h-3 w-3 animate-spin" />
                Uploading start frame…
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 p-3">
            <p className="line-clamp-2 text-xs font-medium text-white/85">
              {ad.headline ?? ad.title ?? "—"}
            </p>
            {(ad.body ?? ad.text) && (
              <p className="line-clamp-3 text-[11px] leading-relaxed text-white/55">
                {ad.body ?? ad.text}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
            Your product
          </p>
          <div className="grid grid-cols-3 gap-2">
            {productSlots.map((slot) => (
              <div
                key={slot.id}
                className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slot.previewUrl}
                  alt="Product"
                  className="h-full w-full object-cover"
                />
                {slot.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <Loader2 className="h-5 w-5 animate-spin text-white/80" />
                  </div>
                )}
                <button
                  onClick={() => onRemoveSlot(slot.id)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-white/80 opacity-0 transition group-hover:opacity-100 hover:text-white"
                  aria-label="Remove image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {productSlots.length < MAX_PRODUCT_IMAGES && (
              <button
                onClick={onPickFiles}
                className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-white/[0.03] text-xs text-white/55 transition hover:border-violet-400/40 hover:text-white"
              >
                <Upload className="h-4 w-4" />
                <span>{productSlots.length === 0 ? "Add image" : "Add more"}</span>
              </button>
            )}
          </div>
          <p className="text-[11px] text-white/40">
            <ImageIcon className="mr-1 inline h-3 w-3" />
            Up to {MAX_PRODUCT_IMAGES} photos. The first one is the canonical product shot — it
            becomes <code className="rounded bg-white/5 px-1 text-violet-200">@image1</code> in the
            generated prompt.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
            Product description (1–2 sentences)
          </label>
          <Textarea
            value={productDescription}
            onChange={(e) => onProductDescriptionChange(e.target.value)}
            placeholder="e.g. Aurora Glow — vitamin-C facial serum in a violet glass bottle. Brightens dull skin in 14 days."
            className="min-h-[80px] resize-none border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-white/30"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Clip type
            </label>
            <Select value={clipType} onValueChange={(v) => onClipTypeChange(v as ClipType)}>
              <SelectTrigger className="h-9 border-white/10 bg-white/[0.04] text-sm text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIP_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="font-medium">{o.label}</span>
                    <span className="ml-1 text-white/45">— {o.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Aspect ratio
            </label>
            <Select
              value={aspectRatio}
              onValueChange={(v) => onAspectRatioChange(v as AspectRatio)}
            >
              <SelectTrigger className="h-9 border-white/10 bg-white/[0.04] text-sm text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="9:16">9:16 — vertical</SelectItem>
                <SelectItem value="1:1">1:1 — square</SelectItem>
                <SelectItem value="16:9">16:9 — landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {anyUploading && (
          <p className="text-[11px] text-white/45">
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
            Uploading product photos…
          </p>
        )}
        {shotAnalysis.kind === "failed" && (
          <p className="text-[11px] text-amber-200/90">
            High-fidelity shot analysis unavailable. The recreate will fall back to the start frame
            and static references.
          </p>
        )}
      </section>
    </div>
  );
}

function ReviewStep({
  prompt,
  onPromptChange,
  onRegenerate,
  ad,
  firstFrameDataUrl,
  shotAnalysis,
  referenceImageUrls,
  productImageUrls,
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
  onRegenerate: () => void;
  ad: TTAd;
  firstFrameDataUrl: string | null;
  shotAnalysis: ShotAnalysisState;
  referenceImageUrls: string[];
  productImageUrls: string[];
}) {
  const reference = firstFrameDataUrl ?? referenceImageUrls[0];
  return (
    <div className="grid gap-5 md:grid-cols-[200px_1fr]">
      <aside className="flex flex-col gap-3">
        <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
          Reference {firstFrameDataUrl && <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-200">start frame</span>}
        </p>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
            <div className="relative aspect-[9/16] w-full bg-black">
              {reference ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={reference} alt="Reference" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
                  No preview
                </div>
              )}
            </div>
            {(ad.headline ?? ad.title) && (
              <p className="line-clamp-2 px-2.5 py-2 text-[11px] text-white/65">
                {ad.headline ?? ad.title}
              </p>
            )}
          </div>
        </div>
        {productImageUrls.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Product
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {productImageUrls.map((url, i) => (
                <div
                  key={url}
                  className="relative aspect-square overflow-hidden rounded-md border border-white/10 bg-black/40"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Product ${i + 1}`} className="h-full w-full object-cover" />
                  <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[9px] font-bold text-violet-200">
                    @image{i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      <section className="flex min-h-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
            Adapted Seedance 2.0 prompt
          </p>
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/65 transition hover:border-violet-400/40 hover:text-white"
          >
            <RefreshCw className="h-3 w-3" />
            Edit inputs and redraft
          </button>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          className="min-h-[360px] resize-none border-white/10 bg-white/[0.04] font-mono text-[13px] leading-relaxed text-white placeholder:text-white/30"
          spellCheck={false}
        />
        <p className="text-[11px] text-white/40">
          Tweak any line. References to{" "}
          <code className="rounded bg-white/5 px-1 text-violet-200">@imageN</code> map to your
          product photos in upload order. Generation runs on Seedance 2.0 — ~10s clip,{" "}
          {productImageUrls.length} product image{productImageUrls.length === 1 ? "" : "s"}.
        </p>
        {shotAnalysis.kind === "ready" && (
          <p className="text-[11px] text-emerald-200/90">
            High-fidelity analysis: {shotAnalysis.shots.length} shots detected from{" "}
            {shotAnalysis.analyzedFrameCount} frames.
          </p>
        )}
      </section>
    </div>
  );
}

function RunningStep({
  generation,
  onRetry,
}: {
  generation: GenerationOutcome;
  onRetry: () => void;
}) {
  if (generation.kind === "running" || generation.kind === "idle") {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-violet-400/40 bg-violet-500/15 text-violet-200">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-white">Generating your recreate clip…</p>
          <p className="mt-1 text-[11px] text-white/50">
            Seedance 2.0 — typically 2–5 minutes. You can keep this open or close — the job
            finishes server-side.
          </p>
        </div>
      </div>
    );
  }

  if (generation.kind === "error") {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-center">
        <p className="max-w-md text-sm text-rose-300">{generation.message}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="border-white/20 bg-white/5 text-white hover:bg-white/10"
        >
          Back to script
        </Button>
      </div>
    );
  }

  const { videoUrl } = generation;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-violet-400/30 bg-black/60">
        <video
          key={videoUrl}
          src={videoUrl}
          controls
          playsInline
          autoPlay
          className="max-h-[60dvh] w-full bg-black object-contain"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70 transition hover:text-white"
        >
          <ExternalLink className="h-3 w-3" />
          Open the file
        </a>
        <Link
          href="/app/studio"
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70 transition hover:text-white"
        >
          Find it in Studio
        </Link>
      </div>
    </div>
  );
}

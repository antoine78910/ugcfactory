"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Loader2, Sparkles, Upload, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compressImageFileForUpload } from "@/lib/compressImageFileForUpload";
import { uploadBlobUrlToCdn, uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { cn } from "@/lib/utils";

type ClipType = "talking_head" | "product_unboxing" | "faceless_lifestyle" | "app_promo" | "custom";
type AspectRatio = "9:16" | "1:1" | "16:9";

const CLIP_TYPE_OPTIONS: Array<{ value: ClipType; label: string }> = [
  { value: "talking_head", label: "Talking head" },
  { value: "product_unboxing", label: "Product unboxing" },
  { value: "faceless_lifestyle", label: "Faceless lifestyle" },
  { value: "app_promo", label: "App promo" },
  { value: "custom", label: "Free-form" },
];

function looksLikeImageUrl(url: string): boolean {
  const clean = url.split("?")[0] ?? url;
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(clean);
}

function mapAspectRatio(value: string): AspectRatio {
  return value === "1:1" || value === "16:9" ? value : "9:16";
}

async function extractFirstFrameFromObjectUrl(objectUrl: string): Promise<string> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Video load timeout.")), 20000);
    video.onloadeddata = () => {
      window.clearTimeout(timer);
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Video load error."));
    };
  });

  video.currentTime = 0;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 2500);
    video.onseeked = () => {
      window.clearTimeout(timer);
      resolve();
    };
  });

  const w = video.videoWidth || 480;
  const h = video.videoHeight || 854;
  const scale = Math.min(1, 720 / Math.max(w, h, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a drawing context.");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function extractRemoteVideoFrame(url: string): Promise<string> {
  const res = await fetch(`/api/download?url=${encodeURIComponent(url)}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Could not fetch the reference video (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await extractFirstFrameFromObjectUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function AdsStudioRecreatePromptDialog({
  open,
  onOpenChange,
  assetType,
  attachedReferenceUrl,
  currentAspectRatio,
  currentDurationSec,
  onApplyPrompt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetType: "product" | "app";
  attachedReferenceUrl?: string;
  currentAspectRatio: string;
  currentDurationSec: number;
  onApplyPrompt: (prompt: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectPreviewUrlRef = useRef<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [clipType, setClipType] = useState<ClipType>(assetType === "app" ? "app_promo" : "custom");
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [videoFirstFrameUrl, setVideoFirstFrameUrl] = useState<string | null>(null);
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);

  const attachedProductUrls = useMemo(() => {
    const ref = attachedReferenceUrl?.trim() ?? "";
    return ref ? [ref] : [];
  }, [attachedReferenceUrl]);

  useEffect(() => {
    if (!open) return;
    if (objectPreviewUrlRef.current) {
      URL.revokeObjectURL(objectPreviewUrlRef.current);
      objectPreviewUrlRef.current = null;
    }
    setReferenceUrl("");
    setProductDescription("");
    setClipType(assetType === "app" ? "app_promo" : "custom");
    setDraftBusy(false);
    setDraftError(null);
    setReferencePreviewUrl(null);
    setVideoFirstFrameUrl(null);
    setReferenceImageUrl(null);
  }, [assetType, open]);

  useEffect(() => {
    return () => {
      if (objectPreviewUrlRef.current) {
        URL.revokeObjectURL(objectPreviewUrlRef.current);
        objectPreviewUrlRef.current = null;
      }
    };
  }, []);

  const canDraft = useMemo(() => {
    const hasSeenVideoReference = Boolean(referenceUrl.trim() || referencePreviewUrl || videoFirstFrameUrl || referenceImageUrl);
    const hasProductContext = attachedProductUrls.length > 0 || productDescription.trim().length > 0;
    return hasSeenVideoReference && hasProductContext && !draftBusy;
  }, [attachedProductUrls.length, draftBusy, productDescription, referenceImageUrl, referencePreviewUrl, referenceUrl, videoFirstFrameUrl]);

  const applyReferenceFile = useCallback(async (file: File) => {
    setDraftError(null);
    if (file.type.startsWith("image/")) {
      const compressed = await compressImageFileForUpload(file);
      const cdnUrl = await uploadFileToCdn(compressed, { kind: "image" });
      if (objectPreviewUrlRef.current) {
        URL.revokeObjectURL(objectPreviewUrlRef.current);
      }
      const previewUrl = URL.createObjectURL(file);
      objectPreviewUrlRef.current = previewUrl;
      setReferencePreviewUrl(previewUrl);
      setReferenceImageUrl(cdnUrl);
      setVideoFirstFrameUrl(null);
      return;
    }

    if (file.type.startsWith("video/")) {
      const objectUrl = URL.createObjectURL(file);
      try {
        const dataUrl = await extractFirstFrameFromObjectUrl(objectUrl);
        const cdnUrl = await uploadBlobUrlToCdn(dataUrl, "ads-studio-recreate-frame.jpg", "image/jpeg", { kind: "image" });
        setReferencePreviewUrl(dataUrl);
        setVideoFirstFrameUrl(cdnUrl);
        setReferenceImageUrl(null);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      return;
    }

    throw new Error("Use an image or video file.");
  }, []);

  const resolveReferenceUrl = useCallback(async (): Promise<{
    previewUrl: string;
    videoFirstFrameUrl: string | null;
    referenceImageUrl: string | null;
  }> => {
    const raw = referenceUrl.trim();
    if (!raw) {
      throw new Error("Add a video URL or upload a file.");
    }

    if (looksLikeImageUrl(raw)) {
      if (objectPreviewUrlRef.current) {
        URL.revokeObjectURL(objectPreviewUrlRef.current);
        objectPreviewUrlRef.current = null;
      }
      setReferencePreviewUrl(raw);
      setReferenceImageUrl(raw);
      setVideoFirstFrameUrl(null);
      return {
        previewUrl: raw,
        videoFirstFrameUrl: null,
        referenceImageUrl: raw,
      };
    }

    const dataUrl = await extractRemoteVideoFrame(raw);
    const cdnUrl = await uploadBlobUrlToCdn(dataUrl, "ads-studio-remote-frame.jpg", "image/jpeg", { kind: "image" });
    if (objectPreviewUrlRef.current) {
      URL.revokeObjectURL(objectPreviewUrlRef.current);
      objectPreviewUrlRef.current = null;
    }
    setReferencePreviewUrl(dataUrl);
    setVideoFirstFrameUrl(cdnUrl);
    setReferenceImageUrl(null);
    return {
      previewUrl: dataUrl,
      videoFirstFrameUrl: cdnUrl,
      referenceImageUrl: null,
    };
  }, [referenceUrl]);

  const draftPrompt = useCallback(async () => {
    if (!canDraft) {
      setDraftError(
        attachedProductUrls.length === 0 && !productDescription.trim()
          ? `Add your ${assetType === "app" ? "app" : "product"} context first.`
          : "Add a reference video URL or upload a screenshot/video first.",
      );
      return;
    }

    setDraftBusy(true);
    setDraftError(null);
    try {
      let resolvedVideoFirstFrameUrl = videoFirstFrameUrl;
      let resolvedReferenceImageUrl = referenceImageUrl;
      if (referenceUrl.trim() && !referencePreviewUrl && !videoFirstFrameUrl && !referenceImageUrl) {
        const resolved = await resolveReferenceUrl();
        resolvedVideoFirstFrameUrl = resolved.videoFirstFrameUrl;
        resolvedReferenceImageUrl = resolved.referenceImageUrl;
      }

      const res = await fetch("/api/intelligence/recreate/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad: {
            platform: assetType === "app" ? "app" : "meta",
          },
          videoFirstFrameUrl: resolvedVideoFirstFrameUrl ?? undefined,
          referenceImageUrls: resolvedReferenceImageUrl ? [resolvedReferenceImageUrl] : [],
          productImageUrls: attachedProductUrls,
          productDescription: productDescription.trim(),
          clipType,
          aspectRatio: mapAspectRatio(currentAspectRatio),
          durationSec: currentDurationSec,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { prompt?: string; error?: string };
      if (!res.ok || !json.prompt) {
        throw new Error(json.error || `Draft failed (HTTP ${res.status}).`);
      }
      onApplyPrompt(json.prompt);
      onOpenChange(false);
      toast.success("Recreate prompt ready");
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Could not draft the recreate prompt.");
    } finally {
      setDraftBusy(false);
    }
  }, [
    assetType,
    attachedProductUrls,
    canDraft,
    clipType,
    currentAspectRatio,
    currentDurationSec,
    onApplyPrompt,
    onOpenChange,
    productDescription,
    referenceImageUrl,
    referencePreviewUrl,
    referenceUrl,
    resolveReferenceUrl,
    videoFirstFrameUrl,
  ]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[540] bg-black/75 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[541] flex max-h-[90vh] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#101014] text-white shadow-[0_24px_80px_rgba(0,0,0,0.75)] outline-none">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-white">Recreate Prompt</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-white/55">
                Drop a video or screenshot you want to mimic, and Ads Studio will draft the same recreate-style prompt as Intelligence.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                aria-label="Close"
              >
                <X className="size-4" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                    Reference video URL
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={referenceUrl}
                      onChange={(e) => setReferenceUrl(e.target.value)}
                      placeholder="Paste a public video URL or screenshot URL"
                      className="border-white/10 bg-black/30 text-white"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                      onClick={() => void resolveReferenceUrl()}
                      disabled={draftBusy || referenceUrl.trim().length === 0}
                    >
                      Analyze
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                    Or upload a screenshot / video
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={draftBusy}
                    >
                      <Upload className="mr-2 size-4" />
                      Upload reference
                    </Button>
                    <span className="text-xs text-white/45">Image or video file</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      void applyReferenceFile(file).catch((err: unknown) => {
                        setDraftError(err instanceof Error ? err.message : "Could not process the uploaded reference.");
                      });
                      e.currentTarget.value = "";
                    }}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_170px]">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                      What are we promoting?
                    </label>
                    <Textarea
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder={
                        assetType === "app"
                          ? "Describe the app, the main benefit, and what should be shown on screen."
                          : "Describe the product, the hero benefit, and anything important to preserve."
                      }
                      className="min-h-28 border-white/10 bg-black/30 text-white placeholder:text-white/30"
                    />
                    <p className="text-xs text-white/45">
                      {attachedProductUrls.length > 0
                        ? `Your current ${assetType === "app" ? "App" : "Product"} reference from Ads Studio will also be used.`
                        : `No ${assetType === "app" ? "app" : "product"} reference is attached in Ads Studio right now, so this description matters more.`}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                      Clip type
                    </label>
                    <Select value={clipType} onValueChange={(value) => setClipType(value as ClipType)}>
                      <SelectTrigger className="border-white/10 bg-black/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIP_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Reference preview</p>
                <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                  {referencePreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={referencePreviewUrl} alt="Reference preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-xs text-white/35">
                      <Video className="size-5" aria-hidden />
                      <span>Upload a video or screenshot</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 space-y-2 text-xs text-white/55">
                  <div className={cn("rounded-lg border px-2.5 py-2", attachedProductUrls.length > 0 ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.03]")}>
                    {attachedProductUrls.length > 0
                      ? `${assetType === "app" ? "App" : "Product"} reference attached`
                      : `No ${assetType === "app" ? "app" : "product"} reference attached`}
                  </div>
                  <div className={cn("rounded-lg border px-2.5 py-2", videoFirstFrameUrl || referenceImageUrl ? "border-violet-300/20 bg-violet-500/10 text-violet-100" : "border-white/10 bg-white/[0.03]")}>
                    {videoFirstFrameUrl
                      ? "Video frame extracted"
                      : referenceImageUrl
                        ? "Static reference ready"
                        : "Waiting for a seen-ad reference"}
                  </div>
                </div>
              </div>
            </div>

            {draftError ? <p className="text-sm text-red-400">{draftError}</p> : null}
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
            <p className="text-xs text-white/45">The drafted recreate prompt will replace the current Ads Studio prompt.</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                onClick={() => onOpenChange(false)}
                disabled={draftBusy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void draftPrompt()}
                disabled={!canDraft}
                className="bg-violet-600 text-white hover:bg-violet-500"
              >
                {draftBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
                Draft prompt
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { TTAd } from "@/lib/trendtrack";
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
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { STUDIO_IMAGE_FILE_ACCEPT } from "@/lib/studioUploadValidation";
import { guardedFetch } from "@/lib/guardedFetch";
import { pollKlingVideo } from "@/lib/studioKlingClientPoll";
import {
  getPersonalApiKey,
  getPersonalPiapiApiKey,
  useCreditsPlanOptional,
} from "@/app/_components/CreditsPlanContext";
import { cn } from "@/lib/utils";

const MAX_PRODUCT_IMAGES = 3;

const SEEDANCE_RECREATE_MODEL = "bytedance/seedance-2-fast" as const;

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

function newProductSlotId(): string {
  return `p-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
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
  }, [open, ad?.id]);

  const referenceImageUrls = useMemo(() => {
    if (!ad) return [] as string[];
    const out: string[] = [];
    const candidates = [ad.previewUrl, ad.thumbnailUrl, ad.imageUrl];
    for (const raw of candidates) {
      if (typeof raw !== "string") continue;
      const u = raw.trim();
      if (u && /^https?:\/\//i.test(u) && !out.includes(u)) out.push(u);
    }
    return out;
  }, [ad]);

  const productCdnUrls = useMemo(
    () => productSlots.map((s) => s.cdnUrl).filter((u): u is string => Boolean(u && u.trim())),
    [productSlots],
  );

  const anyUploading = productSlots.some((s) => s.uploading);
  const canDraft =
    !anyUploading && (productCdnUrls.length > 0 || productDescription.trim().length > 0);

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
          referenceImageUrls,
          productImageUrls: productCdnUrls,
          productDescription: productDescription.trim(),
          clipType,
          aspectRatio,
          durationSec: 10,
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
  }, [ad, canDraft, referenceImageUrls, productCdnUrls, productDescription, clipType, aspectRatio]);

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

    if (productCdnUrls.length > 1) {
      payload.seedanceOmniMedia = productCdnUrls.map((url) => ({ type: "image" as const, url }));
    } else {
      payload.imageUrl = productCdnUrls[0];
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
      const videoUrl = await pollKlingVideo(
        json.taskId,
        personalApiKey ?? undefined,
        piapiApiKey ?? undefined,
      );
      if (cancelRef.current) return;
      setGeneration({ kind: "success", videoUrl, taskId: json.taskId });
      // Store recreate in DB for the user's Intelligence history.
      void fetch("/api/intelligence/recreations", {
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
      }).catch(() => {});
      toast.success("Recreate ready.");
    } catch (err) {
      if (cancelRef.current) return;
      const message = err instanceof Error ? err.message : "Generation failed.";
      setGeneration({ kind: "error", message });
      toast.error(`Generation failed: ${message}`);
    }
  }, [prompt, productCdnUrls, planId, aspectRatio, ad?.id, ad?.platform, ad?.headline, ad?.title, brandName, clipType, productDescription]);

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
              {step === "intake" && "Step 1 of 3 — Add your product"}
              {step === "review" && "Step 2 of 3 — Review the script"}
              {step === "running" && "Step 3 of 3 — Generating with Seedance 2.0 Fast"}
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
                  disabled={!canDraft || draftBusy}
                  className="bg-violet-400 text-black hover:bg-violet-300"
                >
                  {draftBusy ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {draftBusy ? "Drafting…" : "Draft the script"}
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
  const reference = referenceImageUrls[0];
  return (
    <div className="grid gap-5 md:grid-cols-[260px_1fr]">
      <section className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
          Reference ad
        </p>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <div className="relative aspect-[9/16] w-full bg-black">
            {reference ? (
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
      </section>
    </div>
  );
}

function ReviewStep({
  prompt,
  onPromptChange,
  onRegenerate,
  ad,
  referenceImageUrls,
  productImageUrls,
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
  onRegenerate: () => void;
  ad: TTAd;
  referenceImageUrls: string[];
  productImageUrls: string[];
}) {
  const reference = referenceImageUrls[0];
  return (
    <div className="grid gap-5 md:grid-cols-[200px_1fr]">
      <aside className="flex flex-col gap-3">
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
            Reference
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
          product photos in upload order. Generation runs on Seedance 2.0 Fast — ~10s clip,{" "}
          {productImageUrls.length} product image{productImageUrls.length === 1 ? "" : "s"}.
        </p>
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
            Seedance 2.0 Fast — typically 1–3 minutes. You can keep this open or close — the job
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
        <a
          href="/app/studio"
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70 transition hover:text-white"
        >
          Find it in Studio
        </a>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useCreditsPlan,
  getPersonalApiKey,
  isPlatformCreditBypassActive,
} from "@/app/_components/CreditsPlanContext";
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";
import { Sparkles, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudioEmptyExamples, StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import { StudioGenerationsHistory } from "@/app/_components/StudioGenerationsHistory";
import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";
import { StudioModelPicker, type StudioModelPickerItem } from "@/app/_components/StudioModelPicker";
import { topazImageUpscaleCredits, topazVideoUpscaleCredits } from "@/lib/pricing";
import { registerStudioGenerationClient } from "@/lib/registerStudioGenerationClient";
import { UploadBusyOverlay } from "@/app/_components/UploadBusyOverlay";

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
  return json.url;
}

async function pollUpscaleTask(taskId: string, personalApiKey?: string): Promise<string> {
  const max = 120;
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  for (let i = 0; i < max; i++) {
    const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}${keyParam}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      data?: { status?: string; response?: string[]; error_message?: string | null };
      error?: string;
    };
    if (!res.ok || !json.data) throw new Error(json.error || "Poll failed");
    const st = json.data.status ?? "IN_PROGRESS";
    if (st === "IN_PROGRESS") {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (st === "SUCCESS") {
      const urls = json.data.response ?? [];
      const u = urls[0];
      if (!u || typeof u !== "string") throw new Error("Upscale finished but no output URL.");
      return u;
    }
    throw new Error(json.data.error_message || "Upscale failed.");
  }
  throw new Error("Upscale timed out.");
}

type UpscalePickerId = "upscale/video" | "upscale/image";

const UPSCALE_MODEL_PICKER_ITEMS: StudioModelPickerItem[] = [
  {
    id: "upscale/video",
    label: "Topaz Video Upscale",
    icon: "google",
    resolution: "Up to 4x",
    durationRange: "1s–10min",
    searchText: "topaz video upscale kie",
  },
  {
    id: "upscale/image",
    label: "Topaz Image Upscale",
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
  const [imageUrl, setImageUrl] = useState("");
  // Video duration is only known after metadata is loaded; keep it null until then.
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [factor, setFactor] = useState<"1" | "2" | "4">("2");
  const [upscalePickerId, setUpscalePickerId] = useState<UpscalePickerId>("upscale/video");
  const [busy, setBusy] = useState(false);
  const [videoPreviewBlob, setVideoPreviewBlob] = useState<string | null>(null);
  const [imagePreviewBlob, setImagePreviewBlob] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);
  type Bill = { open: false } | { open: true; required: number };
  const [billing, setBilling] = useState<Bill>({ open: false });

  const credits = useMemo(() => {
    if (upscalePickerId === "upscale/image") return topazImageUpscaleCredits(factor);
    if (durationSec == null) return 0;
    return topazVideoUpscaleCredits(durationSec, factor);
  }, [upscalePickerId, durationSec, factor]);

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

  const onPickVideo = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/mp4,video/quicktime,video/webm";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const blobUrl = URL.createObjectURL(f);
      setVideoPreviewBlob(blobUrl);
      setImagePreviewBlob(null);
      setImageUrl("");
      setBusy(true);
      try {
        const url = await uploadFile(f);
        setVideoUrl(url);
        toast.success("Video uploaded");
        setVideoPreviewBlob(null);
      } catch (e) {
        toast.error("Upload failed. Please try again.");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const onPickImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const blobUrl = URL.createObjectURL(f);
      setImagePreviewBlob(blobUrl);
      setVideoPreviewBlob(null);
      setVideoUrl("");
      setBusy(true);
      try {
        const url = await uploadFile(f);
        setImageUrl(url);
        toast.success("Image uploaded");
        setImagePreviewBlob(null);
      } catch (e) {
        toast.error("Upload failed. Please try again.");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const generate = () => {
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

    const label = isImage ? `Topaz Image ${factor}×` : `Topaz ${factor}×`;

    if (!creditBypass) {
      spendCredits(credits);
      creditsRef.current = Math.max(0, creditsRef.current - credits);
    }

    setHistoryItems((prev) => [
      { id: jobId, kind: isImage ? "image" : "video", status: "generating", label, createdAt: startedAt },
      ...prev,
    ]);

    void (async () => {
      try {
        const upPKey = getPersonalApiKey();
        const endpoint = isImage ? "/api/kie/upscale/image" : "/api/kie/upscale/video";
        const body = isImage
          ? { imageUrl: inputUrl, upscaleFactor: factor, personalApiKey: upPKey }
          : { videoUrl: inputUrl, upscaleFactor: factor, personalApiKey: upPKey };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { taskId?: string; error?: string };
        if (!res.ok || !json.taskId) throw new Error(json.error || "Upscale request failed");

        const rowId = await registerStudioGenerationClient({
          kind: "studio_upscale",
          label,
          taskId: json.taskId,
          creditsCharged: platformCharge,
          personalApiKey: upPKey,
        });
        if (rowId) {
          setHistoryItems((prev) =>
            prev.map((i) =>
              i.id === jobId ? { ...i, id: rowId, studioGenerationKind: "studio_upscale" } : i,
            ),
          );
        }

        const outUrl = await pollUpscaleTask(json.taskId, upPKey);
        const doneAt = Date.now();
        const persistId = rowId ?? jobId;
        setHistoryItems((prev) => {
          const rest = prev.filter((i) => i.id !== jobId && i.id !== rowId);
          return [
            {
              id: persistId,
              kind: isImage ? "image" : "video",
              status: "ready",
              label,
              mediaUrl: outUrl,
              createdAt: doneAt,
              studioGenerationKind: "studio_upscale",
            },
            ...rest,
          ];
        });

        toast.success(isImage ? "Upscaled image ready" : "Upscaled video ready");
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
        <div className="flex min-w-0 w-full flex-col gap-2 lg:basis-[30%] lg:max-w-[28rem] lg:flex-none lg:shrink-0 lg:min-h-0 lg:overflow-hidden">
          <div className="studio-params-scroll flex min-w-0 flex-col gap-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-10">
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
          <div className="rounded-2xl border border-white/10 bg-[#101014] p-4 space-y-3">
            <Label className="text-xs text-white/45">
              {upscalePickerId === "upscale/image" ? "Source image" : "Source video"}
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                className="rounded-xl border border-white/10 bg-white/5"
                onClick={() => (upscalePickerId === "upscale/image" ? onPickImage : onPickVideo)()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
            </div>
            {previewSrc ? (
              <div className="relative mt-1 w-full max-w-md space-y-1.5">
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
                  {upscalePickerId === "upscale/image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewSrc}
                      alt="Source for upscale"
                      className="max-h-[min(52vh,420px)] w-full bg-black object-contain"
                    />
                  ) : (
                    /* eslint-disable-next-line jsx-a11y/media-has-caption */
                    <video
                      key={previewSrc}
                      src={previewSrc}
                      className="aspect-video max-h-[min(52vh,420px)] w-full bg-black object-contain"
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
                  )}
                  <UploadBusyOverlay active={busy} className="rounded-xl" />
                </div>
                <p className="text-[10px] leading-snug text-white/40">
                  {upscalePickerId === "upscale/image"
                    ? imageUrl.trim() && !imagePreviewBlob
                      ? "Use the preview to confirm the upload."
                      : "Preview before upload finishes."
                    : videoUrl.trim() && !videoPreviewBlob
                      ? "Use the player controls to play, pause, and scrub your uploaded clip."
                      : "Preview before upload finishes. After upload, use the controls to check the hosted file."}
                </p>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="text-xs text-white/45">Upscale factor</Label>
                <Select value={factor} onValueChange={(v) => setFactor(v as "1" | "2" | "4")}>
                  <SelectTrigger className="mt-2 h-11 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#0c0c10] text-white">
                    <SelectItem value="1">1×</SelectItem>
                    <SelectItem value="2">2×</SelectItem>
                    <SelectItem value="4">4×</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Button
            type="button"
            disabled={busy || (upscalePickerId === "upscale/video" && durationSec == null)}
            onClick={generate}
            className="h-14 w-full rounded-2xl border border-violet-300/40 bg-violet-500 text-lg font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              {upscalePickerId === "upscale/image" ? "Upscale image" : "Upscale video"}
              <Sparkles className="h-5 w-5" />
              {upscalePickerId === "upscale/image" || durationSec !== null ? (
                <>
                  <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums">{credits}</span>
                  <span className="text-sm font-normal text-white/80">credits</span>
                </>
              ) : null}
            </span>
          </Button>
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

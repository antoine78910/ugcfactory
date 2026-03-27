"use client";

import { useCallback, useRef, useState } from "react";
import { useCreditsPlan, getPersonalApiKey, isPersonalApiActive } from "@/app/_components/CreditsPlanContext";
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";
import { Droplets, Sparkles, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StudioEmptyExamples, StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import { StudioGenerationsHistory } from "@/app/_components/StudioGenerationsHistory";
import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";
import { UploadBusyOverlay } from "@/app/_components/UploadBusyOverlay";
import VideoCard from "@/app/_components/VideoCard";

const WATERMARK_REMOVE_CREDITS = 15;

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
  return json.url;
}

async function pollTask(taskId: string, personalApiKey?: string): Promise<string> {
  const max = 180;
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  for (let i = 0; i < max; i++) {
    const res = await fetch(
      `/api/kling/status?taskId=${encodeURIComponent(taskId)}${keyParam}`,
      { cache: "no-store" },
    );
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
      if (!u || typeof u !== "string") throw new Error("Watermark removal finished but no video URL.");
      return u;
    }
    throw new Error(json.data.error_message || "Watermark removal failed.");
  }
  throw new Error("Watermark removal timed out.");
}

async function registerStudioTask(params: {
  kind: "studio_watermark";
  label: string;
  taskId: string;
  creditsCharged: number;
  personalApiKey?: string;
}) {
  try {
    await fetch("/api/studio/generations/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    /* history registration should not block generation */
  }
}

export default function WatermarkRemoverPanel() {
  const { planId, current: creditsBalance, spendCredits, grantCredits } = useCreditsPlan();
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;

  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [videoPreviewBlob, setVideoPreviewBlob] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);
  type Bill = { open: false } | { open: true; required: number };
  const [billing, setBilling] = useState<Bill>({ open: false });

  const credits = WATERMARK_REMOVE_CREDITS;

  const onPickVideo = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/mp4,video/quicktime,video/webm";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const blobUrl = URL.createObjectURL(f);
      setVideoPreviewBlob((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return blobUrl;
      });
      setBusy(true);
      try {
        const url = await uploadFile(f);
        setVideoUrl(url);
        toast.success("Video uploaded");
      } catch {
        toast.error("Upload failed. Please try again.");
      } finally {
        URL.revokeObjectURL(blobUrl);
        setVideoPreviewBlob(null);
        setBusy(false);
      }
    };
    input.click();
  }, []);

  const generate = useCallback(() => {
    const url = videoUrl.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      toast.error("Upload a source video first.");
      return;
    }
    const usingPersonalApi = isPersonalApiActive();
    if (!usingPersonalApi && creditsRef.current < credits) {
      setBilling({ open: true, required: credits });
      return;
    }
    const jobId = crypto.randomUUID();
    const label = "Watermark Remove";
    const platformCharge = usingPersonalApi ? 0 : credits;
    if (!usingPersonalApi) {
      spendCredits(credits);
      creditsRef.current = Math.max(0, creditsRef.current - credits);
    }
    const startedAt = Date.now();
    setHistoryItems((prev) => [
      { id: jobId, kind: "video", status: "generating", label, createdAt: startedAt },
      ...prev,
    ]);

    void (async () => {
      try {
        const pKey = getPersonalApiKey();
        const res = await fetch("/api/kie/watermark-remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: url, personalApiKey: pKey }),
        });
        const json = (await res.json()) as { taskId?: string; error?: string };
        if (!res.ok || !json.taskId) throw new Error(json.error || "Watermark removal request failed");
        await registerStudioTask({
          kind: "studio_watermark",
          label,
          taskId: json.taskId,
          creditsCharged: platformCharge,
          personalApiKey: pKey,
        });
        const outUrl = await pollTask(json.taskId, pKey);
        const doneAt = Date.now();
        setHistoryItems((prev) => {
          const rest = prev.filter((i) => i.id !== jobId);
          return [
            {
              id: `${jobId}-done-${doneAt}`,
              kind: "video",
              status: "ready",
              label,
              mediaUrl: outUrl,
              createdAt: doneAt,
            },
            ...rest,
          ];
        });
        toast.success("Watermark removed — video ready!");
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
  }, [videoUrl, credits, spendCredits, grantCredits]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
        <Droplets className="h-4 w-4 text-violet-400/80" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          Watermark Remover
        </span>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
        <div className="flex min-w-0 w-full flex-col gap-2 lg:basis-[30%] lg:max-w-[28rem] lg:flex-none lg:shrink-0 lg:min-h-0 lg:overflow-hidden">
          <div className="studio-params-scroll flex min-w-0 flex-col gap-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-10">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
              Source video
            </p>
            <div className="rounded-2xl border border-white/10 bg-[#101014] p-4 space-y-3">
              <Label className="text-xs text-white/45">Upload your video with a watermark</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  className="rounded-xl border border-white/10 bg-white/5"
                  onClick={onPickVideo}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload video
                </Button>
              </div>
              {videoUrl.trim() || videoPreviewBlob ? (
                <div className="relative mt-1 aspect-video w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-black">
                  {videoUrl.trim() ? (
                    <VideoCard
                      src={videoUrl.trim()}
                      className="h-full w-full rounded-none border-0"
                      aspectClassName=""
                    />
                  ) : (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      src={videoPreviewBlob || undefined}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  )}
                  <UploadBusyOverlay active={busy && Boolean(videoPreviewBlob)} className="rounded-xl" />
                </div>
              ) : null}
              <p className="text-[10px] leading-snug text-white/35">
                Uses Sora 2 Watermark Remove via KIE to cleanly remove video watermarks.
              </p>
            </div>

            <Button
              type="button"
              disabled={busy || !videoUrl.trim()}
              onClick={generate}
              className="h-14 w-full rounded-2xl border border-violet-300/40 bg-violet-500 text-lg font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                <Wand2 className="h-5 w-5" />
                Remove watermark
                <Sparkles className="h-5 w-5" />
                <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums">
                  {credits}
                </span>
                <span className="text-sm font-normal text-white/80">credits</span>
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
                empty={
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <Droplets className="h-10 w-10 text-white/15" />
                    <p className="text-sm text-white/40">
                      Upload a video and hit &quot;Remove watermark&quot; to get started.
                    </p>
                  </div>
                }
                mediaLabel="Video"
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

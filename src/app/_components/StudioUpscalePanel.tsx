"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCreditsPlan, getPersonalApiKey, isPersonalApiActive } from "@/app/_components/CreditsPlanContext";
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
import { topazVideoUpscaleCredits } from "@/lib/pricing";

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
  return json.url;
}

async function pollKieVideoTask(taskId: string, personalApiKey?: string): Promise<string> {
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
      if (!u || typeof u !== "string") throw new Error("Upscale finished but no video URL.");
      return u;
    }
    throw new Error(json.data.error_message || "Upscale failed.");
  }
  throw new Error("Upscale timed out.");
}

async function registerStudioTask(params: {
  kind: "studio_upscale";
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

const soonCard =
  "flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left opacity-70";

type UpscalePickerId = "upscale/video" | "upscale/image";

const UPSCALE_MODEL_PICKER_ITEMS: StudioModelPickerItem[] = [
  {
    id: "upscale/video",
    label: "Topaz Video Upscale",
    icon: "topaz",
    resolution: "Up to 4x",
    durationRange: "1s–10min",
    searchText: "topaz video upscale kie",
  },
  {
    id: "upscale/image",
    label: "Topaz Image Upscale",
    icon: "topaz",
    subtitle: "Coming soon",
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
  const [durationSec, setDurationSec] = useState(10);
  const [factor, setFactor] = useState<"1" | "2" | "4">("2");
  const [upscalePickerId, setUpscalePickerId] = useState<UpscalePickerId>("upscale/video");
  const [busy, setBusy] = useState(false);
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);
  type Bill = { open: false } | { open: true; required: number };
  const [billing, setBilling] = useState<Bill>({ open: false });

  const credits = useMemo(() => topazVideoUpscaleCredits(durationSec), [durationSec]);
  const creditsDurationText = `${durationSec}s`;

  const probeDuration = useCallback((url: string) => {
    if (!url) return;
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      const d = Number(v.duration);
      if (Number.isFinite(d) && d > 0) setDurationSec(Math.min(600, Math.max(1, Math.ceil(d))));
      v.src = "";
    };
    v.onerror = () => {};
    v.src = url;
  }, []);

  useEffect(() => {
    if (videoUrl) probeDuration(videoUrl);
  }, [videoUrl, probeDuration]);

  const onPickVideo = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/mp4,video/quicktime,video/webm";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setBusy(true);
      try {
        const url = await uploadFile(f);
        setVideoUrl(url);
        toast.success("Video uploaded");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const generate = () => {
    if (upscalePickerId === "upscale/image") {
      toast.message("Topaz Image Upscale is coming soon.");
      return;
    }
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
    const label = `Topaz ${factor}× · ${durationSec}s`;
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
        const upPKey = getPersonalApiKey();
        const res = await fetch("/api/kie/upscale/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: url, upscaleFactor: factor, personalApiKey: upPKey }),
        });
        const json = (await res.json()) as { taskId?: string; error?: string };
        if (!res.ok || !json.taskId) throw new Error(json.error || "Upscale request failed");
        await registerStudioTask({
          kind: "studio_upscale",
          label,
          taskId: json.taskId,
          creditsCharged: platformCharge,
          personalApiKey: upPKey,
        });
        const outUrl = await pollKieVideoTask(json.taskId, upPKey);
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
        toast.success("Upscaled video ready");
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
            onClick={() => setUpscalePickerId("upscale/video")}
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
              toast.message("Topaz Image Upscale is coming soon.");
            }}
          >
            Image
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
        <div className="flex min-w-0 w-full flex-col gap-2 lg:basis-1/4 lg:max-w-[24rem] lg:flex-none lg:shrink-0 lg:min-h-0 lg:overflow-hidden">
          <div className="studio-params-scroll flex min-w-0 flex-col gap-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-10">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Upscale model</p>
          <div className="rounded-2xl border border-white/10 bg-[#101014] p-3">
            <StudioModelPicker
              value={upscalePickerId}
              items={UPSCALE_MODEL_PICKER_ITEMS}
              triggerVariant="bar"
              hideMeta
              featuredTitle="Upscale models"
              onChange={(v) => setUpscalePickerId(v as UpscalePickerId)}
              isItemLocked={(id) => id === "upscale/image"}
              onLockedPick={() => {
                toast.message("Topaz Image Upscale is coming soon.");
              }}
            />
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Source &amp; billing</p>
          <div className="rounded-2xl border border-white/10 bg-[#101014] p-4 space-y-3">
            <Label className="text-xs text-white/45">Source video</Label>
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
                Upload
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="text-xs text-white/45">Detected duration</Label>
                <div className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0a0a0d] px-3 text-sm text-white tabular-nums flex items-center">
                  {creditsDurationText}
                </div>
                <p className="mt-1 text-[10px] text-white/35">Auto-detected from uploaded video metadata.</p>
              </div>
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

          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">More Kie upscale</p>
          <div className={soonCard}>
            <span className="text-xs font-semibold text-white/55">Topaz Image Upscale</span>
            <span className="text-[10px] text-white/35">Same Kie market family; wiring next.</span>
          </div>
          <div className={soonCard}>
            <span className="text-xs font-semibold text-white/55">Other Kie upscalers</span>
            <span className="text-[10px] text-white/35">New tools will appear here as we enable them.</span>
          </div>

          <Button
            type="button"
            disabled={busy}
            onClick={generate}
            className="h-14 w-full rounded-2xl border border-violet-300/40 bg-violet-500 text-lg font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Upscale video
              <Sparkles className="h-5 w-5" />
              <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums">{credits}</span>
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
                empty={<StudioEmptyExamples variant="upscale" />}
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

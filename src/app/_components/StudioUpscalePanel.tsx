"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCreditsPlan } from "@/app/_components/CreditsPlanContext";
import { Sparkles, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudioEmptyExamples, StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import { StudioGenerationsHistory } from "@/app/_components/StudioGenerationsHistory";
import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";
import {
  PRICING_BASE,
  STUDIO_UPSCALE_TOPAZ_VIDEO_ROWS,
  topazVideoUpscaleCredits,
} from "@/lib/pricing";

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
  return json.url;
}

async function pollKieVideoTask(taskId: string): Promise<string> {
  const max = 120;
  for (let i = 0; i < max; i++) {
    const res = await fetch(`/api/kling/status?taskId=${encodeURIComponent(taskId)}`, {
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

const soonCard =
  "flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left opacity-70";

export default function StudioUpscalePanel() {
  const { planId, current: creditsBalance, spendCredits } = useCreditsPlan();
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;

  const [videoUrl, setVideoUrl] = useState("");
  const [durationSec, setDurationSec] = useState(10);
  const [factor, setFactor] = useState<"1" | "2" | "4">("2");
  const [busy, setBusy] = useState(false);
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);
  type Bill = { open: false } | { open: true; required: number };
  const [billing, setBilling] = useState<Bill>({ open: false });

  const credits = useMemo(() => topazVideoUpscaleCredits(durationSec), [durationSec]);

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
    const url = videoUrl.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      toast.error("Add a video URL or upload a file.");
      return;
    }
    if (creditsRef.current < credits) {
      setBilling({ open: true, required: credits });
      return;
    }
    const jobId = crypto.randomUUID();
    const label = `Topaz ${factor}× · ${durationSec}s`;
    spendCredits(credits);
    creditsRef.current = Math.max(0, creditsRef.current - credits);
    const startedAt = Date.now();
    setHistoryItems((prev) => [
      { id: jobId, kind: "video", status: "generating", label, createdAt: startedAt },
      ...prev,
    ]);

    void (async () => {
      try {
        const res = await fetch("/api/kie/upscale/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: url, upscaleFactor: factor }),
        });
        const json = (await res.json()) as { taskId?: string; error?: string };
        if (!res.ok || !json.taskId) throw new Error(json.error || "Upscale request failed");
        const outUrl = await pollKieVideoTask(json.taskId);
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
        toast.error(msg);
        setHistoryItems((prev) =>
          prev.map((i) =>
            i.id === jobId && i.status === "generating"
              ? { ...i, status: "failed", errorMessage: msg, creditsRefunded: false }
              : i,
          ),
        );
      }
    })();
  };

  const row = STUDIO_UPSCALE_TOPAZ_VIDEO_ROWS[0];

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6 lg:min-h-0 lg:max-h-[min(92vh,calc(100vh-7rem))]">
      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-[min(100%,30rem)] lg:min-h-0 lg:overflow-hidden">
        <div className="studio-params-scroll flex min-w-0 flex-col gap-4 lg:flex-1 lg:min-h-0 lg:max-h-[min(55vh,calc(100vh-14rem))] lg:overflow-y-auto">
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
            <input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Or paste HTTPS URL to your video (MP4 / MOV)"
              className="h-11 w-full rounded-xl border border-white/10 bg-[#0a0a0d] px-3 text-sm text-white placeholder:text-white/35"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-white/45">Duration (billing)</Label>
                <input
                  type="number"
                  min={1}
                  max={600}
                  value={durationSec}
                  onChange={(e) => setDurationSec(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
                  className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0a0a0d] px-3 text-sm text-white tabular-nums"
                />
                <p className="mt-1 text-[10px] text-white/35">Adjusted from file metadata when possible.</p>
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

        <details className="group rounded-2xl border border-white/10 bg-[#0c0c10]/90 text-white/80 open:border-violet-500/20">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/50 transition hover:text-white/70 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex w-full items-center justify-between gap-2">
              Upscale economics (Kie)
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal text-white/40 group-open:text-violet-200/80">
                Topaz Video
              </span>
            </span>
          </summary>
          <div className="border-t border-white/10 px-2 pb-3 pt-1">
            <p className="px-2 pb-2 text-[10px] leading-relaxed text-white/35">
              Video processing uses the video margin target (
              <span className="text-white/45">{(PRICING_BASE.target_margins.video * 100).toFixed(0)}%</span>
              ) in the pricing model; Topaz credits/second are set from Kie COGS vs Fal list.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    <th className="px-2 py-2">Model &amp; Modality</th>
                    <th className="px-2 py-2">Modality</th>
                    <th className="px-2 py-2">Provider</th>
                    <th className="px-2 py-2">Credits / unit</th>
                    <th className="px-2 py-2">Our Price (USD)</th>
                    <th className="px-2 py-2">Fal Price (USD)</th>
                    <th className="px-2 py-2">Discount</th>
                  </tr>
                </thead>
                <tbody>
                  {STUDIO_UPSCALE_TOPAZ_VIDEO_ROWS.map((r) => (
                    <tr key={r.modelAndModality} className="border-b border-white/[0.06]">
                      <td className="px-2 py-2.5 text-white/85">{r.modelAndModality}</td>
                      <td className="px-2 py-2.5 text-white/55">{r.modality}</td>
                      <td className="px-2 py-2.5 text-white/55">{r.provider}</td>
                      <td className="px-2 py-2.5 tabular-nums text-white/70">
                        {r.creditsPerUnit}
                        <span className="ml-1 text-[10px] text-white/35">{r.unitLabel}</span>
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-emerald-200/90">
                        ${r.ourRetailUsd.toFixed(2)}
                        <span className="mt-0.5 block text-[9px] font-normal text-white/30">
                          ({r.creditsPerUnit} cr × ${PRICING_BASE.credit_value_usd}/s)
                        </span>
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-white/55">
                        {r.falListUsd != null ? `$${r.falListUsd.toFixed(2)}` : "–"}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-violet-200/90">
                        {r.discountVsFalListPct != null ? (
                          <>
                            {r.discountVsFalListPct <= 0 ? "−" : "+"}
                            {Math.abs(r.discountVsFalListPct).toFixed(1)}%{" "}
                            <span className="text-white/35" aria-hidden>
                              ↓
                            </span>
                          </>
                        ) : (
                          "–"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 px-2 text-[10px] leading-relaxed text-white/30">
              COGS ≈ <span className="tabular-nums text-white/45">${row.cogsUsd.toFixed(2)}</span>/s vs Fal list $
              {row.falListUsd?.toFixed(2)}/s. Total job: <span className="tabular-nums">{credits}</span> credits for{" "}
              {durationSec}s.
            </p>
          </div>
        </details>
        </div>
      </div>

      <div className="flex h-full min-h-0 min-w-0 flex-[2.5] lg:flex-[3] flex-col lg:min-h-0 lg:overflow-hidden">
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
  );
}

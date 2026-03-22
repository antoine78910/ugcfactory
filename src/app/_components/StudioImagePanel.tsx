"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCreditsPlan } from "@/app/_components/CreditsPlanContext";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  StudioModelPicker,
  studioSelectContentClass,
  studioSelectItemClass,
  type StudioModelPickerItem,
} from "@/app/_components/StudioModelPicker";
import { StudioEmptyExamples, StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import { StudioGenerationsHistory } from "@/app/_components/StudioGenerationsHistory";
import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";
import {
  PRICING_BASE,
  STUDIO_IMAGE_GROK_IMAGINE_ROWS,
  STUDIO_IMAGE_GOOGLE_NANO_2_ECONOMICS_ROWS,
  STUDIO_IMAGE_GOOGLE_NANO_PRO_ECONOMICS_ROWS,
  STUDIO_IMAGE_SEEDREAM_45_ECONOMICS_ROWS,
  type StudioImageEconomicsRow,
  studioImageCreditsPerOutput,
} from "@/lib/pricing";
import { NANO_BANANA_2_ASPECT_RATIOS } from "@/lib/nanobanana";
import { cn } from "@/lib/utils";
import { canUseStudioImageModel, studioImageUpgradeMessage } from "@/lib/subscriptionModelAccess";

const ASPECT_RATIOS_PRO = [
  "1:1",
  "9:16",
  "16:9",
  "3:4",
  "4:3",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "21:9",
] as const;

const PRO_RESOLUTIONS = ["1K", "2K", "4K"] as const;

type NanoModel = "nano" | "pro";

const IMAGE_MODEL_PICKER_ITEMS: StudioModelPickerItem[] = [
  {
    id: "pro",
    label: "NanoBanana Pro",
    icon: "image_pro",
    exclusive: true,
    resolution: "Up to 4K",
    durationRange: "Max 4 images",
    searchText: "nanobanana pro nano banana pro",
  },
  {
    id: "nano",
    label: "NanoBanana 2",
    icon: "image_std",
    resolution: "1K–4K",
    durationRange: "Max 4 images",
    searchText: "nanobanana 2 standard",
  },
];

async function uploadReferenceFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error || "Upload failed");
  return json.url;
}

async function pollNanoTask(taskId: string): Promise<string[]> {
  const max = 90;
  for (let i = 0; i < max; i++) {
    const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { successFlag?: number; response?: Record<string, unknown>; errorMessage?: string };
      error?: string;
    };
    if (!res.ok || !json.data) throw new Error(json.error || "Poll failed");
    const s = json.data.successFlag ?? 0;
    if (s === 0) {
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    if (s === 1) {
      const resp = json.data.response ?? {};
      const candidates: unknown[] = [
        (resp as { resultImageUrl?: unknown }).resultImageUrl,
        (resp as { resultUrls?: unknown }).resultUrls,
        (resp as { resultUrl?: unknown }).resultUrl,
        (resp as { result_image_url?: unknown }).result_image_url,
      ];
      const urls = candidates.flatMap((v) => {
        if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
        if (typeof v === "string") return [v];
        return [];
      });
      if (!urls.length) throw new Error("No image URL in result.");
      return urls;
    }
    throw new Error(json.data.errorMessage || "Generation failed.");
  }
  throw new Error("Timeout waiting for NanoBanana.");
}

function ImageEconomicsTable({ rows }: { rows: StudioImageEconomicsRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            <th className="px-2 py-2">Model &amp; Modality</th>
            <th className="px-2 py-2">Modality</th>
            <th className="px-2 py-2">Provider</th>
            <th className="px-2 py-2">Credits / Gen</th>
            <th className="px-2 py-2">Our Price (USD)</th>
            <th className="px-2 py-2">Fal Price (USD)</th>
            <th className="px-2 py-2">Discount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-white/[0.06] last:border-b-0">
              <td className="px-2 py-2.5 text-white/85">{row.modelAndModality}</td>
              <td className="px-2 py-2.5 text-white/55">{row.modality}</td>
              <td className="px-2 py-2.5 text-white/55">{row.provider}</td>
              <td className="px-2 py-2.5 tabular-nums text-white/70">
                {row.creditsPerGen}
                <span className="ml-1 text-[10px] text-white/35">{row.creditsUnit}</span>
              </td>
              <td className="px-2 py-2.5 tabular-nums text-emerald-200/90">
                ${row.ourRetailUsd.toFixed(4)}
                <span className="mt-0.5 block text-[9px] font-normal text-white/30">
                  ({row.creditsPerGen} cr × ${PRICING_BASE.credit_value_usd})
                </span>
              </td>
              <td className="px-2 py-2.5 tabular-nums text-white/55">
                {row.falListUsd != null ? `$${row.falListUsd.toFixed(2)}` : "—"}
              </td>
              <td className="px-2 py-2.5 tabular-nums text-violet-200/90">
                {row.discountVsFalListPct != null ? (
                  <>
                    {row.discountVsFalListPct <= 0 ? "−" : "+"}
                    {Math.abs(row.discountVsFalListPct).toFixed(1)}%{" "}
                    <span className="text-white/35" aria-hidden>
                      ↓
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const economicsIntro = (
  <p className="px-2 pb-2 text-[10px] leading-relaxed text-white/35">
    Studio image generation uses Kie (<code className="text-white/40">nano-banana-2</code> /{" "}
    <code className="text-white/40">nano-banana-pro</code>) with credits from{" "}
    <code className="text-white/40">@/lib/pricing</code> (target image margin{" "}
    <span className="text-white/45">{(PRICING_BASE.target_margins.image * 100).toFixed(0)}%</span>,{" "}
    {PRICING_BASE.cost_buffer}× buffer on COGS, ${PRICING_BASE.credit_value_usd}/credit).
  </p>
);

export default function StudioImagePanel() {
  const { planId, current: creditsBalance, spendCredits } = useCreditsPlan();
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<NanoModel>("pro");
  const [aspect, setAspect] = useState<string>("3:4");
  const [resolution, setResolution] = useState<(typeof PRO_RESOLUTIONS)[number]>("2K");
  const [numImages, setNumImages] = useState(1);
  const [refUrls, setRefUrls] = useState<string[]>([]);
  /** Reference image uploads only — does not block Generate. */
  const [refUploadBusy, setRefUploadBusy] = useState(false);
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);
  type ImageBilling =
    | { open: false }
    | { open: true; reason: "plan"; blockedId: NanoModel }
    | { open: true; reason: "credits"; required: number };
  const [billing, setBilling] = useState<ImageBilling>({ open: false });

  const aspectOptions = useMemo(() => {
    if (model === "pro") return ["auto", ...ASPECT_RATIOS_PRO] as const;
    return NANO_BANANA_2_ASPECT_RATIOS;
  }, [model]);

  useEffect(() => {
    const allowed = new Set(aspectOptions as readonly string[]);
    if (!allowed.has(aspect)) {
      setAspect(model === "pro" ? "3:4" : "auto");
    }
  }, [model, aspectOptions, aspect]);

  useEffect(() => {
    if (canUseStudioImageModel(planId, model)) return;
    setModel("nano");
  }, [planId, model]);

  const perImageCredits = useMemo(
    () =>
      studioImageCreditsPerOutput({
        studioModel: model,
        resolution,
      }),
    [model, resolution],
  );
  const totalCredits = numImages * perImageCredits;

  const onAddRefs = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) return;
      setRefUploadBusy(true);
      try {
        const urls: string[] = [];
        for (const f of files.slice(0, 8)) {
          urls.push(await uploadReferenceFile(f));
        }
        setRefUrls((prev) => [...prev, ...urls].slice(0, 12));
        toast.success(`${urls.length} reference image(s) added`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setRefUploadBusy(false);
      }
    };
    input.click();
  }, []);

  const generate = () => {
    const p = prompt.trim();
    if (!p) {
      toast.error("Describe the scene you imagine.");
      return;
    }
    const gate = studioImageUpgradeMessage(planId, model);
    if (gate) {
      setBilling({ open: true, reason: "plan", blockedId: model });
      return;
    }
    if (creditsRef.current < totalCredits) {
      setBilling({ open: true, reason: "credits", required: totalCredits });
      return;
    }
    const n = Math.min(4, Math.max(1, numImages));
    const jobId = crypto.randomUUID();
    const summary = p.length > 72 ? `${p.slice(0, 72)}…` : p;
    spendCredits(totalCredits);
    creditsRef.current = Math.max(0, creditsRef.current - totalCredits);
    const startedAt = Date.now();
    setHistoryItems((prev) => [
      {
        id: jobId,
        kind: "image",
        status: "generating",
        label: summary,
        createdAt: startedAt,
      },
      ...prev,
    ]);

    void (async () => {
      try {
        const res = await fetch("/api/nanobanana/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountPlan: planId,
            prompt: p,
            model,
            imageUrls: refUrls.length ? refUrls : undefined,
            aspectRatio: aspect,
            resolution,
            numImages: n,
          }),
        });
        const json = (await res.json()) as { taskId?: string; taskIds?: string[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Generate failed");
        const ids =
          Array.isArray(json.taskIds) && json.taskIds.length > 0
            ? json.taskIds
            : json.taskId
              ? [json.taskId]
              : [];
        if (!ids.length) throw new Error("No task id returned");
        toast.message("Generation started", { description: `Polling ${ids.length} task(s)…` });
        const batches = await Promise.all(ids.map((tid) => pollNanoTask(tid)));
        const urls = batches.flat();
        const doneAt = Date.now();
        setHistoryItems((prev) => {
          const rest = prev.filter((i) => i.id !== jobId);
          const adds: StudioHistoryItem[] = urls.map((u, idx) => ({
            id: `${jobId}-done-${idx}-${doneAt}`,
            kind: "image",
            status: "ready",
            label: summary,
            mediaUrl: u,
            createdAt: doneAt,
          }));
          return [...adds, ...rest];
        });
        toast.success(ids.length > 1 ? `${urls.length} images ready` : "Image ready");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error";
        toast.error(msg);
        setHistoryItems((prev) =>
          prev.map((i) =>
            i.id === jobId && i.status === "generating"
              ? {
                  ...i,
                  status: "failed",
                  errorMessage: msg,
                  creditsRefunded: false,
                }
              : i,
          ),
        );
      }
    })();
  };

  const generateBtnClass =
    "h-14 w-full rounded-2xl border border-violet-300/40 bg-violet-500 text-lg font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none";

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6 lg:min-h-0 lg:max-h-[min(92vh,calc(100vh-7rem))]">
      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-[min(100%,30rem)] lg:min-h-0 lg:overflow-hidden">
        <div className="studio-left-inputs-scroll flex min-w-0 flex-col gap-4 lg:max-h-[min(42vh,24rem)] lg:shrink-0 lg:overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Create — prompt</p>
        <div className="rounded-2xl border border-white/10 bg-[#101014] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/45">Reference images</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-14 w-14 shrink-0 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
              title="Add reference images"
              disabled={refUploadBusy}
              onClick={onAddRefs}
            >
              <Plus className="h-5 w-5" />
            </Button>
            {refUrls.map((u, i) => (
              <button
                key={`${u}-${i}`}
                type="button"
                className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/15"
                title="Remove"
                onClick={() => setRefUrls((prev) => prev.filter((_, j) => j !== i))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                  Remove
                </span>
              </button>
            ))}
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the scene you imagine."
            className="mt-4 min-h-[120px] w-full resize-none border-white/10 bg-[#0a0a0d] px-3 py-3 text-sm text-white placeholder:text-white/35 focus-visible:ring-0"
            rows={4}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
              ✨ Studio
            </span>
          </div>
        </div>
        </div>

        <div className="studio-params-scroll flex min-w-0 flex-1 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Parameters</p>
        <div className="rounded-2xl border border-white/10 bg-[#101014] p-4 space-y-4">
          <div>
              <StudioModelPicker
                value={model}
                items={IMAGE_MODEL_PICKER_ITEMS}
                triggerVariant="bar"
                hideMeta
                isItemLocked={(id) => !canUseStudioImageModel(planId, id as NanoModel)}
                onLockedPick={(id) => {
                  setBilling({ open: true, reason: "plan", blockedId: id as NanoModel });
                }}
                onChange={(v) => setModel(v as NanoModel)}
                featuredTitle="Image models"
              />
          </div>

          <div>
            <Label className="text-xs text-white/45">Aspect ratio</Label>
            <Select value={aspect} onValueChange={setAspect}>
              <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                <SelectValue placeholder="Ratio" />
              </SelectTrigger>
              <SelectContent position="popper" className={cn(studioSelectContentClass, "max-h-[min(280px,50vh)]")}>
                {aspectOptions.map((r) => (
                  <SelectItem key={r} value={r} className={studioSelectItemClass}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-white/45">Quality (resolution)</Label>
            <p className="mt-0.5 text-[10px] leading-snug text-white/35">
              1K = faster / lower cost · 4K = more detail · {perImageCredits} credits per image at this quality
            </p>
            <Select value={resolution} onValueChange={(v) => setResolution(v as (typeof PRO_RESOLUTIONS)[number])}>
              <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className={studioSelectContentClass}>
                {PRO_RESOLUTIONS.map((r) => (
                  <SelectItem key={r} value={r} className={studioSelectItemClass}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-white/45">Images (same prompt)</Label>
            <p className="mt-0.5 text-[10px] leading-snug text-white/35">
              Pro: one job per image. NanoBanana 2: up to 4 parallel jobs.
            </p>
            <Select
              value={String(numImages)}
              onValueChange={(v) => setNumImages(Math.min(4, Math.max(1, Number(v) || 1)))}
            >
              <SelectTrigger className="mt-2 h-12 w-full rounded-xl border-white/15 bg-[#0a0a0d] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className={studioSelectContentClass}>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)} className={studioSelectItemClass}>
                    {n} image{n > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button type="button" onClick={() => generate()} className={generateBtnClass}>
          <span className="inline-flex items-center gap-2">
            Generate
            <Sparkles className="h-5 w-5" />
            <span className="rounded-md bg-white/15 px-2 py-0.5 text-base tabular-nums">{totalCredits}</span>
            <span className="text-sm font-normal text-white/80">credits</span>
          </span>
        </Button>
        </div>

        <details className="group rounded-2xl border border-white/10 bg-[#0c0c10]/90 text-white/80 open:border-violet-500/20">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/50 transition hover:text-white/70 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex w-full items-center justify-between gap-2">
              Google Nano Banana 2 — economics
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal text-white/40 group-open:text-violet-200/80">
                Kie
              </span>
            </span>
          </summary>
          <div className="border-t border-white/10 px-2 pb-3 pt-1">
            {economicsIntro}
            <ImageEconomicsTable rows={STUDIO_IMAGE_GOOGLE_NANO_2_ECONOMICS_ROWS} />
          </div>
        </details>

        <details className="group rounded-2xl border border-white/10 bg-[#0c0c10]/90 text-white/80 open:border-violet-500/20">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/50 transition hover:text-white/70 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex w-full items-center justify-between gap-2">
              Google Nano Banana Pro — economics
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal text-white/40 group-open:text-violet-200/80">
                Kie
              </span>
            </span>
          </summary>
          <div className="border-t border-white/10 px-2 pb-3 pt-1">
            {economicsIntro}
            <ImageEconomicsTable rows={STUDIO_IMAGE_GOOGLE_NANO_PRO_ECONOMICS_ROWS} />
          </div>
        </details>

        <details className="group rounded-2xl border border-white/10 bg-[#0c0c10]/90 text-white/80 open:border-violet-500/20">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/50 transition hover:text-white/70 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex w-full items-center justify-between gap-2">
              Grok Imagine — reference
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal text-white/40 group-open:text-violet-200/80">
                Batch
              </span>
            </span>
          </summary>
          <div className="border-t border-white/10 px-2 pb-3 pt-1">
            <p className="px-2 pb-2 text-[10px] leading-relaxed text-white/35">
              Batch pricing from product sheet; Fal list N/A. Not yet exposed as a studio picker.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    <th className="px-2 py-2">Model &amp; Modality</th>
                    <th className="px-2 py-2">Credits</th>
                    <th className="px-2 py-2">Our Price (USD)</th>
                    <th className="px-2 py-2">Fal Price</th>
                    <th className="px-2 py-2">Discount</th>
                  </tr>
                </thead>
                <tbody>
                  {STUDIO_IMAGE_GROK_IMAGINE_ROWS.map((row) => (
                    <tr key={row.modelAndModality} className="border-b border-white/[0.06] last:border-b-0">
                      <td className="px-2 py-2.5 text-white/85">{row.modelAndModality}</td>
                      <td className="px-2 py-2.5 text-white/70">{row.creditsLabel}</td>
                      <td className="px-2 py-2.5 tabular-nums text-emerald-200/90">${row.ourRetailUsd.toFixed(2)}</td>
                      <td className="px-2 py-2.5 text-white/45">N/A</td>
                      <td className="px-2 py-2.5 text-white/45">N/A</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        <details className="group rounded-2xl border border-white/10 bg-[#0c0c10]/90 text-white/80 open:border-violet-500/20">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white/50 transition hover:text-white/70 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex w-full items-center justify-between gap-2">
              Seedream 4.5 — economics
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal text-white/40 group-open:text-violet-200/80">
                2 modalities
              </span>
            </span>
          </summary>
          <div className="border-t border-white/10 px-2 pb-3 pt-1">
            {economicsIntro}
            <ImageEconomicsTable rows={STUDIO_IMAGE_SEEDREAM_45_ECONOMICS_ROWS} />
            <p className="mt-2 px-2 text-[10px] leading-relaxed text-white/30">
              Seedream COGS ≈{" "}
              <span className="tabular-nums text-white/45">
                ${STUDIO_IMAGE_SEEDREAM_45_ECONOMICS_ROWS[0].cogsUsd.toFixed(4)}
              </span>{" "}
              per gen vs Fal list $0.04.
            </p>
          </div>
        </details>
      </div>

      <div className="flex h-full min-h-0 min-w-0 flex-[2.5] lg:flex-[3] flex-col lg:min-h-0 lg:overflow-hidden">
        <StudioOutputPane
          title=""
          hasOutput
          output={
            <StudioGenerationsHistory
              items={historyItems}
              empty={<StudioEmptyExamples variant="image" />}
              mediaLabel="Image"
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
        studioMode="image"
        variant={
          !billing.open
            ? { kind: "credits", currentCredits: 0, requiredCredits: 0 }
            : billing.reason === "plan"
              ? { kind: "plan", blockedModelId: billing.blockedId }
              : { kind: "credits", currentCredits: creditsBalance, requiredCredits: billing.required }
        }
      />
    </div>
  );
}

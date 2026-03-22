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
import { studioImageCreditsPerOutput } from "@/lib/pricing";
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
    <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
      <div className="flex min-w-0 flex-[1] flex-col gap-4 lg:min-w-[min(100%,18rem)]">
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

      <aside className="studio-params-scroll flex min-w-0 flex-col gap-4 lg:w-[min(100%,17rem)] xl:w-[min(100%,19rem)] lg:shrink-0 lg:max-h-[min(90vh,calc(100vh-10rem))] lg:overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Parameters</p>
        <div className="rounded-2xl border border-white/10 bg-[#101014] p-4 space-y-4">
          <div>
            <Label className="text-xs text-white/45">Model</Label>
            <div className="mt-2">
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
      </aside>

      <div className="flex h-full min-h-0 min-w-0 flex-[2.35] flex-col">
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

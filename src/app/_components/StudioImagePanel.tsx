"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCreditsPlan, getPersonalApiKey, isPersonalApiActive } from "@/app/_components/CreditsPlanContext";
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";
import { Plus, Sparkles, UserRound } from "lucide-react";
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
import { loadAvatarUrls } from "@/lib/avatarLibrary";
import { AvatarPickerDialog } from "@/app/_components/AvatarPickerDialog";
import { clipboardImageFiles } from "@/lib/clipboardImage";

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
    icon: "google",
    exclusive: true,
    resolution: "Up to 4K",
    durationRange: "Max 4 images",
    searchText: "nanobanana pro nano banana pro google",
  },
  {
    id: "nano",
    label: "NanoBanana 2",
    icon: "google",
    resolution: "1K–4K",
    durationRange: "Max 4 images",
    searchText: "nanobanana 2 standard google",
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

async function pollNanoTask(taskId: string, personalApiKey?: string): Promise<string[]> {
  const max = 90;
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  for (let i = 0; i < max; i++) {
    const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${keyParam}`, { cache: "no-store" });
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

const LS_STUDIO_IMAGE_HISTORY = "ugc_studio_image_history_v1";

function readLocalStudioImageHistory(): StudioHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_STUDIO_IMAGE_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is StudioHistoryItem =>
        x != null &&
        typeof x === "object" &&
        typeof (x as StudioHistoryItem).id === "string" &&
        typeof (x as StudioHistoryItem).createdAt === "number",
    );
  } catch {
    return [];
  }
}

function writeLocalStudioImageHistory(items: StudioHistoryItem[]) {
  try {
    localStorage.setItem(LS_STUDIO_IMAGE_HISTORY, JSON.stringify(items.slice(0, 80)));
  } catch {
    /* ignore */
  }
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

export default function StudioImagePanel() {
  const { planId, current: creditsBalance, spendCredits, grantCredits } = useCreditsPlan();
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<NanoModel>("pro");
  const [aspect, setAspect] = useState<string>("3:4");
  const [resolution, setResolution] = useState<(typeof PRO_RESOLUTIONS)[number]>("2K");
  const [numImages, setNumImages] = useState(1);
  const [refUrls, setRefUrls] = useState<string[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<string[]>([]);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  /** Reference image uploads only; does not block Generate. */
  const [refUploadBusy, setRefUploadBusy] = useState(false);
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);
  /** null = unknown; true = Supabase + server poll; false = guest / local only */
  const [serverHistory, setServerHistory] = useState<boolean | null>(null);
  type ImageBilling =
    | { open: false }
    | { open: true; reason: "plan"; blockedId: NanoModel }
    | { open: true; reason: "credits"; required: number };
  const [billing, setBilling] = useState<ImageBilling>({ open: false });

  const grantCreditsRef = useRef(grantCredits);
  grantCreditsRef.current = grantCredits;

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/studio/generations?kind=studio_image", { cache: "no-store" });
      if (res.status === 401) {
        setServerHistory(false);
        setHistoryItems(readLocalStudioImageHistory());
        return;
      }
      if (!res.ok) {
        setServerHistory(false);
        setHistoryItems(readLocalStudioImageHistory());
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
            kind: "studio_image",
            personalApiKey: getPersonalApiKey() ?? undefined,
          }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: StudioHistoryItem[]; refundHints?: RefundHint[] };
        if (Array.isArray(json.data)) setHistoryItems(json.data);
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

  useEffect(() => {
    if (serverHistory !== false) return;
    writeLocalStudioImageHistory(historyItems);
  }, [serverHistory, historyItems]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const urls = await loadAvatarUrls();
      if (!cancelled) setAvatarUrls(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [historyItems]);

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
        toast.error("Upload failed. Please try again.");
      } finally {
        setRefUploadBusy(false);
      }
    };
    input.click();
  }, []);

  const onPasteRefs = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setRefUploadBusy(true);
    try {
      const urls: string[] = [];
      for (const f of files.slice(0, 8)) {
        urls.push(await uploadReferenceFile(f));
      }
      setRefUrls((prev) => [...prev, ...urls].slice(0, 12));
      toast.success(urls.length > 1 ? `${urls.length} reference images pasted` : "Reference image pasted");
    } catch (e) {
      toast.error("Upload failed. Please try again.");
    } finally {
      setRefUploadBusy(false);
    }
  }, []);

  const onUseAvatarRef = useCallback((avatarUrl: string) => {
    const u = avatarUrl.trim();
    if (!u) return;
    setRefUrls((prev) => [u, ...prev.filter((x) => x !== u)].slice(0, 12));
    toast.success("Avatar added as reference");
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = clipboardImageFiles(event);
      if (!files.length) return;
      event.preventDefault();
      void onPasteRefs(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onPasteRefs]);

  const generate = () => {
    if (serverHistory === null) {
      toast.message("Still loading your library…", { description: "Wait a moment, then try Generate again." });
      return;
    }
    const p = prompt.trim();
    if (!p) {
      toast.error("Describe the scene you imagine.");
      return;
    }
    const gate = studioImageUpgradeMessage(planId, model);
    if (!isPersonalApiActive() && gate) {
      setBilling({ open: true, reason: "plan", blockedId: model });
      return;
    }
    const usingPersonalApi = isPersonalApiActive();
    if (!usingPersonalApi && creditsRef.current < totalCredits) {
      setBilling({ open: true, reason: "credits", required: totalCredits });
      return;
    }
    const n = Math.min(4, Math.max(1, numImages));
    const summary = p.length > 72 ? `${p.slice(0, 72)}…` : p;
    const platformCharge = usingPersonalApi ? 0 : totalCredits;
    if (!usingPersonalApi) {
      spendCredits(totalCredits);
      creditsRef.current = Math.max(0, creditsRef.current - totalCredits);
    }

    void (async () => {
      if (serverHistory === true) {
        try {
          const res = await fetch("/api/studio/generations/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "studio_image",
              label: summary,
              accountPlan: planId,
              creditsCharged: platformCharge,
              prompt: p,
              model,
              aspectRatio: aspect,
              resolution,
              numImages: n,
              imageUrls: refUrls.length ? refUrls : undefined,
              personalApiKey: getPersonalApiKey(),
            }),
          });
          const json = (await res.json()) as {
            data?: { id?: string; rows?: { id: string }[]; error?: string };
            error?: string;
          };
          if (!res.ok) throw new Error(json.error || "Start failed");
          const rowIds = json.data?.rows?.map((r) => r.id) ?? (json.data?.id ? [json.data.id] : []);
          if (!rowIds.length) throw new Error("No job id");
          const startedAt = Date.now();
          setHistoryItems((prev) => {
            const gens: StudioHistoryItem[] = rowIds.map((id) => ({
              id,
              kind: "image",
              status: "generating",
              label: summary,
              createdAt: startedAt,
              studioGenerationKind: "studio_image",
            }));
            const drop = new Set(rowIds);
            return [...gens, ...prev.filter((i) => !drop.has(i.id))];
          });
          toast.message("Generation running", {
            description: "You can open My Projects — jobs stay in sync. Safe to leave this page.",
          });
        } catch (e) {
          const msg = "Something went wrong while starting generation. Please try again.";
          refundPlatformCredits(platformCharge, grantCredits, creditsRef);
          toast.error(msg);
        }
        return;
      }

      const jobId = crypto.randomUUID();
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
            personalApiKey: getPersonalApiKey(),
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
        const pKey = getPersonalApiKey();
        const batches = await Promise.all(ids.map((tid) => pollNanoTask(tid, pKey)));
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
        const msg = "Something went wrong while generating. Please try again.";
        refundPlatformCredits(platformCharge, grantCredits, creditsRef);
        toast.error(msg);
        setHistoryItems((prev) =>
          prev.map((i) =>
            i.id === jobId && i.status === "generating"
              ? {
                  ...i,
                  status: "failed",
                  errorMessage: msg,
                  creditsRefunded: platformCharge > 0,
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
    <div className="flex flex-col gap-3 overflow-x-hidden lg:flex-row lg:items-start lg:gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
      <div className="flex min-w-0 w-full flex-col gap-2 lg:basis-[30%] lg:max-w-[28rem] lg:flex-none lg:shrink-0 lg:min-h-0 lg:overflow-hidden">
        <div className="studio-params-scroll flex min-w-0 max-h-[min(86vh,calc(100dvh-5rem))] flex-col gap-2 overflow-y-auto pr-1 pb-6 lg:h-full lg:min-h-0 lg:max-h-none lg:flex-1 lg:pb-10">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Create prompt</p>
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
            {avatarUrls.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="group relative h-14 w-14 shrink-0 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
                title="Choose a generated avatar"
                disabled={refUploadBusy}
                onClick={() => setAvatarPickerOpen(true)}
              >
                <UserRound className="h-5 w-5" />
                <span className="sr-only">Upload avatar</span>
                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border border-white/15 bg-[#0b0b10]/95 px-2 py-1 text-[11px] font-medium text-white/85 opacity-0 shadow-lg transition-all duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100">
                  Upload avatar
                </span>
              </Button>
            ) : null}
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

        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Parameters</p>
        <div className="rounded-2xl border border-white/10 bg-[#101014] p-4 space-y-4">
          <div>
              <StudioModelPicker
                value={model}
                items={IMAGE_MODEL_PICKER_ITEMS}
                triggerVariant="bar"
                hideMeta
                isItemLocked={(id) =>
                  !isPersonalApiActive() && !canUseStudioImageModel(planId, id as NanoModel)
                }
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
      </div>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
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
      <AvatarPickerDialog
        open={avatarPickerOpen}
        onOpenChange={setAvatarPickerOpen}
        avatarUrls={avatarUrls}
        onPick={onUseAvatarRef}
        title="Choose avatar for image references"
      />
    </div>
  );
}

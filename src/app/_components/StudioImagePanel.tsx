"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useCreditsPlan,
  getPersonalApiKey,
  getPersonalPiapiApiKey,
  isPersonalApiActive,
  isPlatformCreditBypassActive,
} from "@/app/_components/CreditsPlanContext";
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
import type { StudioHistoryItem, StudioImageLightboxEditModelOption } from "@/app/_components/StudioGenerationsHistory";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";
import { studioImageCreditsPerOutput, topazImageUpscaleCredits } from "@/lib/pricing";
import { NANO_BANANA_2_ASPECT_RATIOS } from "@/lib/nanobanana";
import { dedupeStudioImageHistoryByMediaUrl } from "@/lib/studioHistoryDedupe";
import { readStudioHistoryLocal, writeStudioHistoryLocal } from "@/lib/studioHistoryLocalStorage";
import { userMessageFromCaughtError } from "@/lib/generationUserMessage";
import { cn } from "@/lib/utils";
import {
  canUseStudioImagePickerModel,
  studioImagePickerUpgradeMessage,
} from "@/lib/subscriptionModelAccess";
import {
  isStudioImageKiePickerModelId,
  isStudioSeedreamImagePickerId,
  studioSeedreamPickerRequiresReferenceImages,
  type StudioImageKiePickerModelId,
} from "@/lib/studioImageModels";
import { STUDIO_IMAGE_TAB_KINDS } from "@/lib/studioGenerationKinds";
import { loadAvatarUrls } from "@/lib/avatarLibrary";
import { AvatarPickerDialog } from "@/app/_components/AvatarPickerDialog";
import { clipboardImageFiles } from "@/lib/clipboardImage";
import { UploadBusyOverlay } from "@/app/_components/UploadBusyOverlay";
import { assertStudioImageUpload, STUDIO_IMAGE_FILE_ACCEPT } from "@/lib/studioUploadValidation";

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
  {
    id: "seedream_45_text_to_image",
    label: "Seedream 4.5 (text-to-image)",
    icon: "google",
    subtitle: "1 credit per image",
    resolution: "Image",
    durationRange: "T2I",
    searchText: "seedream 4.5 text to image",
  },
  {
    id: "seedream_45_image_to_image",
    label: "Seedream 4.5 (image-to-image)",
    icon: "google",
    subtitle: "1 credit per image",
    resolution: "Image",
    durationRange: "I2I",
    searchText: "seedream 4.5 image to image",
  },
  {
    id: "seedream_50_lite_text_to_image",
    label: "Seedream 5.0 Lite (text-to-image)",
    icon: "google",
    subtitle: "1 credit per image",
    resolution: "Image",
    durationRange: "T2I",
    searchText: "seedream 5.0 lite text to image",
  },
  {
    id: "seedream_50_lite_image_to_image",
    label: "Seedream 5.0 Lite (image-to-image)",
    icon: "google",
    subtitle: "1 credit per image",
    resolution: "Image",
    durationRange: "I2I",
    searchText: "seedream 5.0 lite image to image",
  },
  {
    id: "nanobanana_standard",
    label: "Google Nano Banana (text-to-image)",
    icon: "google",
    subtitle: "1 credit per image",
    resolution: "Image",
    durationRange: "T2I",
    searchText: "google nano banana text to image",
  },
  {
    id: "google_nano_banana_edit",
    label: "Google Nano Banana Edit (image-to-image)",
    icon: "google",
    subtitle: "1 credit per image",
    resolution: "Image",
    durationRange: "I2I",
    searchText: "google nano banana edit image to image",
  },
  {
    id: "recraft_remove_background",
    label: "Recraft Remove Background",
    icon: "google",
    subtitle: "1 credit per image",
    resolution: "Image",
    durationRange: "Edit",
    searchText: "recraft remove background",
  },
];

// These pickers are now enabled for Growth+ (and above).
const COMING_SOON_IMAGE_MODEL_IDS = new Set<string>();

const STUDIO_LIGHTBOX_EDIT_MODEL_OPTIONS: StudioImageLightboxEditModelOption[] = [
  { value: "pro", label: "NanoBanana Pro" },
  { value: "nano", label: "NanoBanana 2" },
  { value: "seedream_45_image_to_image", label: "Seedream 4.5 (image-to-image)" },
  { value: "seedream_50_lite_image_to_image", label: "Seedream 5.0 Lite (image-to-image)" },
];

async function uploadReferenceFile(file: File): Promise<string> {
  assertStudioImageUpload(file);
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
      await new Promise((r) => setTimeout(r, 1800));
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

/** Supabase list + poll: Studio Image tab only (excludes Link to Ad `link_to_ad_image`). */
const STUDIO_IMAGE_LIBRARY_KIND_PARAM = STUDIO_IMAGE_TAB_KINDS.join(",");

async function pollKieMarketFirstUrl(taskId: string, personalApiKey?: string): Promise<string> {
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
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (st === "SUCCESS") {
      const urls = json.data.response ?? [];
      const u = urls[0];
      if (!u || typeof u !== "string") throw new Error("Job finished but no output URL.");
      return u;
    }
    throw new Error(json.data.error_message || "Generation failed.");
  }
  throw new Error("Timed out waiting for result.");
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
  const [model, setModel] = useState<StudioImageKiePickerModelId>("pro");
  const [aspect, setAspect] = useState<string>("3:4");
  const [resolution, setResolution] = useState<(typeof PRO_RESOLUTIONS)[number]>("2K");
  const [numImages, setNumImages] = useState(1);
  const [refUrls, setRefUrls] = useState<string[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<string[]>([]);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  /** Reference image uploads only; does not block Generate. */
  const [refUploadBusy, setRefUploadBusy] = useState(false);
  const [refUploadPreviews, setRefUploadPreviews] = useState<{ id: string; blob: string }[]>([]);
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);
  /** null = unknown; true = Supabase + server poll; false = guest / local only */
  const [serverHistory, setServerHistory] = useState<boolean | null>(null);
  type ImageBilling =
    | { open: false }
    | { open: true; reason: "plan"; blockedId: string }
    | { open: true; reason: "credits"; required: number };
  const [billing, setBilling] = useState<ImageBilling>({ open: false });

  const grantCreditsRef = useRef(grantCredits);
  grantCreditsRef.current = grantCredits;

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/studio/generations?kind=${encodeURIComponent(STUDIO_IMAGE_LIBRARY_KIND_PARAM)}`,
        { cache: "no-store" },
      );
      if (res.status === 401) {
        setServerHistory(false);
        setHistoryItems([]);
        return;
      }
      if (!res.ok) {
        setServerHistory(false);
        setHistoryItems(readStudioHistoryLocal(LS_STUDIO_IMAGE_HISTORY));
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

  const runImageUpscale = useCallback(
    (opts: { sourceUrl: string; upscaleFactor: string }) => {
      const url = opts.sourceUrl.trim();
      const f = opts.upscaleFactor.trim();
      if (!url) return;
      if (!["1", "2", "4", "8"].includes(f)) {
        toast.error("Invalid upscale factor.");
        return;
      }
      if (serverHistory !== true) {
        toast.error("Sync backend indisponible. Recharge la page puis reessaie.");
        return;
      }

      const creditBypass = isPlatformCreditBypassActive();
      const charge = topazImageUpscaleCredits(f);
      if (!creditBypass && creditsRef.current < charge) {
        setBilling({ open: true, reason: "credits", required: charge });
        return;
      }

      const platformCharge = creditBypass ? 0 : charge;
      if (!creditBypass) {
        spendCredits(charge);
        creditsRef.current = Math.max(0, creditsRef.current - charge);
      }

      const label = `Topaz ${f}× image`;

      void (async () => {
        const pKey = getPersonalApiKey() ?? undefined;

        try {
          const res = await fetch("/api/kie/upscale/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: url, upscaleFactor: f, personalApiKey: pKey }),
          });
          const json = (await res.json()) as { taskId?: string; error?: string };
          if (!res.ok || !json.taskId) throw new Error(json.error || "Upscale request failed");

          const regRes = await fetch("/api/studio/generations/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "studio_upscale",
              label,
              taskId: json.taskId,
              creditsCharged: platformCharge,
              personalApiKey: pKey,
            }),
          });
          const regJson = (await regRes.json()) as {
            data?: { rows?: { id: string }[] };
            error?: string;
          };
          if (!regRes.ok || !regJson.data?.rows?.length) {
            throw new Error(regJson.error || "Failed to register job");
          }
          const rowId = String(regJson.data.rows[0]!.id);
          const startedAt = Date.now();
          setHistoryItems((prev) => {
            const row: StudioHistoryItem = {
              id: rowId,
              kind: "image",
              status: "generating",
              label,
              createdAt: startedAt,
              studioGenerationKind: "studio_upscale",
            };
            return [row, ...prev.filter((i) => i.id !== rowId)];
          });
          toast.message("Image upscale running", {
            description: "You can leave this page — it will appear in history when ready.",
          });
        } catch (e) {
          const msg = userMessageFromCaughtError(e, "Something went wrong while upscaling.");
          refundPlatformCredits(platformCharge, grantCredits, creditsRef);
          toast.error(msg);
        }
      })();
    },
    [serverHistory, spendCredits, grantCredits],
  );

  useEffect(() => {
    if (serverHistory !== true) return;

    const tick = () => {
      void (async () => {
        const res = await fetch("/api/studio/generations/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: STUDIO_IMAGE_LIBRARY_KIND_PARAM,
            personalApiKey: getPersonalApiKey() ?? undefined,
            piapiApiKey: getPersonalPiapiApiKey() ?? undefined,
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
    if (serverHistory === null) return;
    writeStudioHistoryLocal(LS_STUDIO_IMAGE_HISTORY, historyItems);
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
    if (model === "nano") return NANO_BANANA_2_ASPECT_RATIOS;
    if (model === "pro") return ["auto", ...ASPECT_RATIOS_PRO] as const;
    if (isStudioSeedreamImagePickerId(model)) return ASPECT_RATIOS_PRO;
    return NANO_BANANA_2_ASPECT_RATIOS;
  }, [model]);

  useEffect(() => {
    const allowed = new Set(aspectOptions as readonly string[]);
    if (!allowed.has(aspect)) {
      if (model === "pro") setAspect("3:4");
      else if (isStudioSeedreamImagePickerId(model)) setAspect("3:4");
      else setAspect("auto");
    }
  }, [model, aspectOptions, aspect]);

  useEffect(() => {
    if (canUseStudioImagePickerModel(planId, model)) return;
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

  const displayHistoryItems = useMemo(() => dedupeStudioImageHistoryByMediaUrl(historyItems), [historyItems]);

  const dismissFailedHistoryItem = useCallback((id: string) => {
    setHistoryItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const proAspectOptionsFull = useMemo(() => ["auto", ...ASPECT_RATIOS_PRO] as const, []);

  type RunGenOpts = {
    prompt: string;
    model: StudioImageKiePickerModelId;
    aspect: string;
    resolution: (typeof PRO_RESOLUTIONS)[number];
    numImages: number;
    refUrls: string[];
    /** Mirror values into the left sidebar (e.g. after lightbox edit). */
    syncSidebar?: boolean;
  };

  function runImageGeneration(opts: RunGenOpts) {
    if (serverHistory !== true) {
      toast.error("Sync backend indisponible. Recharge la page puis reessaie.");
      return;
    }
    const p = opts.prompt.trim();
    if (!p) {
      toast.error("Describe the scene you imagine.");
      return;
    }
    if (
      isStudioSeedreamImagePickerId(opts.model) &&
      studioSeedreamPickerRequiresReferenceImages(opts.model) &&
      !opts.refUrls.length
    ) {
      toast.error("Add at least one reference image for this Seedream image-to-image model.");
      return;
    }
    if (opts.syncSidebar) {
      setPrompt(opts.prompt);
      setModel(opts.model);
      setAspect(opts.aspect);
      setResolution(opts.resolution);
      setNumImages(opts.numImages);
      setRefUrls(opts.refUrls);
    }
    const gate = studioImagePickerUpgradeMessage(planId, opts.model);
    if (!isPersonalApiActive() && gate) {
      setBilling({ open: true, reason: "plan", blockedId: opts.model });
      return;
    }
    const creditBypass = isPlatformCreditBypassActive();
    const n = Math.min(4, Math.max(1, opts.numImages));
    const perOut = studioImageCreditsPerOutput({
      studioModel: opts.model,
      resolution: opts.resolution,
    });
    const chargeTotal = n * perOut;
    if (!creditBypass && creditsRef.current < chargeTotal) {
      setBilling({ open: true, reason: "credits", required: chargeTotal });
      return;
    }
    const summary = p;
    const platformCharge = creditBypass ? 0 : chargeTotal;
    if (!creditBypass) {
      spendCredits(chargeTotal);
      creditsRef.current = Math.max(0, creditsRef.current - chargeTotal);
    }

    void (async () => {
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
            model: opts.model,
            imageUrls: opts.refUrls.length ? opts.refUrls : undefined,
            aspectRatio: opts.aspect,
            resolution: opts.resolution,
            numImages: n,
            personalApiKey: getPersonalApiKey() ?? undefined,
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
        const msg = userMessageFromCaughtError(
          e,
          "Something went wrong while starting generation. Please try again.",
        );
        refundPlatformCredits(platformCharge, grantCredits, creditsRef);
        toast.error(msg);
      }
    })();
  }

  const onAddRefs = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = STUDIO_IMAGE_FILE_ACCEPT;
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) return;
      const slice = files.slice(0, 8);
      const pending = slice.map((f) => ({ id: crypto.randomUUID(), blob: URL.createObjectURL(f), file: f }));
      setRefUploadPreviews((prev) => [...prev, ...pending.map(({ id, blob }) => ({ id, blob }))]);
      setRefUploadBusy(true);
      try {
        const urls: string[] = [];
        for (const row of pending) {
          try {
            urls.push(await uploadReferenceFile(row.file));
          } catch (e) {
            toast.error("Échec de l’upload", {
              description: userMessageFromCaughtError(e, "Utilise JPEG, PNG, WebP ou GIF."),
            });
          } finally {
            URL.revokeObjectURL(row.blob);
            setRefUploadPreviews((p) => p.filter((x) => x.id !== row.id));
          }
        }
        if (urls.length) {
          setRefUrls((prev) => [...prev, ...urls].slice(0, 12));
          toast.success(`${urls.length} reference image(s) added`);
        }
      } finally {
        setRefUploadBusy(false);
      }
    };
    input.click();
  }, []);

  const onPasteRefs = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const slice = files.slice(0, 8);
    const pending = slice.map((f) => ({ id: crypto.randomUUID(), blob: URL.createObjectURL(f), file: f }));
    setRefUploadPreviews((prev) => [...prev, ...pending.map(({ id, blob }) => ({ id, blob }))]);
    setRefUploadBusy(true);
    try {
      const urls: string[] = [];
      for (const row of pending) {
        try {
          urls.push(await uploadReferenceFile(row.file));
        } catch (e) {
          toast.error("Échec du collage", {
            description: userMessageFromCaughtError(e, "Utilise JPEG, PNG, WebP ou GIF."),
          });
        } finally {
          URL.revokeObjectURL(row.blob);
          setRefUploadPreviews((p) => p.filter((x) => x.id !== row.id));
        }
      }
      if (urls.length) {
        setRefUrls((prev) => [...prev, ...urls].slice(0, 12));
        toast.success(urls.length > 1 ? `${urls.length} reference images pasted` : "Reference image pasted");
      }
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
    runImageGeneration({
      prompt: prompt.trim(),
      model,
      aspect,
      resolution,
      numImages,
      refUrls,
      syncSidebar: false,
    });
  };

  const generateBtnClass =
    "h-14 w-full rounded-2xl border border-violet-300/40 bg-violet-500 text-lg font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none";

  return (
    <div className="flex flex-col gap-3 overflow-x-hidden lg:flex-row lg:items-start lg:gap-4 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
      <div className="flex min-w-0 w-full flex-col gap-2 lg:basis-[30%] lg:max-w-[28rem] lg:flex-none lg:shrink-0 lg:min-h-0 lg:overflow-hidden">
        <div className="studio-params-scroll flex min-w-0 max-h-[min(86vh,calc(100dvh-5rem))] flex-col gap-2 overflow-y-auto pb-6 lg:h-full lg:min-h-0 lg:max-h-none lg:flex-1 lg:pb-10">
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
            {refUploadPreviews.map((row) => (
              <div
                key={row.id}
                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-violet-500/35"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.blob} alt="" className="h-full w-full object-cover" />
                <UploadBusyOverlay active className="rounded-xl" />
              </div>
            ))}
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
                panelMode="dropdown"
                hideMeta
                isItemLocked={(id) =>
                  COMING_SOON_IMAGE_MODEL_IDS.has(id) ||
                  (!isPersonalApiActive() && !canUseStudioImagePickerModel(planId, id))
                }
                onLockedPick={(id) => {
                  if (COMING_SOON_IMAGE_MODEL_IDS.has(id)) {
                    toast.message("Model coming soon", {
                      description: "This model is already listed in the picker and will be enabled soon.",
                    });
                    return;
                  }
                  setBilling({ open: true, reason: "plan", blockedId: id });
                }}
                onChange={(v) => setModel(v as StudioImageKiePickerModelId)}
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
              {isStudioSeedreamImagePickerId(model) ? (
                <>
                  Seedream: 1K/2K → basic quality (~2K output), 4K → high (~4K output). {perImageCredits} credits per
                  image.
                </>
              ) : (
                <>
                  1K = faster / lower cost · 4K = more detail · {perImageCredits} credits per image at this quality
                </>
              )}
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
              items={displayHistoryItems}
              empty={<StudioEmptyExamples variant="image" />}
              mediaLabel="Image"
              failedAutoDismiss
              onDismissFailed={dismissFailedHistoryItem}
              onItemDeleted={(id) => setHistoryItems((prev) => prev.filter((i) => i.id !== id))}
              imageLightboxUpscale={{
                seedFactor: "2",
                creditsFor: (factor) => topazImageUpscaleCredits(factor),
                onSubmitUpscale: runImageUpscale,
              }}
              imageLightboxEdit={{
                nanoAspectOptions: NANO_BANANA_2_ASPECT_RATIOS,
                proAspectOptions: proAspectOptionsFull,
                resolutionOptions: PRO_RESOLUTIONS,
                seedModel: model,
                editModelOptions: STUDIO_LIGHTBOX_EDIT_MODEL_OPTIONS,
                seedAspect: aspect,
                seedResolution: resolution,
                creditsFor: (m, r) => studioImageCreditsPerOutput({ studioModel: m, resolution: r }),
                onSubmitEdit: ({ sourceUrl, prompt: editP, model: m, aspectRatio, resolution: res }) => {
                  if (!isStudioImageKiePickerModelId(m)) {
                    toast.error("Invalid model selected.");
                    return;
                  }
                  runImageGeneration({
                    prompt: editP,
                    model: m,
                    aspect: aspectRatio,
                    resolution: res,
                    numImages: 1,
                    refUrls: [sourceUrl],
                    syncSidebar: true,
                  });
                },
              }}
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

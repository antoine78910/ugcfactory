"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Sparkles, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreditsPlan,
  getPersonalApiKey,
  isPlatformCreditBypassActive,
} from "@/app/_components/CreditsPlanContext";
import { userMessageFromCaughtError } from "@/lib/generationUserMessage";
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";
import { StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import { StudioGenerationsHistory } from "@/app/_components/StudioGenerationsHistory";
import { AvatarPickerDialog } from "@/app/_components/AvatarPickerDialog";
import { AvatarInputCornerBadge } from "@/app/_components/AvatarInputCornerBadge";
import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { studioImageCreditsPerOutput, type StudioImageOutputResolution } from "@/lib/pricing";
import { loadAvatarUrls } from "@/lib/avatarLibrary";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import { STUDIO_IMAGE_FILE_ACCEPT } from "@/lib/studioUploadValidation";
import { cn } from "@/lib/utils";

const LS_AVATAR_HISTORY = "ugc_studio_avatar_history_v1";

const AGE_OPTIONS = ["18-25", "25-35", "35-45", "45-55", "55+"] as const;
const SEX_OPTIONS = ["Female", "Male"] as const;
const ETHNICITY_OPTIONS = [
  "Caucasian", "African", "Asian", "Hispanic/Latino", "Middle Eastern",
  "South Asian", "Mixed",
] as const;
const BODY_TYPE_OPTIONS = ["Slim", "Athletic", "Average", "Curvy", "Plus-size"] as const;
const EYE_COLOR_OPTIONS = ["Brown", "Blue", "Green", "Hazel", "Gray", "Amber"] as const;
const HAIR_COLOR_OPTIONS = ["Black", "Brown", "Blonde", "Red", "Gray", "White", "Auburn"] as const;
const HAIR_STYLE_OPTIONS = ["Short", "Medium", "Long", "Curly", "Straight", "Wavy", "Bald", "Braided", "Ponytail"] as const;
const SKIN_TONE_OPTIONS = ["Fair", "Light", "Medium", "Olive", "Tan", "Brown", "Dark"] as const;
const EXPRESSION_OPTIONS = ["Neutral", "Smiling", "Confident", "Friendly", "Serious", "Excited"] as const;

type AvatarParams = {
  age: string;
  sex: string;
  ethnicity: string;
  bodyType: string;
  eyeColor: string;
  hairColor: string;
  hairStyle: string;
  skinTone: string;
  expression: string;
  moreDetails: string;
};

const DEFAULTS: AvatarParams = {
  age: "25-35",
  sex: "Female",
  ethnicity: "Caucasian",
  bodyType: "Athletic",
  eyeColor: "Brown",
  hairColor: "Brown",
  hairStyle: "Medium",
  skinTone: "Medium",
  expression: "Smiling",
  moreDetails: "",
};

function buildAvatarPrompt(p: AvatarParams, resolution: StudioImageOutputResolution): string {
  const sexLower = p.sex.toLowerCase();
  const details = p.moreDetails.trim();
  const resLabel =
    resolution === "1K" ? "1K portrait" : resolution === "2K" ? "2K portrait" : "4K portrait";
  return [
    `Ultra-realistic studio portrait of a ${p.age} year old ${sexLower},`,
    `${p.ethnicity} ethnicity, ${p.bodyType.toLowerCase()} body type,`,
    `${p.skinTone.toLowerCase()} skin tone, ${p.eyeColor.toLowerCase()} eyes,`,
    `${p.hairColor.toLowerCase()} ${p.hairStyle.toLowerCase()} hair,`,
    `${p.expression.toLowerCase()} expression.`,
    details ? `Additional details: ${details}.` : "",
    `Professional UGC creator look, natural lighting, clean background,`,
    `high detail face, ${resLabel}, photorealistic.`,
  ]
    .filter(Boolean)
    .join(" ");
}

const AVATAR_360_PROMPT =
  "A professional character reference sheet of the exact same character from the reference image, plain white background. his name tag 'D. kieft' is clearly visible. Two rows: top row contains four equally sized close-up head shots side by side - front facing, left profile, right profile, and back of head. Bottom row contains three equally sized full body shots side by side - full body front, full body three-quarter side profile, and full body back. Replicate every detail exactly across all panels: facial structure, skin tone, natural blemishes, pore texture, hair color, hair texture and styling, eye color with realistic iris detail, natural moisture and catchlights. Exact same outfit and costume consistent across every single view. Soft neutral studio lighting, flat and even across all panels, no shadows, no color cast, no background elements. Every panel perfectly consistent in character, scale, and lighting. Shot on Hasselblad X2D 100C, photorealistic, ultra sharp micro detail, RAW photograph quality, character design sheet, turnaround sheet, model sheet, orthographic reference.";

async function uploadAvatarReference(file: File): Promise<string> {
  return uploadFileToCdn(file, { kind: "image" });
}

function readLocalAvatarHistory(): StudioHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_AVATAR_HISTORY);
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

function writeLocalAvatarHistory(items: StudioHistoryItem[]) {
  try {
    localStorage.setItem(LS_AVATAR_HISTORY, JSON.stringify(items.slice(0, 80)));
  } catch {
    /* ignore */
  }
}

async function pollNanoTask(taskId: string, personalApiKey?: string): Promise<string[]> {
  const keyParam = personalApiKey ? `&personalApiKey=${encodeURIComponent(personalApiKey)}` : "";
  for (let i = 0; i < 90; i++) {
    const res = await fetch(`/api/nanobanana/task?taskId=${encodeURIComponent(taskId)}${keyParam}`, { cache: "no-store" });
    const json = (await res.json()) as {
      data?: { successFlag?: number; response?: Record<string, unknown>; errorMessage?: string };
      error?: string;
    };
    if (!res.ok || !json.data) throw new Error(json.error || "Poll failed");
    if (json.data.successFlag === 0) {
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    if (json.data.successFlag === 1) {
      const resp = json.data.response ?? {};
      const candidates: unknown[] = [
        (resp as { resultImageUrl?: unknown }).resultImageUrl,
        (resp as { resultUrls?: unknown }).resultUrls,
        (resp as { resultUrl?: unknown }).resultUrl,
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
  throw new Error("Timed out.");
}

function SelectField({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-8 border-white/20 bg-[#0d0d11] text-sm text-white shadow-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-white/15 bg-[#0b0b10] text-white">
          {options.map((o) => (
            <SelectItem
              key={o}
              value={o}
              className="text-sm text-white/90 data-[highlighted]:bg-violet-500/25 data-[highlighted]:text-white data-[state=checked]:bg-violet-500/20 data-[state=checked]:text-violet-100"
            >
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
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

function isAvatar360HistoryItem(item: StudioHistoryItem): boolean {
  const label = item.label.trim().toLowerCase();
  const aspect = (item.aspectRatio ?? "").trim();
  if (label.includes("360")) return true;
  if (aspect === "16:9") return true;
  return false;
}

export default function StudioAvatarPanel({
  onChangeVoice,
}: {
  onChangeVoice?: (item: StudioHistoryItem) => void;
}) {
  const { planId, current: creditsBalance, spendCredits, grantCredits } = useCreditsPlan();
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;

  const [params, setParams] = useState<AvatarParams>(DEFAULTS);
  const [outputResolution, setOutputResolution] = useState<StudioImageOutputResolution>("1K");
  const [isStartingAvatar, setIsStartingAvatar] = useState(false);
  const [isStartingAvatar360, setIsStartingAvatar360] = useState(false);
  const [mode, setMode] = useState<"describe" | "turnaround">("describe");
  const [avatar360Model, setAvatar360Model] = useState<"pro" | "gpt_image_2">("gpt_image_2");
  const [avatar360RefUrls, setAvatar360RefUrls] = useState<string[]>([]);
  const [avatar360Uploading, setAvatar360Uploading] = useState(false);
  const [avatar360UploadPreviews, setAvatar360UploadPreviews] = useState<{ id: string; blob: string }[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<string[]>([]);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);
  /** null = unknown; true = Supabase + server poll; false = guest / local only */
  const [serverHistory, setServerHistory] = useState<boolean | null>(null);

  type Bill = { open: false } | { open: true; reason: "credits"; required: number };
  const [billing, setBilling] = useState<Bill>({ open: false });

  const credits = studioImageCreditsPerOutput({ studioModel: "nano", resolution: outputResolution });
  const avatar360Credits = studioImageCreditsPerOutput({ studioModel: avatar360Model, resolution: outputResolution });

  const set = useCallback((key: keyof AvatarParams, value: string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const grantCreditsRef = useRef(grantCredits);
  grantCreditsRef.current = grantCredits;

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/studio/generations?kind=avatar", { cache: "no-store" });
      if (res.status === 401) {
        // Not authenticated, never show localStorage data that may belong to another account
        setServerHistory(false);
        setHistoryItems([]);
        return;
      }
      if (!res.ok) {
        // Server error, fall back to local only as a last resort (guest/offline mode)
        setServerHistory(false);
        setHistoryItems(readLocalAvatarHistory());
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
            kind: "avatar",
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
    writeLocalAvatarHistory(historyItems);
  }, [serverHistory, historyItems]);

  useEffect(() => {
    void loadAvatarUrls().then((urls) => setAvatarUrls(urls));
  }, []);

  const generate = useCallback(() => {
    if (serverHistory !== true) {
      toast.error("Sync backend indisponible. Recharge la page puis reessaie.");
      return;
    }
    const creditBypass = isPlatformCreditBypassActive();
    if (!creditBypass && creditsRef.current < credits) {
      setBilling({ open: true, reason: "credits", required: credits });
      return;
    }
    const platformCharge = creditBypass ? 0 : credits;
    if (!creditBypass) {
      spendCredits(credits);
      creditsRef.current = Math.max(0, creditsRef.current - credits);
    }

    const prompt = buildAvatarPrompt(params, outputResolution);
    const label = `${params.sex} · ${params.age} · ${params.ethnicity}`;
    setIsStartingAvatar(true);
    const optimisticId = `avatar-describe-pending-${Date.now()}`;
    const startedAt = Date.now();
    setHistoryItems((prev) => {
      return [
        {
          id: optimisticId,
          kind: "image",
          status: "generating",
          label,
          createdAt: startedAt,
          aspectRatio: "3:4",
        },
        ...prev.filter((i) => i.id !== optimisticId),
      ];
    });

    void (async () => {
      try {
        const res = await fetch("/api/studio/generations/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "avatar",
            label,
            accountPlan: planId,
            prompt,
            model: "nano",
            aspectRatio: "3:4",
            resolution: outputResolution,
            numImages: 1,
            creditsCharged: platformCharge,
            personalApiKey: getPersonalApiKey(),
          }),
        });
        const json = (await res.json()) as { data?: { id: string }; error?: string };
        if (!res.ok) throw new Error(json.error || "Start failed");
        const id = json.data?.id;
        if (!id) throw new Error("No job id");
        setHistoryItems((prev) => {
          return [
            {
              id,
              kind: "image",
              status: "generating",
              label,
              createdAt: startedAt,
              aspectRatio: "3:4",
            },
            ...prev.filter((i) => i.id !== id && i.id !== optimisticId),
          ];
        });
        toast.message("Avatar generation running", {
          description: "You can leave this page, it will finish on the server.",
        });
      } catch (e) {
        const msg = userMessageFromCaughtError(
          e,
          "Something went wrong while generating. Please try again.",
        );
        setHistoryItems((prev) => prev.filter((i) => i.id !== optimisticId));
        refundPlatformCredits(platformCharge, grantCredits, creditsRef);
        toast.error(msg);
      } finally {
        setIsStartingAvatar(false);
      }
    })();
  }, [params, outputResolution, planId, credits, spendCredits, grantCredits, serverHistory]);

  const onAddAvatar360Refs = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = STUDIO_IMAGE_FILE_ACCEPT;
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) return;
      const slice = files.slice(0, 8);
      const pending = slice.map((f) => ({ id: crypto.randomUUID(), blob: URL.createObjectURL(f), file: f }));
      setAvatar360UploadPreviews((prev) => [...prev, ...pending.map(({ id, blob }) => ({ id, blob }))]);
      setAvatar360Uploading(true);
      try {
        const urls: string[] = [];
        for (const row of pending) {
          try {
            urls.push(await uploadAvatarReference(row.file));
          } catch (e) {
            toast.error("Upload failed", {
              description: userMessageFromCaughtError(e, "Use JPEG, PNG, WebP, or GIF."),
            });
          } finally {
            URL.revokeObjectURL(row.blob);
            setAvatar360UploadPreviews((p) => p.filter((x) => x.id !== row.id));
          }
        }
        if (urls.length) {
          setAvatar360RefUrls((prev) => [...prev, ...urls].slice(0, 12));
          toast.success(`${urls.length} reference image(s) added`);
        }
      } finally {
        setAvatar360Uploading(false);
      }
    };
    input.click();
  }, []);

  const generateAvatar360Profile = useCallback(() => {
    if (serverHistory !== true) {
      toast.error("Backend sync unavailable. Reload and try again.");
      return;
    }
    if (!avatar360RefUrls.length) {
      toast.error("Add at least one avatar reference image.");
      return;
    }
    const creditBypass = isPlatformCreditBypassActive();
    if (!creditBypass && creditsRef.current < avatar360Credits) {
      setBilling({ open: true, reason: "credits", required: avatar360Credits });
      return;
    }
    const platformCharge = creditBypass ? 0 : avatar360Credits;
    if (!creditBypass) {
      spendCredits(avatar360Credits);
      creditsRef.current = Math.max(0, creditsRef.current - avatar360Credits);
    }
    const label = "Avatar 360 Profile";
    setIsStartingAvatar360(true);
    const optimisticId = `avatar360-pending-${Date.now()}`;
    const startedAt = Date.now();
    setHistoryItems((prev) => [
      {
        id: optimisticId,
        kind: "image",
        status: "generating",
        label,
        createdAt: startedAt,
        aspectRatio: "16:9",
      },
      ...prev.filter((i) => i.id !== optimisticId),
    ]);

    void (async () => {
      try {
        const res = await fetch("/api/studio/generations/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "avatar",
            label,
            accountPlan: planId,
            prompt: AVATAR_360_PROMPT,
            model: avatar360Model,
            imageUrls: avatar360RefUrls,
            aspectRatio: "16:9",
            resolution: outputResolution,
            numImages: 1,
            creditsCharged: platformCharge,
            personalApiKey: getPersonalApiKey(),
          }),
        });
        const json = (await res.json()) as { data?: { id: string }; error?: string };
        if (!res.ok) throw new Error(json.error || "Start failed");
        const id = json.data?.id;
        if (!id) throw new Error("No job id");
        setHistoryItems((prev) => [
          {
            id,
            kind: "image",
            status: "generating",
            label,
            createdAt: startedAt,
            aspectRatio: "16:9",
          },
          ...prev.filter((i) => i.id !== id && i.id !== optimisticId),
        ]);
        toast.message("360 profile generation running", {
          description: "You can leave this page, it will finish on the server.",
        });
      } catch (e) {
        const msg = userMessageFromCaughtError(
          e,
          "Something went wrong while generating 360 profile. Please try again.",
        );
        setHistoryItems((prev) => prev.filter((i) => i.id !== optimisticId));
        refundPlatformCredits(platformCharge, grantCredits, creditsRef);
        toast.error(msg);
      } finally {
        setIsStartingAvatar360(false);
      }
    })();
  }, [avatar360RefUrls, avatar360Credits, avatar360Model, planId, outputResolution, serverHistory, spendCredits, grantCredits]);

  const addAvatarAs360Reference = useCallback((avatarUrl: string) => {
    const u = avatarUrl.trim();
    if (!u) return;
    setAvatar360RefUrls((prev) => {
      if (prev.includes(u)) return prev;
      return [...prev, u].slice(0, 12);
    });
    toast.success("Avatar reference added");
  }, []);

  const visibleHistoryItems = historyItems.filter((item) =>
    mode === "turnaround" ? isAvatar360HistoryItem(item) : !isAvatar360HistoryItem(item),
  );

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-3 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
        <div className="flex min-w-0 w-full flex-col gap-3 lg:basis-[36%] lg:max-w-[33rem] lg:flex-none lg:shrink-0 lg:min-h-0 lg:overflow-hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
              <UserRound className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Create your avatar</h3>
              <p className="text-xs text-white/45">
                Build avatars here and reuse them across the studio.
              </p>
            </div>
          </div>

          <div className="inline-flex w-full rounded-xl border border-white/10 bg-white/[0.04] p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("describe")}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 font-semibold transition",
                mode === "describe"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/55 hover:text-white",
              )}
            >
              Describe
            </button>
            <button
              type="button"
              onClick={() => setMode("turnaround")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition",
                mode === "turnaround"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/55 hover:text-white",
              )}
            >
              360° profile
              <span className="rounded-md bg-violet-500/25 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-200">
                New
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Resolution</Label>
            <Select value={outputResolution} onValueChange={(v) => setOutputResolution(v as StudioImageOutputResolution)}>
              <SelectTrigger className="h-8 border-white/20 bg-[#0d0d11] text-sm text-white shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/15 bg-[#0b0b10] text-white">
                <SelectItem value="1K" className="text-sm text-white/90 data-[highlighted]:bg-violet-500/25 data-[highlighted]:text-white data-[state=checked]:bg-violet-500/20 data-[state=checked]:text-violet-100">1K</SelectItem>
                <SelectItem value="2K" className="text-sm text-white/90 data-[highlighted]:bg-violet-500/25 data-[highlighted]:text-white data-[state=checked]:bg-violet-500/20 data-[state=checked]:text-violet-100">2K</SelectItem>
                <SelectItem value="4K" className="text-sm text-white/90 data-[highlighted]:bg-violet-500/25 data-[highlighted]:text-white data-[state=checked]:bg-violet-500/20 data-[state=checked]:text-violet-100">4K</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "describe" ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
                <SelectField label="Sex" value={params.sex} onValueChange={(v) => set("sex", v)} options={SEX_OPTIONS} />
                <SelectField label="Age" value={params.age} onValueChange={(v) => set("age", v)} options={AGE_OPTIONS} />
                <SelectField label="Ethnicity" value={params.ethnicity} onValueChange={(v) => set("ethnicity", v)} options={ETHNICITY_OPTIONS} />
                <SelectField label="Body type" value={params.bodyType} onValueChange={(v) => set("bodyType", v)} options={BODY_TYPE_OPTIONS} />
                <SelectField label="Eye color" value={params.eyeColor} onValueChange={(v) => set("eyeColor", v)} options={EYE_COLOR_OPTIONS} />
                <SelectField label="Hair color" value={params.hairColor} onValueChange={(v) => set("hairColor", v)} options={HAIR_COLOR_OPTIONS} />
                <SelectField label="Hair style" value={params.hairStyle} onValueChange={(v) => set("hairStyle", v)} options={HAIR_STYLE_OPTIONS} />
                <SelectField label="Skin tone" value={params.skinTone} onValueChange={(v) => set("skinTone", v)} options={SKIN_TONE_OPTIONS} />
                <SelectField label="Expression" value={params.expression} onValueChange={(v) => set("expression", v)} options={EXPRESSION_OPTIONS} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-white/45">More details</Label>
                <Textarea
                  value={params.moreDetails}
                  onChange={(e) => set("moreDetails", e.target.value)}
                  placeholder="Optional: freckles, makeup, clothing vibe, accessories, pose, mood..."
                  className="min-h-[84px] resize-none border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-white/35 focus-visible:ring-0"
                  maxLength={600}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Reference photos</Label>
                <span className="text-[10px] tabular-nums text-white/35">{avatar360RefUrls.length}/12</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Model</Label>
                <Select
                  value={avatar360Model}
                  onValueChange={(v) => setAvatar360Model(v === "gpt_image_2" ? "gpt_image_2" : "pro")}
                >
                  <SelectTrigger className="h-8 border-white/20 bg-[#0d0d11] text-sm text-white shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/15 bg-[#0b0b10] text-white">
                    <SelectItem
                      value="pro"
                      className="text-sm text-white/90 data-[highlighted]:bg-violet-500/25 data-[highlighted]:text-white data-[state=checked]:bg-violet-500/20 data-[state=checked]:text-violet-100"
                    >
                      NanoBanana Pro
                    </SelectItem>
                    <SelectItem
                      value="gpt_image_2"
                      className="text-sm text-white/90 data-[highlighted]:bg-violet-500/25 data-[highlighted]:text-white data-[state=checked]:bg-violet-500/20 data-[state=checked]:text-violet-100"
                    >
                      GPT Image 2
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <AvatarInputCornerBadge
                  align="right"
                  className="!right-2 !top-2"
                  disabled={isStartingAvatar360 || avatarUrls.length === 0 || avatar360RefUrls.length >= 12}
                  onClick={() => setAvatarPickerOpen(true)}
                />
                {avatar360RefUrls.length === 0 && avatar360UploadPreviews.length === 0 ? (
                  <button
                    type="button"
                    disabled={avatar360Uploading || isStartingAvatar360}
                    onClick={onAddAvatar360Refs}
                    className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-7 text-xs text-white/45 transition hover:border-violet-400/40 hover:bg-violet-500/5 hover:text-white/70 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Upload one or more avatar photos
                    <span className="text-[10px] text-white/30">JPEG, PNG, WebP · up to 12</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2 pt-8">
                  {avatar360UploadPreviews.map((row) => (
                    <div
                      key={row.id}
                      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-violet-500/35"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={row.blob} alt="" className="h-full w-full object-cover opacity-75" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-white/80" />
                      </div>
                    </div>
                  ))}
                  {avatar360RefUrls.map((u, i) => (
                    <div key={`${u}-${i}`} className="group/ref relative h-14 w-14 shrink-0">
                      <div className="h-full w-full overflow-hidden rounded-xl border border-white/15 bg-[#050507]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
                      </div>
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => setAvatar360RefUrls((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-black/85 text-white/70 opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.45)] transition hover:text-red-400 group-hover/ref:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={avatar360Uploading || isStartingAvatar360 || avatar360RefUrls.length >= 12}
                    onClick={onAddAvatar360Refs}
                    aria-label="Add more reference photos"
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-white/30 transition hover:border-violet-400/40 hover:text-violet-300 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  </div>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-white/40">
                We generate a 16:9 turnaround sheet (front, profiles, back & full body) of the same character with{" "}
                {avatar360Model === "gpt_image_2" ? "GPT Image 2" : "NanoBanana Pro"}.
              </p>
            </div>
          )}

          <div className="mt-auto pt-1">
            <Button
              type="button"
              disabled={
                (mode === "describe" ? isStartingAvatar : isStartingAvatar360) ||
                (mode === "turnaround" && avatar360Uploading) ||
                serverHistory !== true ||
                (mode === "turnaround" && avatar360RefUrls.length === 0)
              }
              onClick={mode === "describe" ? generate : generateAvatar360Profile}
              className="h-12 w-full gap-2 rounded-xl border border-violet-300/40 bg-violet-500 px-5 text-base font-semibold text-white shadow-[0_6px_0_0_rgba(76,29,149,0.85)] transition-all hover:-translate-y-px hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.85)] active:translate-y-1 active:shadow-none disabled:translate-y-0 disabled:shadow-[0_6px_0_0_rgba(76,29,149,0.85)] disabled:opacity-55"
            >
              {(mode === "describe" ? isStartingAvatar : isStartingAvatar360) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {mode === "describe" ? "Generate avatar" : "Generate 360° profile"}
              <span className="ml-auto rounded-md bg-white/15 px-1.5 py-0.5 text-xs tabular-nums">
                {mode === "describe" ? credits : avatar360Credits}
              </span>
            </Button>
          </div>
        </div>

        <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col lg:basis-[64%] lg:min-h-0 lg:overflow-hidden">
          <StudioOutputPane
            title=""
            hasOutput
            output={
              <StudioGenerationsHistory
                items={visibleHistoryItems}
                empty={
                  mode === "turnaround" ? (
                    <div className="flex flex-col items-center justify-center py-6">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/images/avatar-360-empty-state.png"
                        alt="360 profile example"
                        className="h-auto w-full max-w-[26rem] object-contain"
                      />
                      <p className="mt-3 text-center text-xs text-white/35">
                        Upload one avatar photo and generate your 360 profile.
                      </p>
                    </div>
                  ) : (
                    <p className="py-8 text-center text-xs text-white/30">
                      Generated avatars will appear here.
                    </p>
                  )
                }
                mediaLabel="Avatar"
                onItemDeleted={(id) => setHistoryItems((prev) => prev.filter((i) => i.id !== id))}
                onChangeVoice={onChangeVoice}
              />
            }
            empty={null}
          />
        </div>
      </div>

      {billing.open ? (
        <StudioBillingDialog
          open
          onOpenChange={(open) => { if (!open) setBilling({ open: false }); }}
          planId={planId}
          studioMode="image"
          variant={{
            kind: "credits",
            currentCredits: creditsBalance,
            requiredCredits: billing.required,
          }}
        />
      ) : null}

      <AvatarPickerDialog
        open={avatarPickerOpen}
        onOpenChange={(open) => {
          setAvatarPickerOpen(open);
          if (open) {
            void loadAvatarUrls().then((urls) => setAvatarUrls(urls));
          }
        }}
        avatarUrls={avatarUrls}
        onPick={addAvatarAs360Reference}
        title="Choose avatar for 360 profile"
      />
    </>
  );
}

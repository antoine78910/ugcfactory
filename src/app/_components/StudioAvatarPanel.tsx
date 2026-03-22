"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreditsPlan, getPersonalApiKey, isPersonalApiActive } from "@/app/_components/CreditsPlanContext";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";
import { StudioGenerationsHistory } from "@/app/_components/StudioGenerationsHistory";
import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { studioImageCreditsPerOutput } from "@/lib/pricing";
import { cn } from "@/lib/utils";

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
};

function buildAvatarPrompt(p: AvatarParams): string {
  const sexLower = p.sex.toLowerCase();
  return [
    `Ultra-realistic studio portrait of a ${p.age} year old ${sexLower},`,
    `${p.ethnicity} ethnicity, ${p.bodyType.toLowerCase()} body type,`,
    `${p.skinTone.toLowerCase()} skin tone, ${p.eyeColor.toLowerCase()} eyes,`,
    `${p.hairColor.toLowerCase()} ${p.hairStyle.toLowerCase()} hair,`,
    `${p.expression.toLowerCase()} expression.`,
    `Professional UGC creator look, natural lighting, clean background,`,
    `high detail face, 4K portrait, photorealistic.`,
  ].join(" ");
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
        (resp as any).resultImageUrl,
        (resp as any).resultUrls,
        (resp as any).resultUrl,
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
        <SelectTrigger className="h-9 border-white/10 bg-white/[0.04] text-sm text-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-white/10 bg-[#111] text-white">
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-sm">{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function StudioAvatarPanel() {
  const { planId, current: creditsBalance, spendCredits } = useCreditsPlan();
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;

  const [params, setParams] = useState<AvatarParams>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  type Bill = { open: false } | { open: true; reason: "credits"; required: number };
  const [billing, setBilling] = useState<Bill>({ open: false });

  const credits = studioImageCreditsPerOutput({ studioModel: "pro", resolution: "1K" });

  const set = useCallback((key: keyof AvatarParams, value: string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const generate = useCallback(() => {
    const usingPersonalApi = isPersonalApiActive();
    if (!usingPersonalApi && creditsRef.current < credits) {
      setBilling({ open: true, reason: "credits", required: credits });
      return;
    }
    if (!usingPersonalApi) {
      spendCredits(credits);
      creditsRef.current = Math.max(0, creditsRef.current - credits);
    }

    const prompt = buildAvatarPrompt(params);
    const jobId = crypto.randomUUID();
    const label = `${params.sex} · ${params.age} · ${params.ethnicity}`;
    setBusy(true);

    const startedAt = Date.now();
    setHistoryItems((prev) => [
      { id: jobId, kind: "image", status: "generating", label, createdAt: startedAt },
      ...prev,
    ]);

    void (async () => {
      try {
        const pKey = getPersonalApiKey();
        const res = await fetch("/api/nanobanana/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountPlan: planId,
            prompt,
            model: "pro",
            aspectRatio: "3:4",
            resolution: "1K",
            numImages: 1,
            personalApiKey: pKey,
          }),
        });
        const json = (await res.json()) as { taskId?: string; taskIds?: string[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Generate failed");
        const tid = json.taskId ?? json.taskIds?.[0];
        if (!tid) throw new Error("No task id returned");
        toast.message("Avatar generation started");
        const urls = await pollNanoTask(tid, pKey);
        const doneAt = Date.now();
        setHistoryItems((prev) => {
          const rest = prev.filter((i) => i.id !== jobId);
          return [
            {
              id: `${jobId}-done-${doneAt}`,
              kind: "image",
              status: "ready",
              label,
              mediaUrl: urls[0],
              createdAt: doneAt,
            },
            ...rest,
          ];
        });
        toast.success("Avatar ready");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Generation failed";
        toast.error(msg);
        setHistoryItems((prev) => {
          const rest = prev.filter((i) => i.id !== jobId);
          return [
            { id: `${jobId}-err`, kind: "image", status: "failed", label: msg, errorMessage: msg, createdAt: Date.now() },
            ...rest,
          ];
        });
      } finally {
        setBusy(false);
      }
    })();
  }, [params, planId, credits, spendCredits]);

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
              <UserRound className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Create your avatar</h3>
              <p className="text-xs text-white/45">Configure appearance parameters, then generate with NanoBanana Pro.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
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

          <div className="flex items-center gap-3">
            <Button
              type="button"
              disabled={busy}
              onClick={generate}
              className="h-10 gap-2 rounded-xl border border-violet-400/30 bg-violet-500 px-5 text-sm font-bold text-white shadow-[0_4px_0_0_rgba(76,29,149,0.7)] hover:bg-violet-400"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate avatar
            </Button>
            <span className="text-xs text-white/35">{credits} credits</span>
          </div>
        </div>

        <div className="w-full lg:w-[360px] xl:w-[420px]">
          <StudioGenerationsHistory
            items={historyItems}
            empty={<p className="py-8 text-center text-xs text-white/30">Generated avatars will appear here.</p>}
            mediaLabel="Avatar"
          />
        </div>
      </div>

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/88 p-4 backdrop-blur-[2px]"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Avatar full view"
            className="max-h-[92vh] max-w-[min(100%,900px)] rounded-xl border border-violet-500/20 object-contain shadow-[0_0_60px_rgba(139,92,246,0.15)]"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}

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
    </>
  );
}

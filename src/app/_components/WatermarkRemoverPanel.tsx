"use client";

import { useCallback, useRef, useState } from "react";
import { useCreditsPlan, getPersonalApiKey, isPersonalApiActive } from "@/app/_components/CreditsPlanContext";
import { refundPlatformCredits } from "@/lib/refundPlatformCredits";
import { Droplets, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StudioOutputPane } from "@/app/_components/StudioEmptyExamples";
import { StudioGenerationsHistory } from "@/app/_components/StudioGenerationsHistory";
import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";
import { StudioBillingDialog } from "@/app/_components/StudioBillingDialog";

const WATERMARK_REMOVE_CREDITS = 10;

/** Must match server validation — KIE only accepts Sora share pages, not MP4 URLs. */
function isSoraShareUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && u.hostname.toLowerCase() === "sora.chatgpt.com";
  } catch {
    return false;
  }
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

  const [soraShareUrl, setSoraShareUrl] = useState("");
  const [historyItems, setHistoryItems] = useState<StudioHistoryItem[]>([]);
  type Bill = { open: false } | { open: true; required: number };
  const [billing, setBilling] = useState<Bill>({ open: false });

  const credits = WATERMARK_REMOVE_CREDITS;

  const generate = useCallback(() => {
    const url = soraShareUrl.trim();
    if (!url) {
      toast.error("Paste your Sora share link.");
      return;
    }
    if (!isSoraShareUrl(url)) {
      toast.error(
        "Use a Sora link only (https://sora.chatgpt.com/…). MP4 uploads are not supported by this KIE model.",
      );
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
  }, [soraShareUrl, credits, spendCredits, grantCredits]);

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
              Sora share link
            </p>
            <div className="rounded-2xl border border-white/10 bg-[#101014] p-4 space-y-3">
              <Label htmlFor="sora-watermark-url" className="text-xs text-white/45">
                Paste the public Sora 2 page URL
              </Label>
              <Input
                id="sora-watermark-url"
                value={soraShareUrl}
                onChange={(e) => setSoraShareUrl(e.target.value)}
                placeholder="https://sora.chatgpt.com/p/…"
                className="h-11 rounded-xl border-white/15 bg-[#0a0a0d] text-sm text-white placeholder:text-white/30"
              />
              <p className="text-[10px] leading-snug text-amber-200/70">
                KIE only accepts links from{" "}
                <span className="font-semibold text-amber-200/90">sora.chatgpt.com</span> — not MP4 files or Supabase
                URLs. The &quot;post is null&quot; error appears when the link is not a Sora share page.
              </p>
              <p className="text-[10px] leading-snug text-white/35">
                Docs:{" "}
                <a
                  href="https://docs.kie.ai/market/sora2/sora-watermark-remover"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
                >
                  Sora2 Watermark Remover
                </a>
              </p>
            </div>

            <Button
              type="button"
              disabled={!soraShareUrl.trim()}
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
                      Paste a Sora share link, then hit &quot;Remove watermark&quot;.
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

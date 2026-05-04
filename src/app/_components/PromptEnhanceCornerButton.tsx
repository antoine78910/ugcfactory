"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  dispatchAuthoritativeCreditBalance,
  useCreditsPlanOptional,
} from "@/app/_components/CreditsPlanContext";
import type { PromptEnhanceSurface } from "@/lib/promptEnhance";
import { PROMPT_ENHANCE_CREDITS } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onApply: (next: string) => void;
  surface: PromptEnhanceSurface;
  className?: string;
  disabled?: boolean;
};

function parseResponseBalance(json: { balance?: unknown } | null): number | null {
  const n = Number(json?.balance);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function PromptEnhanceCornerButton({ value, onApply, surface, className, disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const creditsCtx = useCreditsPlanOptional();
  const showCreditCost =
    creditsCtx == null ? true : creditsCtx.planId === "free" && !creditsCtx.isUnlimited;

  const run = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.message("Nothing to enhance", {
        description: "Add some prompt text first.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/studio/prompt-enhance", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, surface }),
      });
      const json = (await res.json().catch(() => null)) as {
        enhanced?: string;
        error?: string;
        balance?: unknown;
      } | null;

      if (!res.ok) {
        const balErr = parseResponseBalance(json);
        if (balErr !== null) {
          dispatchAuthoritativeCreditBalance(balErr);
        }
        toast.error("Enhance failed", {
          description: json?.error ?? (res.status === 402 ? "Not enough credits." : "Please try again."),
        });
        return;
      }

      const enhanced = typeof json?.enhanced === "string" ? json.enhanced.trim() : "";
      if (!enhanced) {
        toast.error("Enhance failed", { description: "Empty response." });
        return;
      }
      const balOk = parseResponseBalance(json);
      if (balOk !== null) {
        dispatchAuthoritativeCreditBalance(balOk);
      }
      onApply(enhanced);
      toast.success("Prompt enhanced");
    } catch (e) {
      toast.error("Enhance failed", {
        description: e instanceof Error ? e.message : "Network error.",
      });
    } finally {
      setBusy(false);
    }
  }, [value, surface, onApply]);

  const canClick = !disabled && !busy;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-[320] flex justify-end p-1.5",
        className,
      )}
    >
      <button
        type="button"
        disabled={!canClick}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void run();
        }}
        title={
          showCreditCost
            ? `Enhance with Claude Opus 4.7 (${PROMPT_ENHANCE_CREDITS} ${PROMPT_ENHANCE_CREDITS === 1 ? "credit" : "credits"})`
            : "Enhance with Claude Opus 4.7"
        }
        className="pointer-events-auto inline-flex items-center gap-1 rounded-lg border border-violet-400/35 bg-[#121218]/95 px-2 py-1 text-[10px] font-semibold text-violet-100 shadow-sm backdrop-blur-sm transition hover:border-violet-400/55 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
        )}
        <span>Enhance</span>
        {showCreditCost ? (
          <span className="tabular-nums text-white/50">
            {PROMPT_ENHANCE_CREDITS === 1 ? "1 credit" : `${PROMPT_ENHANCE_CREDITS} credits`}
          </span>
        ) : null}
      </button>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { Check, Coins, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccountPlanId } from "@/lib/subscriptionModelAccess";
import { formatDisplayCredits } from "@/lib/creditLedgerTicks";
import {
  listAllowedStudioImageModels,
  listAllowedStudioVideoEditPickers,
  listAllowedStudioVideoModels,
  minPlanForStudioImagePicker,
  minPlanForStudioVideo,
  minPlanForStudioVideoEditPicker,
  planDisplayName,
  studioImagePickerDisplayLabel,
  studioVideoDisplayLabel,
  studioVideoEditPickerDisplayLabel,
  upgradePlanMessage,
} from "@/lib/subscriptionModelAccess";

function creditLabel(n: number): string {
  return n === 1 ? "credit" : "credits";
}

export type StudioBillingVariant =
  | { kind: "plan"; blockedModelId: string }
  | { kind: "credits"; currentCredits: number; requiredCredits: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: AccountPlanId;
  /** Included models list: studio image vs video tab vs edit-video tab. */
  studioMode: "image" | "video" | "video_edit";
  variant: StudioBillingVariant;
};

export function StudioBillingDialog({ open, onOpenChange, planId, studioMode, variant }: Props) {
  const isPlan = variant.kind === "plan";
  const allowed =
    studioMode === "video"
      ? listAllowedStudioVideoModels(planId)
      : studioMode === "video_edit"
        ? listAllowedStudioVideoEditPickers(planId)
        : listAllowedStudioImageModels(planId);

  let title = "";
  let description: ReactNode = null;

  if (isPlan) {
    const blockedLabel =
      studioMode === "video"
        ? studioVideoDisplayLabel(variant.blockedModelId)
        : studioMode === "video_edit"
          ? studioVideoEditPickerDisplayLabel(variant.blockedModelId)
          : studioImagePickerDisplayLabel(variant.blockedModelId);
    const requiredPlan =
      studioMode === "video"
        ? minPlanForStudioVideo(variant.blockedModelId)
        : studioMode === "video_edit"
          ? minPlanForStudioVideoEditPicker(variant.blockedModelId)
          : minPlanForStudioImagePicker(variant.blockedModelId);
    const headline = upgradePlanMessage(requiredPlan, blockedLabel);
    title = "Model not included";
    description = headline || "This model requires a higher plan.";
  } else {
    const { currentCredits, requiredCredits } = variant;
    const shortfall = Math.max(0, requiredCredits - currentCredits);
    title = "Insufficient balance";
    description = (
      <>
        Add credits or upgrade to continue. You’re{" "}
        <span className="tabular-nums text-white/85">{formatDisplayCredits(shortfall)}</span>{" "}
        {creditLabel(shortfall)} short.
      </>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/70 backdrop-blur-[3px] transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[221] w-[min(92vw,400px)] max-h-[min(85vh,560px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#14141a] to-[#0a0a0e] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.04)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] data-[state=closed]:slide-out-to-bottom-1 data-[state=open]:slide-in-from-bottom-1 data-[state=open]:duration-200 data-[state=closed]:duration-150"
        >
          {isPlan ? (
            <div className="p-6">
              <Dialog.Title className="text-[17px] font-semibold tracking-tight text-white">{title}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-relaxed text-white/55">
                {description}
              </Dialog.Description>

              <div className="mt-5 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-3.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-violet-200/75">
                  On {planDisplayName(planId)}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-white/45">
                  Included in the{" "}
                  {studioMode === "video"
                    ? "video"
                    : studioMode === "video_edit"
                      ? "video edit"
                      : "image"}{" "}
                  studio:
                </p>
                <ul className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
                  {allowed.length ? (
                    allowed.map((name) => (
                      <li key={name} className="flex items-center gap-2.5 text-sm font-medium text-white/[0.92]">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-violet-400/25 bg-violet-500/15 text-violet-200">
                          <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                        </span>
                        <span className="min-w-0">{name}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-white/45">No models in this section on your plan.</li>
                  )}
                </ul>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 text-white/55 hover:bg-white/[0.06] hover:text-white"
                  >
                    Close
                  </Button>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    className="h-10 gap-2 rounded-xl border border-violet-400/35 bg-violet-500 text-white shadow-[0_0_24px_rgba(139,92,246,0.2)] hover:bg-violet-400"
                    asChild
                  >
                    <Link href="/subscription">
                      <Sparkles className="h-4 w-4 opacity-90" />
                      View plans
                    </Link>
                  </Button>
                </Dialog.Close>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <Coins className="h-5 w-5 text-violet-300/90" strokeWidth={1.75} aria-hidden />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <Dialog.Title className="text-[17px] font-semibold tracking-tight text-white">{title}</Dialog.Title>
                  <Dialog.Description className="mt-1.5 text-sm leading-relaxed text-white/50">
                    {description}
                  </Dialog.Description>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">Balance</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-white/95">
                    {formatDisplayCredits(variant.currentCredits)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/38">{creditLabel(variant.currentCredits)}</p>
                </div>
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.07] px-4 py-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-violet-200/70">Needed</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-violet-100">
                    {formatDisplayCredits(variant.requiredCredits)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-violet-200/45">{creditLabel(variant.requiredCredits)}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <span className="text-xs text-white/40">Current plan</span>
                <span className="text-sm font-medium text-white/90">{planDisplayName(planId)}</span>
              </div>

              <div className="mt-6 space-y-2">
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    className="h-11 w-full gap-2 rounded-xl border border-violet-400/35 bg-violet-500 text-[15px] font-semibold text-white shadow-[0_0_28px_rgba(139,92,246,0.22)] transition hover:bg-violet-400"
                    asChild
                  >
                    <Link href="/credits">
                      <Coins className="h-4 w-4 opacity-90" />
                      Buy credits
                    </Link>
                  </Button>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    className="h-10 w-full rounded-xl border border-white/[0.08] bg-transparent text-sm font-medium text-white/70 transition hover:bg-white/[0.05] hover:text-white"
                    asChild
                  >
                    <Link href="/subscription">View subscription plans</Link>
                  </Button>
                </Dialog.Close>
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 w-full text-sm text-white/45 hover:bg-white/[0.04] hover:text-white/70"
                  >
                    Close
                  </Button>
                </Dialog.Close>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** @deprecated Use StudioBillingDialog with variant plan; kept for quick imports */
export function StudioPlanUpgradeDialog({
  open,
  onOpenChange,
  planId,
  mode,
  blockedModelId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: AccountPlanId;
  mode: "image" | "video";
  blockedModelId: string;
}) {
  return (
    <StudioBillingDialog
      open={open}
      onOpenChange={onOpenChange}
      planId={planId}
      studioMode={mode}
      variant={{ kind: "plan", blockedModelId }}
    />
  );
}

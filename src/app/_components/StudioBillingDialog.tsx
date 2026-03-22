"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { Coins, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccountPlanId } from "@/lib/subscriptionModelAccess";
import {
  listAllowedStudioImageModels,
  listAllowedStudioVideoEditPickers,
  listAllowedStudioVideoModels,
  minPlanForStudioImage,
  minPlanForStudioVideo,
  minPlanForStudioVideoEditPicker,
  planDisplayName,
  studioImageDisplayLabel,
  studioVideoDisplayLabel,
  studioVideoEditPickerDisplayLabel,
  upgradePlanMessage,
} from "@/lib/subscriptionModelAccess";

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
          : studioImageDisplayLabel(variant.blockedModelId as "nano" | "pro");
    const requiredPlan =
      studioMode === "video"
        ? minPlanForStudioVideo(variant.blockedModelId)
        : studioMode === "video_edit"
          ? minPlanForStudioVideoEditPicker(variant.blockedModelId)
          : minPlanForStudioImage(variant.blockedModelId as "nano" | "pro");
    const headline = upgradePlanMessage(requiredPlan, blockedLabel);
    title = "Model not included";
    description = headline || "This model requires a higher plan.";
  } else {
    const { currentCredits, requiredCredits } = variant;
    title = "Not enough credits";
    description = (
      <>
        You have <strong className="text-white/90">{currentCredits}</strong>{" "}
        {currentCredits === 1 ? "credit" : "credits"}. This generation needs{" "}
        <strong className="text-white/90">{requiredCredits}</strong>{" "}
        {requiredCredits === 1 ? "credit" : "credits"}.
      </>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/75 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[221] w-[min(92vw,440px)] max-h-[min(85vh,560px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/12 bg-[#101014] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <Dialog.Title className="text-lg font-bold tracking-tight text-white">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-white/60">
            {description}
          </Dialog.Description>

          {!isPlan ? (
            <div className="mt-5 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200/90">
                Buy credits
              </p>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  className="h-11 w-full gap-2 border border-emerald-400/35 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                  asChild
                >
                  <Link href="/credits">
                    <Coins className="h-4 w-4 shrink-0" />
                    Buy credits
                  </Link>
                </Button>
              </Dialog.Close>
              <p className="text-[10px] leading-snug text-white/40">
                One-off packs — use right away on Free or stacked with a subscription.
              </p>
            </div>
          ) : null}

          {!isPlan ? (
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/35">
                Plans &amp; model access
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
          ) : null}

          <div
            className={
              isPlan
                ? "mt-5 rounded-xl border border-violet-500/25 bg-violet-500/[0.07] px-4 py-3"
                : "rounded-xl border border-violet-500/25 bg-violet-500/[0.07] px-4 py-3"
            }
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-200/90">
              On your current plan ({planDisplayName(planId)})
            </p>
            <p className="mt-2 text-xs text-white/50">
              You can use the following models in the{" "}
              {studioMode === "video"
                ? "video"
                : studioMode === "video_edit"
                  ? "video edit"
                  : "image"}{" "}
              studio:
            </p>
            <ul className="mt-3 space-y-2 border-t border-white/10 pt-3">
              {allowed.length ? (
                allowed.map((name) => (
                  <li
                    key={name}
                    className="flex items-center gap-2 text-sm font-medium text-white/90"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-300">
                      ✓
                    </span>
                    {name}
                  </li>
                ))
              ) : (
                <li className="text-sm text-amber-200/80">
                  No studio models in this section — upgrade your plan.
                </li>
              )}
            </ul>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="secondary"
                className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              >
                Close
              </Button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Button
                type="button"
                className="gap-2 bg-violet-500 text-white hover:bg-violet-400"
                asChild
              >
                <Link href="/subscription">
                  <Sparkles className="h-4 w-4" />
                  View plans
                </Link>
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** @deprecated Use StudioBillingDialog with variant plan — kept for quick imports */
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

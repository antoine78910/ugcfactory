"use client";

import { useMemo } from "react";
import { Dialog } from "radix-ui";
import { cn } from "@/lib/utils";

type Stage = "idle" | "scanning" | "finding_image" | "summarizing" | "writing_scripts" | "server_pipeline" | "ready" | "error";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function LinkToAdUrlFlowProgressOverlay({
  open,
  assetKind,
  stage,
  serverPipelineStepIndex,
}: {
  open: boolean;
  assetKind: "product" | "app";
  stage: Stage;
  serverPipelineStepIndex: number | null;
}) {
  const percent = useMemo(() => {
    if (!open) return 0;
    if (stage === "scanning") return 14;
    if (stage === "finding_image" || stage === "summarizing" || stage === "writing_scripts") return 28;
    if (stage === "server_pipeline") {
      const step = serverPipelineStepIndex ?? 0;
      return clamp(22 + Math.round((step / 4) * 72), 22, 96);
    }
    return 10;
  }, [open, stage, serverPipelineStepIndex]);

  const title = assetKind === "app" ? "Creating app" : "Creating product";
  const subtitle = "It takes a few seconds";

  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[230] bg-black/70 backdrop-blur-[6px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-[231] w-[min(92vw,20rem)] -translate-x-1/2 -translate-y-1/2 outline-none",
            "rounded-[1.35rem] border border-white/[0.08] bg-[#1a1b22] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <div className="flex flex-col items-center text-center">
            <div className="relative mx-auto h-[7.5rem] w-[7.5rem]">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden>
                <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r={r}
                  fill="none"
                  stroke="rgba(255,255,255,0.92)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${c}`}
                  className="transition-[stroke-dasharray] duration-500 ease-out"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums text-white">
                {percent}%
              </span>
            </div>
            <p className="mt-6 text-base font-bold text-white">{title}</p>
            <p className="mt-1.5 text-sm text-white/45">{subtitle}</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

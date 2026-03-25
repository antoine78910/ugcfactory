"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TextShimmer } from "@/components/ui/text-shimmer";

/** Matches {@link runInitialPipeline} order (extract → classify → brief → save → scripts → save). */
const STEPS = [
  "Fetch the store page",
  "Analyze product images",
  "Write brand brief (from the site)",
  "Generate 3 UGC script angles",
  "Save your project",
] as const;

type ScanStage =
  | "idle"
  | "scanning"
  | "finding_image"
  | "summarizing"
  | "writing_scripts"
  | "server_pipeline"
  | "ready"
  | "error";

type StepState = "done" | "active" | "pending";

function stepStateAt(
  index: number,
  stage: ScanStage,
  simulatedPipelineStep: number,
  realPipelineStep: number | null | undefined,
): StepState {
  if (stage === "scanning") {
    if (index === 0) return "active";
    return "pending";
  }
  if (stage === "finding_image") {
    if (index < 1) return "done";
    if (index === 1) return "active";
    return "pending";
  }
  if (stage === "summarizing") {
    if (index < 2) return "done";
    if (index === 2) return "active";
    return "pending";
  }
  if (stage === "writing_scripts") {
    if (index < 3) return "done";
    if (index === 3) return "active";
    return "pending";
  }
  if (stage === "server_pipeline") {
    const active =
      realPipelineStep != null && realPipelineStep >= 0 && realPipelineStep < STEPS.length
        ? realPipelineStep
        : simulatedPipelineStep;
    if (index < active) return "done";
    if (index === active) return "active";
    return "pending";
  }
  return "pending";
}

function progressPercent(states: StepState[]): number {
  let done = 0;
  for (let i = 0; i < states.length; i++) {
    if (states[i] === "done") done++;
    else if (states[i] === "active") {
      return Math.min(99, Math.round(((done + 0.45) / STEPS.length) * 100));
    }
  }
  return states.every((s) => s === "done") ? 100 : Math.round((done / STEPS.length) * 100);
}

type Props = {
  stage: ScanStage;
  isWorking: boolean;
  className?: string;
  /**
   * When `stage === "server_pipeline"`, checklist follows this index (real pipeline progress).
   * If omitted, falls back to a slow simulated advance (legacy).
   */
  serverPipelineStepIndex?: number | null;
};

/**
 * Checklist + progress bar; violet accent. Prefer passing `serverPipelineStepIndex` during initial pipeline.
 */
export function WebsiteScanChecklist({ stage, isWorking, className, serverPipelineStepIndex }: Props) {
  const [pipelineTick, setPipelineTick] = useState(0);
  const useRealSteps =
    stage === "server_pipeline" && serverPipelineStepIndex != null && serverPipelineStepIndex >= 0;

  useEffect(() => {
    if (stage !== "server_pipeline" || !isWorking) {
      setPipelineTick(0);
      return;
    }
    if (useRealSteps) {
      setPipelineTick(0);
      return;
    }
    setPipelineTick(0);
    const id = window.setInterval(() => {
      setPipelineTick((t) => Math.min(t + 1, STEPS.length - 1));
    }, 10_000);
    return () => window.clearInterval(id);
  }, [stage, isWorking, useRealSteps]);

  const states = useMemo(() => {
    return STEPS.map((_, i) => stepStateAt(i, stage, pipelineTick, serverPipelineStepIndex));
  }, [stage, pipelineTick, serverPipelineStepIndex]);

  const pct = useMemo(() => progressPercent([...states]), [states]);

  const show = isWorking && ["scanning", "finding_image", "summarizing", "writing_scripts", "server_pipeline"].includes(stage);
  if (!show) return null;

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-2xl border border-white/10 bg-[#101014] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
    >
      <ul className="space-y-2.5">
        {STEPS.map((label, i) => {
          const s = states[i];
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-700 ease-out",
                  s === "done" && "border-violet-400 bg-violet-500 text-black",
                  s === "active" && "border-violet-400/90 bg-violet-500/15 text-violet-200",
                  s === "pending" && "border-white/15 bg-transparent text-white/25",
                )}
                aria-hidden
              >
                {s === "done" ? (
                  <Check className="h-4 w-4" strokeWidth={2.75} />
                ) : s === "active" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-white/15" />
                )}
              </span>
              {s === "active" ? (
                <TextShimmer
                  as="span"
                  className="text-sm font-semibold leading-tight dark:[--base-color:rgba(210,200,255,0.55)] dark:[--base-gradient-color:#faf5ff]"
                  duration={2.2}
                  spread={1.4}
                >
                  {label}
                </TextShimmer>
              ) : (
                <span
                  className={cn(
                    "text-sm font-medium leading-tight transition-colors duration-700 ease-out",
                    s === "done" && "text-white/90",
                    s === "pending" && "text-white/38",
                  )}
                >
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 space-y-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-[width] duration-1000 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-center text-[11px] font-medium tabular-nums text-white/40">{pct}%</p>
      </div>
    </div>
  );
}

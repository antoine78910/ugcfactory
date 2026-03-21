"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Connecting to website",
  "Extracting product images",
  "Reading brand & product details",
  "Drafting UGC script angles",
  "Saving your project",
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
    if (index < simulatedPipelineStep) return "done";
    if (index === simulatedPipelineStep) return "active";
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
};

/**
 * Checklist + progress bar inspired by scan UIs; violet accent to match Link to Ad.
 * During `server_pipeline`, steps advance on a timer (no granular server events).
 */
export function WebsiteScanChecklist({ stage, isWorking, className }: Props) {
  const [pipelineTick, setPipelineTick] = useState(0);

  useEffect(() => {
    if (stage !== "server_pipeline" || !isWorking) {
      setPipelineTick(0);
      return;
    }
    setPipelineTick(0);
    const id = window.setInterval(() => {
      setPipelineTick((t) => Math.min(t + 1, STEPS.length - 1));
    }, 2600);
    return () => window.clearInterval(id);
  }, [stage, isWorking]);

  const states = useMemo(() => {
    return STEPS.map((_, i) => stepStateAt(i, stage, pipelineTick));
  }, [stage, pipelineTick]);

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
      <ul className="space-y-3">
        {STEPS.map((label, i) => {
          const s = states[i];
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300",
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
              <span
                className={cn(
                  "text-sm font-medium leading-tight transition-colors duration-300",
                  s === "done" && "text-white",
                  s === "active" && "text-white",
                  s === "pending" && "text-white/38",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 space-y-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-center text-[11px] font-medium tabular-nums text-white/40">{pct}%</p>
      </div>
    </div>
  );
}

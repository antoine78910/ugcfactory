"use client";

import { Fragment } from "react";
import { Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

const STEP_LABELS = ["Boutique", "Scripts", "Images", "Vidéo", "Kling"] as const;

export type LinkToAdUniverseStepperProps = {
  /** 1–5 = étape en cours, 6 = tout terminé */
  currentStep: number;
  step1Done: boolean;
  step2Done: boolean;
  step3Done: boolean;
  step4Done: boolean;
  step5Done: boolean;
};

export function LinkToAdUniverseStepper({
  currentStep,
  step1Done,
  step2Done,
  step3Done,
  step4Done,
  step5Done,
}: LinkToAdUniverseStepperProps) {
  const doneFlags = [step1Done, step2Done, step3Done, step4Done, step5Done];

  return (
    <div
      className="mb-6 rounded-2xl border border-violet-500/20 bg-gradient-to-b from-violet-500/[0.07] to-transparent px-2 py-4 sm:px-4"
      aria-label="Progression Link to Ad"
    >
      <div className="flex w-full items-start justify-center">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const done = doneFlags[i];
          const isCurrent = !done && currentStep === n;
          const isUpcoming = !done && currentStep !== n;

          return (
            <Fragment key={n}>
              {i > 0 ? (
                <div
                  className={cn(
                    "mx-0.5 mt-[17px] h-0.5 min-w-[8px] flex-1 max-sm:mx-0 sm:mt-[18px] sm:min-w-[12px]",
                    "rounded-full transition-colors duration-500 ease-out",
                    doneFlags[i - 1] ? "bg-emerald-500/55" : "bg-white/10",
                  )}
                  aria-hidden
                />
              ) : null}
              <div className="flex w-[3.25rem] shrink-0 flex-col items-center gap-1.5 sm:w-[4.5rem]">
                <motion.div
                  layout
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors duration-300 sm:h-10 sm:w-10 sm:text-sm",
                    done &&
                      "border-emerald-400/90 bg-emerald-500/20 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.2)]",
                    isCurrent &&
                      "border-violet-400 bg-violet-500/25 text-violet-100 shadow-[0_0_22px_rgba(139,92,246,0.45)]",
                    isUpcoming && "border-white/15 bg-white/[0.04] text-white/30",
                  )}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {done ? (
                      <motion.span
                        key="check"
                        initial={{ scale: 0.35, opacity: 0, rotate: -50 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 440, damping: 21 }}
                        className="flex items-center justify-center"
                      >
                        <Check className="h-4 w-4 text-emerald-300 sm:h-[18px] sm:w-[18px]" strokeWidth={2.75} aria-hidden />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="num"
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -3 }}
                        transition={{ duration: 0.2 }}
                      >
                        {n}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {isCurrent ? (
                    <motion.span
                      className="pointer-events-none absolute inset-0 rounded-full border border-violet-300/50"
                      initial={{ opacity: 0.55, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.4 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                    />
                  ) : null}
                </motion.div>
                <span
                  className={cn(
                    "text-center text-[9px] font-semibold uppercase leading-tight tracking-wide sm:text-[10px]",
                    done && "text-emerald-200/90",
                    isCurrent && "text-violet-200",
                    isUpcoming && "text-white/35",
                  )}
                >
                  {label}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

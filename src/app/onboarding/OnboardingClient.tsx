"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const WORK_TYPES = [
  { id: "agency", label: "Agency" },
  { id: "ecommerce_brand", label: "Ecommerce brand" },
  { id: "dropshipper", label: "Dropshipper" },
  { id: "freelancer", label: "Freelancer" },
  { id: "software", label: "Software / SaaS" },
  { id: "other", label: "Other" },
] as const;

const REFERRAL_SOURCES = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "google", label: "Google Search" },
  { id: "ai_llm", label: "AI / LLM" },
  { id: "twitter", label: "X / Twitter" },
  { id: "discord", label: "Discord" },
  { id: "youtube", label: "YouTube" },
  { id: "reddit", label: "Reddit" },
  { id: "word_of_mouth", label: "Word of mouth" },
  { id: "friend", label: "From a friend" },
  { id: "other", label: "Other" },
] as const;

type WorkType = (typeof WORK_TYPES)[number]["id"];
type ReferralSource = (typeof REFERRAL_SOURCES)[number]["id"];

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-all",
              i < step
                ? "border-violet-500 bg-violet-500 text-white"
                : i === step
                  ? "border-violet-400 bg-violet-500/20 text-violet-300"
                  : "border-white/15 bg-white/5 text-white/30",
            )}
          >
            {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={cn(
                "h-px w-8 transition-all",
                i < step ? "bg-violet-500" : "bg-white/10",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ChoiceButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-150",
        selected
          ? "border-violet-500 bg-violet-500/20 text-white shadow-[0_0_0_1px_rgba(139,92,246,0.4)]"
          : "border-white/12 bg-white/[0.04] text-white/65 hover:border-white/25 hover:bg-white/[0.07] hover:text-white/90",
      )}
    >
      {selected && (
        <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500">
          <Check className="h-2.5 w-2.5 text-white" />
        </span>
      )}
      {label}
    </button>
  );
}

export default function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [workType, setWorkType] = useState<WorkType | null>(null);
  const [referralSource, setReferralSource] = useState<ReferralSource | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!workType || !referralSource) return;
    setLoading(true);
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_type: workType, referral_source: referralSource }),
      });
    } catch {
      // non-blocking — proceed even if save fails
    }
    router.push("/setup");
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#050507] px-4 py-12 text-white">
      {/* Background glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[480px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute -left-32 top-1/3 h-56 w-56 rounded-full bg-indigo-600/8 blur-[80px]" />
        <div className="absolute -right-32 bottom-1/4 h-48 w-48 rounded-full bg-violet-700/8 blur-[80px]" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Logo / brand mark */}
        <div className="mb-10 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10 shadow-[0_0_30px_rgba(139,92,246,0.2)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4L12 20L20 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mb-6 flex justify-center">
              <StepIndicator step={step} total={2} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {step === 0 ? "Personalize your experience" : "Where did you hear about us?"}
            </h1>
            <p className="mt-2 text-sm text-white/45">
              {step === 0
                ? "Tell us a bit about yourself so we can tailor your experience."
                : "Help us understand how you found Youry."}
            </p>
          </div>

          {/* Step 0 — Work type */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="mb-4 text-center text-[13px] font-medium text-white/55">
                What best describes your work?
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {WORK_TYPES.map((w) => (
                  <ChoiceButton
                    key={w.id}
                    label={w.label}
                    selected={workType === w.id}
                    onClick={() => setWorkType(w.id)}
                  />
                ))}
              </div>

              <div className="mt-8">
                <button
                  type="button"
                  disabled={!workType}
                  onClick={() => setStep(1)}
                  className={cn(
                    "flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all",
                    workType
                      ? "bg-violet-500 text-white shadow-[0_6px_0_0_rgba(76,29,149,0.8)] hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.8)] active:translate-y-1 active:shadow-none"
                      : "cursor-not-allowed bg-white/8 text-white/30",
                  )}
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 1 — Referral source */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="flex flex-wrap justify-center gap-2">
                {REFERRAL_SOURCES.map((s) => (
                  <ChoiceButton
                    key={s.id}
                    label={s.label}
                    selected={referralSource === s.id}
                    onClick={() => setReferralSource(s.id)}
                  />
                ))}
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="h-12 rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-white/55 transition hover:bg-white/8 hover:text-white/75"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!referralSource || loading}
                  onClick={handleSubmit}
                  className={cn(
                    "flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all",
                    referralSource && !loading
                      ? "bg-violet-500 text-white shadow-[0_6px_0_0_rgba(76,29,149,0.8)] hover:bg-violet-400 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.8)] active:translate-y-1 active:shadow-none"
                      : "cursor-not-allowed bg-white/8 text-white/30",
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-white/25">
          You can skip this — it only helps us improve the product.
        </p>
      </div>
    </div>
  );
}

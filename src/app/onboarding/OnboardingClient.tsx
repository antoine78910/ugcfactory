"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronRight, Loader2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const DISCORD_INVITE_URL =
  process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim() || "https://discord.gg/youry";

const WORK_TYPES = [
  { id: "agency", label: "Agency" },
  { id: "ecommerce_brand", label: "Ecommerce brand" },
  { id: "dropshipper", label: "Dropshippers" },
  { id: "freelancer", label: "Freelancer" },
  { id: "software", label: "Software" },
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

const STEPPER_LABELS = ["Register", "Personalize", "Setup"] as const;

/** Three-step progress: Register done, Personalize current, Setup upcoming (matches reference). */
function OnboardingStepper() {
  return (
    <div className="mx-auto flex w-full max-w-md items-start justify-center sm:max-w-lg">
      {STEPPER_LABELS.map((label, i) => {
        const isDone = i === 0;
        const isCurrent = i === 1;
        const isPending = i === 2;
        const node = (
          <div className="flex w-[5.25rem] shrink-0 flex-col items-center gap-2.5 sm:w-28">
            <div
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full ring-4 transition-all duration-300",
                isDone && "bg-emerald-500 ring-emerald-500/20",
                isCurrent && "scale-110 bg-violet-500 ring-violet-500/25",
                isPending && "bg-white/20 ring-white/[0.06]",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.12em] sm:text-[11px]",
                isDone && "text-emerald-400/90",
                isCurrent && "text-violet-300",
                isPending && "text-white/30",
              )}
            >
              {label}
            </span>
          </div>
        );
        const line =
          i < STEPPER_LABELS.length - 1 ? (
            <div
              key={`line-${i}`}
              className={cn(
                "mx-1 mt-[3px] h-px w-8 shrink-0 self-start sm:mx-2 sm:mt-[4px] sm:w-14",
                i === 0 ? "bg-gradient-to-r from-emerald-500/45 to-violet-500/35" : "bg-white/[0.1]",
              )}
              aria-hidden
            />
          ) : null;
        return (
          <Fragment key={label}>
            {node}
            {line}
          </Fragment>
        );
      })}
    </div>
  );
}

function ChoicePill({
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
        "min-h-[44px] rounded-full border px-4 py-2.5 text-left text-[13px] font-medium transition-all duration-200",
        selected
          ? "border-violet-400/70 bg-violet-500/[0.18] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-white/[0.12] bg-transparent text-white/55 hover:border-white/22 hover:bg-white/[0.04] hover:text-white/80",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span>{label}</span>
        {selected ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white">
            <Check className="h-3 w-3" strokeWidth={2.5} />
          </span>
        ) : null}
      </span>
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
      /* non-blocking */
    }
    router.push("/setup");
  }

  return (
    <div className="relative min-h-[100dvh] bg-[#030304] text-white antialiased">
      {/* Subtle vignette — no heavy blobs for a cleaner “premium” feel */}
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(109,40,217,0.12),transparent_55%)]"
        aria-hidden
      />

      {/* Top nav — minimal, smooth */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#030304]/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-[3.75rem] sm:px-6">
          <Link
            href="/"
            className="group flex min-w-0 items-center gap-2 rounded-lg py-0.5 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-violet-500/50"
          >
            <Image
              src="/youry-logo.png"
              alt="Youry"
              width={174}
              height={52}
              className="h-7 w-auto max-w-[min(100%,9.5rem)] object-contain object-left sm:h-8"
              priority
            />
          </Link>

          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex max-w-[min(100%,14rem)] items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 transition hover:border-white/15 hover:bg-white/[0.06] sm:max-w-none sm:px-4"
          >
            <svg className="h-5 w-5 shrink-0 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.876 19.876 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            <span className="min-w-0 text-left">
              <span className="block text-[13px] font-bold leading-tight text-white">Discord</span>
              <span className="mt-0.5 flex items-center gap-0.5 text-[10px] font-medium text-white/40">
                <span className="truncate">Join the community</span>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              </span>
            </span>
          </a>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-lg px-4 pb-28 pt-10 sm:max-w-xl sm:px-6 sm:pt-14">
        <OnboardingStepper />

        <div className="mt-10 text-center sm:mt-12">
          <h1 className="text-[1.65rem] font-bold leading-[1.15] tracking-tight text-white sm:text-4xl sm:leading-[1.1]">
            {step === 0 ? "Personalize your Experience" : "Where did you hear about us?"}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-white/45 sm:text-[15px]">
            {step === 0
              ? "Let's start with what brought you here — tell us a bit about why you're using Youry and what you're hoping to get out of it."
              : "Help us understand how you discovered us so we can keep improving."}
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0c0c0f] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:mt-12 sm:p-8">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <p className="text-[13px] font-semibold text-white/75">
                  What best describes your work? <span className="text-violet-400/90">*</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {WORK_TYPES.map((w) => (
                    <ChoicePill
                      key={w.id}
                      label={w.label}
                      selected={workType === w.id}
                      onClick={() => setWorkType(w.id)}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={!workType}
                onClick={() => setStep(1)}
                className={cn(
                  "mt-2 flex h-[3.25rem] w-full items-center justify-center rounded-xl text-[15px] font-semibold tracking-wide transition-all duration-200",
                  workType
                    ? "bg-[#6d28d9] text-white shadow-[0_1px_0_rgba(255,255,255,0.08)_inset] hover:bg-[#7c3aed] active:scale-[0.99]"
                    : "cursor-not-allowed bg-white/[0.06] text-white/30",
                )}
              >
                Next
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-[13px] font-semibold text-white/75">
                  Where did you hear about us? <span className="text-violet-400/90">*</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {REFERRAL_SOURCES.map((s) => (
                    <ChoicePill
                      key={s.id}
                      label={s.label}
                      selected={referralSource === s.id}
                      onClick={() => setReferralSource(s.id)}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="h-[3.25rem] shrink-0 rounded-xl border border-white/[0.1] bg-transparent px-5 text-[14px] font-medium text-white/50 transition hover:border-white/18 hover:bg-white/[0.04] hover:text-white/75"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!referralSource || loading}
                  onClick={handleSubmit}
                  className={cn(
                    "flex h-[3.25rem] min-w-0 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-all duration-200",
                    referralSource && !loading
                      ? "bg-[#6d28d9] text-white shadow-[0_1px_0_rgba(255,255,255,0.08)_inset] hover:bg-[#7c3aed] active:scale-[0.99]"
                      : "cursor-not-allowed bg-white/[0.06] text-white/30",
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4 opacity-90" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-[12px] text-white/28">
          Optional — you can continue; this only helps us improve the product.
        </p>
      </main>

      {/* Floating support — discrete, matches reference vibe */}
      <Link
        href="/support"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#6d28d9] text-white shadow-[0_8px_32px_rgba(109,40,217,0.45)] transition hover:bg-[#7c3aed] hover:shadow-[0_10px_36px_rgba(109,40,217,0.5)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-400/60 sm:bottom-8 sm:right-8"
        aria-label="Support"
      >
        <MessageCircle className="h-5 w-5" strokeWidth={2} />
      </Link>
    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const OTHER_MAX_LEN = 160;

const WORK_TYPES = [
  { id: "agency", label: "Agency" },
  { id: "ecommerce_brand", label: "Ecommerce brand" },
  { id: "dropshipper", label: "Dropshippers" },
  { id: "software", label: "Software" },
  { id: "freelancer", label: "Freelancer" },
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

const chipBase =
  "px-4 py-2 rounded-lg border text-sm transition-all duration-200 ease-out";

const chipIdle = cn(
  chipBase,
  "cursor-pointer border-white/10 bg-white/[0.04] text-white/70",
  "hover:border-violet-500/35 hover:bg-white/[0.07] hover:text-white/90 hover:-translate-y-0.5",
);

const chipSelected = cn(
  chipBase,
  "cursor-pointer border-violet-400/45 bg-violet-500/10 text-white ring-1 ring-violet-400/20",
);

const chipDisabled = cn(
  chipBase,
  "cursor-not-allowed border-white/[0.06] bg-white/[0.02] text-white/35",
);

/** Primary CTA — matches landing “Get started” (page.tsx). */
const nextEnabledClass = cn(
  "h-11 w-full max-w-sm rounded-2xl border border-violet-200/40 bg-violet-400 text-sm font-semibold text-black",
  "shadow-[0_6px_0_0_rgba(76,29,149,0.9)] ring-offset-0 transition-all",
  "hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9),0_0_28px_rgba(167,139,250,0.45)]",
  "focus-visible:border-violet-400/45 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-violet-400/55",
  "active:translate-y-[4px] active:shadow-[0_2px_0_0_rgba(76,29,149,0.9)]",
);

const nextDisabledClass = cn(
  "h-11 w-full max-w-sm cursor-not-allowed rounded-2xl border border-white/10 bg-white/[0.05] text-sm font-semibold text-white/35",
);

function payloadWorkType(workType: WorkType, otherText: string): string {
  if (workType !== "other") return workType;
  const t = otherText.trim();
  return t.length ? `other:${t.slice(0, OTHER_MAX_LEN)}` : "other";
}

function payloadReferral(referral: ReferralSource, otherText: string): string {
  if (referral !== "other") return referral;
  const t = otherText.trim();
  return t.length ? `other:${t.slice(0, OTHER_MAX_LEN)}` : "other";
}

export default function OnboardingClient() {
  const router = useRouter();
  const [workType, setWorkType] = useState<WorkType | null>(null);
  const [workOtherText, setWorkOtherText] = useState("");
  const [referralSource, setReferralSource] = useState<ReferralSource | null>(null);
  const [referralOtherText, setReferralOtherText] = useState("");
  const [loading, setLoading] = useState(false);

  const workOtherOk = workType !== "other" || workOtherText.trim().length > 0;
  const referralOtherOk = referralSource !== "other" || referralOtherText.trim().length > 0;
  const canSubmit = Boolean(workType && referralSource && workOtherOk && referralOtherOk);

  async function handleSubmit() {
    if (!workType || !referralSource || !workOtherOk || !referralOtherOk) return;
    setLoading(true);
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_type: payloadWorkType(workType, workOtherText),
          referral_source: payloadReferral(referralSource, referralOtherText),
        }),
      });
    } catch {
      /* non-blocking */
    }
    router.push("/setup");
  }

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-[#050507] text-white antialiased selection:bg-violet-500/30">
      {/* Nav — same shell as landing (page.tsx header) */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#050507]/85 backdrop-blur-md supports-[backdrop-filter]:bg-[#050507]/20">
        <div className="mx-auto flex min-w-0 max-w-6xl items-center gap-3 px-5 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <Link
            href="/"
            className="flex shrink-0 items-center outline-none transition-opacity hover:opacity-95 focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-violet-400/50"
          >
            <Image
              src="/youry-logo.png"
              alt="Youry"
              width={174}
              height={52}
              className="h-11 w-auto sm:h-12 md:h-14"
              priority
            />
          </Link>
        </div>
      </header>

      <main className="relative mx-auto max-w-2xl overflow-visible px-5 pb-20 pt-6 sm:px-6 sm:pt-8">
        {/* Soft violet wash — same language as LP hero */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-0 h-[320px] w-[min(100vw,640px)] -translate-x-1/2 rounded-full bg-violet-600/[0.08] blur-[100px]"
          aria-hidden
        />

        <div className="relative z-10 mx-auto w-full max-w-2xl overflow-visible">
          <div className="mb-5 flex select-none items-center justify-center gap-2 text-xs text-white/40 sm:mb-6">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500/80" aria-hidden />
              <span>Register</span>
            </div>
            <div className="h-px w-10 shrink-0 bg-white/10" aria-hidden />
            <div className="flex items-center gap-2 text-violet-300/95">
              <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.55)]" aria-hidden />
              <span>Personalize</span>
            </div>
            <div className="h-px w-10 shrink-0 bg-white/10" aria-hidden />
            <div className="flex items-center gap-2 text-white/35">
              <span className="h-2 w-2 shrink-0 rounded-full bg-white/15" aria-hidden />
              <span>Setup</span>
            </div>
          </div>

          <div className="mb-5 text-center sm:mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-white md:text-2xl">
              Personalize your{" "}
              <span className="text-violet-400">Experience</span>
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55 sm:text-[15px]">
              Let&apos;s start with what brought you here — tell us a bit about why you&apos;re using Youry and what
              you&apos;re hoping to get out of it.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-violet-500/10 md:p-6">
            <div className="text-center">
              <div className="mb-3 text-sm text-white/45">What best describes your work? *</div>
              <div className="flex flex-wrap justify-center gap-2">
                {WORK_TYPES.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      setWorkType(w.id);
                      if (w.id !== "other") setWorkOtherText("");
                    }}
                    className={workType === w.id ? chipSelected : chipIdle}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              {workType === "other" ? (
                <div className="mx-auto mb-8 mt-3 max-w-md text-left">
                  <label htmlFor="onboarding-work-other" className="mb-1.5 block text-xs font-medium text-white/50">
                    Please specify
                  </label>
                  <Input
                    id="onboarding-work-other"
                    value={workOtherText}
                    onChange={(e) => setWorkOtherText(e.target.value.slice(0, OTHER_MAX_LEN))}
                    placeholder="e.g. Consultant, marketplace seller…"
                    className="h-11 border-white/15 bg-black/30 text-white placeholder:text-white/30 focus-visible:border-violet-400/50 focus-visible:ring-violet-400/30"
                    autoComplete="organization-title"
                  />
                </div>
              ) : (
                <div className="mb-8" />
              )}

              <div className="mb-4 text-sm text-white/45">Where did you hear about us? *</div>
              <div className="flex flex-wrap justify-center gap-2">
                {REFERRAL_SOURCES.map((s) => {
                  const locked = !workType;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        if (!locked) {
                          setReferralSource(s.id);
                          if (s.id !== "other") setReferralOtherText("");
                        }
                      }}
                      className={
                        locked
                          ? chipDisabled
                          : referralSource === s.id
                            ? chipSelected
                            : chipIdle
                      }
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {referralSource === "other" && workType ? (
                <div className="mx-auto mb-2 mt-3 max-w-md text-left">
                  <label htmlFor="onboarding-referral-other" className="mb-1.5 block text-xs font-medium text-white/50">
                    Please specify
                  </label>
                  <Input
                    id="onboarding-referral-other"
                    value={referralOtherText}
                    onChange={(e) => setReferralOtherText(e.target.value.slice(0, OTHER_MAX_LEN))}
                    placeholder="e.g. Podcast, newsletter, event…"
                    className="h-11 border-white/15 bg-black/30 text-white placeholder:text-white/30 focus-visible:border-violet-400/50 focus-visible:ring-violet-400/30"
                    autoComplete="off"
                  />
                </div>
              ) : null}

              <div className="mt-10 flex flex-col items-center justify-center">
                <button
                  type="button"
                  disabled={!canSubmit || loading}
                  onClick={handleSubmit}
                  className={cn(
                    "inline-flex items-center justify-center gap-2",
                    !canSubmit && nextDisabledClass,
                    !canSubmit && "opacity-60",
                    canSubmit && nextEnabledClass,
                    loading && canSubmit && "cursor-wait opacity-95",
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-black/70" aria-hidden />
                      <span className="text-black/80">Saving…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 shrink-0 text-black/80" aria-hidden />
                      Next
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

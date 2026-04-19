"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  "cursor-pointer border-white/15 bg-black/30 text-gray-200",
  "hover:bg-black/45 hover:border-white/30 hover:-translate-y-0.5",
);

const chipSelected = cn(
  chipBase,
  "cursor-pointer border-[#9541e0]/50 bg-black/40 text-white",
);

const chipDisabled = cn(
  chipBase,
  "cursor-not-allowed border-white/10 bg-black/20 text-gray-500",
);

export default function OnboardingClient() {
  const router = useRouter();
  const [workType, setWorkType] = useState<WorkType | null>(null);
  const [referralSource, setReferralSource] = useState<ReferralSource | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = Boolean(workType && referralSource);

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
    <div className="min-h-[100dvh] bg-black text-white antialiased selection:bg-[#9541e0]/30">
      <header className="border-b border-white/[0.06] bg-black/80 backdrop-blur-sm">
        <div className="mx-auto flex h-11 max-w-2xl items-center px-4 sm:h-12 sm:px-5">
          <Link href="/" className="inline-flex items-center opacity-90 transition hover:opacity-100">
            <Image
              src="/youry-logo.png"
              alt="Youry"
              width={140}
              height={42}
              className="h-6 w-auto object-contain object-left sm:h-7"
              priority
            />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl overflow-visible px-4 pb-16 pt-5 sm:px-5 sm:pt-6">
        <div className="mx-auto w-full max-w-2xl overflow-visible">
          {/* Stepper — compact, high on page (matches provided HTML) */}
          <div className="mb-5 flex select-none items-center justify-center gap-2 text-xs text-gray-500 sm:mb-6">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-green-500/70" aria-hidden />
              <span>Register</span>
            </div>
            <div className="h-px w-10 shrink-0 bg-white/10" aria-hidden />
            <div className="flex items-center gap-2 text-white">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#9541e0]" aria-hidden />
              <span>Personalize</span>
            </div>
            <div className="h-px w-10 shrink-0 bg-white/10" aria-hidden />
            <div className="flex items-center gap-2 text-gray-500">
              <span className="h-2 w-2 shrink-0 rounded-full bg-white/10" aria-hidden />
              <span>Setup</span>
            </div>
          </div>

          <div className="mb-5 text-center sm:mb-6">
            <h1 className="text-xl font-semibold text-white md:text-2xl">Personalize your Experience</h1>
            <p className="mt-2 text-sm text-gray-400">
              Let&apos;s start with what brought you here — tell us a bit about why you&apos;re using Youry and what
              you&apos;re hoping to get out of it.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 md:p-6">
            <div className="text-center">
              <div className="mb-3 text-sm text-gray-400">What best describes your work? *</div>
              <div className="mb-8 flex flex-wrap justify-center gap-2">
                {WORK_TYPES.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWorkType(w.id)}
                    className={workType === w.id ? chipSelected : chipIdle}
                  >
                    {w.label}
                  </button>
                ))}
              </div>

              <div className="mb-4 text-sm text-gray-400">Where did you hear about us? *</div>
              <div className="flex flex-wrap justify-center gap-2">
                {REFERRAL_SOURCES.map((s) => {
                  const locked = !workType;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={locked}
                      onClick={() => !locked && setReferralSource(s.id)}
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

              <div className="mt-10 flex flex-col items-center justify-center">
                <button
                  type="button"
                  disabled={!canSubmit || loading}
                  onClick={handleSubmit}
                  className={cn(
                    "h-11 w-full max-w-sm rounded-lg text-sm font-semibold text-white transition-none",
                    "bg-[#9541e0]",
                    canSubmit && !loading
                      ? "cursor-pointer hover:opacity-95 active:opacity-90"
                      : "cursor-not-allowed opacity-60",
                  )}
                >
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Saving…
                    </span>
                  ) : (
                    "Next"
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

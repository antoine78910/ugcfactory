"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ExternalLink, Play, X } from "lucide-react";

import { clippingBtnOutline, clippingBtnPrimary } from "@/lib/clippingUi";
import { studioAppPath, studioBrowserApiUrl } from "@/lib/studioAppOrigin";
import { CLIPPING_SIGNUP_REDIRECT_PATH } from "@/lib/analytics/clippingSignupRef";
import { cn } from "@/lib/utils";

import ltaTemplateToggle from "../images/lta-template-toggle.png";

const LTA_STUDIO_HOST = "app.youry.io/link-to-ad";
/** Fallback if static import path is ever bypassed (also at /lta-template-toggle.png). */
export const LTA_TOGGLE_SCREENSHOT_PUBLIC = "/lta-template-toggle.png";
const LTA_DEMO_VIDEO_URL =
  "https://drive.google.com/file/d/1cJzkvA81MIMt-bc0EDA2zEKAYygrsTQZ/view?usp=sharing";

type ClippingLinkToAdSignupDialogProps = {
  open: boolean;
  onClose: () => void;
};

function Step({
  index,
  title,
  children,
  isLast = false,
}: {
  index: number;
  title: string;
  children: ReactNode;
  isLast?: boolean;
}) {
  return (
    <li className="relative flex gap-4 pb-8 last:pb-0">
      {!isLast ? (
        <span
          className="absolute left-[13px] top-8 bottom-0 w-px bg-gradient-to-b from-violet-500/35 to-transparent"
          aria-hidden
        />
      ) : null}
      <span
        className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-violet-400/25 bg-violet-500/[0.08] text-[11px] font-semibold tabular-nums text-violet-200"
        aria-hidden
      >
        {index}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[13px] font-medium tracking-tight text-white">{title}</p>
        <div className="mt-2 space-y-2.5">{children}</div>
      </div>
    </li>
  );
}

export function ClippingLinkToAdSignupDialog({
  open,
  onClose,
}: ClippingLinkToAdSignupDialogProps) {
  const trackedRef = useRef(false);
  const [email, setEmail] = useState("");
  const [emailDone, setEmailDone] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      trackedRef.current = false;
      return;
    }
    if (trackedRef.current) return;
    trackedRef.current = true;
    void fetch(studioBrowserApiUrl("/api/clipping/signup-intent"), {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const signupHref = studioAppPath(
    `/signup?redirect=${encodeURIComponent(CLIPPING_SIGNUP_REDIRECT_PATH)}&source=clipping_template`,
  );
  const signinHref = studioAppPath(
    `/signin?redirect=${encodeURIComponent(CLIPPING_SIGNUP_REDIRECT_PATH)}&source=clipping_template`,
  );
  const ltaHref = studioAppPath("/link-to-ad");

  const onSubmitEmail = useCallback(() => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    setEmail(normalized);
    setEmailDone(true);

    void fetch(studioBrowserApiUrl("/api/clipping/request-template-access"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalized }),
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(json.error || "Could not save your email. Try again.");
        }
      })
      .catch((e) => {
        setEmailDone(false);
        setEmailError(e instanceof Error ? e.message : "Something went wrong.");
      });
  }, [email]);

  if (!open) return null;

  const ghostBtn = cn(clippingBtnOutline, "text-[13px]");
  const primaryBtn = cn(clippingBtnPrimary, "w-full text-[13px]");

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="clipping-lta-signup-title"
        className="relative max-h-[min(90vh,760px)] w-full max-w-[420px] overflow-hidden rounded-[1.35rem] border border-white/[0.08] bg-[#050507] shadow-[0_32px_100px_rgba(0,0,0,0.65),0_0_0_1px_rgba(167,139,250,0.06)_inset]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(ellipse_80%_70%_at_50%_-20%,rgba(139,92,246,0.18),transparent)]"
          aria-hidden
        />

        <div className="relative max-h-[min(90vh,760px)] overflow-y-auto overscroll-contain px-6 pb-6 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/35 transition hover:bg-white/[0.05] hover:text-white/70"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>

          <header className="pr-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-300/70">
              Link to Ad
            </p>
            <h2
              id="clipping-lta-signup-title"
              className="mt-2 text-[1.35rem] font-semibold leading-tight tracking-tight text-white"
            >
              Template access
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">
              A short path to the template toggle in Link to Ad.
            </p>
            <a
              href={LTA_DEMO_VIDEO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-500/[0.06] px-3.5 py-3 text-left transition hover:border-violet-400/35 hover:bg-violet-500/[0.1]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/25 text-violet-100">
                <Play className="size-4 fill-current" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-white">Watch the demo</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-white/45">
                  See how template access and recording work end to end.
                </span>
              </span>
              <ExternalLink className="ml-auto size-3.5 shrink-0 text-white/25" aria-hidden />
            </a>
          </header>

          <ol className="mt-7">
            <Step index={1} title="Start for free">
              <p className="text-[12px] leading-relaxed text-white/45">
                Create your Youry account. You&apos;ll land on Link to Ad after signup.
              </p>
              <Link href={signupHref} className={primaryBtn}>
                Start for free
                <ArrowRight className="size-3.5 opacity-80" aria-hidden />
              </Link>
              <p className="text-center text-[11px] text-white/30">
                Have an account?{" "}
                <Link href={signinHref} className="text-violet-300/90 hover:text-violet-200">
                  Sign in
                </Link>
              </p>
            </Step>

            <Step index={2} title="Confirm your email">
              <p className="text-[12px] leading-relaxed text-white/45">
                Come back here and submit the same email — we enable the template toggle
                automatically.
              </p>
              {emailDone ? (
                <div className="flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-3 py-2.5 text-[12px] text-violet-100/90">
                  <Check className="size-3.5 shrink-0 text-violet-300" aria-hidden />
                  <span className="truncate">
                    Enabled · <span className="font-medium text-white/90">{email}</span>
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onSubmitEmail();
                        }
                      }}
                      placeholder="you@email.com"
                      autoComplete="email"
                      disabled={emailDone}
                      className="min-w-0 flex-1 rounded-full border border-white/[0.08] bg-white/[0.02] px-3.5 py-2 text-[13px] text-white placeholder:text-white/25 focus:border-violet-400/30 focus:outline-none focus:ring-2 focus:ring-violet-500/15 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={onSubmitEmail}
                      disabled={emailDone || !email.trim()}
                      className={cn(ghostBtn, "shrink-0 px-3.5 disabled:cursor-not-allowed disabled:opacity-40")}
                    >
                      Next
                    </button>
                  </div>
                  {emailError ? (
                    <p className="text-[11px] text-violet-200/70">{emailError}</p>
                  ) : null}
                </>
              )}
            </Step>

            <Step index={3} title="Open the studio">
              <p className="text-[12px] leading-relaxed text-white/45">
                Pick a published template and follow the flow on camera.
              </p>
              <a
                href={ltaHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(ghostBtn, "w-full")}
              >
                {LTA_STUDIO_HOST}
                <ExternalLink className="size-3 opacity-60" aria-hidden />
              </a>
            </Step>

            <Step index={4} title="Template toggle" isLast>
              <p className="text-[12px] leading-relaxed text-white/45">
                Bottom right on Link to Ad — tap{" "}
                <span className="font-medium text-violet-200/90">Template</span> to begin.
              </p>
              <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-black/40 ring-1 ring-violet-400/15">
                <Image
                  src={ltaTemplateToggle}
                  alt="Template toggle at the bottom right of Link to Ad"
                  className="h-auto w-full object-cover object-right-bottom"
                  sizes="(max-width: 420px) 100vw, 420px"
                />
              </div>
            </Step>
          </ol>
        </div>
      </div>
    </div>
  );
}

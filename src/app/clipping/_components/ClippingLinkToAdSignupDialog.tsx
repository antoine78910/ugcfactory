"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ExternalLink, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { studioAppPath, studioBrowserApiUrl } from "@/lib/studioAppOrigin";
import { CLIPPING_SIGNUP_REDIRECT_PATH } from "@/lib/analytics/clippingSignupRef";

const LTA_STUDIO_HOST = "app.youry.io/link-to-ad";
const LTA_TOGGLE_SCREENSHOT = "/clipping/lta-template-toggle.png";

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
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailDone, setEmailDone] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [screenshotMissing, setScreenshotMissing] = useState(false);

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

  const onSubmitEmail = useCallback(async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailBusy(true);
    setEmailError(null);
    try {
      const res = await fetch(studioBrowserApiUrl("/api/clipping/request-template-access"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Could not save your email. Try again.");
      }
      setEmailDone(true);
      setEmail(normalized);
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setEmailBusy(false);
    }
  }, [email]);

  if (!open) return null;

  const ghostBtn =
    "inline-flex items-center justify-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/80 transition hover:border-violet-400/20 hover:bg-violet-500/[0.06] hover:text-white";
  const primaryBtn =
    "inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-violet-500 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_0_24px_rgba(139,92,246,0.22)] transition hover:bg-violet-400";

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
        className="relative max-h-[min(90vh,760px)] w-full max-w-[420px] overflow-hidden rounded-[1.35rem] border border-white/[0.06] bg-[#07050c] shadow-[0_32px_100px_rgba(0,0,0,0.65),0_0_0_1px_rgba(167,139,250,0.06)_inset]"
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
                      placeholder="you@email.com"
                      autoComplete="email"
                      disabled={emailBusy}
                      className="min-w-0 flex-1 rounded-full border border-white/[0.08] bg-white/[0.02] px-3.5 py-2 text-[13px] text-white placeholder:text-white/25 focus:border-violet-400/30 focus:outline-none focus:ring-2 focus:ring-violet-500/15 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => void onSubmitEmail()}
                      disabled={emailBusy || !email.trim()}
                      className={cn(
                        ghostBtn,
                        "shrink-0 rounded-full px-3.5 disabled:cursor-not-allowed disabled:opacity-40",
                      )}
                    >
                      {emailBusy ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        "Submit"
                      )}
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
              <div className="overflow-hidden rounded-xl ring-1 ring-violet-400/15">
                {!screenshotMissing ? (
                  <Image
                    src={LTA_TOGGLE_SCREENSHOT}
                    alt="Template toggle at the bottom right of Link to Ad"
                    width={800}
                    height={480}
                    className="h-auto w-full object-cover object-right-bottom"
                    onError={() => setScreenshotMissing(true)}
                  />
                ) : (
                  <div className="flex aspect-[5/3] items-center justify-center bg-violet-500/[0.04] px-4 text-center text-[11px] leading-relaxed text-white/30">
                    Add screenshot at{" "}
                    <code className="text-violet-300/60">public/clipping/lta-template-toggle.png</code>
                  </div>
                )}
              </div>
            </Step>
          </ol>
        </div>
      </div>
    </div>
  );
}

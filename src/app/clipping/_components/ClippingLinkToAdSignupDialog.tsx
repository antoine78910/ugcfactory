"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ExternalLink, Link2, Loader2, X } from "lucide-react";

import { studioAppPath, studioBrowserApiUrl } from "@/lib/studioAppOrigin";
import { CLIPPING_SIGNUP_REDIRECT_PATH } from "@/lib/analytics/clippingSignupRef";

const LTA_STUDIO_URL = "https://app.youry.io/link-to-ad";
const LTA_TOGGLE_SCREENSHOT = "/clipping/lta-template-toggle.png";

type ClippingLinkToAdSignupDialogProps = {
  open: boolean;
  onClose: () => void;
};

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
    }).catch(() => {
      /* best-effort attribution */
    });
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

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="clipping-lta-signup-title"
        className="relative max-h-[min(92vh,820px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/12 bg-[#0a0812] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden />
        </button>

        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-200">
          <Link2 className="size-3.5" aria-hidden />
          Link to Ad templates
        </div>

        <h2 id="clipping-lta-signup-title" className="pr-8 text-xl font-semibold text-white">
          Get access in 3 quick steps
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          Follow the steps below to unlock the Link to Ad template toggle and study winning ad flows.
        </p>

        <ol className="mt-5 space-y-4">
          <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300/80">Step 1</p>
            <p className="mt-1 text-sm font-medium text-white">Create your account</p>
            <p className="mt-1 text-xs leading-relaxed text-white/55">
              Start for free on Youry — you&apos;ll land on Link to Ad right after signup.
            </p>
            <Link
              href={signupHref}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              Start for free
              <ArrowRight className="size-4 opacity-80" aria-hidden />
            </Link>
            <p className="mt-2 text-center text-[11px] text-white/40">
              Already have an account?{" "}
              <Link href={signinHref} className="font-medium text-violet-300 hover:text-violet-200">
                Sign in
              </Link>
            </p>
          </li>

          <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-300/80">Step 2</p>
            <p className="mt-1 text-sm font-medium text-white">Come back here with your email</p>
            <p className="mt-1 text-xs leading-relaxed text-white/55">
              After signing up, enter the same email below. We enable template access automatically
              and track it in our admin panel.
            </p>
            {emailDone ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-100">
                <Check className="size-4 shrink-0" aria-hidden />
                <span>
                  Access enabled for <span className="font-semibold">{email}</span>
                </span>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
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
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-sky-400/40 focus:outline-none focus:ring-2 focus:ring-sky-500/25 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void onSubmitEmail()}
                  disabled={emailBusy || !email.trim()}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {emailBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    "Enable access"
                  )}
                </button>
              </div>
            )}
            {emailError ? (
              <p className="mt-2 text-xs text-red-300/90">{emailError}</p>
            ) : null}
          </li>

          <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Step 3</p>
            <p className="mt-1 text-sm font-medium text-white">Open Link to Ad</p>
            <p className="mt-1 text-xs leading-relaxed text-white/55">
              Go to the studio and pick a published template to follow on camera.
            </p>
            <a
              href={ltaHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/90 transition hover:bg-white/[0.08]"
            >
              Open {LTA_STUDIO_URL.replace(/^https:\/\//, "")}
              <ExternalLink className="size-3.5 opacity-70" aria-hidden />
            </a>
          </li>

          <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">Step 4</p>
            <p className="mt-1 text-sm font-medium text-white">Use the template toggle</p>
            <p className="mt-1 text-xs leading-relaxed text-white/55">
              You should now see the <span className="font-semibold text-white/80">Template</span>{" "}
              toggle at the bottom right of Link to Ad.
            </p>
            <div className="relative mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/50">
              {!screenshotMissing ? (
                <Image
                  src={LTA_TOGGLE_SCREENSHOT}
                  alt="Link to Ad template toggle at the bottom right of the screen"
                  width={800}
                  height={500}
                  className="h-auto w-full object-cover object-right-bottom"
                  onError={() => setScreenshotMissing(true)}
                />
              ) : (
                <div className="flex aspect-[16/10] items-center justify-center px-4 text-center text-xs leading-relaxed text-white/40">
                  Screenshot coming soon — add{" "}
                  <code className="rounded bg-white/10 px-1 text-white/60">
                    public/clipping/lta-template-toggle.png
                  </code>
                </div>
              )}
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}

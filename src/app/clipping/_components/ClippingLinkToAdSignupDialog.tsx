"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowRight, Link2, X } from "lucide-react";

import { studioAppPath, studioBrowserApiUrl } from "@/lib/studioAppOrigin";
import {
  CLIPPING_SIGNUP_REDIRECT_PATH,
} from "@/lib/analytics/clippingSignupRef";

type ClippingLinkToAdSignupDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function ClippingLinkToAdSignupDialog({
  open,
  onClose,
}: ClippingLinkToAdSignupDialogProps) {
  const trackedRef = useRef(false);

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

  if (!open) return null;

  const signupHref = studioAppPath(
    `/signup?redirect=${encodeURIComponent(CLIPPING_SIGNUP_REDIRECT_PATH)}&source=clipping_template`,
  );
  const signinHref = studioAppPath(
    `/signin?redirect=${encodeURIComponent(CLIPPING_SIGNUP_REDIRECT_PATH)}&source=clipping_template`,
  );

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
        className="relative w-full max-w-md rounded-2xl border border-white/12 bg-[#0a0812] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden />
        </button>

        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-200">
          <Link2 className="size-3.5" aria-hidden />
          Link to Ad
        </div>

        <h2 id="clipping-lta-signup-title" className="pr-8 text-xl font-semibold text-white">
          Create a free account to browse templates
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          Sign up to open published Link to Ad templates, walk through winning ad setups step by
          step, and land directly in the studio after registration.
        </p>

        <ul className="mt-4 space-y-2 text-xs text-white/55">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-bold text-sky-200">
              1
            </span>
            Pick a brand template from the library
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-bold text-sky-200">
              2
            </span>
            Follow products, angles, and scripts on camera
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-bold text-sky-200">
              3
            </span>
            Start clipping with proven ad flows
          </li>
        </ul>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={signupHref}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Create free account
            <ArrowRight className="size-4 opacity-80" aria-hidden />
          </Link>
          <p className="text-center text-xs text-white/45">
            Already have an account?{" "}
            <Link href={signinHref} className="font-medium text-violet-300 hover:text-violet-200">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  CREATOR_FORMATS_NOTICE_EVENT,
  EE_CREATOR_FORMATS_URL,
  type CreatorFormatsNoticeDetail,
} from "@/lib/creatorFormatsNotice";

/**
 * Same notice Ecom Efficiency shows creators who open a tool outside the format workflow.
 */
export default function CreatorFormatsNotice() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [redirectOnClose, setRedirectOnClose] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function handler(event: Event) {
      const detail = (event as CustomEvent<CreatorFormatsNoticeDetail>).detail;
      setRedirectOnClose(Boolean(detail?.redirectOnClose));
      setOpen(true);
    }
    window.addEventListener(CREATOR_FORMATS_NOTICE_EVENT, handler as EventListener);
    return () => window.removeEventListener(CREATOR_FORMATS_NOTICE_EVENT, handler as EventListener);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    if (redirectOnClose) router.replace("/workflow");
  }, [redirectOnClose, router]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.72)" }}
      role="presentation"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-formats-title"
        className="w-full max-w-md rounded-3xl border border-[#9541e0]/40 bg-[#0b0b0f] p-6 text-left text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-300">Creator tools</p>
        <h2 id="creator-formats-title" className="mt-2 text-xl font-bold text-white">
          Use Link to Ad and workflow templates
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-300">
          For the video formats, use only Link to Ad and the static workflow templates from the training course.
          The other tools are not part of the creator workflow. Open the{" "}
          <a
            href={EE_CREATOR_FORMATS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-purple-300 underline underline-offset-4"
          >
            formats
          </a>
          .
        </p>
        <button
          type="button"
          onClick={close}
          className="mt-6 h-11 w-full rounded-full border border-[#9541e0] font-bold text-white hover:brightness-110"
          style={{ backgroundImage: "linear-gradient(to bottom, #9541e0, #7c30c7)" }}
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}

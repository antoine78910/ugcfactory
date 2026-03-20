"use client";

import { Mail, MessageCircle } from "lucide-react";
import StudioShell from "@/app/_components/StudioShell";

const SUPPORT_EMAIL = "app@youry.io";
const MAILTO = `mailto:${SUPPORT_EMAIL}`;

export default function SupportPage() {
  return (
    <StudioShell>
      <div className="flex min-h-[calc(100vh-1px)] items-center justify-center px-6 py-12 md:px-10">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0a0a0a] px-8 py-12 text-center shadow-[0_0_60px_rgba(0,0,0,0.45)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/15 ring-1 ring-violet-500/25">
            <MessageCircle className="h-8 w-8 text-violet-400" strokeWidth={1.75} aria-hidden />
          </div>

          <h1 className="mt-8 text-2xl font-bold tracking-tight text-white sm:text-3xl">Need Help?</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#9ca3af] sm:text-base">
            We&apos;re here to assist you with any questions or concerns
          </p>

          <div className="mt-10 border-t border-white/10 pt-10">
            <h2 className="text-lg font-bold text-white sm:text-xl">Contact Support</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#9ca3af] sm:text-base">
              Send us an email and we&apos;ll get back to you as soon as possible
            </p>

            <a
              href={MAILTO}
              className="mt-8 inline-flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-base font-semibold text-violet-400 transition-colors hover:text-violet-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
            >
              <Mail className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
              {SUPPORT_EMAIL}
            </a>
          </div>

          <p className="mt-10 text-xs text-white/40 sm:text-sm">
            Response time: Usually within 24 hours
          </p>
        </div>
      </div>
    </StudioShell>
  );
}

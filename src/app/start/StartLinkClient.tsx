"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { DATAFAST_GOALS, trackDatafastGoal } from "@/lib/analytics/datafastGoals";
import { setStartLinkEntryCookie } from "@/lib/analytics/startLinkRef";
import { studioAppPath } from "@/lib/studioAppOrigin";

/**
 * Short link landing (youry.io/start): track visit, persist attribution, redirect to signup.
 */
export default function StartLinkClient() {
  useEffect(() => {
    setStartLinkEntryCookie();
    trackDatafastGoal(DATAFAST_GOALS.start_link_visit, { surface: "start" });

    const target = new URL(studioAppPath("/signup"));
    const qs = window.location.search;
    if (qs) {
      const incoming = new URLSearchParams(qs);
      incoming.forEach((value, key) => {
        if (!target.searchParams.has(key)) target.searchParams.set(key, value);
      });
    }

    window.location.replace(target.toString());
  }, []);

  return (
    <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-[#050507] text-white">
      <div className="flex flex-col items-center gap-3 text-white/50">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" aria-hidden />
        <p className="text-sm">Redirection…</p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import {
  useCreditsPlan,
  getPersonalApiKey,
  getPersonalPiapiApiKey,
} from "@/app/_components/CreditsPlanContext";
import { toast } from "sonner";

type RefundHint = { jobId: string; credits: number };

function applyRefundHints(
  hints: RefundHint[],
  grantCredits: (n: number) => void,
  creditsRef: { current: number },
) {
  for (const h of hints) {
    if (h.credits > 0) {
      grantCredits(h.credits);
      creditsRef.current += h.credits;
    }
  }
}

/** While jobs finish on KIE, refresh DB-backed items sooner so history UI does not lag. */
const POLL_INTERVAL_MS = 4500;

/**
 * Polls in-flight studio jobs (all library kinds) while the user navigates inside /app.
 * Hits the same Next.js origin as the UI (e.g. Vercel serverless `/api/...`). Railway is only involved
 * if you deploy the app there or point a cron job at that URL.
 */
export default function StudioGenerationsBackgroundPoll() {
  const { grantCredits, current: creditsBalance } = useCreditsPlan();
  const creditsRef = useRef(creditsBalance);
  creditsRef.current = creditsBalance;

  const grantRef = useRef(grantCredits);
  grantRef.current = grantCredits;

  useEffect(() => {
    const tick = () => {
      void (async () => {
        try {
          const res = await fetch("/api/studio/generations/poll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "all",
              personalApiKey: getPersonalApiKey() ?? undefined,
              piapiApiKey: getPersonalPiapiApiKey() ?? undefined,
            }),
          });
          if (!res.ok) return;
          const json = (await res.json()) as { refundHints?: RefundHint[] };
          const hints = json.refundHints ?? [];
          if (hints.length) {
            applyRefundHints(hints, grantRef.current, creditsRef);
            toast.message("Credits refunded", {
              description: "A studio generation failed after charge.",
            });
          }
        } catch {
          /* ignore */
        }
      })();
    };

    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return null;
}

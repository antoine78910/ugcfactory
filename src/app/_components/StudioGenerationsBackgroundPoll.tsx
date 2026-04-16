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
const UNAUTHORIZED_STREAK_THRESHOLD = 3;

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
    let stoppedForUnauthorized = false;
    let didNotifyUnauthorized = false;
    let unauthorizedStreak = 0;
    let id = 0;
    const tick = () => {
      if (stoppedForUnauthorized) return;
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
          if (res.status === 401) {
            unauthorizedStreak += 1;
            if (unauthorizedStreak >= UNAUTHORIZED_STREAK_THRESHOLD) {
              stoppedForUnauthorized = true;
              if (id) window.clearInterval(id);
              if (!didNotifyUnauthorized) {
                didNotifyUnauthorized = true;
                toast.error("Session expired", {
                  description: "Please sign in again to continue studio generations.",
                });
              }
            }
            return;
          }
          unauthorizedStreak = 0;
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
    id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return null;
}

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

/**
 * Active interval: while at least one job is in-flight, poll fast so the history flips from
 * "generating" to "ready" within a couple of seconds of provider completion.
 */
const POLL_INTERVAL_ACTIVE_MS = 4500;
/**
 * Idle interval: when zero in-flight rows exist for the user, the only reason to poll is to
 * notice new jobs created in another tab. 30 s is plenty for that and trims the serverless
 * load 6-7× compared to always-on 4.5 s polling.
 */
const POLL_INTERVAL_IDLE_MS = 30_000;
/**
 * Hidden tab: throttle further. The browser already coalesces setTimeout while the tab is
 * backgrounded, but being explicit here saves credits when a user leaves /app open.
 */
const POLL_INTERVAL_HIDDEN_MS = 60_000;
const UNAUTHORIZED_STREAK_THRESHOLD = 3;

/**
 * Polls in-flight studio jobs (all library kinds) while the user navigates inside /app.
 * The cadence adapts to the server's `hasInFlight` signal — fast while jobs are running,
 * 30 s otherwise. Hits the same Next.js origin as the UI (e.g. Vercel serverless `/api/...`).
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
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    /** Most recent server signal: true while at least one in-progress row exists. */
    let lastHasInFlight = true; // assume in-flight on mount so we tick fast initially

    const scheduleNext = (delayMs: number) => {
      if (cancelled || stoppedForUnauthorized) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, delayMs);
    };

    const nextInterval = () => {
      if (typeof document !== "undefined" && document.hidden) return POLL_INTERVAL_HIDDEN_MS;
      return lastHasInFlight ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS;
    };

    const tick = () => {
      if (cancelled || stoppedForUnauthorized) return;
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
              if (timer) {
                clearTimeout(timer);
                timer = null;
              }
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
          const json = (await res.json()) as {
            refundHints?: RefundHint[];
            hasInFlight?: boolean;
          };
          // Default to true when the field is absent (older server build) — keeps us in
          // fast cadence rather than silently stretching the poll to 30 s.
          lastHasInFlight = json.hasInFlight !== false;
          const hints = json.refundHints ?? [];
          if (hints.length) {
            applyRefundHints(hints, grantRef.current, creditsRef);
            toast.message("Credits refunded", {
              description: "A studio generation failed after charge.",
            });
          }
        } catch {
          /* network blip — keep cadence */
        } finally {
          scheduleNext(nextInterval());
        }
      })();
    };

    // Drop to fast cadence as soon as the tab becomes visible again (likely the user is
    // checking on a job they queued in another tab).
    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        scheduleNext(0);
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, []);

  return null;
}

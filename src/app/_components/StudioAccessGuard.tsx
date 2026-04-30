"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Elements, CardCvcElement, CardExpiryElement, CardNumberElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  dispatchSubscriptionRefresh,
  isCheckoutGracePeriodActive,
  useCreditsPlanOptional,
} from "@/app/_components/CreditsPlanContext";
import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";
import { isStudioToolPath } from "@/lib/studioPaths";
import { toast } from "sonner";

const CARD_INPUT_CLASS =
  "h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[16px] text-white";

type RecoveryIntentResponse = {
  data?: {
    clientSecret?: string;
    setupIntentId?: string;
    publishableKey?: string;
  };
  error?: string;
};

function PaymentRecoveryForm({
  clientSecret,
  onRecovered,
}: {
  clientSecret: string;
  onRecovered: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!stripe || !elements || submitting) return;
    const numberEl = elements.getElement(CardNumberElement);
    if (!numberEl) {
      toast.error("Card field not ready yet. Please try again.");
      return;
    }

    setSubmitting(true);
    try {
      const confirmed = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: numberEl,
        },
      });
      if (confirmed.error) throw new Error(confirmed.error.message || "Could not update card.");
      const setupIntentId = confirmed.setupIntent?.id;
      if (!setupIntentId) throw new Error("Missing setup intent id.");

      const res = await fetch("/api/stripe/subscription/payment-recovery/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupIntentId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not confirm payment recovery.");

      toast.success("Card updated. Retrying payment now.");
      onRecovered();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update card.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-violet-400/30 bg-[#0d1018] p-4 sm:p-5">
      <p className="text-lg font-bold text-white">Update your card to restore access</p>
      <p className="mt-1 text-xs text-white/60">Secure payment via Stripe.</p>

      <div className="mt-3 space-y-2.5">
        <div className={CARD_INPUT_CLASS}>
          <CardNumberElement
            options={{
              style: {
                base: {
                  color: "#ffffff",
                  fontSize: "16px",
                  "::placeholder": { color: "rgba(255,255,255,0.4)" },
                },
                invalid: { color: "#f87171" },
              },
            }}
          />
        </div>
        <div className={CARD_INPUT_CLASS}>
          <CardExpiryElement
            options={{
              style: {
                base: {
                  color: "#ffffff",
                  fontSize: "16px",
                  "::placeholder": { color: "rgba(255,255,255,0.4)" },
                },
                invalid: { color: "#f87171" },
              },
            }}
          />
        </div>
        <div className={CARD_INPUT_CLASS}>
          <CardCvcElement
            options={{
              style: {
                base: {
                  color: "#ffffff",
                  fontSize: "16px",
                  "::placeholder": { color: "rgba(255,255,255,0.4)" },
                },
                invalid: { color: "#f87171" },
              },
            }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting || !stripe || !elements}
        className="mt-4 h-11 w-full rounded-xl border border-violet-200/40 bg-violet-400 text-sm font-bold text-black shadow-[0_5px_0_0_rgba(76,29,149,0.9)] transition hover:-translate-y-[1px] hover:bg-violet-300 hover:shadow-[0_7px_0_0_rgba(76,29,149,0.9)] disabled:cursor-wait disabled:opacity-60"
      >
        {submitting ? "Updating card..." : "Update Card"}
      </button>
    </div>
  );
}

/**
 * Keeps users without an active $1 trial (with credits) or paid plan off studio tool routes.
 * They are sent to onboarding setup (paywall) instead.
 */
export function StudioAccessGuard() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const supabase = useSupabaseBrowserClient();
  const ctx = useCreditsPlanOptional();
  const [open, setOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const paymentIssue = ctx?.paymentIssue ?? null;
  const cardLabel = useMemo(() => {
    if (!paymentIssue?.last4) return "your card";
    return `your card ending in ${paymentIssue.last4}`;
  }, [paymentIssue?.last4]);

  useEffect(() => {
    if (!ctx) return;
    if (ctx.isUnlimited) return;
    if (ctx.studioAccessAllowed !== false) return;
    if (isCheckoutGracePeriodActive()) return;
    if (!isStudioToolPath(pathname)) return;
    if (ctx.paymentIssue) {
      setOpen(true);
      return;
    }
    router.replace("/onboarding?step=setup");
  }, [ctx, pathname, router]);

  useEffect(() => {
    if (!open || !paymentIssue || loadingIntent || clientSecret) return;
    setLoadingIntent(true);
    void (async () => {
      try {
        const res = await fetch("/api/stripe/subscription/payment-recovery/intent", {
          method: "POST",
          credentials: "include",
        });
        const json = (await res.json()) as RecoveryIntentResponse;
        if (!res.ok) throw new Error(json.error || "Could not initialize secure card form.");
        const secret = json.data?.clientSecret?.trim();
        const key = json.data?.publishableKey?.trim();
        if (!secret || !key) throw new Error("Missing Stripe client setup.");
        setClientSecret(secret);
        setStripePromise(loadStripe(key));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not initialize payment recovery.");
      } finally {
        setLoadingIntent(false);
      }
    })();
  }, [open, paymentIssue, loadingIntent, clientSecret]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      if (supabase) await supabase.auth.signOut();
    } catch {
      // Always continue to auth page so users are not blocked in recovery modal.
    } finally {
      window.location.href = "/auth";
    }
  }

  if (!open || !paymentIssue) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[3px]">
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-violet-400/20 bg-[#0a0c14] text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="p-4 sm:p-5">
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-3.5 sm:p-4">
            <h2 className="text-xl font-bold leading-tight text-white">
              Payment failed. Your account access is limited right now.
            </h2>
            <p className="mt-2 text-sm leading-snug text-white/85">
              We&apos;ve tried a number of times to charge {cardLabel}, but it just hasn&apos;t worked out.
              Add a valid card below to restart your subscription immediately.
            </p>
          </div>

          {clientSecret && stripePromise ? (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentRecoveryForm
                clientSecret={clientSecret}
                onRecovered={() => {
                  setOpen(false);
                  setClientSecret(null);
                  dispatchSubscriptionRefresh();
                }}
              />
            </Elements>
          ) : (
            <div className="mt-4 rounded-2xl border border-violet-400/25 bg-[#0d1018] p-4 text-sm text-white/70">
              {loadingIntent ? "Loading secure card form..." : "Could not load payment form. Please try again shortly."}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="mt-4 h-10 w-full rounded-lg border border-white/10 bg-white/[0.05] text-sm font-semibold text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </div>
    </div>
  );
}

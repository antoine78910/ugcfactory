"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isCheckoutGracePeriodActive,
  useCreditsPlanOptional,
} from "@/app/_components/CreditsPlanContext";
import { isStudioToolPath } from "@/lib/studioPaths";
import { openStripeBillingPortal } from "@/lib/stripe/openBillingPortalClient";
import { toast } from "sonner";

/**
 * Keeps users without an active $1 trial (with credits) or paid plan off studio tool routes.
 * They are sent to onboarding setup (paywall) instead.
 */
export function StudioAccessGuard() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const ctx = useCreditsPlanOptional();
  const [open, setOpen] = useState(false);
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

  if (!open || !paymentIssue) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[560px] overflow-hidden rounded-xl border border-white/15 bg-[#f4f4f6] text-[#202430] shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div className="max-h-[82vh] overflow-y-auto p-6 sm:p-8">
          <div className="rounded-xl bg-[#efeff2] p-4 sm:p-5">
            <h2 className="text-2xl font-bold leading-tight text-[#1f2430]">
              Hey. Your account access is limited right now.
            </h2>
            <p className="mt-3 text-lg leading-snug text-[#2a3040]">
              We&apos;ve tried a number of times to charge {cardLabel}, but it just hasn&apos;t worked out.
              You&apos;re not someone we want to lose, though.
            </p>
          </div>

          <div className="mt-6 rounded-3xl border-2 border-[#2c3340] bg-white p-5 sm:p-6">
            <p className="text-3xl font-extrabold text-[#262d3a]">Update your card to restore access.</p>
            <button
              type="button"
              onClick={() => {
                void openStripeBillingPortal().catch((e) => {
                  toast.error(e instanceof Error ? e.message : "Could not open billing portal");
                });
              }}
              className="mt-6 h-12 w-full rounded-xl bg-[#222838] text-xl font-semibold text-white transition hover:bg-[#1b2030]"
            >
              Update Card
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/auth";
            }}
            className="mt-6 h-11 w-full rounded-lg border border-[#d9dae0] bg-[#ececf0] text-lg font-semibold text-[#4a4f5c] transition hover:bg-[#e1e2e8]"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

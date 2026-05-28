import { marketingPageRootClassName } from "@/lib/youryFonts";
import { cn } from "@/lib/utils";

/** Root wrapper: Geist + dark canvas (matches main LP). */
export const clippingRootClassName = marketingPageRootClassName;

export const clippingPageClassName =
  "relative min-h-screen overflow-x-clip bg-[#050507] text-white antialiased selection:bg-violet-500/30";

/** Sticky nav shell (matches `/` header). */
export const clippingHeaderClassName =
  "sticky top-0 z-50 border-b border-white/[0.08] bg-[#050507]/85 backdrop-blur-md supports-[backdrop-filter]:bg-[#050507]/20";

export const clippingEyebrowClassName =
  "text-xs font-semibold uppercase tracking-[0.28em] text-violet-300/80";

export const clippingCardClassName =
  "rounded-2xl border border-white/[0.06] bg-white/[0.015] transition-all duration-300 hover:border-violet-500/20 hover:shadow-[0_0_40px_rgba(139,92,246,0.06)]";

export const clippingBadgeClassName =
  "inline-flex rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-200/95";

/** Primary CTA — violet pill with depth (LP “Get started”). */
export const clippingBtnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-2xl border border-violet-200/40 bg-violet-400 px-4 py-2 text-sm font-semibold text-black shadow-[0_6px_0_0_rgba(76,29,149,0.9)] ring-offset-0 transition-all hover:-translate-y-px hover:bg-violet-300 hover:shadow-[0_8px_0_0_rgba(76,29,149,0.9),0_0_28px_rgba(167,139,250,0.5)] focus-visible:border-violet-400/45 focus-visible:ring-violet-400/55 focus-visible:ring-[3px] active:translate-y-1.5 active:shadow-[0_0_0_0_rgba(76,29,149,0.9)]";

export const clippingBtnPrimarySm = cn(
  clippingBtnPrimary,
  "px-3 py-1.5 text-xs sm:py-2",
);

/** Secondary / outline control. */
export const clippingBtnOutline =
  "inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400/40";

export const clippingBtnOutlineSm = cn(clippingBtnOutline, "px-3 py-1.5 text-xs");

/** Nav text link. */
export const clippingNavLinkClassName = (active?: boolean) =>
  cn(
    "text-sm font-medium transition-colors",
    active ? "text-white" : "text-white/65 hover:text-white",
  );

export function clippingSectionTitle(className?: string) {
  return cn("text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl", className);
}

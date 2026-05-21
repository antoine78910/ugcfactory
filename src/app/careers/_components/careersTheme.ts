import { marketingPageRootClassName } from "@/lib/youryFonts";

/** Shared dark Youry branding for job pages and in-app application forms. */
export const careersTheme = {
  page: marketingPageRootClassName,
  header:
    "sticky top-0 z-20 border-b border-white/[0.08] bg-[#050507]/90 backdrop-blur-md supports-[backdrop-filter]:bg-[#050507]/75",
  footer: "border-t border-white/[0.08]",
  body: "text-white/75",
  muted: "text-white/55",
  hint: "text-white/45",
  heading: "text-white",
  card: "rounded-2xl border border-white/10 bg-white/[0.03]",
  cardDashed: "rounded-2xl border border-dashed border-white/15 bg-white/[0.02]",
  metaDivider: "border-b border-white/10",
  metaLabel: "text-xs font-semibold uppercase tracking-wide text-white/45",
  metaValue: "text-sm font-medium text-white/85",
  link: "font-medium text-violet-300 underline decoration-white/25 underline-offset-4 transition-colors hover:text-violet-200 hover:decoration-violet-300/60",
  btnPrimary:
    "rounded-xl bg-violet-600 text-white shadow-[0_0_24px_-8px_rgba(139,92,246,0.55)] hover:bg-violet-500",
  btnSecondary:
    "rounded-xl border border-white/15 bg-white/[0.05] text-white hover:bg-white/[0.08]",
  field:
    "border-white/15 bg-white/[0.04] text-white placeholder:text-white/30 focus-visible:border-violet-400/50 focus-visible:ring-violet-500/30",
  formRoot: "space-y-6 text-sm text-white/80 [&_label]:text-white/90",
  choiceSelected: "border-violet-400 bg-violet-600 text-white",
  choiceIdle:
    "border-white/15 bg-white/[0.04] text-white/80 hover:border-white/25 hover:bg-white/[0.07]",
  privacyFieldset: "rounded-xl border border-white/10 bg-white/[0.02] p-4",
  tabBar: "mb-8 flex gap-0 overflow-x-auto border-b border-white/10",
  tabActive: "border-violet-400 text-white",
  tabIdle: "border-transparent text-white/50 hover:text-white/80",
  error: "text-red-300",
} as const;

export const careersFormFieldClass = careersTheme.field;

/** Dark native selects: black dropdown surface on Windows/macOS. */
export const careersSelectFieldClass =
  "min-h-11 w-full max-w-md rounded-md border border-white/15 bg-[#050507] px-3 text-sm text-white [color-scheme:dark] focus-visible:border-violet-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30 [&>option]:bg-[#050507] [&>option]:text-white";

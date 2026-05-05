"use client";

import { Box, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

/** When true, Link to Ad allows App mode (screenshots + app-specific scripts). */
export const LINK_TO_AD_APP_OPTION_AVAILABLE = false;

export function LinkToAdAssetTypeSwitch({
  value,
  onChange,
  appAvailable = LINK_TO_AD_APP_OPTION_AVAILABLE,
}: {
  value: "product" | "app";
  onChange: (next: "product" | "app") => void;
  appAvailable?: boolean;
}) {
  const effectiveValue = appAvailable ? value : "product";
  const appDisabled = !appAvailable;
  return (
    <div className="relative h-[2.7rem] w-[10.75rem] shrink-0 overflow-hidden rounded-2xl border border-violet-400/30 bg-[#0f1016] p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.85),0_16px_30px_-14px_rgba(0,0,0,0.65)]">
      <div
        className={cn(
          "pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-[0.8rem] border border-violet-200/35 bg-[linear-gradient(145deg,rgba(196,181,253,0.28),rgba(139,92,246,0.06))] shadow-[0_0_18px_rgba(139,92,246,0.4),inset_0_0_12px_rgba(167,139,250,0.25)] transition-transform duration-300 ease-out",
          effectiveValue === "app" ? "translate-x-[calc(100%+0.25rem)]" : "translate-x-0",
        )}
      >
        <span className="pointer-events-none absolute left-[10%] top-0 h-px w-[80%] bg-gradient-to-r from-transparent via-white/85 to-transparent" />
      </div>
      <div className="relative z-10 flex h-full items-center">
        <button
          type="button"
          onClick={() => onChange("product")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold"
        >
          <Box className={cn("h-3.5 w-3.5 transition", effectiveValue === "product" ? "text-violet-50" : "text-white/45")} />
          <span className={cn("transition", effectiveValue === "product" ? "text-white" : "text-white/45")}>Product</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (appDisabled) return;
            onChange("app");
          }}
          disabled={appDisabled}
          aria-disabled={appDisabled}
          title={appDisabled ? "App support is coming soon." : undefined}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-xl px-2 text-xs font-semibold",
            appDisabled && "cursor-not-allowed opacity-70",
          )}
        >
          <Globe
            className={cn(
              "h-3.5 w-3.5 transition",
              !appDisabled && effectiveValue === "app" ? "text-violet-50" : "text-white/45",
            )}
          />
          <span
            className={cn(
              "transition",
              !appDisabled && effectiveValue === "app" ? "text-white" : "text-white/45",
            )}
          >
            App
          </span>
          {appDisabled ? (
            <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.05] px-1 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-white/45">
              Soon
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WebsiteScanLoaderProps = {
  /** Mot affiché avec l’effet « scan » (ex. Scan, Site…) */
  label?: string;
  /** Sous-texte descriptif (statut détaillé) */
  subtitle?: ReactNode;
  className?: string;
};

/**
 * Animation type « scan laser » sur le texte + barre verticale (inspiré loader scan),
 * couleurs violet / lilas (branding Link to Ad).
 */
export function WebsiteScanLoader({
  label = "Scan",
  subtitle,
  className,
}: WebsiteScanLoaderProps) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4", className)}>
      <div className="relative inline-block max-w-fit py-1">
        {/* Zone de déplacement des barres (hauteur ~ texte lg) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[3rem] overflow-visible">
          <div className="lta-website-scan-line-glow" aria-hidden />
          <div className="lta-website-scan-line-solid" aria-hidden />
        </div>
        <p
          className={cn(
            "relative z-[2] m-0 text-2xl font-semibold italic leading-tight tracking-tight sm:text-3xl",
            "text-[rgb(245,240,255)] transition-colors duration-300",
            "selection:bg-violet-500/30",
          )}
        >
          <span className="lta-website-scan-cut">{label}</span>
        </p>
      </div>
      {subtitle != null && subtitle !== "" ? (
        <div className="m-0 max-w-md text-xs leading-snug text-white/55 sm:text-sm sm:text-white/50">{subtitle}</div>
      ) : null}
    </div>
  );
}

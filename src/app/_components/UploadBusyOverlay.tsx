"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Semi-transparent overlay with spinner for file uploads (image/video preview underneath). */
export function UploadBusyOverlay({
  active,
  label = "Uploading…",
  className,
}: {
  active: boolean;
  label?: string;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[inherit] bg-black/55 backdrop-blur-[1.5px] transition-opacity duration-200 ease-out",
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-6 w-6 shrink-0 animate-spin text-violet-300 sm:h-7 sm:w-7" aria-hidden />
      {label ? (
        <span className="max-w-[92%] truncate px-1 text-center text-[10px] font-medium text-white/85">{label}</span>
      ) : null}
    </div>
  );
}

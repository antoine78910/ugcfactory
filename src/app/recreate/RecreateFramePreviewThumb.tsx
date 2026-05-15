"use client";

import { Clapperboard } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function FramePreviewThumb({
  url,
  alt,
  className,
  placeholder,
  fit = "contain",
}: {
  url?: string;
  alt: string;
  className?: string;
  placeholder?: ReactNode;
  fit?: "contain" | "cover";
}) {
  if (url?.trim()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        className={cn(fit === "contain" ? "object-contain" : "object-cover", className)}
      />
    );
  }
  return (
    <div className={cn("flex items-center justify-center bg-black/40 text-white/30", className)}>
      {placeholder ?? <Clapperboard className="size-8 opacity-40" />}
    </div>
  );
}

"use client";

import { useRef, type ChangeEvent } from "react";
import { ImagePlus, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RecreateFilePickProps = {
  accept: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  busy?: boolean;
  previewUrl?: string | null;
  fileName?: string | null;
  onPick: (file: File) => void;
  className?: string;
  variant?: "default" | "compact";
};

/** Hidden native file input + visible button (shadcn Input file styling is unreliable on dark UIs). */
export function RecreateFilePick({
  accept,
  label,
  hint,
  disabled,
  busy,
  previewUrl,
  fileName,
  onPick,
  className,
  variant = "default",
}: RecreateFilePickProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onPick(f);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled || busy}
        onChange={handleChange}
      />
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          className={cn(
            "rounded-lg border border-white/10 object-cover",
            variant === "compact" ? "h-20 w-full" : "aspect-video w-full max-h-36",
          )}
        />
      ) : null}
      <Button
        type="button"
        size={variant === "compact" ? "sm" : "default"}
        variant="secondary"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "w-full border-white/15 bg-white/10 text-white hover:bg-white/15",
          variant === "compact" && "h-8 text-xs",
        )}
      >
        {busy ? (
          <Loader2 className="mr-2 size-3.5 animate-spin" />
        ) : (
          <ImagePlus className="mr-2 size-3.5" />
        )}
        {busy ? "Uploading…" : label}
      </Button>
      {fileName ? <p className="truncate text-[10px] text-violet-200/90">{fileName}</p> : null}
      {hint ? <p className="text-[10px] leading-snug text-white/45">{hint}</p> : null}
    </div>
  );
}

"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  options: readonly string[];
  tickLabels: readonly string[];
  onChange: (value: string) => void;
  className?: string;
};

/**
 * 3-step discrete “slider” for Topaz upscale (video 1×/2×/4× or image 2K/4K/8K tiers).
 */
export function StudioUpscaleDiscreteSlider({ label, value, options, tickLabels, onChange, className }: Props) {
  const idx = Math.max(0, options.indexOf(value));
  const max = options.length - 1;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-white/45">{label}</Label>
      <div className="rounded-xl border border-white/10 bg-[#0a0a0d] px-2 py-2">
        <input
          type="range"
          aria-label={label}
          min={0}
          max={max}
          step={1}
          value={idx}
          onChange={(e) => {
            const i = Number(e.target.value);
            const next = options[i];
            if (next !== undefined) onChange(next);
          }}
          className={cn(
            "h-2 w-full cursor-pointer rounded-full bg-white/10",
            "accent-violet-500",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400 [&::-webkit-slider-thumb]:shadow-md",
            "[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-violet-400",
          )}
        />
        <div className="mt-1 flex justify-between gap-0.5 text-[10px] font-medium tabular-nums text-white/40">
          {tickLabels.map((t, i) => (
            <span
              key={`${t}-${i}`}
              className={cn("min-w-0 flex-1 text-center", i === idx ? "text-violet-300" : "")}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

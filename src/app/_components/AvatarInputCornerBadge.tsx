"use client";

import { User } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** When the slot already has a top-right label (e.g. “Optional”), place the badge on the left. */
  align?: "left" | "right";
  className?: string;
  /** Opens saved-avatar picker; click is isolated from the parent drop zone. */
  onClick?: () => void;
  disabled?: boolean;
};

const iconClass = "h-3.5 w-3.5 shrink-0";

/**
 * Compact saved-avatar hint on image drop zones (Motion Control character, Studio frames, etc.).
 */
export function AvatarInputCornerBadge({ align = "right", className, onClick, disabled }: Props) {
  const position = cn(
    "absolute top-1.5 z-[4] flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-[#08080c]/90 shadow-sm backdrop-blur-sm",
    align === "left" ? "left-1.5" : "right-1.5",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        disabled={disabled}
        className={cn(
          position,
          "pointer-events-auto text-white/85 transition",
          !disabled && "hover:border-violet-400/45 hover:bg-[#12121a]/95",
          disabled && "cursor-not-allowed opacity-45",
        )}
        title="Pick a saved avatar"
        aria-label="Pick a saved avatar"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }}
      >
        <User className={iconClass} aria-hidden />
      </button>
    );
  }

  return (
    <span
      className={cn(position, "pointer-events-none text-white/55")}
      title="You can pick a published avatar via “Upload my avatar” below"
      aria-hidden
    >
      <User className={iconClass} />
    </span>
  );
}

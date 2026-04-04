"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  /** When the slot already has a top-right label (e.g. “Optional”), place the badge on the left. */
  align?: "left" | "right";
  className?: string;
};

/**
 * Compact avatar-library hint on image drop zones (Motion Control character, Studio frames, etc.).
 */
export function AvatarInputCornerBadge({ align = "right", className }: Props) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1.5 z-[2] flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-[#08080c]/90 shadow-sm backdrop-blur-sm",
        align === "left" ? "left-1.5" : "right-1.5",
        className,
      )}
      title="You can pick a published avatar via “Upload my avatar” below"
      aria-hidden
    >
      <Image
        src="/icon.png"
        alt=""
        width={18}
        height={18}
        className="h-[18px] w-[18px] rounded object-cover opacity-95"
      />
    </span>
  );
}

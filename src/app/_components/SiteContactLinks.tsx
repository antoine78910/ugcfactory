import Link from "next/link";

import { cn } from "@/lib/utils";

import { DiscordIcon } from "./DiscordIcon";

export const DISCORD_INVITE_URL = "https://discord.gg/B3exbqPTJM";

type SiteContactLinksProps = {
  className?: string;
};

export function SiteContactLinks({ className }: SiteContactLinksProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <a
        href={DISCORD_INVITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-[#5865F2]"
      >
        <DiscordIcon className="h-3.5 w-3.5" />
        Discord
      </a>
      <span className="text-xs text-white/20" aria-hidden>
        ·
      </span>
      <Link
        href="/support"
        className="text-xs text-white/40 transition-colors hover:text-white/70"
      >
        Contact us
      </Link>
    </div>
  );
}

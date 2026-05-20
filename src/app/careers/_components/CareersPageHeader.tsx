import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { careersTheme } from "./careersTheme";

type CareersPageHeaderProps = {
  backHref?: string;
  backLabel?: string;
  backAriaLabel?: string;
  /** e.g. `max-w-5xl` or `max-w-4xl` */
  containerClassName?: string;
};

export function CareersPageHeader({
  backHref = "/",
  backLabel = "Back",
  backAriaLabel = "Back to home",
  containerClassName = "max-w-5xl",
}: CareersPageHeaderProps) {
  return (
    <header className={careersTheme.header}>
      <div
        className={cn(
          "mx-auto flex items-center px-4 py-3 sm:px-6",
          containerClassName,
        )}
      >
        <Link
          href={backHref}
          aria-label={backAriaLabel}
          className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          <span>{backLabel}</span>
        </Link>
      </div>
    </header>
  );
}

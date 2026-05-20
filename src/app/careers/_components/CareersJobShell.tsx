import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { careersTheme } from "./careersTheme";
import { CareersPageHeader } from "./CareersPageHeader";

export function CareersJobMetaCard({
  items,
}: {
  items: { title: string; value: ReactNode }[];
}) {
  return (
    <div className={cn(careersTheme.card, "p-1")}>
      {items.map((item, i) => (
        <div
          key={item.title}
          className={cn(
            "px-4 py-5",
            i < items.length - 1 && careersTheme.metaDivider,
          )}
        >
          <h2 className={cn("mb-1", careersTheme.metaLabel)}>{item.title}</h2>
          <div className={careersTheme.metaValue}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function CareersJobShell({
  title,
  titleAside,
  children,
}: {
  title: ReactNode;
  titleAside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={careersTheme.page}>
      <CareersPageHeader
        backHref="/careers"
        backLabel="All openings"
        backAriaLabel="Back to careers"
        containerClassName="max-w-6xl"
      />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-14">
        <h1 className="mb-10 text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
          {title}
          {titleAside ? (
            <span className="mt-1 block text-xl font-normal text-white/50 sm:inline sm:mt-0 sm:ml-2 sm:text-2xl">
              {titleAside}
            </span>
          ) : null}
        </h1>
        {children}
      </main>

      <footer className={careersTheme.footer}>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className={cn("text-center text-xs", careersTheme.hint)}>
            © {new Date().getFullYear()} Youry.{" "}
            <Link
              href="/careers"
              className="underline underline-offset-4 transition-colors hover:text-white/70"
            >
              All openings
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

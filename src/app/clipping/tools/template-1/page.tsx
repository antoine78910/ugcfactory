import type { Metadata } from "next";
import Link from "next/link";

import { ClippingSubpage } from "@/app/clipping/_components/ClippingShell";
import { CLIPPING_TOOLS_PATH } from "@/lib/clippingPaths";
import {
  clippingBtnOutlineSm,
  clippingBtnPrimarySm,
  clippingCardClassName,
} from "@/lib/clippingUi";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Clipping Template 1",
  description: "Template 1 for one-take clipping recording.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ClippingTemplateOnePage({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  const clipId = typeof searchParams?.id === "string" ? searchParams.id.trim() : "";
  const query = clipId ? `?id=${encodeURIComponent(clipId)}&template=classic` : "?template=classic";
  return (
    <ClippingSubpage
      eyebrow="Clipping"
      title="Template 1"
      description="One take · hook + split-screen template · auto export."
      maxWidth="max-w-4xl"
    >
      <article className={cn("p-5 sm:p-6", clippingCardClassName)}>
        <h2 className="text-base font-semibold tracking-tight text-white">How it works</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-white/60">
          <li>Record your hook with webcam first.</li>
          <li>Play your template video in split-screen for phase 2.</li>
          <li>Download a single merged file when export is done.</li>
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link href={`${CLIPPING_TOOLS_PATH}/studio${query}`} className={clippingBtnPrimarySm}>
            Start with Template 1
          </Link>
          <Link
            href={
              clipId
                ? `${CLIPPING_TOOLS_PATH}?id=${encodeURIComponent(clipId)}`
                : CLIPPING_TOOLS_PATH
            }
            className={clippingBtnOutlineSm}
          >
            Back to clipping tools
          </Link>
        </div>
      </article>
    </ClippingSubpage>
  );
}

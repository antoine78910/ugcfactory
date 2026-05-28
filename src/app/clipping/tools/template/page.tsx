import type { Metadata } from "next";
import Link from "next/link";

import { ClippingSubpage } from "@/app/clipping/_components/ClippingShell";
import { CLIPPING_TOOLS_PATH } from "@/lib/clippingPaths";
import {
  clippingBadgeClassName,
  clippingCardClassName,
  clippingStudioBtnOutline,
  clippingStudioBtnPrimary,
} from "@/lib/clippingUi";
import { cn } from "@/lib/utils";

type TemplateCard = {
  id: "classic" | "split_focus_bottom_webcam";
  title: string;
  description: string;
  layout: string;
};

const TEMPLATES: TemplateCard[] = [
  {
    id: "classic",
    title: "Template 1 — Classic split",
    description: "Webcam on top and uploaded template video on bottom during phase 2.",
    layout: "1:1",
  },
  {
    id: "split_focus_bottom_webcam",
    title: "Template 2 — Top template + bottom webcam",
    description:
      "Uploaded template video fills the top 3/4. Webcam stays in the bottom 1/4 with rounded corners and green-screen style panel.",
    layout: "3:4 + 1:4",
  },
];

export const metadata: Metadata = {
  title: "Clipping Templates",
  description: "Choose a clipping layout template.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ClippingTemplatePage({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  const clipId = typeof searchParams?.id === "string" ? searchParams.id.trim() : "";
  const clipSuffix = clipId ? `&id=${encodeURIComponent(clipId)}` : "";
  return (
    <ClippingSubpage
      eyebrow="Clipping studio"
      title="Choose a template"
      description="Pick the recording layout for your clipping sessions."
      maxWidth="max-w-5xl"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {TEMPLATES.map((template) => (
          <article key={template.id} className={cn("p-5 sm:p-6", clippingCardClassName)}>
            <div className={cn("mb-3", clippingBadgeClassName)}>{template.layout}</div>
            <h2 className="text-base font-semibold tracking-tight text-white">{template.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{template.description}</p>
            <div className="mt-5">
              <Link
                href={`${CLIPPING_TOOLS_PATH}/studio?template=${encodeURIComponent(template.id)}${clipSuffix}`}
                className={clippingStudioBtnPrimary}
              >
                Use this template
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-6">
        <Link
          href={
            clipId
              ? `${CLIPPING_TOOLS_PATH}/studio?id=${encodeURIComponent(clipId)}`
              : `${CLIPPING_TOOLS_PATH}/studio`
          }
          className={clippingStudioBtnOutline}
        >
          Back to clipping studio
        </Link>
      </div>
    </ClippingSubpage>
  );
}

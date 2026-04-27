import type { Metadata } from "next";
import Link from "next/link";

type TemplateCard = {
  id: "classic" | "split_focus_bottom_webcam";
  title: string;
  description: string;
  layout: string;
};

const TEMPLATES: TemplateCard[] = [
  {
    id: "classic",
    title: "Template 1 - Classic split",
    description: "Webcam on top and uploaded template video on bottom during phase 2.",
    layout: "1:1",
  },
  {
    id: "split_focus_bottom_webcam",
    title: "Template 2 - Top template + bottom webcam",
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
    <div className="min-h-screen w-full bg-gradient-to-b from-[#06050a] via-[#0a0612] to-[#050307] px-4 py-8 text-white sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/80">Clipping Studio</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Choose a template</h1>
          <p className="text-sm text-white/60">Pick the recording layout for your clipping sessions.</p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {TEMPLATES.map((template) => (
            <article
              key={template.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
            >
              <div className="mb-3 inline-flex rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-200/95">
                {template.layout}
              </div>
              <h2 className="text-base font-semibold text-white">{template.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{template.description}</p>
              <div className="mt-5 flex items-center gap-2">
                <Link
                  href={`/clipping?template=${encodeURIComponent(template.id)}${clipSuffix}`}
                  className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
                >
                  Use this template
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div>
          <Link
            href={clipId ? `/clipping?id=${encodeURIComponent(clipId)}` : "/clipping"}
            className="inline-flex items-center rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/[0.08]"
          >
            Back to clipping studio
          </Link>
        </div>
      </div>
    </div>
  );
}


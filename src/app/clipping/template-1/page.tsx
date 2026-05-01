import type { Metadata } from "next";
import Link from "next/link";

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
    <div className="min-h-screen w-full bg-gradient-to-b from-[#06050a] via-[#0a0612] to-[#050307] px-4 py-8 text-white sm:py-10">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/80">Clipping</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Template 1</h1>
          <p className="text-sm text-white/65">
            One take · hook + split-screen template · auto export.
          </p>
        </header>

        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
          <h2 className="text-base font-semibold text-white">How it works</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-white/70">
            <li>Record your hook with webcam first.</li>
            <li>Play your template video in split-screen for phase 2.</li>
            <li>Download a single merged file when export is done.</li>
          </ol>
          <div className="mt-5 flex items-center gap-2">
            <Link
              href={`/clipping/studio${query}`}
              className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
            >
              Start with Template 1
            </Link>
            <Link
              href={clipId ? `/clipping?id=${encodeURIComponent(clipId)}` : "/clipping"}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/[0.08]"
            >
              Back to clipping tools
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}

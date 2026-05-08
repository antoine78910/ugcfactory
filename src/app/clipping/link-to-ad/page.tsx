"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readLinkToAdTemplates, removeLinkToAdTemplate, type LinkToAdTemplateSummary } from "@/lib/linkToAdTemplates";
import { proxiedMediaSrc } from "@/lib/mediaProxyUrl";

export default function ClippingLinkToAdTemplatesPage() {
  const [templates, setTemplates] = useState<LinkToAdTemplateSummary[]>([]);

  useEffect(() => {
    setTemplates(readLinkToAdTemplates());
  }, []);

  const hasItems = useMemo(() => templates.length > 0, [templates]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#06050a] via-[#0a0612] to-[#050307] px-4 py-8 text-white sm:py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/80">Clipping</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Link to Ad templates</h1>
          <p className="max-w-3xl text-sm text-white/65">
            Templates published from My Projects. Open any template to continue from its Link to Ad run.
          </p>
        </header>

        {!hasItems ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center text-sm text-white/55">
            No Link to Ad templates yet. In My Projects, click the small Template button on the top-right of a card.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <article
                key={template.normalizedUrl}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
              >
                <div className="relative h-36 w-full overflow-hidden bg-[#100d17]">
                  {template.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proxiedMediaSrc(template.thumbUrl) || template.thumbUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-white/35">No preview</div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full border border-violet-400/25 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-100">
                    Link to Ad
                  </span>
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <p className="truncate text-sm font-semibold text-white">
                      {template.title?.trim() || template.storeUrl}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-white/45">{template.storeUrl}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/link-to-ad?project=${encodeURIComponent(template.sourceRunId)}`}
                      className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/[0.08]"
                    >
                      Open template
                    </Link>
                    <button
                      type="button"
                      onClick={() => setTemplates(removeLinkToAdTemplate(template.normalizedUrl))}
                      className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs font-semibold text-white/65 transition hover:text-white"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div>
          <Link
            href="/clipping"
            className="inline-flex items-center rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/[0.08]"
          >
            Back to clipping
          </Link>
        </div>
      </div>
    </div>
  );
}


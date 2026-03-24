"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Download, FolderOpen, Info, LayoutGrid, List, Loader2, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StudioHistoryMediaKind = "image" | "video" | "motion";

export type StudioHistoryItem = {
  id: string;
  kind: StudioHistoryMediaKind;
  status: "generating" | "ready" | "failed";
  /** Prompt or short description */
  label: string;
  mediaUrl?: string;
  /** Optional poster (e.g. motion reference) */
  posterUrl?: string;
  errorMessage?: string;
  /** Show “Credits refunded” pill (e.g. after a failed run) */
  creditsRefunded?: boolean;
  createdAt: number;
  /** When row comes from `studio_generations` (avatar, studio_image, …). */
  studioGenerationKind?: string;
};

function formatHistoryDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function groupByDate(items: StudioHistoryItem[]): { date: string; rows: StudioHistoryItem[] }[] {
  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
  const map = new Map<string, StudioHistoryItem[]>();
  for (const item of sorted) {
    const d = formatHistoryDate(item.createdAt);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(item);
  }
  const groups = [...map.entries()].map(([date, rows]) => ({ date, rows }));
  groups.sort((a, b) => (b.rows[0]?.createdAt ?? 0) - (a.rows[0]?.createdAt ?? 0));
  return groups;
}

type Props = {
  items: StudioHistoryItem[];
  empty: ReactNode;
  /** Shown in generating subtitle */
  mediaLabel?: string;
};

export function StudioGenerationsHistory({ items, empty, mediaLabel = "Generation" }: Props) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [zoom, setZoom] = useState(100);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const grouped = useMemo(() => groupByDate(items), [items]);

  const cardWidthClass =
    view === "grid"
      ? cn(
          "w-[min(100%,11.5rem)] shrink-0 sm:w-[min(100%,13rem)]",
          zoom <= 90 && "sm:w-[min(100%,11.5rem)]",
          zoom >= 110 && "sm:w-[min(100%,14.5rem)]",
        )
      : "w-full shrink-0";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top bar: History + view controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.08] px-3 py-2 text-sm font-semibold text-white"
          >
            <FolderOpen className="h-4 w-4 text-white/80" aria-hidden />
            History
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-white/35">
            <span className="hidden sm:inline">Zoom</span>
            <input
              type="range"
              min={85}
              max={115}
              step={5}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1 w-20 cursor-pointer accent-violet-400 sm:w-28"
            />
            <span className="tabular-nums text-white/45">{zoom}%</span>
          </label>
          <div className="flex rounded-lg border border-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "rounded-md p-2 transition",
                view === "list" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70",
              )}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn(
                "rounded-md p-2 transition",
                view === "grid" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70",
              )}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 flex min-h-[min(360px,50vh)] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 p-6">
          {empty}
        </div>
      ) : (
        <div className="mt-4 min-h-0 flex-1 space-y-8 overflow-y-auto pr-1">
          {grouped.map(({ date, rows }) => (
            <section key={date}>
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="inline-flex h-4 w-4 shrink-0 rounded border border-white/20 bg-white/[0.04]"
                  aria-hidden
                />
                <h3 className="text-sm font-semibold tracking-tight text-white/90">{date}</h3>
              </div>
              <div
                className={cn(
                  view === "grid"
                    ? "flex flex-wrap gap-4"
                    : "flex flex-col gap-4",
                )}
              >
                {rows.map((item) => (
                  <article
                    key={item.id}
                    className={cn(
                      "flex flex-col gap-2",
                      view === "list" && "sm:flex-row sm:items-stretch sm:gap-4",
                      cardWidthClass,
                    )}
                  >
                    <div
                      className={cn(
                        "group/media relative overflow-hidden rounded-xl border border-white/[0.12] bg-[#12121a] shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
                        view === "grid" ? "aspect-[9/16] w-full" : "aspect-[9/16] w-full sm:w-44 sm:shrink-0",
                      )}
                    >
                      {item.status === "generating" ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#1a1a24] to-[#0d0d12] p-3">
                          {item.posterUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.posterUrl}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover opacity-25"
                            />
                          ) : null}
                          <div className="absolute inset-0 animate-pulse bg-gradient-to-t from-violet-500/15 to-transparent" />
                          <Loader2 className="relative h-8 w-8 animate-spin text-violet-300" aria-hidden />
                          <p className="relative text-center text-[11px] font-medium leading-snug text-white/55">
                            {mediaLabel}…
                          </p>
                        </div>
                      ) : null}
                      {item.status === "failed" ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#14141c] p-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/40">
                            <X className="h-6 w-6 text-white/35" strokeWidth={2} />
                          </div>
                          <p className="text-center text-[11px] leading-snug text-white/45">
                            {item.errorMessage || "Generation failed"}
                          </p>
                        </div>
                      ) : null}
                      {item.status === "ready" && item.kind === "image" && item.mediaUrl ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setLightboxUrl(item.mediaUrl ?? null)}
                            className="block h-full w-full"
                            aria-label="Open image fullscreen"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.mediaUrl}
                              alt=""
                              className="h-full w-full object-cover object-center"
                            />
                          </button>
                          <a
                            href={`/api/download?url=${encodeURIComponent(item.mediaUrl)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/75 opacity-0 transition hover:bg-black/75 hover:text-white group-hover/media:opacity-100 focus-visible:opacity-100"
                            aria-label="Download image"
                            title="Download"
                          >
                            <Download className="h-4 w-4" aria-hidden />
                          </a>
                        </>
                      ) : null}
                      {item.status === "ready" && item.kind !== "image" && item.mediaUrl ? (
                        <div className="relative h-full w-full bg-black">
                          <video
                            src={item.mediaUrl}
                            className="h-full w-full object-cover"
                            controls
                            playsInline
                            preload="metadata"
                            poster={item.posterUrl}
                          />
                          <a
                            href={`/api/download?url=${encodeURIComponent(item.mediaUrl)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/75 opacity-0 transition hover:bg-black/75 hover:text-white group-hover/media:opacity-100 focus-visible:opacity-100"
                            aria-label="Download video"
                            title="Download"
                          >
                            <Download className="h-4 w-4" aria-hidden />
                          </a>
                          <div
                            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/50 via-transparent to-black/20"
                            aria-hidden
                          >
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-black shadow-lg ring-2 ring-black/20">
                              <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
                            </span>
                          </div>
                        </div>
                      ) : null}
                      {item.status === "ready" && !item.mediaUrl && item.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.posterUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "min-w-0 space-y-2",
                        view === "list" && "flex flex-1 flex-col justify-center py-1",
                      )}
                    >
                      <p className="line-clamp-2 text-xs leading-snug text-white/50">{item.label}</p>
                      {item.status === "failed" ? (
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/35 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-200/90">
                            <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                            Failed
                          </span>
                          {item.creditsRefunded ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                              <Info className="h-3 w-3" aria-hidden />
                              Credits refunded
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/90 p-4 backdrop-blur-[2px]"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen image preview"
        >
          <button
            type="button"
            className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white transition hover:bg-black/85"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxUrl(null);
            }}
            aria-label="Close fullscreen image"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Fullscreen generation preview"
            className="max-h-[92vh] max-w-[min(100%,1200px)] rounded-xl border border-violet-500/20 object-contain shadow-[0_0_60px_rgba(139,92,246,0.15)]"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}

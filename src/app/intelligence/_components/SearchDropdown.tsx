"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TTLookupResult } from "@/lib/intelligenceProvider";

type Props = {
  results: TTLookupResult[];
  highlightedIndex: number;
  onHighlight: (i: number) => void;
  onPick: (r: TTLookupResult) => void;
  onClose: () => void;
  emptyQuery: string | null;
};

export function SearchDropdown({
  results,
  highlightedIndex,
  onHighlight,
  onPick,
  onClose,
  emptyQuery,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      const target = e.target as Node;
      if (ref.current.contains(target)) return;
      // Walk up: if the click landed on the sibling search input/button (parent's children),
      // skip closing — the parent owns its own focus/keyboard cycle.
      const parent = ref.current.parentElement;
      if (parent && parent.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  if (results.length === 0 && !emptyQuery) return null;

  return (
    <div
      ref={ref}
      className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-80 overflow-y-auto rounded-xl border border-black/10 bg-white p-1 shadow-xl"
      role="listbox"
    >
      {results.length === 0 && emptyQuery ? (
        <div className="flex flex-col gap-1 px-3 py-3 text-xs text-neutral-600">
          <span>No brand found for &quot;{emptyQuery}&quot;.</span>
          <span className="text-neutral-400">Try a domain (e.g. nike.com).</span>
        </div>
      ) : (
        results.map((r, i) => {
          const logo = r.logo ?? r.logoUrl;
          const isOwn = r.type === "brandtracker";
          const activeAdsLabel =
            typeof r.activeAds === "number" && Number.isFinite(r.activeAds)
              ? `${r.activeAds} active ads`
              : null;
          return (
            <button
              key={`${r.type}:${r.id}`}
              role="option"
              aria-selected={i === highlightedIndex}
              onMouseEnter={() => onHighlight(i)}
              onClick={() => onPick(r)}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                i === highlightedIndex
                  ? "bg-violet-100 text-neutral-950"
                  : "text-neutral-800 hover:bg-neutral-50"
              }`}
            >
              <ResultIcon r={r} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{r.name}</span>
                <span className="truncate text-[11px] text-neutral-500">
                  {[r.domain ?? r.type, activeAdsLabel].filter(Boolean).join(" · ")}
                </span>
              </div>
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isOwn
                    ? "border-violet-300/60 bg-violet-50 text-violet-700"
                    : "border-neutral-200 bg-neutral-50 text-neutral-600"
                }`}
              >
                {isOwn ? "Tracker" : "Brand"}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}

function ResultIcon({ r }: { r: TTLookupResult }) {
  const [failed, setFailed] = useState(false);
  const favicon = useMemo(() => {
    const logo = (r.logo ?? r.logoUrl ?? "").trim();
    if (logo) return logo;
    const domain = (r.domain ?? "").trim();
    if (!domain) return "";
    // Cheap, reliable favicon endpoint (no CORS issues for <img>).
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
  }, [r.domain, r.logo, r.logoUrl]);

  if (!favicon || failed) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/10 bg-white text-xs font-bold text-neutral-500 shadow-[0_0_0_1px_rgba(0,0,0,0.04)_inset]">
        {r.name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={favicon}
      alt={r.name}
      className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-black/10 bg-white object-contain p-0.5 shadow-[0_0_0_1px_rgba(0,0,0,0.04)_inset]"
      onError={() => setFailed(true)}
    />
  );
}

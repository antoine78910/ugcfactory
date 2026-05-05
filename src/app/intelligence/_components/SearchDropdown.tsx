"use client";

import { useEffect, useRef } from "react";
import type { TTLookupResult } from "@/lib/trendtrack";

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
      className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-[#0b0912]/95 p-1 shadow-xl backdrop-blur"
      role="listbox"
    >
      {results.length === 0 && emptyQuery ? (
        <div className="flex flex-col gap-1 px-3 py-3 text-xs text-white/55">
          <span>No brand found for &quot;{emptyQuery}&quot;.</span>
          <span className="text-white/35">Try a domain (e.g. nike.com).</span>
        </div>
      ) : (
        results.map((r, i) => {
          const logo = r.logo ?? r.logoUrl;
          const isOwn = r.type === "brandtracker";
          return (
            <button
              key={`${r.type}:${r.id}`}
              role="option"
              aria-selected={i === highlightedIndex}
              onMouseEnter={() => onHighlight(i)}
              onClick={() => onPick(r)}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                i === highlightedIndex
                  ? "bg-violet-500/15 text-white"
                  : "text-white/80 hover:bg-white/5"
              }`}
            >
              {logo ? (
                <img
                  src={logo}
                  alt={r.name}
                  className="h-8 w-8 shrink-0 rounded-md bg-white/10 object-contain p-1"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-500/20 text-xs font-bold text-violet-300">
                  {r.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{r.name}</span>
                <span className="truncate text-[11px] text-white/40">
                  {r.domain ?? r.type}
                </span>
              </div>
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isOwn
                    ? "border-violet-300/35 bg-violet-500/15 text-violet-100"
                    : "border-white/10 bg-white/5 text-white/55"
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

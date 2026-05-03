"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdsStudioMentionEntry = {
  id: string;
  section: "attached" | "avatar";
  label: string;
  thumbnailUrl: string;
  /** Seedance @imageN token to insert */
  token: string;
};

export function filterAdsStudioMentionEntries(
  entries: AdsStudioMentionEntry[],
  filter: string,
): AdsStudioMentionEntry[] {
  const q = filter.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.label.toLowerCase().includes(q));
}

type Props = {
  open: boolean;
  entries: AdsStudioMentionEntry[];
  /** True if anything exists before filtering (for “No matches” vs “nothing available”). */
  hasAnySource: boolean;
  loadingAvatarLibrary: boolean;
  highlightedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (entry: AdsStudioMentionEntry) => void;
};

export function AdsStudioMentionMenu({
  open,
  entries,
  hasAnySource,
  loadingAvatarLibrary,
  highlightedIndex,
  onHighlight,
  onSelect,
}: Props) {
  if (!open) return null;

  if (entries.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 z-[100] mb-1 rounded-xl border border-white/12 bg-[#121218] px-3 py-2.5 text-sm text-white/55 shadow-[0_16px_48px_rgba(0,0,0,0.65)]">
        {loadingAvatarLibrary ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            Loading references…
          </span>
        ) : !hasAnySource ? (
          <span>
            Upload a Product, App, or Avatar reference above, or create avatars in Create → Avatar. You can also type
            tokens such as @image2 or @image3 manually.
          </span>
        ) : (
          <span>No matches.</span>
        )}
      </div>
    );
  }

  const attached = entries.filter((e) => e.section === "attached");
  const avatars = entries.filter((e) => e.section === "avatar");

  return (
    <div
      role="listbox"
      aria-label="Insert image reference"
      className="absolute bottom-full left-0 right-0 z-[100] mb-1 max-h-[min(280px,42vh)] overflow-hidden rounded-xl border border-white/12 bg-[#121218] shadow-[0_16px_48px_rgba(0,0,0,0.65)]"
    >
      <div className="max-h-[min(280px,42vh)] overflow-y-auto overscroll-contain studio-params-scroll px-1 py-2">
        {attached.length > 0 ? (
          <div className="mb-2">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">Attached</p>
            <ul className="space-y-0.5">
              {attached.map((e) => {
                const idx = entries.indexOf(e);
                return (
                  <li key={e.id}>
                    <MentionRow
                      entry={e}
                      active={idx === highlightedIndex}
                      onMouseEnter={() => onHighlight(idx)}
                      onPick={() => onSelect(e)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="flex items-center gap-1 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">
            <ChevronDown className="size-3 opacity-70" aria-hidden />
            Avatar library
          </p>
          {loadingAvatarLibrary ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-white/45">
              <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
              Loading…
            </div>
          ) : avatars.length === 0 ? (
            <p className="px-2 py-2 text-xs text-white/45">
              No library avatars yet. Create avatars in Create → Avatar.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {avatars.map((e) => {
                const idx = entries.indexOf(e);
                return (
                  <li key={e.id}>
                    <MentionRow
                      entry={e}
                      active={idx === highlightedIndex}
                      onMouseEnter={() => onHighlight(idx)}
                      onPick={() => onSelect(e)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MentionRow({
  entry,
  active,
  onMouseEnter,
  onPick,
}: {
  entry: AdsStudioMentionEntry;
  active: boolean;
  onMouseEnter: () => void;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-white/90 transition",
        active ? "bg-white/[0.08]" : "hover:bg-white/[0.06]",
      )}
      onMouseEnter={onMouseEnter}
      onMouseDown={(ev) => {
        ev.preventDefault();
        onPick();
      }}
    >
      <span className="relative size-9 shrink-0 overflow-hidden rounded-md border border-white/12 bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={entry.thumbnailUrl} alt="" className="size-full object-cover" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
      <span className="shrink-0 text-[10px] font-mono text-white/35">{entry.token}</span>
    </button>
  );
}

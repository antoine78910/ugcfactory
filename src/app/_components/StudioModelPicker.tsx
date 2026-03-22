"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Diamond,
  Lock,
  Search,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StudioModelPickerIcon =
  | "kling"
  | "seedance"
  | "sora"
  | "veo"
  | "image_pro"
  | "image_std"
  | "grok";

export type StudioModelPickerItem = {
  id: string;
  label: string;
  /** Shown under the title in the sheet / bar when `hideMeta` (or always in the list). */
  subtitle?: string;
  exclusive?: boolean;
  hasAudio?: boolean;
  resolution: string;
  durationRange: string;
  icon: StudioModelPickerIcon;
  searchText?: string;
};

/** Transparent PNGs in /public (see scripts/process-studio-model-logos.mjs). Veo uses the Google “G” mark. */
const STUDIO_MODEL_LOGO_SRC: Partial<Record<StudioModelPickerIcon, string>> = {
  kling: "/studio/model-logos/kling.png",
  seedance: "/studio/model-logos/seedance.png",
  sora: "/studio/model-logos/sora.png",
  veo: "/studio/model-logos/google.png",
  grok: "/studio/model-logos/grok.png",
};

function ModelGlyph({ icon, active }: { icon: StudioModelPickerIcon; active: boolean }) {
  const box =
    "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10";

  const logoSrc = STUDIO_MODEL_LOGO_SRC[icon];
  if (logoSrc) {
    return (
      <div
        className={cn(
          box,
          active ? "border-violet-400/45 bg-white/[0.08]" : "bg-white/[0.06]",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" className="h-[22px] w-[22px] object-contain" draggable={false} />
      </div>
    );
  }

  if (icon === "image_pro") {
    return (
      <div className={cn(box, active ? "border-violet-400/45 bg-violet-500/15" : "bg-white/[0.06]")}>
        <span className={cn("text-[11px] font-bold", active ? "text-violet-200" : "text-white/45")}>Pro</span>
      </div>
    );
  }
  return (
    <div className={cn(box, active ? "border-white/25 bg-white/10" : "bg-white/[0.06]")}>
      <span className={cn("text-[10px] font-semibold", active ? "text-white/90" : "text-white/45")}>Std</span>
    </div>
  );
}

function ModelPickerPanelBody({
  q,
  setQ,
  featuredTitle,
  filtered,
  value,
  isItemLocked,
  onLockedPick,
  pick,
  setOpen,
  variant = "dropdown",
  hideMeta = false,
  showSearch = true,
}: {
  q: string;
  setQ: (s: string) => void;
  featuredTitle: string;
  filtered: StudioModelPickerItem[];
  value: string;
  isItemLocked?: (id: string) => boolean;
  onLockedPick?: (id: string) => void;
  pick: (id: string) => void;
  setOpen: (o: boolean) => void;
  variant?: "dropdown" | "sheet";
  hideMeta?: boolean;
  showSearch?: boolean;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col", variant === "sheet" && "h-full")}>
      {showSearch ? (
        <div
          className={cn(
            "shrink-0 border-b border-white/10 p-2 pb-2",
            variant === "sheet" && "border-violet-500/15 px-4 pb-3 pt-4",
          )}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search models…"
              className={cn(
                "w-full rounded-xl border bg-black/40 py-2 pl-8 pr-3 text-sm text-white placeholder:text-white/35 focus:outline-none",
                variant === "sheet"
                  ? "border-white/12 focus:border-violet-400/45 focus:ring-2 focus:ring-violet-500/20"
                  : "border-white/10 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/25",
              )}
            />
          </div>
        </div>
      ) : null}
      {variant === "dropdown" && !hideMeta ? (
        <div className="shrink-0 px-2 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/85">✦ {featuredTitle}</p>
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <p className={cn("py-8 text-center text-sm text-white/45", variant === "sheet" ? "px-4" : "px-2")}>
          No models match.
        </p>
      ) : (
        <ul
          className={cn(
            "studio-params-scroll min-h-0 flex-1 overflow-y-auto pb-3",
            variant === "dropdown"
              ? cn("max-h-[min(52vh,20rem)] px-1", showSearch || !hideMeta ? "pt-1" : "pt-2")
              : cn("px-3", showSearch ? "pt-3" : "pt-4"),
          )}
        >
          {filtered.map((item) => {
            const selected = item.id === value;
            const locked = isItemLocked?.(item.id) ?? false;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (locked) {
                      setOpen(false);
                      setQ("");
                      onLockedPick?.(item.id);
                      return;
                    }
                    pick(item.id);
                  }}
                  className={cn(
                    "mb-1 flex w-full items-center gap-2.5 rounded-xl border px-2.5 text-left transition",
                    hideMeta ? "py-2" : "py-2.5",
                    selected
                      ? "border-violet-400/45 bg-violet-500/[0.12] shadow-[0_0_24px_rgba(139,92,246,0.1)]"
                      : "border-transparent bg-transparent hover:border-white/12 hover:bg-white/[0.06]",
                    locked && "opacity-55",
                  )}
                >
                  <ModelGlyph icon={item.icon} active={selected && !locked} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-white">{item.label}</span>
                      {item.exclusive ? (
                        <span className="shrink-0 rounded-md border border-violet-400/35 bg-violet-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-violet-200">
                          Exclusive
                        </span>
                      ) : null}
                      {!hideMeta && item.hasAudio ? (
                        <Volume2 className="h-3 w-3 shrink-0 text-emerald-400/70" aria-hidden />
                      ) : null}
                      {locked ? <Lock className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden /> : null}
                    </div>
                    {item.subtitle ? (
                      <p className="mt-0.5 text-[11px] leading-snug text-white/40">{item.subtitle}</p>
                    ) : null}
                    {!hideMeta ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-white/45">
                        <span className="inline-flex items-center gap-0.5">
                          <Diamond className="h-2.5 w-2.5" />
                          {item.resolution}
                        </span>
                        <span className="text-white/20">·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {item.durationRange}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  {selected && !locked ? <Check className="h-4 w-4 shrink-0 text-violet-300" strokeWidth={2.5} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type StudioModelPickerProps = {
  value: string;
  onChange: (id: string) => void;
  items: StudioModelPickerItem[];
  featuredTitle?: string;
  triggerClassName?: string;
  /** Narrow card beside the prompt (default) vs full-width row in the parameters block. */
  triggerVariant?: "card" | "bar";
  align?: "end" | "start";
  /** If true, row is dimmed; click calls `onLockedPick` instead of changing value. */
  isItemLocked?: (id: string) => boolean;
  onLockedPick?: (id: string) => void;
  /** Right sheet (default) vs legacy dropdown below trigger. */
  panelMode?: "sheet" | "dropdown";
  /**
   * Hide resolution / duration (and similar) in the trigger and list — use when the sidebar already shows those params.
   */
  hideMeta?: boolean;
};

export function StudioModelPicker({
  value,
  onChange,
  items,
  featuredTitle = "Featured models",
  triggerClassName,
  triggerVariant = "card",
  align = "end",
  isItemLocked,
  onLockedPick,
  panelMode = "sheet",
  hideMeta = false,
}: StudioModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => items.find((i) => i.id === value), [items, value]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) => {
      const hay = (i.searchText ?? `${i.label} ${i.resolution} ${i.durationRange}`).toLowerCase();
      return hay.includes(t);
    });
  }, [items, q]);

  useEffect(() => {
    if (!open || panelMode !== "dropdown") return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, panelMode]);

  useEffect(() => {
    if (!open || panelMode !== "sheet") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, panelMode]);

  const pick = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
      setQ("");
    },
    [onChange],
  );

  const isBar = triggerVariant === "bar";
  /** With hideMeta, skip search for short lists (params panel already focused). */
  const showSearch = !hideMeta || items.length > 8;

  return (
    <div
      ref={rootRef}
      className={cn("relative", isBar ? "w-full" : cn("shrink-0", align === "end" && "self-stretch"))}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "rounded-xl border border-white/15 bg-[#0a0a0d] text-left transition hover:border-violet-400/35 hover:bg-[#0e0e12]",
          open && "border-violet-400/55 ring-1 ring-violet-400/30 shadow-[0_0_24px_rgba(139,92,246,0.15)]",
          isBar
            ? cn(
                "flex w-full flex-row items-center justify-between gap-3 px-3 py-2.5",
                hideMeta ? "min-h-[48px]" : "min-h-[52px]",
              )
            : "flex h-full min-h-[100px] w-[min(100%,8.5rem)] flex-col justify-between gap-2 px-3 py-2.5",
          triggerClassName,
        )}
      >
        {isBar ? (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Model</span>
              {selected ? (
                <>
                  <ModelGlyph icon={selected.icon} active />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{selected.label}</span>
                    {hideMeta && selected.subtitle ? (
                      <span className="mt-0.5 block truncate text-[11px] text-white/40">{selected.subtitle}</span>
                    ) : null}
                    {!hideMeta ? (
                      <span className="mt-0.5 block truncate text-[11px] text-white/40">
                        {selected.resolution} · {selected.durationRange}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <span className="text-sm text-white/45">Choose a model…</span>
              )}
            </div>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-white/45 transition", open && "rotate-180")} />
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Model</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-white/45 transition", open && "rotate-180")} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              {selected ? (
                <>
                  <div className="flex items-center gap-2">
                    <ModelGlyph icon={selected.icon} active />
                    <span className="truncate text-sm font-semibold text-white">{selected.label}</span>
                  </div>
                  {!hideMeta ? (
                    <div className="flex flex-wrap gap-1">
                      <span className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white/55">
                        <Diamond className="h-2.5 w-2.5" />
                        {selected.resolution}
                      </span>
                      <span className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white/55">
                        <Clock className="h-2.5 w-2.5" />
                        {selected.durationRange}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : (
                <span className="text-sm text-white/45">Choose…</span>
              )}
            </div>
          </>
        )}
      </button>

      {open && panelMode === "dropdown" ? (
        <div
          className={cn(
            "absolute z-[80] mt-2 max-h-[min(70vh,28rem)] w-[min(calc(100vw-1.5rem),22rem)] overflow-hidden rounded-xl border border-white/10 bg-[#121214] p-2 shadow-[0_16px_48px_rgba(0,0,0,0.65)]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <ModelPickerPanelBody
            q={q}
            setQ={setQ}
            featuredTitle={featuredTitle}
            filtered={filtered}
            value={value}
            isItemLocked={isItemLocked}
            onLockedPick={onLockedPick}
            pick={pick}
            setOpen={setOpen}
            hideMeta={hideMeta}
            showSearch={showSearch}
          />
        </div>
      ) : null}

      {open && panelMode === "sheet" ? (
        <>
          <button
            type="button"
            aria-label="Close model list"
            className="fixed inset-0 z-[88] bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
            onClick={() => {
              setOpen(false);
              setQ("");
            }}
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="studio-model-sheet-title"
            className="fixed inset-y-0 right-0 z-[90] flex w-[min(100vw,24rem)] flex-col border-l border-violet-500/20 bg-[#06070d] shadow-[-16px_0_60px_rgba(0,0,0,0.55)] animate-in slide-in-from-right duration-300"
          >
            <div className="pointer-events-none absolute left-0 top-0 h-32 w-full bg-gradient-to-b from-violet-600/12 to-transparent" />
            <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0b0912]/95 px-4 py-3">
              <div>
                <p id="studio-model-sheet-title" className="text-sm font-bold tracking-tight text-white">
                  {hideMeta ? "Model" : "Models"}
                </p>
                {!hideMeta ? <p className="text-[11px] text-violet-300/70">{featuredTitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setQ("");
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70 transition hover:border-violet-400/35 hover:bg-violet-500/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <ModelPickerPanelBody
                q={q}
                setQ={setQ}
                featuredTitle={featuredTitle}
                filtered={filtered}
                value={value}
                isItemLocked={isItemLocked}
                onLockedPick={onLockedPick}
                pick={pick}
                setOpen={setOpen}
                variant="sheet"
                hideMeta={hideMeta}
                showSearch={showSearch}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Dark Radix Select — panel #121212, row highlight / selected #2a2a2a, check discret (ref. maquette). */
export const studioSelectContentClass =
  "rounded-lg border border-white/10 bg-[#121212] p-1 text-white shadow-[0_16px_48px_rgba(0,0,0,0.65)] !bg-[#121212]";

export const studioSelectItemClass =
  "relative cursor-default select-none rounded-lg py-2.5 pl-3 pr-10 text-sm text-white outline-none " +
  "focus:bg-[#2a2a2a] focus:text-white focus:outline-none " +
  "data-[highlighted]:bg-[#2a2a2a] data-[highlighted]:text-white " +
  "data-[state=checked]:bg-[#2a2a2a] " +
  "[&_[data-slot=select-item-indicator]_svg]:size-4 [&_[data-slot=select-item-indicator]_svg]:shrink-0 [&_[data-slot=select-item-indicator]_svg]:text-white/45";

/** Read-only row when only one backend model exists (e.g. Motion Control). */
export function StudioSingleModelCard({
  label,
  icon,
  resolution,
  durationRange,
  hint,
  /** Hide resolution/duration chips when those live in Parameters (e.g. Quality). */
  hideMeta,
}: {
  label: string;
  icon: StudioModelPickerIcon;
  resolution: string;
  durationRange: string;
  hint?: string;
  hideMeta?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/15 bg-[#0a0a0d] p-3">
      <div className="flex items-start gap-3">
        <ModelGlyph icon={icon} active />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Model</p>
          <p className="mt-0.5 text-sm font-semibold text-white">{label}</p>
          {!hideMeta ? (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white/55">
                <Diamond className="h-2.5 w-2.5" />
                {resolution}
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white/55">
                <Clock className="h-2.5 w-2.5" />
                {durationRange}
              </span>
            </div>
          ) : null}
          {hint ? <p className="mt-2 text-[10px] leading-snug text-white/40">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Diamond,
  Infinity as InfinityIcon,
  Lock,
  Search,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StudioModelPickerIcon = "kling" | "seedance" | "sora" | "veo" | "image_pro" | "image_std";

export type StudioModelPickerItem = {
  id: string;
  label: string;
  exclusive?: boolean;
  hasAudio?: boolean;
  resolution: string;
  durationRange: string;
  icon: StudioModelPickerIcon;
  searchText?: string;
};

function ModelGlyph({ icon, active }: { icon: StudioModelPickerIcon; active: boolean }) {
  const lime = active ? "text-[#c8f542]" : "text-white/40";
  const box = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10";

  if (icon === "kling") {
    return (
      <div className={cn(box, active ? "border-[#c8f542]/50 bg-[#c8f542]/12" : "bg-white/[0.06]")}>
        <InfinityIcon className={cn("h-5 w-5", lime)} strokeWidth={2.25} />
      </div>
    );
  }
  if (icon === "seedance") {
    return (
      <div className={cn(box, "gap-0.5", active ? "border-emerald-400/40 bg-emerald-500/10" : "bg-white/[0.06]")}>
        {[0.35, 0.65, 0.45].map((h, i) => (
          <span
            key={i}
            className={cn("w-1 rounded-sm", active ? "bg-emerald-300" : "bg-white/35")}
            style={{ height: `${h * 1.25}rem` }}
          />
        ))}
      </div>
    );
  }
  if (icon === "sora") {
    return (
      <div className={cn(box, active ? "border-sky-400/40 bg-sky-500/10" : "bg-white/[0.06]")}>
        <span className={cn("text-sm font-bold", active ? "text-sky-200" : "text-white/45")}>S</span>
      </div>
    );
  }
  if (icon === "veo") {
    return (
      <div className={cn(box, active ? "border-amber-400/40 bg-amber-500/10" : "bg-white/[0.06]")}>
        <span className={cn("text-sm font-bold", active ? "text-amber-200" : "text-white/45")}>V</span>
      </div>
    );
  }
  if (icon === "image_pro") {
    return (
      <div className={cn(box, active ? "border-[#c8f542]/50 bg-[#c8f542]/12" : "bg-white/[0.06]")}>
        <span className={cn("text-[11px] font-bold", active ? "text-[#d4ff8a]" : "text-white/45")}>Pro</span>
      </div>
    );
  }
  return (
    <div className={cn(box, active ? "border-white/25 bg-white/10" : "bg-white/[0.06]")}>
      <span className={cn("text-[10px] font-semibold", active ? "text-white/90" : "text-white/45")}>Std</span>
    </div>
  );
}

const panelClass =
  "z-[80] w-[min(calc(100vw-1.5rem),22rem)] rounded-xl border border-white/10 bg-[#121214] p-2 shadow-[0_16px_48px_rgba(0,0,0,0.65)]";

type StudioModelPickerProps = {
  value: string;
  onChange: (id: string) => void;
  items: StudioModelPickerItem[];
  featuredTitle?: string;
  triggerClassName?: string;
  align?: "end" | "start";
  /** If true, row is dimmed; click calls `onLockedPick` instead of changing value. */
  isItemLocked?: (id: string) => boolean;
  onLockedPick?: (id: string) => void;
};

export function StudioModelPicker({
  value,
  onChange,
  items,
  featuredTitle = "Featured models",
  triggerClassName,
  align = "end",
  isItemLocked,
  onLockedPick,
}: StudioModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

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
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
      setQ("");
    },
    [onChange],
  );

  return (
    <div ref={rootRef} className={cn("relative shrink-0", align === "end" && "self-stretch")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-full min-h-[100px] w-[min(100%,8.5rem)] flex-col justify-between gap-2 rounded-xl border border-white/15 bg-[#0a0a0d] px-3 py-2.5 text-left transition hover:border-violet-400/35 hover:bg-[#0e0e12]",
          open && "border-violet-400/50 ring-1 ring-violet-400/25",
          triggerClassName,
        )}
      >
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
            </>
          ) : (
            <span className="text-sm text-white/45">Choose…</span>
          )}
        </div>
      </button>

      {open ? (
        <div
          className={cn(
            "absolute mt-2 max-h-[min(70vh,28rem)] overflow-hidden rounded-xl",
            align === "end" ? "right-0" : "left-0",
            panelClass,
          )}
        >
          <div className="border-b border-white/10 p-2 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="h-9 w-full rounded-lg border border-white/10 bg-[#1a1a1e] pl-8 pr-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/20"
                autoFocus
              />
            </div>
          </div>
          <div className="px-2 pt-2">
            <p className="px-1 pb-1.5 text-[11px] font-medium text-white/40">✦ {featuredTitle}</p>
          </div>
          <ul className="studio-params-scroll max-h-[min(52vh,20rem)] overflow-y-auto px-1 pb-2">
            {filtered.map((item) => {
              const isSel = item.id === value;
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
                      "flex w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-left transition",
                      locked && "cursor-not-allowed opacity-55",
                      !locked && isSel && "bg-white/[0.08]",
                      !locked && !isSel && "hover:bg-white/[0.05]",
                    )}
                  >
                    <ModelGlyph icon={item.icon} active={isSel && !locked} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-white">{item.label}</span>
                        {locked ? (
                          <span className="inline-flex items-center gap-0.5 rounded-md border border-amber-500/35 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-200/95">
                            <Lock className="h-2.5 w-2.5" />
                            Plan
                          </span>
                        ) : null}
                        {item.hasAudio ? (
                          <Volume2 className="h-3.5 w-3.5 text-white/45" aria-label="Audio" />
                        ) : null}
                        {item.exclusive ? (
                          <span className="rounded-md bg-[#d4ff00] px-1.5 py-0.5 text-[9px] font-bold italic text-black">
                            EXCLUSIVE
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-black/35 px-1.5 py-0.5 text-[9px] font-medium text-white/50">
                          <Diamond className="h-2.5 w-2.5 text-white/40" />
                          {item.resolution}
                        </span>
                        <span className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-black/35 px-1.5 py-0.5 text-[9px] font-medium text-white/50">
                          <Clock className="h-2.5 w-2.5 text-white/40" />
                          {item.durationRange}
                        </span>
                      </div>
                    </div>
                    {isSel && !locked ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#c8f542]" strokeWidth={2.5} />
                    ) : locked ? (
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-white/35" strokeWidth={2.25} />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-white/40">No models match.</li>
            ) : null}
          </ul>
        </div>
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
}: {
  label: string;
  icon: StudioModelPickerIcon;
  resolution: string;
  durationRange: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/15 bg-[#0a0a0d] p-3">
      <div className="flex items-start gap-3">
        <ModelGlyph icon={icon} active />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Model</p>
          <p className="mt-0.5 text-sm font-semibold text-white">{label}</p>
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
          {hint ? <p className="mt-2 text-[10px] leading-snug text-white/40">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

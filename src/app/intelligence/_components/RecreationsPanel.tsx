"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog } from "radix-ui";
import { Loader2, Play, Trash2, X } from "lucide-react";
import { proxiedMediaSrc } from "@/lib/mediaProxyUrl";
import { cn } from "@/lib/utils";
import type { IntelligenceRecreation } from "@/app/api/intelligence/recreations/route";

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  } catch {
    return "";
  }
}

export function RecreationsPanel() {
  const [rows, setRows] = useState<IntelligenceRecreation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<IntelligenceRecreation | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/intelligence/recreations", { cache: "no-store" });
      const json = (await res.json().catch(() => [])) as unknown;
      if (Array.isArray(json)) setRows(json as IntelligenceRecreation[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const items = useMemo(() => rows.slice(0, 10), [rows]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">Recreations</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-[11px] font-semibold text-white/35 hover:text-white/70 transition"
          disabled={loading}
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/45">
          No recreations yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((r) => {
            const title =
              (r.sourceBrand ?? "").trim() ||
              (r.sourceHook ?? "").trim().slice(0, 28) ||
              (r.sourcePlatform ?? "").trim() ||
              "Recreation";
            const hasVideo = Boolean(r.outputVideoUrl && r.outputVideoUrl.trim());
            return (
              <div
                key={r.id}
                className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2"
              >
                <button
                  type="button"
                  disabled={!hasVideo}
                  onClick={() => setOpen(r)}
                  className={cn("min-w-0 flex-1 text-left", !hasVideo && "opacity-50 cursor-not-allowed")}
                  title={r.sourceHook ?? title}
                >
                  <div className="truncate text-[12px] font-semibold text-white/80">{title}</div>
                  <div className="truncate text-[10px] text-white/40">
                    {r.sourcePlatform ? `${r.sourcePlatform} · ` : ""}
                    {formatDateShort(r.createdAt)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(r)}
                  disabled={!hasVideo}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-white/60 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                  title="Open"
                >
                  <Play className="h-3.5 w-3.5 translate-x-[1px]" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={deletingId === r.id}
                  onClick={async () => {
                    setDeletingId(r.id);
                    try {
                      await fetch(`/api/intelligence/recreations/${encodeURIComponent(r.id)}`, { method: "DELETE" });
                      setRows((prev) => prev.filter((x) => x.id !== r.id));
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-white/55 opacity-0 transition hover:bg-white/[0.06] hover:text-white group-hover:opacity-100 disabled:opacity-40"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog.Root open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[90] w-[min(980px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[#0b0912] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-sm font-semibold text-white/90">
                  {open?.sourceBrand || "Recreation"}
                </Dialog.Title>
                <Dialog.Description className="truncate text-[11px] text-white/45">
                  {open?.sourceHook || ""}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/[0.06] hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </Dialog.Close>
            </div>
            <div className="p-4">
              {open?.outputVideoUrl ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  src={proxiedMediaSrc(open.outputVideoUrl) || open.outputVideoUrl}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="max-h-[76vh] w-full rounded-xl bg-black object-contain"
                />
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
                  Missing video URL.
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}


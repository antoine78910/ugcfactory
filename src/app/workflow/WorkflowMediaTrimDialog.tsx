"use client";

import { Dialog } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Scissors, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

type TrimKind = "video" | "audio";

async function readMediaDurationSec(file: File, kind: TrimKind): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.src = objectUrl;
    const duration = await new Promise<number>((resolve, reject) => {
      el.onloadedmetadata = () => resolve(Number(el.duration || 0));
      el.onerror = () => reject(new Error("Could not read media duration."));
    });
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function trimMediaFileOnServer(file: File, kind: TrimKind, startSec: number, endSec: number): Promise<File> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  fd.append("startSec", String(startSec));
  fd.append("endSec", String(endSec));
  const res = await fetch("/api/media/trim", { method: "POST", body: fd });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let message = `Trim failed (HTTP ${res.status}).`;
    const t = raw.replace(/\s+/g, " ").trim();
    if (t) {
      try {
        const parsed = JSON.parse(t) as { error?: string };
        if (typeof parsed?.error === "string" && parsed.error.trim()) message = parsed.error.trim();
        else message = t.slice(0, 280);
      } catch {
        message = t.slice(0, 280);
      }
    }
    throw new Error(message);
  }
  const b = await res.blob();
  const ext = kind === "video" ? ".mp4" : ".mp3";
  const base = file.name.replace(/\.[^/.]+$/, "");
  return new File([b], `${base}-trim${ext}`, { type: b.type || file.type || "application/octet-stream" });
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function WorkflowMediaTrimDialog({
  open,
  file,
  kind,
  maxDurationSec,
  title = "Trim media",
  onOpenChange,
  onTrimmed,
}: {
  open: boolean;
  file: File | null;
  kind: TrimKind;
  maxDurationSec: number;
  title?: string;
  onOpenChange: (open: boolean) => void;
  onTrimmed: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [startSec, setStartSec] = useState<number>(0);
  const [endSec, setEndSec] = useState<number>(0);

  const objectUrl = useMemo(() => (open && file ? URL.createObjectURL(file) : ""), [open, file]);
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    void (async () => {
      const dur = await readMediaDurationSec(file, kind).catch(() => 0);
      if (cancelled) return;
      setDurationSec(dur);
      const cap = Math.max(0.2, Number(maxDurationSec) || 15);
      setStartSec(0);
      setEndSec(clamp(Math.min(dur || cap, cap), 0.2, Math.max(0.2, dur || cap)));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, file, kind, maxDurationSec]);

  const selectionSec = Math.max(0, endSec - startSec);
  const budgetSec = Math.max(0.2, Number(maxDurationSec) || 15);
  const overBudget = selectionSec > budgetSec + 0.01;

  const updateStart = useCallback(
    (v: number) => {
      const dur = durationSec || 0;
      const nextStart = clamp(v, 0, Math.max(0, dur - 0.1));
      const maxEnd = dur ? Math.min(dur, nextStart + budgetSec) : nextStart + budgetSec;
      const nextEnd = clamp(endSec, nextStart + 0.1, Math.max(nextStart + 0.1, maxEnd));
      setStartSec(nextStart);
      setEndSec(nextEnd);
      if (kind === "video" && videoRef.current) {
        try {
          videoRef.current.currentTime = nextStart;
        } catch {}
      }
    },
    [budgetSec, durationSec, endSec, kind],
  );

  const updateEnd = useCallback(
    (v: number) => {
      const dur = durationSec || 0;
      const maxEnd = dur ? Math.min(dur, startSec + budgetSec) : startSec + budgetSec;
      const nextEnd = clamp(v, startSec + 0.1, Math.max(startSec + 0.1, maxEnd));
      setEndSec(nextEnd);
      if (kind === "video" && videoRef.current) {
        try {
          videoRef.current.currentTime = Math.max(startSec, nextEnd - 0.08);
        } catch {}
      }
    },
    [budgetSec, durationSec, kind, startSec],
  );

  const confirmTrim = useCallback(async () => {
    if (!file) return;
    if (busy) return;
    if (!durationSec || !Number.isFinite(durationSec)) {
      toast.error("Could not read duration", { description: "Try another file." });
      return;
    }
    if (overBudget) {
      toast.error("Selection too long", { description: `Select at most ${budgetSec.toFixed(1)}s.` });
      return;
    }
    setBusy(true);
    try {
      const trimmed = await trimMediaFileOnServer(file, kind, startSec, endSec);
      onTrimmed(trimmed);
      onOpenChange(false);
    } catch (err) {
      toast.error("Trim failed", { description: err instanceof Error ? err.message : "Try again." });
    } finally {
      setBusy(false);
    }
  }, [budgetSec, busy, durationSec, endSec, file, kind, onOpenChange, onTrimmed, overBudget, startSec]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[260] bg-black/75 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[261] w-[min(94vw,680px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/12 bg-[#101014] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.75)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-[15px] font-semibold tracking-tight text-white">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg p-2 text-white/65 transition hover:bg-white/[0.06] hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-3 grid gap-3">
            {kind === "video" ? (
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                <video
                  ref={videoRef}
                  src={objectUrl || undefined}
                  controls
                  playsInline
                  className="block w-full max-h-[min(56vh,320px)] bg-black"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-[12px] text-white/70">
                Audio trim preview is not available here.
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/60">
                <span className="font-semibold text-white/80">
                  Select ≤ {budgetSec.toFixed(1)}s
                </span>
                <span className={cn("tabular-nums", overBudget && "text-red-300")}>
                  {selectionSec.toFixed(1)}s selected
                </span>
              </div>

              <div className="mt-3 grid gap-3">
                <label className="grid gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Start</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, (durationSec || budgetSec) - 0.1)}
                    step={0.05}
                    value={startSec}
                    onChange={(e) => updateStart(Number(e.target.value))}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-white/45">End</span>
                  <input
                    type="range"
                    min={startSec + 0.1}
                    max={Math.min(durationSec || budgetSec, startSec + budgetSec)}
                    step={0.05}
                    value={endSec}
                    onChange={(e) => updateEnd(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>

            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-white/80 transition hover:bg-white/[0.07]"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTrim}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg bg-violet-500/90 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-violet-500",
                  busy && "opacity-70",
                )}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                Trim & continue
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


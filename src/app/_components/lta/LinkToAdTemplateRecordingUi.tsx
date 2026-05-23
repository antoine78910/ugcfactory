"use client";

import { Loader2, Clapperboard, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { proxiedMediaSrc } from "@/lib/mediaProxyUrl";
import type { LtaTemplateBrandSummary } from "@/lib/ltaTemplateRecording";
import type { useLtaTemplateRecording } from "@/app/_components/lta/useLtaTemplateRecording";

type TemplateRecording = ReturnType<typeof useLtaTemplateRecording>;

export function LinkToAdTemplateRecordingButton({
  recording,
}: {
  recording: TemplateRecording;
}) {
  if (!recording.featureEnabled) return null;

  return (
    <button
      type="button"
      onClick={recording.openBrandPicker}
      className={cn(
        "fixed bottom-4 left-4 z-[10060] inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-2xl backdrop-blur-md transition",
        recording.active
          ? "border-amber-400/40 bg-amber-500/20 text-amber-100"
          : "border-violet-400/35 bg-violet-600/25 text-violet-50 hover:bg-violet-600/40",
      )}
    >
      <Clapperboard className="h-4 w-4" aria-hidden />
      Template view
    </button>
  );
}

export function LinkToAdTemplateBrandPicker({
  recording,
}: {
  recording: TemplateRecording;
}) {
  if (!recording.pickingBrand) return null;

  return (
    <div className="fixed inset-0 z-[10045] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0b0912] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Template recording</p>
            <p className="text-[11px] text-white/50">Pick a brand — no backend generation, replay only.</p>
          </div>
          <button
            type="button"
            onClick={recording.closeBrandPicker}
            className="rounded-lg border border-white/10 p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {recording.brandsLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-white/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading brands…
            </div>
          ) : recording.brands.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/45">
              No template brands yet. Mark projects as Template in My Projects or clipping.
            </p>
          ) : (
            <ul className="space-y-2">
              {recording.brands.map((brand) => (
                <li key={brand.runId}>
                  <button
                    type="button"
                    onClick={() => {
                      recording.closeBrandPicker();
                      void recording.startBrandFlow(brand);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-left transition hover:border-violet-400/30 hover:bg-violet-500/[0.06]"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#100d17]">
                      {brand.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={proxiedMediaSrc(brand.thumbUrl) || brand.thumbUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-white/30">
                          —
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {brand.title?.trim() || brand.storeUrl}
                      </p>
                      <p className="truncate text-[11px] text-white/40">{brand.storeUrl}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function LinkToAdTemplateRecordingGate({
  recording,
}: {
  recording: TemplateRecording;
}) {
  if (!recording.gateStep || !recording.gateLabel) return null;

  const canGoBack = recording.gateStep > 1;

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-md rounded-2xl border border-violet-400/25 bg-[#0b0912] p-5 shadow-2xl">
        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300/70">Template recording</p>
        <h3 className="mt-1 text-[16px] font-semibold text-white">
          Step {recording.gateStep} — {recording.gateLabel}
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-white/60">
          Film this step, then continue. Need more time? Stay on this screen — loading already finished.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {canGoBack ? (
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-full border border-white/15 px-4 text-[12px] font-semibold text-white/75 transition hover:bg-white/10"
              onClick={recording.previousFromGate}
            >
              Previous step
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-full border border-violet-400/40 bg-violet-500/25 px-4 text-[12px] font-semibold text-violet-50 transition hover:bg-violet-500/35"
            onClick={recording.continueFromGate}
          >
            Continue
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-full border border-white/10 px-3 text-[11px] text-white/45 transition hover:text-white/70"
            onClick={recording.exitTemplateMode}
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Clapperboard, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { proxiedMediaSrc } from "@/lib/mediaProxyUrl";
import type { useLtaTemplateRecording } from "@/app/_components/lta/useLtaTemplateRecording";

type TemplateRecording = ReturnType<typeof useLtaTemplateRecording>;

function useDocumentPortal() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Bottom-right FAB with on/off toggle; portaled to `document.body`. */
export function LinkToAdTemplateRecordingButton({
  recording,
}: {
  recording: TemplateRecording;
}) {
  const mounted = useDocumentPortal();
  if (!mounted || !recording.featureEnabled) return null;

  const toggleDisabled =
    recording.active ||
    recording.pickingBrand ||
    recording.flowStage === "step1_loading" ||
    recording.flowStage === "step2_loading" ||
    recording.flowStage === "step3_loading" ||
    recording.flowStage === "step4_loading";

  return createPortal(
    <div
      className={cn(
        "fixed bottom-5 right-5 z-[10100] flex items-center gap-2.5 rounded-full border px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-md transition",
        "ring-2 ring-violet-400/25",
        recording.templateToggleOn
          ? "border-amber-400/45 bg-amber-500/20"
          : "border-violet-300/40 bg-violet-600/30",
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={recording.templateToggleOn}
        aria-label="Template mode on/off"
        disabled={toggleDisabled}
        onClick={() => recording.requestTemplateToggle(!recording.templateToggleOn)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60",
          recording.templateToggleOn ? "bg-violet-500" : "bg-white/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            recording.templateToggleOn && "translate-x-5",
          )}
        />
      </button>
      <span className="flex items-center gap-1.5 pr-1 text-xs font-semibold text-white">
        <Clapperboard className="h-4 w-4 shrink-0 text-violet-200" aria-hidden />
        Template
      </span>
    </div>,
    document.body,
  );
}

export function LinkToAdTemplateRecordingStartConfirm({
  recording,
}: {
  recording: TemplateRecording;
}) {
  const mounted = useDocumentPortal();
  if (!mounted || !recording.showStartConfirm) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10115] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-md rounded-2xl border border-violet-400/25 bg-[#0b0912] p-5 shadow-2xl">
        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300/70">Template mode</p>
        <h3 className="mt-1 text-[16px] font-semibold text-white">Start template recording?</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-white/60">
          You will pick a saved brand and replay the full Link to Ad flow with fake loading. No credits are
          spent and nothing is generated on the server.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-full border border-white/15 px-4 text-[12px] font-semibold text-white/75 transition hover:bg-white/10"
            onClick={recording.cancelTemplateStart}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-full border border-violet-400/40 bg-violet-500/25 px-4 text-[12px] font-semibold text-violet-50 transition hover:bg-violet-500/35"
            onClick={recording.confirmTemplateStart}
          >
            Start template
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function LinkToAdTemplateRecordingExitConfirm({
  recording,
}: {
  recording: TemplateRecording;
}) {
  const mounted = useDocumentPortal();
  if (!mounted || !recording.showExitConfirm) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10115] flex items-center justify-center bg-black/65 p-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-400/25 bg-[#0b0912] p-5 shadow-2xl">
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300/70">Template mode</p>
        <h3 className="mt-1 text-[16px] font-semibold text-white">Turn off template mode?</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-white/60">
          The replay in progress will stop and you will return to the normal Link to Ad flow.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-full border border-white/15 px-4 text-[12px] font-semibold text-white/75 transition hover:bg-white/10"
            onClick={recording.cancelTemplateExit}
          >
            Keep recording
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-full border border-amber-400/40 bg-amber-500/20 px-4 text-[12px] font-semibold text-amber-100 transition hover:bg-amber-500/30"
            onClick={recording.confirmTemplateExit}
          >
            Turn off
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function LinkToAdTemplateBrandPicker({
  recording,
}: {
  recording: TemplateRecording;
}) {
  const mounted = useDocumentPortal();
  if (!mounted || !recording.pickingBrand) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10110] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0b0912] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Template mode</p>
            <p className="text-[11px] text-white/50">Pick a brand — replay only, no generation.</p>
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
              No template brands yet. Mark projects as Template in My Projects.
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
    </div>,
    document.body,
  );
}

export function LinkToAdTemplateRecordingGate({
  recording,
}: {
  recording: TemplateRecording;
}) {
  const mounted = useDocumentPortal();
  if (!mounted || !recording.gateStep || !recording.gateLabel) return null;

  const canGoBack = recording.gateStep > 1;

  return createPortal(
    <div className="fixed inset-0 z-[10120] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-md rounded-2xl border border-violet-400/25 bg-[#0b0912] p-5 shadow-2xl">
        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300/70">Template mode</p>
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
    </div>,
    document.body,
  );
}

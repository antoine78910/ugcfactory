"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Clapperboard, X, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { proxiedMediaSrc } from "@/lib/mediaProxyUrl";
import type { useLtaTemplateRecording } from "@/app/_components/lta/useLtaTemplateRecording";

type TemplateRecording = ReturnType<typeof useLtaTemplateRecording>;

function useDocumentPortal() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Bottom-right dock: step controls (no overlay) + template toggle; portaled to `document.body`. */
export function LinkToAdTemplateRecordingButton({
  recording,
}: {
  recording: TemplateRecording;
}) {
  const mounted = useDocumentPortal();
  const [stepBarMinimized, setStepBarMinimized] = useState(false);
  const [readyHintHidden, setReadyHintHidden] = useState(false);

  if (!mounted || !recording.featureEnabled) return null;

  const stepLoading =
    recording.flowStage === "step1_loading" ||
    recording.flowStage === "step2_loading" ||
    recording.flowStage === "step3_loading" ||
    recording.flowStage === "step4_loading";

  useEffect(() => {
    if (stepLoading) setStepBarMinimized(false);
  }, [stepLoading]);

  useEffect(() => {
    if (!recording.isBrandSelected) setReadyHintHidden(false);
  }, [recording.isBrandSelected]);

  const toggleDisabled = recording.active || recording.pickingBrand || stepLoading || recording.isBrandSelected;

  const showStepBar = Boolean(recording.gateStep && recording.gateLabel);
  const canGoBack = (recording.gateStep ?? 0) > 1;

  return createPortal(
    <div className="pointer-events-none fixed bottom-5 right-5 z-[10100] flex max-w-[min(92vw,15rem)] flex-col items-end gap-1.5">
      {/* Brand selected — waiting for Generate */}
      {recording.isBrandSelected && !readyHintHidden ? (
        <div
          className={cn(
            "pointer-events-auto w-full rounded-xl border px-2.5 py-2 shadow-[0_6px_24px_rgba(0,0,0,0.45)] backdrop-blur-md",
            "border-violet-400/30 bg-[#0b0912]/95 ring-1 ring-violet-400/20",
          )}
        >
          <div className="flex items-start justify-between gap-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-violet-300/70">Template ready</p>
            <button
              type="button"
              className="shrink-0 rounded-md p-0.5 text-white/40 transition hover:bg-white/10 hover:text-white/70"
              aria-label="Minimize"
              onClick={() => setReadyHintHidden(true)}
            >
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-white/75">
            URL above, then <span className="font-semibold text-violet-300">Generate</span>.
          </p>
          <button
            type="button"
            className="mt-1.5 inline-flex h-6 items-center gap-1 rounded-full border border-white/15 px-2.5 text-[9px] font-semibold text-white/55 transition hover:bg-white/10"
            onClick={recording.cancelBrandSelected}
          >
            <X className="h-2.5 w-2.5" aria-hidden />
            Cancel
          </button>
        </div>
      ) : recording.isBrandSelected && readyHintHidden ? (
        <button
          type="button"
          className="pointer-events-auto rounded-full border border-violet-400/25 bg-[#0b0912]/90 px-2.5 py-1 text-[9px] font-semibold text-violet-200/90 shadow-md backdrop-blur-md transition hover:bg-violet-500/15"
          onClick={() => setReadyHintHidden(false)}
        >
          Template ready
        </button>
      ) : null}

      {/* Step loading indicator — always visible even when minimized */}
      {stepLoading ? (
        <div
          className={cn(
            "pointer-events-auto w-full rounded-xl border px-2.5 py-2 shadow-[0_6px_24px_rgba(0,0,0,0.45)] backdrop-blur-md",
            "border-violet-400/30 bg-[#0b0912]/95 ring-1 ring-violet-400/20",
          )}
        >
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-violet-200/90">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
            Loading step…
          </div>
        </div>
      ) : null}

      {/* Step controls — collapsible */}
      {showStepBar ? (
        <div
          className={cn(
            "pointer-events-auto w-full rounded-xl border shadow-[0_6px_24px_rgba(0,0,0,0.5)] backdrop-blur-md",
            "border-violet-400/30 bg-[#0b0912]/95 ring-1 ring-violet-400/20",
            stepBarMinimized ? "px-2.5 py-1.5" : "px-2.5 py-2",
          )}
          role="region"
          aria-label="Template mode step controls"
        >
          <div className="flex w-full items-center justify-between gap-1.5">
            <div className="min-w-0">
              <p className="text-[8px] font-bold uppercase tracking-widest text-violet-300/65">Template</p>
              <p className={cn("font-semibold text-white", stepBarMinimized ? "text-[10px]" : "text-[11px]")}>
                {recording.gateStep}. {recording.gateLabel}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white/50 transition hover:bg-white/10 hover:text-white/75"
              aria-expanded={!stepBarMinimized}
              onClick={() => setStepBarMinimized((v) => !v)}
            >
              <Minimize2 className="h-3 w-3" aria-hidden />
              {stepBarMinimized ? "Show" : "Minimize"}
            </button>
          </div>

          {!stepBarMinimized ? (
            <>
              <p className="mt-1 text-[9px] leading-snug text-white/45">
                Film this step, then Continue.
              </p>
              <div className="mt-1.5 flex flex-col gap-1">
                <button
                  type="button"
                  className="inline-flex h-7 w-full items-center justify-center rounded-full border border-white/15 text-[10px] font-semibold text-white/80 transition hover:bg-white/10"
                  onClick={recording.retakeCurrentStepFromGate}
                >
                  Retake
                </button>
                <div className="flex flex-wrap items-center gap-1">
                  {canGoBack ? (
                    <button
                      type="button"
                      className="inline-flex h-7 flex-1 items-center justify-center rounded-full border border-white/10 text-[9px] font-medium text-white/55 transition hover:bg-white/10 hover:text-white/75"
                      onClick={recording.previousFromGate}
                    >
                      Prev
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-7 items-center justify-center rounded-full border border-violet-400/40 bg-violet-500/25 px-2.5 text-[10px] font-semibold text-violet-50 transition hover:bg-violet-500/35",
                      canGoBack ? "flex-1" : "flex-[2]",
                    )}
                    onClick={recording.continueFromGate}
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center justify-center rounded-full border border-white/15 px-2 text-[9px] font-semibold text-white/65 transition hover:bg-white/10"
                    onClick={() => recording.requestTemplateToggle(false)}
                  >
                    Exit
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-1 flex items-center gap-1">
              {canGoBack ? (
                <button
                  type="button"
                  className="inline-flex h-6 flex-1 items-center justify-center rounded-full border border-white/10 text-[9px] font-medium text-white/55 transition hover:bg-white/10"
                  onClick={recording.previousFromGate}
                >
                  Prev
                </button>
              ) : null}
              <button
                type="button"
                className={cn(
                  "inline-flex h-6 items-center justify-center rounded-full border border-violet-400/40 bg-violet-500/25 px-2 text-[9px] font-semibold text-violet-50 transition hover:bg-violet-500/35",
                  canGoBack ? "flex-1" : "flex-[2]",
                )}
                onClick={recording.continueFromGate}
              >
                Continue
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Toggle pill */}
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2.5 rounded-full border px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-md transition",
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
      </div>
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
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!recording.showStartConfirm) setMinimized(false);
  }, [recording.showStartConfirm]);

  if (!mounted || !recording.showStartConfirm) return null;

  if (minimized) {
    return createPortal(
      <button
        type="button"
        className="fixed bottom-[4.75rem] right-5 z-[10115] rounded-full border border-violet-400/30 bg-[#0b0912]/95 px-3 py-1.5 text-[10px] font-semibold text-violet-200 shadow-lg backdrop-blur-md transition hover:bg-violet-500/15"
        onClick={() => setMinimized(false)}
      >
        Template start
      </button>,
      document.body,
    );
  }

  return createPortal(
    <div className="pointer-events-none fixed bottom-[4.75rem] right-5 z-[10115] flex max-w-[min(92vw,14rem)] flex-col items-end">
      <div className="pointer-events-auto w-full rounded-xl border border-violet-400/25 bg-[#0b0912]/95 px-2.5 py-2 shadow-lg ring-1 ring-violet-400/15 backdrop-blur-md">
        <div className="flex items-start justify-between gap-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-violet-300/70">Template mode</p>
          <button
            type="button"
            className="shrink-0 rounded-md p-0.5 text-white/40 transition hover:bg-white/10 hover:text-white/70"
            aria-label="Minimize"
            onClick={() => setMinimized(true)}
          >
            <Minimize2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <p className="mt-0.5 text-[11px] font-semibold text-white">Start recording?</p>
        <p className="mt-1 text-[9px] leading-snug text-white/50">
          Pick a brand, enter URL, Generate. No credits.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-full border border-white/15 px-2.5 text-[10px] font-semibold text-white/70 transition hover:bg-white/10"
            onClick={recording.cancelTemplateStart}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-full border border-violet-400/40 bg-violet-500/25 px-2.5 text-[10px] font-semibold text-violet-50 transition hover:bg-violet-500/35"
            onClick={recording.confirmTemplateStart}
          >
            Start
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
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  if (!mounted || !recording.pickingBrand) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10110] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0b0912] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Template mode</p>
            <p className="text-[11px] text-white/50">Pick a brand — you will review the URL before starting.</p>
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
              No templates yet. Anyone can mark a project with Template in My Projects (shared list).
            </p>
          ) : (
            <ul className="space-y-2">
              {recording.brands.map((brand) => (
                <li key={brand.runId}>
                  <button
                    type="button"
                    disabled={loadingRunId !== null}
                    onClick={() => {
                      setLoadingRunId(brand.runId);
                      void recording.startBrandFlow(brand).finally(() => setLoadingRunId(null));
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-left transition hover:border-violet-400/30 hover:bg-violet-500/[0.06] disabled:cursor-wait disabled:opacity-60"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#100d17]">
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
                      {loadingRunId === brand.runId ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                          <Loader2 className="h-5 w-5 animate-spin text-violet-300" />
                        </div>
                      ) : null}
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

/** @deprecated Step controls live on {@link LinkToAdTemplateRecordingButton} (no fullscreen gate). */
export function LinkToAdTemplateRecordingGate(_props: { recording: TemplateRecording }) {
  return null;
}

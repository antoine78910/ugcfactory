"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  LTA_TEMPLATE_RECORDING_MIN_STEP_MS,
  LTA_TEMPLATE_RECORDING_STEP_LABELS,
  type LtaTemplateBrandSummary,
  type LtaTemplateRecordingGateStep,
} from "@/lib/ltaTemplateRecording";
import {
  buildExtractedForTemplateStep,
  type BuildExtractedForTemplateStepOpts,
} from "@/lib/ltaTemplateRecordingSnapshot";
import { isDefaultTemplateRecordingEmail } from "@/lib/ltaTemplateRecording";
import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";
import { sessionUserEmail } from "@/lib/sessionUserEmail";

export type TemplateRunCache = {
  id: string;
  store_url?: string | null;
  title?: string | null;
  extracted?: unknown;
  video_prompt?: string | null;
};

type FlowStage =
  | "idle"
  | "picking_brand"
  | "step1_loading"
  | "step1_gate"
  | "step2_loading"
  | "step2_gate"
  | "step3_loading"
  | "step3_gate"
  | "step4_loading"
  | "step4_gate"
  | "finished";

export type UseLtaTemplateRecordingArgs = {
  /** Logged-in email from the browser session (OAuth-safe). */
  clientEmail?: string | null;
  hydrateFromRun: (
    run: TemplateRunCache,
    opts?: { silent?: boolean; preserveVideoDuration?: boolean },
  ) => void;
  prepareBlankCanvas: () => void;
  setStoreUrl: (url: string) => void;
  setIsWorking: (v: boolean) => void;
  setStage: (
    v:
      | "idle"
      | "scanning"
      | "finding_image"
      | "summarizing"
      | "writing_scripts"
      | "server_pipeline"
      | "ready"
      | "error",
  ) => void;
  setServerPipelineStepIndex: (v: number | null) => void;
  setIsNanoAllImagesSubmitting: (v: boolean) => void;
  setIsNanoPromptsLoading: (v: boolean) => void;
  setIsVideoPromptLoading: (v: boolean) => void;
  setIsKlingSubmitting: (v: boolean) => void;
  /** After each template hydrate (e.g. sync prompt signature so image gen does not call the API). */
  onAfterTemplateHydrate?: (extracted: unknown, run: TemplateRunCache) => void;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gateStepForStage(stage: FlowStage): LtaTemplateRecordingGateStep | null {
  if (stage === "step1_gate") return 1;
  if (stage === "step2_gate") return 2;
  if (stage === "step3_gate") return 3;
  if (stage === "step4_gate") return 4;
  return null;
}

function resolveClientAllowlistEmail(
  fromProp: string | null | undefined,
  fromSession: string | null | undefined,
): string | null {
  const a = (fromProp ?? "").trim().toLowerCase();
  const b = (fromSession ?? "").trim().toLowerCase();
  return a || b || null;
}

export function useLtaTemplateRecording(args: UseLtaTemplateRecordingArgs) {
  const supabaseClient = useSupabaseBrowserClient();
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [featureEnabled, setFeatureEnabled] = useState(() =>
    isDefaultTemplateRecordingEmail(args.clientEmail),
  );
  const [brands, setBrands] = useState<LtaTemplateBrandSummary[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [flowStage, setFlowStage] = useState<FlowStage>("idle");
  /** User-facing on/off for template mode (armed after start confirmation). */
  const [templateToggleOn, setTemplateToggleOn] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const runCacheRef = useRef<TemplateRunCache | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flowActiveRef = useRef(false);

  const effectiveEmail = resolveClientAllowlistEmail(args.clientEmail, sessionEmail);

  const templateFlowInProgress =
    flowStage !== "idle" && flowStage !== "picking_brand" && flowStage !== "finished";

  /** True while Link to Ad template replay is active (not normal LTA generation). */
  const isTemplateReplayActive = templateToggleOn && templateFlowInProgress;

  const locksSelection = isTemplateReplayActive;
  const active =
    locksSelection &&
    flowStage !== "step1_gate" &&
    flowStage !== "step2_gate" &&
    flowStage !== "step3_gate" &&
    flowStage !== "step4_gate";

  useEffect(() => {
    if (!supabaseClient) return;
    let cancelled = false;
    void supabaseClient.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      const email = sessionUserEmail(data.user);
      if (email) setSessionEmail(email);
    });
    const { data: sub } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      const email = session?.user ? sessionUserEmail(session.user) : null;
      setSessionEmail(email);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabaseClient]);

  const refreshFeatureAccess = useCallback(async () => {
    const fromClient = isDefaultTemplateRecordingEmail(effectiveEmail);
    if (fromClient) setFeatureEnabled(true);

    try {
      const res = await fetch("/api/me/lta-template-recording", {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { enabled?: boolean };
      const fromApi = res.ok && Boolean(json.enabled);
      setFeatureEnabled(fromApi || fromClient);
    } catch {
      if (fromClient) setFeatureEnabled(true);
    }
  }, [effectiveEmail]);

  useEffect(() => {
    void refreshFeatureAccess();
  }, [refreshFeatureAccess]);

  const loadBrands = useCallback(async () => {
    setBrandsLoading(true);
    try {
      const res = await fetch("/api/link-to-ad/template-brands", {
        cache: "no-store",
        credentials: "include",
      });
      const json = (await res.json()) as { brands?: LtaTemplateBrandSummary[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Could not load template brands");
      setBrands(Array.isArray(json.brands) ? json.brands : []);
    } catch (e) {
      toast.error("Could not load template brands", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
      setBrands([]);
    } finally {
      setBrandsLoading(false);
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const applyCachedStep = useCallback(
    (step: LtaTemplateRecordingGateStep, buildOpts?: BuildExtractedForTemplateStepOpts) => {
      const run = runCacheRef.current;
      if (!run) return;
      const extracted = buildExtractedForTemplateStep(run.extracted, step, buildOpts);
      args.hydrateFromRun(
        { ...run, extracted },
        { silent: true, preserveVideoDuration: true },
      );
      args.onAfterTemplateHydrate?.(extracted, run);
      args.setStage("ready");
      args.setIsWorking(false);
      args.setServerPipelineStepIndex(null);
      args.setIsNanoAllImagesSubmitting(false);
      args.setIsNanoPromptsLoading(false);
      args.setIsVideoPromptLoading(false);
      args.setIsKlingSubmitting(false);
    },
    [args],
  );

  const runStep1Loading = useCallback(async () => {
    args.prepareBlankCanvas();
    args.setStoreUrl(runCacheRef.current?.store_url?.trim() ?? "");
    args.setIsWorking(true);
    const stages = ["scanning", "finding_image", "summarizing", "writing_scripts", "server_pipeline"] as const;
    const perStage = Math.max(2000, Math.floor(LTA_TEMPLATE_RECORDING_MIN_STEP_MS / stages.length));
    for (let i = 0; i < stages.length; i++) {
      args.setStage(stages[i]!);
      if (stages[i] === "server_pipeline") args.setServerPipelineStepIndex(Math.min(i, 4));
      await delay(perStage);
    }
    applyCachedStep(1);
    setFlowStage("step1_gate");
  }, [applyCachedStep, args]);

  const runStep2Loading = useCallback(async () => {
    args.setIsWorking(true);
    args.setStage("writing_scripts");
    await delay(LTA_TEMPLATE_RECORDING_MIN_STEP_MS);
    applyCachedStep(2);
    setFlowStage("step2_gate");
  }, [applyCachedStep, args]);

  const runStep3Loading = useCallback(async () => {
    args.setIsWorking(true);
    args.setIsNanoPromptsLoading(true);
    await delay(LTA_TEMPLATE_RECORDING_MIN_STEP_MS);
    applyCachedStep(3, { step3Phase: "prompts" });
    args.setIsNanoPromptsLoading(false);

    args.setIsNanoAllImagesSubmitting(true);
    await delay(LTA_TEMPLATE_RECORDING_MIN_STEP_MS);
    applyCachedStep(3, { step3Phase: "full" });
    args.setIsNanoAllImagesSubmitting(false);
    args.setIsWorking(false);
    setFlowStage("step3_gate");
  }, [applyCachedStep, args]);

  const runStep4Loading = useCallback(async () => {
    args.setIsVideoPromptLoading(true);
    args.setIsWorking(true);
    await delay(Math.floor(LTA_TEMPLATE_RECORDING_MIN_STEP_MS / 2));
    args.setIsVideoPromptLoading(false);
    args.setIsKlingSubmitting(true);
    await delay(Math.ceil(LTA_TEMPLATE_RECORDING_MIN_STEP_MS / 2));
    applyCachedStep(4);
    setFlowStage("step4_gate");
  }, [applyCachedStep, args]);

  const startBrandFlow = useCallback(
    async (brand: LtaTemplateBrandSummary) => {
      flowActiveRef.current = true;
      setTemplateToggleOn(true);
      setFlowStage("step1_loading");
      try {
        const res = await fetch(`/api/runs/get?runId=${encodeURIComponent(brand.runId)}`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = (await res.json()) as {
          data?: TemplateRunCache;
          error?: string;
        };
        if (!res.ok || !json.data) throw new Error(json.error || "Could not load template run");
        runCacheRef.current = json.data;
        await runStep1Loading();
      } catch (e) {
        flowActiveRef.current = false;
        setFlowStage("idle");
        runCacheRef.current = null;
        args.setIsWorking(false);
        toast.error("Template failed to start", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    [args, runStep1Loading],
  );

  const openBrandPicker = useCallback(() => {
    if (!featureEnabled) {
      void refreshFeatureAccess().then(() => {
        toast.message("Template mode unavailable", {
          description: "Your account is not on the template recording allowlist.",
        });
      });
      return;
    }
    setFlowStage("picking_brand");
    void loadBrands();
  }, [featureEnabled, loadBrands, refreshFeatureAccess]);

  const exitTemplateMode = useCallback(() => {
    clearTimer();
    flowActiveRef.current = false;
    runCacheRef.current = null;
    setFlowStage("idle");
    setTemplateToggleOn(false);
    setShowStartConfirm(false);
    setShowExitConfirm(false);
    args.setIsWorking(false);
    args.setIsNanoAllImagesSubmitting(false);
    args.setIsNanoPromptsLoading(false);
    args.setIsVideoPromptLoading(false);
    args.setIsKlingSubmitting(false);
    args.setStage("ready");
  }, [args, clearTimer]);

  const requestTemplateToggle = useCallback(
    (nextOn: boolean) => {
      if (!featureEnabled) {
        void refreshFeatureAccess();
        return;
      }
      if (nextOn) {
        if (templateFlowInProgress || flowStage === "picking_brand") return;
        setShowStartConfirm(true);
        return;
      }
      if (templateFlowInProgress || flowStage === "picking_brand") {
        setShowExitConfirm(true);
        return;
      }
      setTemplateToggleOn(false);
    },
    [featureEnabled, flowStage, refreshFeatureAccess, templateFlowInProgress],
  );

  const confirmTemplateStart = useCallback(() => {
    setShowStartConfirm(false);
    setTemplateToggleOn(true);
    openBrandPicker();
  }, [openBrandPicker]);

  const cancelTemplateStart = useCallback(() => {
    setShowStartConfirm(false);
    setTemplateToggleOn(false);
  }, []);

  const confirmTemplateExit = useCallback(() => {
    setShowExitConfirm(false);
    exitTemplateMode();
  }, [exitTemplateMode]);

  const cancelTemplateExit = useCallback(() => {
    setShowExitConfirm(false);
  }, []);

  const closeBrandPicker = useCallback(() => {
    if (flowActiveRef.current) return;
    setFlowStage("idle");
    setTemplateToggleOn(false);
  }, []);

  const gateStep = gateStepForStage(flowStage);

  const continueFromGate = useCallback(() => {
    if (flowStage === "step1_gate") {
      setFlowStage("step2_loading");
      void runStep2Loading();
      return;
    }
    if (flowStage === "step2_gate") {
      setFlowStage("step3_loading");
      void runStep3Loading();
      return;
    }
    if (flowStage === "step3_gate") {
      setFlowStage("step4_loading");
      void runStep4Loading();
      return;
    }
    if (flowStage === "step4_gate") {
      setFlowStage("finished");
      flowActiveRef.current = false;
      setTemplateToggleOn(false);
      toast.success("Template recording complete");
      return;
    }
  }, [flowStage, runStep2Loading, runStep3Loading, runStep4Loading]);

  const previousFromGate = useCallback(() => {
    if (flowStage === "step2_gate") {
      applyCachedStep(1);
      setFlowStage("step1_gate");
      return;
    }
    if (flowStage === "step3_gate") {
      applyCachedStep(2);
      setFlowStage("step2_gate");
      return;
    }
    if (flowStage === "step4_gate") {
      applyCachedStep(3);
      setFlowStage("step3_gate");
    }
  }, [applyCachedStep, flowStage]);

  /** Re-run fake loading for the current gate step (re-film the transition). */
  const retakeCurrentStepFromGate = useCallback(() => {
    if (flowStage === "step1_gate") {
      setFlowStage("step1_loading");
      void runStep1Loading();
      return;
    }
    if (flowStage === "step2_gate") {
      setFlowStage("step2_loading");
      void runStep2Loading();
      return;
    }
    if (flowStage === "step3_gate") {
      setFlowStage("step3_loading");
      void runStep3Loading();
      return;
    }
    if (flowStage === "step4_gate") {
      setFlowStage("step4_loading");
      void runStep4Loading();
    }
  }, [flowStage, runStep1Loading, runStep2Loading, runStep3Loading, runStep4Loading]);

  const interceptPaidAction = useCallback((): boolean => {
    if (!templateToggleOn && !isTemplateReplayActive) return false;
    toast.message("Template mode", {
      description:
        flowStage.endsWith("_gate") || flowStage.endsWith("_loading")
          ? "Use Continue on the template bar (bottom-right) when you are ready for the next step."
          : "Template recording is in progress.",
    });
    return true;
  }, [flowStage, isTemplateReplayActive, templateToggleOn]);

  const interceptOnRun = useCallback(
    async (_storeUrl: string, realOnRun: () => Promise<void>) => {
      if (templateToggleOn || isTemplateReplayActive) {
        toast.message("Template mode", {
          description: "Turn off template mode or finish the replay before running a real generation.",
        });
        return;
      }
      await realOnRun();
    },
    [isTemplateReplayActive, templateToggleOn],
  );

  return {
    featureEnabled,
    templateToggleOn,
    showStartConfirm,
    showExitConfirm,
    brands,
    brandsLoading,
    flowStage,
    active,
    locksSelection,
    isTemplateReplayActive,
    gateStep,
    gateLabel: gateStep ? LTA_TEMPLATE_RECORDING_STEP_LABELS[gateStep] : null,
    requestTemplateToggle,
    confirmTemplateStart,
    cancelTemplateStart,
    confirmTemplateExit,
    cancelTemplateExit,
    startBrandFlow,
    exitTemplateMode,
    continueFromGate,
    previousFromGate,
    retakeCurrentStepFromGate,
    interceptPaidAction,
    interceptOnRun,
    pickingBrand: flowStage === "picking_brand",
    closeBrandPicker,
  };
}

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
  /** Brand picked and run fetched; waiting for user to confirm URL and click Generate. */
  | "brand_selected"
  | "step1_loading"
  | "step1_gate"
  | "step2_loading"
  | "step2_gate"
  | "step3_prompts_loading"
  | "step3_prompts_gate"
  | "step3_images_loading"
  | "step3_images_gate"
  | "step4_prompt_loading"
  | "step4_prompt_gate"
  | "step4_video_loading"
  | "step4_gate"
  | "finished";

/** Paid Link to Ad actions that advance the template replay when clicked naturally. */
export type LtaTemplatePaidAction =
  | "generate_prompts"
  | "generate_images"
  | "generate_video_prompt"
  | "generate_kling";

export type UseLtaTemplateRecordingArgs = {
  /** Logged-in email from the browser session (OAuth-safe). */
  clientEmail?: string | null;
  hydrateFromRun: (
    run: TemplateRunCache,
    opts?: { silent?: boolean; preserveVideoDuration?: boolean; templateReplay?: boolean },
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
  if (stage === "step3_prompts_gate" || stage === "step3_images_gate") return 3;
  if (stage === "step4_prompt_gate" || stage === "step4_gate") return 4;
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

  /** True only during active fake-loading / gate steps — NOT during brand_selected waiting state. */
  const templateFlowInProgress =
    flowStage !== "idle" &&
    flowStage !== "picking_brand" &&
    flowStage !== "brand_selected" &&
    flowStage !== "finished";

  /** True while Link to Ad template replay is active (not normal LTA generation). */
  const isTemplateReplayActive = templateToggleOn && templateFlowInProgress;

  const locksSelection = isTemplateReplayActive;
  const active =
    locksSelection &&
    flowStage !== "step1_gate" &&
    flowStage !== "step2_gate" &&
    flowStage !== "step3_prompts_gate" &&
    flowStage !== "step3_images_gate" &&
    flowStage !== "step4_prompt_gate" &&
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
      const extracted = buildExtractedForTemplateStep(run.extracted, step, {
        ...buildOpts,
        storeUrl: run.store_url ?? "",
      });
      args.hydrateFromRun(
        { ...run, extracted },
        { silent: true, preserveVideoDuration: true, templateReplay: true },
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

  /** Template demo: keep the same “Scanning the store page…” UI for the full step duration. */
  const runClassicLtaLoading = useCallback(async () => {
    args.setIsNanoAllImagesSubmitting(false);
    args.setIsNanoPromptsLoading(false);
    args.setIsVideoPromptLoading(false);
    args.setIsKlingSubmitting(false);
    args.setServerPipelineStepIndex(null);
    args.setIsWorking(true);

    // Cycle through checklist stages so bullet-points complete progressively.
    // WebsiteScanLoader label stays "Scanning" for all stages (handled in UI layer).
    const total = LTA_TEMPLATE_RECORDING_MIN_STEP_MS;
    const slices: Array<[Parameters<typeof args.setStage>[0], number]> = [
      ["scanning",        Math.round(total * 0.20)],
      ["finding_image",   Math.round(total * 0.25)],
      ["summarizing",     Math.round(total * 0.25)],
      ["writing_scripts", Math.round(total * 0.30)],
    ];
    for (const [stage, ms] of slices) {
      args.setStage(stage);
      await delay(ms);
    }
  }, [args]);

  /** Store-only gate (no loading — used when stepping back from Scripts). */
  const showStep1Gate = useCallback(() => {
    applyCachedStep(1);
    setFlowStage("step1_gate");
  }, [applyCachedStep]);

  /** Scripts gate (no loading — data already hydrated). */
  const showStep2Gate = useCallback(() => {
    applyCachedStep(2);
    setFlowStage("step2_gate");
  }, [applyCachedStep]);

  /**
   * One fake loading for Store + Scripts: scanning → image → brief → writing scripts,
   * then land on Scripts with marketing angles visible.
   */
  const runStoreAndScriptsLoading = useCallback(async () => {
    args.prepareBlankCanvas();
    args.setStoreUrl(runCacheRef.current?.store_url?.trim() ?? "");
    await runClassicLtaLoading();
    applyCachedStep(2);
    setFlowStage("step2_gate");
  }, [applyCachedStep, args, runClassicLtaLoading]);

  /** Re-film the Store step only (optional retake from step 1 gate). */
  const runStep1Loading = useCallback(async () => {
    args.prepareBlankCanvas();
    args.setStoreUrl(runCacheRef.current?.store_url?.trim() ?? "");
    await runClassicLtaLoading();
    applyCachedStep(1);
    setFlowStage("step1_gate");
  }, [applyCachedStep, args, runClassicLtaLoading]);

  /** Fake “Writing image prompts…” — no store scanning. */
  const runTemplatePromptsLoading = useCallback(async () => {
    args.setIsWorking(false);
    args.setStage("ready");
    args.setServerPipelineStepIndex(null);
    args.setIsNanoAllImagesSubmitting(false);
    args.setIsVideoPromptLoading(false);
    args.setIsKlingSubmitting(false);
    setFlowStage("step3_prompts_loading");
    args.setIsNanoPromptsLoading(true);
    await delay(LTA_TEMPLATE_RECORDING_MIN_STEP_MS);
    applyCachedStep(3, { step3Phase: "prompts" });
    args.setIsNanoPromptsLoading(false);
    setFlowStage("step3_prompts_gate");
  }, [applyCachedStep, args]);

  /** Fake “Generating your 3 reference images…” — no store scanning, no prompt pass. */
  const runTemplateImagesLoading = useCallback(async () => {
    args.setIsWorking(false);
    args.setStage("ready");
    args.setServerPipelineStepIndex(null);
    args.setIsNanoPromptsLoading(false);
    args.setIsVideoPromptLoading(false);
    args.setIsKlingSubmitting(false);
    setFlowStage("step3_images_loading");
    args.setIsNanoAllImagesSubmitting(true);
    await delay(LTA_TEMPLATE_RECORDING_MIN_STEP_MS);
    applyCachedStep(3, { step3Phase: "full" });
    args.setIsNanoAllImagesSubmitting(false);
    setFlowStage("step3_images_gate");
  }, [applyCachedStep, args]);

  /** Fake “Writing your video prompt…” */
  const runTemplateVideoPromptLoading = useCallback(async () => {
    args.setIsWorking(false);
    args.setStage("ready");
    args.setServerPipelineStepIndex(null);
    args.setIsNanoPromptsLoading(false);
    args.setIsNanoAllImagesSubmitting(false);
    args.setIsKlingSubmitting(false);
    setFlowStage("step4_prompt_loading");
    args.setIsVideoPromptLoading(true);
    await delay(LTA_TEMPLATE_RECORDING_MIN_STEP_MS);
    applyCachedStep(4, { step4Phase: "prompt" });
    args.setIsVideoPromptLoading(false);
    setFlowStage("step4_prompt_gate");
  }, [applyCachedStep, args]);

  /** Fake “Starting video render…” */
  const runTemplateKlingLoading = useCallback(async () => {
    args.setIsWorking(false);
    args.setStage("ready");
    args.setServerPipelineStepIndex(null);
    args.setIsNanoPromptsLoading(false);
    args.setIsNanoAllImagesSubmitting(false);
    args.setIsVideoPromptLoading(false);
    setFlowStage("step4_video_loading");
    args.setIsKlingSubmitting(true);
    await delay(LTA_TEMPLATE_RECORDING_MIN_STEP_MS);
    applyCachedStep(4, { step4Phase: "full" });
    args.setIsKlingSubmitting(false);
    setFlowStage("step4_gate");
  }, [applyCachedStep, args]);

  /**
   * Step 1 – fetch the template run and pre-fill the URL field.
   * Does NOT start the replay; the user must review/edit the URL then click Generate.
   */
  const startBrandFlow = useCallback(
    async (brand: LtaTemplateBrandSummary) => {
      try {
        const res = await fetch(
          `/api/link-to-ad/template-runs/get?runId=${encodeURIComponent(brand.runId)}`,
          {
            cache: "no-store",
            credentials: "include",
          },
        );
        const json = (await res.json()) as {
          data?: TemplateRunCache;
          error?: string;
        };
        if (!res.ok || !json.data) throw new Error(json.error || "Could not load template run");
        runCacheRef.current = json.data;
        args.setStoreUrl(json.data.store_url?.trim() ?? "");
        setFlowStage("brand_selected");
      } catch (e) {
        setFlowStage("idle");
        runCacheRef.current = null;
        toast.error("Template failed to load", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    [args],
  );

  /**
   * Called when the user clicks Generate after reviewing the URL.
   * Single loading covers store scrape + scripts, then opens Scripts (angles).
   */
  const beginTemplateReplay = useCallback(
    async (urlOverride?: string) => {
      if (!runCacheRef.current) return;
      flowActiveRef.current = true;
      setTemplateToggleOn(true);
      if (urlOverride?.trim()) args.setStoreUrl(urlOverride.trim());
      setFlowStage("step2_loading");
      await runStoreAndScriptsLoading();
    },
    [args, runStoreAndScriptsLoading],
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
        if (templateFlowInProgress || flowStage === "picking_brand" || flowStage === "brand_selected") return;
        setShowStartConfirm(true);
        return;
      }
      if (templateFlowInProgress) {
        setShowExitConfirm(true);
        return;
      }
      // picking_brand or brand_selected: just cancel cleanly (no generation started)
      runCacheRef.current = null;
      setFlowStage("idle");
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
    runCacheRef.current = null;
    setFlowStage("idle");
    setTemplateToggleOn(false);
  }, []);

  /** Cancel the brand_selected waiting state (user changed their mind before clicking Generate). */
  const cancelBrandSelected = useCallback(() => {
    if (flowActiveRef.current) return;
    runCacheRef.current = null;
    setFlowStage("idle");
    setTemplateToggleOn(false);
  }, []);

  const gateStep = gateStepForStage(flowStage);

  const continueFromGate = useCallback(() => {
    if (flowStage === "step1_gate") {
      showStep2Gate();
      return;
    }
    if (flowStage === "step4_gate") {
      setFlowStage("finished");
      flowActiveRef.current = false;
      setTemplateToggleOn(false);
      toast.success("Template recording complete");
    }
  }, [flowStage, showStep2Gate]);

  const previousFromGate = useCallback(() => {
    if (flowStage === "step2_gate") {
      applyCachedStep(1);
      setFlowStage("step1_gate");
      return;
    }
    if (flowStage === "step3_prompts_gate") {
      applyCachedStep(2);
      setFlowStage("step2_gate");
      return;
    }
    if (flowStage === "step3_images_gate") {
      applyCachedStep(3, { step3Phase: "prompts" });
      setFlowStage("step3_prompts_gate");
      return;
    }
    if (flowStage === "step4_prompt_gate") {
      applyCachedStep(3, { step3Phase: "full" });
      setFlowStage("step3_images_gate");
      return;
    }
    if (flowStage === "step4_gate") {
      applyCachedStep(4, { step4Phase: "prompt" });
      setFlowStage("step4_prompt_gate");
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
      showStep2Gate();
      return;
    }
    if (flowStage === "step3_prompts_gate") {
      void runTemplatePromptsLoading();
      return;
    }
    if (flowStage === "step3_images_gate") {
      void runTemplateImagesLoading();
      return;
    }
    if (flowStage === "step4_prompt_gate") {
      void runTemplateVideoPromptLoading();
      return;
    }
    if (flowStage === "step4_gate") {
      void runTemplateKlingLoading();
    }
  }, [
    flowStage,
    runStep1Loading,
    showStep2Gate,
    runTemplatePromptsLoading,
    runTemplateImagesLoading,
    runTemplateVideoPromptLoading,
    runTemplateKlingLoading,
  ]);

  const interceptPaidAction = useCallback(
    (action: LtaTemplatePaidAction): boolean => {
      if (!isTemplateReplayActive) return false;

      switch (action) {
        case "generate_prompts":
          if (
            flowStage === "step2_gate" ||
            flowStage === "step3_prompts_gate"
          ) {
            void runTemplatePromptsLoading();
            return true;
          }
          return false;
        case "generate_images":
          if (
            flowStage === "step3_prompts_gate" ||
            flowStage === "step3_images_gate"
          ) {
            void runTemplateImagesLoading();
            return true;
          }
          return false;
        case "generate_video_prompt":
          if (
            flowStage === "step3_images_gate" ||
            flowStage === "step4_prompt_gate"
          ) {
            void runTemplateVideoPromptLoading();
            return true;
          }
          return false;
        case "generate_kling":
          if (flowStage === "step4_prompt_gate" || flowStage === "step4_gate") {
            void runTemplateKlingLoading();
            return true;
          }
          return false;
        default:
          return false;
      }
    },
    [
      flowStage,
      isTemplateReplayActive,
      runTemplateImagesLoading,
      runTemplateKlingLoading,
      runTemplatePromptsLoading,
      runTemplateVideoPromptLoading,
    ],
  );

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
    /** Brand selected and run cached; waiting for user to click Generate to start replay. */
    isBrandSelected: flowStage === "brand_selected",
    gateStep,
    gateLabel: gateStep ? LTA_TEMPLATE_RECORDING_STEP_LABELS[gateStep] : null,
    requestTemplateToggle,
    confirmTemplateStart,
    cancelTemplateStart,
    confirmTemplateExit,
    cancelTemplateExit,
    startBrandFlow,
    beginTemplateReplay,
    cancelBrandSelected,
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

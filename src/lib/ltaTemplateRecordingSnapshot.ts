import {
  cloneExtractedBase,
  createEmptyKlingByReference,
  emptyAnglePipeline,
  readUniverseFromExtracted,
  type LinkToAdAnglePipelineV1,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";
import type { LtaTemplateRecordingGateStep } from "@/lib/ltaTemplateRecording";
import { pickBestProductUrlForNanoBanana } from "@/lib/productReferenceImages";

export type LtaTemplateStep3Phase = "prompts" | "full";
export type LtaTemplateStep4Phase = "prompt" | "full";

function stripNanoImagesFromPipeline(p: LinkToAdAnglePipelineV1): LinkToAdAnglePipelineV1 {
  return {
    ...p,
    nanoBananaImageUrls: [],
    nanoBananaImageUrl: null,
    nanoBananaSelectedImageIndex: null,
    nanoBananaTaskId: null,
    nanoBananaTaskIds: [null, null, null] as (string | null)[],
    nanoThreeGenerating: false,
  };
}

function stripPipelineToStep(
  snap: LinkToAdUniverseSnapshotV1,
  maxStep: LtaTemplateRecordingGateStep,
  step3Phase: LtaTemplateStep3Phase = "full",
  step4Phase: LtaTemplateStep4Phase = "full",
): LinkToAdUniverseSnapshotV1 {
  const emptyPipe = emptyAnglePipeline();
  const triple = snap.linkToAdPipelineByAngle;
  const pipes =
    triple && triple.length === 3
      ? triple.map((p) => {
          if (maxStep >= 4) return p;
          if (maxStep >= 3) {
            const base = {
              ...p,
              ugcVideoPromptGpt: "",
              klingByReferenceIndex: createEmptyKlingByReference(),
              videoStageMode: false,
            };
            if (step3Phase === "prompts") {
              return stripNanoImagesFromPipeline(base);
            }
            return base;
          }
          return { ...emptyPipe };
        })
      : [emptyAnglePipeline(), emptyAnglePipeline(), emptyAnglePipeline()];

  if (maxStep >= 4) {
    if (step4Phase === "prompt") {
      return {
        ...snap,
        klingTaskId: null,
        klingVideoUrl: null,
        klingByReferenceIndex: createEmptyKlingByReference(),
        videoStageMode: true,
        linkToAdPipelineByAngle: pipes.map((p) => ({
          ...p,
          klingByReferenceIndex: createEmptyKlingByReference(),
        })) as typeof snap.linkToAdPipelineByAngle,
      };
    }
    return { ...snap, linkToAdPipelineByAngle: pipes as typeof snap.linkToAdPipelineByAngle };
  }

  if (maxStep >= 3) {
    const promptsOnly = step3Phase === "prompts";
    return {
      ...snap,
      ugcVideoPromptGpt: "",
      klingTaskId: null,
      klingVideoUrl: null,
      klingByReferenceIndex: createEmptyKlingByReference(),
      videoStageMode: false,
      linkToAdPipelineByAngle: pipes as typeof snap.linkToAdPipelineByAngle,
      nanoBananaPromptsRaw: snap.nanoBananaPromptsRaw,
      nanoBananaSelectedPromptIndex: snap.nanoBananaSelectedPromptIndex,
      nanoBananaImageUrls: promptsOnly ? [] : snap.nanoBananaImageUrls,
      nanoBananaImageUrl: promptsOnly ? null : snap.nanoBananaImageUrl,
      nanoBananaSelectedImageIndex: promptsOnly ? null : snap.nanoBananaSelectedImageIndex,
      nanoBananaTaskId: promptsOnly ? null : snap.nanoBananaTaskId,
    };
  }

  if (maxStep >= 2) {
    return {
      ...snap,
      phase: "after_scripts",
      /** Force null so the angle-picker section renders (not the empty I2V pipeline). */
      selectedAngleIndex: null,
      ugcVideoPromptGpt: "",
      klingTaskId: null,
      klingVideoUrl: null,
      klingByReferenceIndex: createEmptyKlingByReference(),
      videoStageMode: false,
      linkToAdPipelineByAngle: pipes as typeof snap.linkToAdPipelineByAngle,
      nanoBananaPromptsRaw: "",
      nanoBananaImageUrls: [],
      nanoBananaImageUrl: null,
      nanoBananaSelectedImageIndex: null,
      nanoBananaTaskId: null,
    };
  }

  return {
    ...snap,
    phase: "after_summary",
    scriptsText: "",
    angleLabels: ["", "", ""],
    selectedAngleIndex: null,
    ugcVideoPromptGpt: "",
    klingTaskId: null,
    klingVideoUrl: null,
    klingByReferenceIndex: createEmptyKlingByReference(),
    videoStageMode: false,
    linkToAdPipelineByAngle: [
      emptyAnglePipeline(),
      emptyAnglePipeline(),
      emptyAnglePipeline(),
    ],
    nanoBananaPromptsRaw: "",
    nanoBananaImageUrls: [],
    nanoBananaImageUrl: null,
    nanoBananaSelectedImageIndex: null,
    nanoBananaTaskId: null,
  };
}

export type BuildExtractedForTemplateStepOpts = {
  /** Step 3 only: show saved prompts without images, then full images on `"full"`. */
  step3Phase?: LtaTemplateStep3Phase;
  /** Step 4 only: video prompt without render, then full video on `"full"`. */
  step4Phase?: LtaTemplateStep4Phase;
  storeUrl?: string;
};

/** Product refs sent to Nano (same priority as Link to Ad “Generate 3 images”), not generated outputs. */
function buildNanoInputCandidateUrls(snap: LinkToAdUniverseSnapshotV1): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const t = (raw ?? "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  const list = snap.productOnlyImageUrls;
  if (list?.length) {
    for (let i = list.length - 1; i >= 0; i--) push(list[i]);
  }
  push(snap.cleanCandidate?.url);
  return out;
}

function resolveTemplateNanoInputProductUrl(
  source: LinkToAdUniverseSnapshotV1,
  storeUrl: string,
): string | null {
  const pageUrl = storeUrl.trim();
  if (!pageUrl) {
    return (
      source.neutralUploadUrl?.trim() ||
      buildNanoInputCandidateUrls(source)[0] ||
      source.fallbackImageUrl?.trim() ||
      null
    );
  }
  return pickBestProductUrlForNanoBanana({
    pageUrl,
    neutralUploadUrl: source.neutralUploadUrl,
    candidateUrls: buildNanoInputCandidateUrls(source),
    fallbackUrl: source.fallbackImageUrl,
  });
}

function applyTemplateProductPhotoDisplay(
  snap: LinkToAdUniverseSnapshotV1,
  source: LinkToAdUniverseSnapshotV1,
  storeUrl: string,
): LinkToAdUniverseSnapshotV1 {
  const inputUrl = resolveTemplateNanoInputProductUrl(source, storeUrl);
  if (!inputUrl) return snap;
  return {
    ...snap,
    cleanCandidate: { url: inputUrl, reason: "Product reference for image generation" },
    productOnlyImageUrls: [inputUrl],
    neutralUploadUrl: source.neutralUploadUrl?.trim() === inputUrl ? source.neutralUploadUrl : snap.neutralUploadUrl,
  };
}

/** Build extracted JSON for template replay up to the given step (inclusive). */
export function buildExtractedForTemplateStep(
  extracted: unknown,
  maxStep: LtaTemplateRecordingGateStep,
  opts?: BuildExtractedForTemplateStepOpts,
): unknown {
  const snap0 = readUniverseFromExtracted(extracted);
  if (!snap0) return extracted;
  const base = cloneExtractedBase(extracted);
  const step3Phase = maxStep === 3 ? (opts?.step3Phase ?? "full") : "full";
  const step4Phase = maxStep === 4 ? (opts?.step4Phase ?? "full") : "full";
  const storeUrl = typeof opts?.storeUrl === "string" ? opts.storeUrl : "";
  let snap = stripPipelineToStep(snap0, maxStep, step3Phase, step4Phase);
  if (maxStep >= 1) {
    snap = applyTemplateProductPhotoDisplay(snap, snap0, storeUrl);
  }
  return { ...base, __universe: snap };
}

import {
  cloneExtractedBase,
  createEmptyKlingByReference,
  emptyAnglePipeline,
  normalizePipelineByAngle,
  readUniverseFromExtracted,
  type LinkToAdAnglePipelineV1,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";
import type { LtaTemplateRecordingGateStep } from "@/lib/ltaTemplateRecording";

export type LtaTemplateStep3Phase = "prompts" | "full";

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
};

/** Prefer the Nano reference frame used for image generation (not the scraper pick). */
function resolveTemplateProductPhotoUrl(snap: LinkToAdUniverseSnapshotV1): string | null {
  const triple = normalizePipelineByAngle(snap);
  const sel = snap.selectedAngleIndex;
  const slot = sel === 0 || sel === 1 || sel === 2 ? sel : sel === 3 ? 2 : 0;
  const pipe = triple[slot];
  const fromSelectedIdx = pipe?.nanoBananaSelectedImageIndex;
  if (fromSelectedIdx === 0 || fromSelectedIdx === 1 || fromSelectedIdx === 2) {
    const picked = pipe?.nanoBananaImageUrls?.[fromSelectedIdx]?.trim();
    if (picked) return picked;
  }
  const fromPipeUrl = pipe?.nanoBananaImageUrl?.trim();
  if (fromPipeUrl) return fromPipeUrl;
  const fromPipeList = pipe?.nanoBananaImageUrls?.find((u) => typeof u === "string" && u.trim());
  if (fromPipeList?.trim()) return fromPipeList.trim();

  const topIdx = snap.nanoBananaSelectedImageIndex;
  if (topIdx === 0 || topIdx === 1 || topIdx === 2) {
    const picked = snap.nanoBananaImageUrls?.[topIdx]?.trim();
    if (picked) return picked;
  }
  const topUrl = snap.nanoBananaImageUrl?.trim();
  if (topUrl) return topUrl;
  const topList = snap.nanoBananaImageUrls?.find((u) => typeof u === "string" && u.trim());
  if (topList?.trim()) return topList.trim();

  return null;
}

function applyTemplateProductPhotoDisplay(snap: LinkToAdUniverseSnapshotV1, source: LinkToAdUniverseSnapshotV1): LinkToAdUniverseSnapshotV1 {
  const genUrl = resolveTemplateProductPhotoUrl(source);
  if (!genUrl) return snap;
  return {
    ...snap,
    cleanCandidate: { url: genUrl, reason: "Reference used for image generation" },
    productOnlyImageUrls: [genUrl],
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
  let snap = stripPipelineToStep(snap0, maxStep, step3Phase);
  if (maxStep >= 1) {
    snap = applyTemplateProductPhotoDisplay(snap, snap0);
  }
  return { ...base, __universe: snap };
}

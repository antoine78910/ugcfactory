import {
  cloneExtractedBase,
  createEmptyKlingByReference,
  emptyAnglePipeline,
  readUniverseFromExtracted,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";
import type { LtaTemplateRecordingGateStep } from "@/lib/ltaTemplateRecording";

function stripPipelineToStep(
  snap: LinkToAdUniverseSnapshotV1,
  maxStep: LtaTemplateRecordingGateStep,
): LinkToAdUniverseSnapshotV1 {
  const emptyPipe = emptyAnglePipeline();
  const triple = snap.linkToAdPipelineByAngle;
  const pipes =
    triple && triple.length === 3
      ? triple.map((p) => {
          if (maxStep >= 4) return p;
          if (maxStep >= 3) {
            return {
              ...p,
              ugcVideoPromptGpt: "",
              klingByReferenceIndex: createEmptyKlingByReference(),
              videoStageMode: false,
            };
          }
          return { ...emptyPipe };
        })
      : [emptyAnglePipeline(), emptyAnglePipeline(), emptyAnglePipeline()];

  if (maxStep >= 4) {
    return { ...snap, linkToAdPipelineByAngle: pipes as typeof snap.linkToAdPipelineByAngle };
  }

  if (maxStep >= 3) {
    return {
      ...snap,
      ugcVideoPromptGpt: "",
      klingTaskId: null,
      klingVideoUrl: null,
      klingByReferenceIndex: createEmptyKlingByReference(),
      videoStageMode: false,
      linkToAdPipelineByAngle: pipes as typeof snap.linkToAdPipelineByAngle,
      nanoBananaPromptsRaw: snap.nanoBananaPromptsRaw,
      nanoBananaImageUrls: snap.nanoBananaImageUrls,
      nanoBananaImageUrl: snap.nanoBananaImageUrl,
      nanoBananaSelectedImageIndex: snap.nanoBananaSelectedImageIndex,
      nanoBananaSelectedPromptIndex: snap.nanoBananaSelectedPromptIndex,
      nanoBananaTaskId: snap.nanoBananaTaskId,
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

/** Build extracted JSON for template replay up to the given step (inclusive). */
export function buildExtractedForTemplateStep(
  extracted: unknown,
  maxStep: LtaTemplateRecordingGateStep,
): unknown {
  const snap0 = readUniverseFromExtracted(extracted);
  if (!snap0) return extracted;
  const base = cloneExtractedBase(extracted);
  const snap = stripPipelineToStep(snap0, maxStep);
  return { ...base, __universe: snap };
}

export const RECREATE_FRAME_INTERVAL_SEC = 0.1;
export const RECREATE_MAX_ANALYSIS_DURATION_SEC = 15;
export const RECREATE_MAX_FRAMES = 150;
export const RECREATE_BATCH_SIZE = 12;

export type UploadedRecreateFrame = {
  frameIndex: number;
  timestampSec: number;
  imageUrl: string;
};

export type RecreateFrameAnalysis = {
  frameIndex: number;
  timestampSec: number;
  isSceneStart: boolean;
  captureRole?: "start" | "end";
  description: string;
  subjectAction: string;
  movement: string;
  textVisible: boolean;
};

export type RecreateFrameAnalysisWithScene = RecreateFrameAnalysis & {
  sceneId: string;
};

/** Visual / production lane inferred from screenshots (for model + prompt routing). */
export const RECREATE_VISUAL_STYLE_CATEGORIES = [
  "authentic_ugc",
  "studio_ugc",
  "motion_graphics",
  "claymation_stop_motion",
  "pixar_3d_cgi",
  "hyperreal_cgi",
  "cinematic_live_action",
  "meme_raw",
  "unknown",
] as const;

export type RecreateVisualStyleCategory = (typeof RECREATE_VISUAL_STYLE_CATEGORIES)[number];

export function parseRecreateVisualStyleCategory(raw: unknown): RecreateVisualStyleCategory {
  if (typeof raw !== "string") return "unknown";
  const t = raw.trim() as RecreateVisualStyleCategory;
  return (RECREATE_VISUAL_STYLE_CATEGORIES as readonly string[]).includes(t) ? t : "unknown";
}

export type RecreateScene = {
  sceneId: string;
  startFrameIndex: number;
  endFrameIndex: number;
  startSec: number;
  endSec: number;
  /** Public HTTPS JPEG of the scene start frame (for GPT Image 2 references). */
  sceneStartImageUrl?: string;
  /** Public HTTPS JPEG of the scene end frame (for GPT Image 2 references). */
  sceneEndImageUrl?: string;
  shortDescription: string;
  summary: string;
  startDescription?: string;
  endDescription?: string;
  transitionSummary?: string;
  recreationNotes?: string;
  /** Inferred production style (UGC, claymation, Pixar-like CGI, etc.). */
  visualStyleCategory?: RecreateVisualStyleCategory;
  visualStyleConfidence?: "high" | "medium" | "low";
  visualStyleRationale?: string;
  /** Setting: room, location, set dressing, props, depth, palette. */
  backgroundDescription?: string;
  /** Who is on camera: presentation, wardrobe, energy, eyeline; avoid unsafe demographic guessing. */
  onScreenTalentDescription?: string;
  lightingAndGradeNotes?: string;
  /** Likely spoken line or VO tone; quote only if clearly grounded in the frames. */
  dialogueOrVoiceoverHints?: string;
  /** One rich paragraph suitable for text-to-video / image-to-video tools. */
  videoGenerationPrompt?: string;
  /** Studio Video picker ids; subset of `STUDIO_VIDEO_PICKER_IDS`. */
  recommendedVideoModels?: string[];
  /** Primary persuasion lever for this beat (e.g. social proof, urgency, demo). */
  primaryMarketingAngleLabel?: string;
  primaryMarketingAngleRationale?: string;
};

export type RecreateCreativeBriefSecondaryAngle = {
  label: string;
  rationale: string;
};

/** Aggregated narrative + marketing view after all scenes are analyzed. */
export type RecreateCreativeBrief = {
  globalVisualStyleCategory: RecreateVisualStyleCategory;
  globalVisualStyleRationale: string;
  primaryMarketingAngleLabel: string;
  primaryMarketingAngleRationale: string;
  secondaryMarketingAngles: RecreateCreativeBriefSecondaryAngle[];
  /** Full spoken / VO script with scene markers; brand placeholders until product context is added. */
  fullVideoScriptDraft: string;
  /** How to treat each scene clip in the final timeline (order, pacing, match cuts). */
  finalEditAssemblyNotes: string;
  /** How this creative tests angles vs typical SaaS / DTC patterns (for later portfolio analytics). */
  marketingTestingNotes: string;
  /** Reminder to upload packshot / product for brand-accurate regeneration. */
  productUploadCallout: string;
};

export type RecreateAnalyzeRequest = {
  fileName: string;
  durationSec: number;
  frameIntervalSec: number;
  truncated: boolean;
  videoUrl?: string | null;
  frames: UploadedRecreateFrame[];
};

export type MergedRecreateAnalysis = {
  frames: RecreateFrameAnalysisWithScene[];
  scenes: RecreateScene[];
  segmentationSummary: string;
  videoSummary: string;
};

export type RecreateAnalyzeResponse = MergedRecreateAnalysis & {
  model: string;
  frameIntervalSec: number;
  analyzedFrameCount: number;
  sceneCount: number;
  truncated: boolean;
  logs: string[];
  /** Present when the scene-detection + Claude pipeline runs; null on failure or legacy frame path. */
  creativeBrief: RecreateCreativeBrief | null;
};

function roundToMillis(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function compactText(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ");
}

export function buildFrameTimestamps(
  durationSec: number,
  intervalSec: number,
  maxDurationSec: number,
  maxFrames: number,
): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) return [];
  if (!Number.isFinite(maxDurationSec) || maxDurationSec <= 0) return [];
  if (!Number.isFinite(maxFrames) || maxFrames <= 0) return [];

  const cappedDuration = Math.min(durationSec, maxDurationSec);
  const frameCount = Math.min(
    maxFrames,
    Math.max(1, Math.floor((cappedDuration - 1e-9) / intervalSec) + 1),
  );
  const out: number[] = [];

  for (let idx = 0; idx < frameCount; idx += 1) {
    out.push(roundToMillis(idx * intervalSec));
  }

  return out;
}

export function groupFramesIntoBatches(
  frames: UploadedRecreateFrame[],
  maxBatchSize: number,
): UploadedRecreateFrame[][] {
  if (maxBatchSize <= 0) return [];

  const ordered = [...frames].sort((a, b) => a.frameIndex - b.frameIndex || a.timestampSec - b.timestampSec);
  const batches: UploadedRecreateFrame[][] = [];

  for (let idx = 0; idx < ordered.length; idx += maxBatchSize) {
    batches.push(ordered.slice(idx, idx + maxBatchSize));
  }

  return batches;
}

export function mergeBatchFrameAnalyses(frames: RecreateFrameAnalysis[]): MergedRecreateAnalysis {
  const ordered = [...frames].sort((a, b) => a.frameIndex - b.frameIndex || a.timestampSec - b.timestampSec);
  if (ordered.length === 0) {
    return {
      frames: [],
      scenes: [],
      segmentationSummary: "No frames were analyzed.",
      videoSummary: "No frame-level analysis is available.",
    };
  }

  const scenes: RecreateScene[] = [];
  const framesWithScene: RecreateFrameAnalysisWithScene[] = [];

  let currentSceneIndex = 0;
  let currentSceneStart = 0;

  const closeScene = (endExclusive: number) => {
    const slice = ordered.slice(currentSceneStart, endExclusive);
    if (slice.length === 0) return;

    currentSceneIndex += 1;
    const sceneId = `scene-${currentSceneIndex}`;
    const start = slice[0]!;
    const end = slice[slice.length - 1]!;

    for (const frame of slice) {
      framesWithScene.push({ ...frame, sceneId });
    }

    const shortDescription = start.description.trim() || `Scene ${currentSceneIndex}`;
    const summary = compactText([
      shortDescription,
      start.subjectAction,
      end.movement && end.movement !== start.movement ? `Ends with ${end.movement}.` : start.movement,
    ]);

    scenes.push({
      sceneId,
      startFrameIndex: start.frameIndex,
      endFrameIndex: end.frameIndex,
      startSec: start.timestampSec,
      endSec: end.timestampSec,
      shortDescription,
      summary,
    });
  };

  for (let idx = 1; idx < ordered.length; idx += 1) {
    if (ordered[idx]!.isSceneStart) {
      closeScene(idx);
      currentSceneStart = idx;
    }
  }

  closeScene(ordered.length);

  const segmentationSummary =
    scenes.length === 1
      ? "1 scene detected across the analyzed frames."
      : `${scenes.length} scenes detected across ${ordered.length} analyzed frames.`;

  const videoSummary = scenes
    .map((scene) => `${scene.sceneId} (${scene.startSec.toFixed(1)}s-${scene.endSec.toFixed(1)}s): ${scene.shortDescription}`)
    .join(" ");

  return {
    frames: framesWithScene,
    scenes,
    segmentationSummary,
    videoSummary,
  };
}

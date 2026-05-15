export const runtime = "nodejs";
export const maxDuration = 120;

import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { existsSync, statSync } from "fs";
import { chmod, mkdir, readFile, readdir, rm, unlink, writeFile } from "fs/promises";
import { NextResponse } from "next/server";
import { tmpdir } from "os";
import { join } from "path";
import ffmpegStatic from "ffmpeg-static";
import { gunzipSync } from "zlib";

import { claudeMessagesText, claudeMessagesTextWithImages, type ClaudeModel } from "@/lib/claudeResponses";
import {
  openaiResponsesTextWithImages,
  parseOpenAiRetryAfterMs,
  type OpenaiImageDetail,
} from "@/lib/openaiResponses";
import {
  groupFramesIntoBatches,
  mergeBatchFrameAnalyses,
  RECREATE_BATCH_SIZE,
  type RecreateAnalyzeRequest,
  type RecreateCreativeBrief,
  type RecreateCreativeBriefSecondaryAngle,
  type RecreateFrameAnalysis,
  type RecreateFrameAnalysisWithScene,
  type RecreateScene,
  parseRecreateVisualStyleCategory,
  type UploadedRecreateFrame,
} from "@/lib/recreateAnalysis";
import {
  buildSceneCaptureFrames,
  getSceneCaptureOutputConfig,
  buildSceneRanges,
  parseSelectedSceneTimestamps,
  RECREATE_SCENE_THRESHOLD,
  type RecreateDetectedScene,
} from "@/lib/recreateSceneDetection";
import { uploadRecreateSceneFrameJpeg } from "@/lib/recreateFrameUpload";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import {
  fallbackVideoModelsForVisualStyle,
  RECREATE_ANALYSIS_VIDEO_MODEL_ALLOWLIST,
  sanitizeRecreateRecommendedVideoModels,
} from "@/lib/recreateVideoModelRecommendations";

const ANALYSIS_MODEL = "gpt-4o-mini" as const;
const SCENE_ANALYSIS_MODEL: ClaudeModel = "claude-sonnet-4-6";
const ANALYSIS_IMAGE_DETAIL: OpenaiImageDetail = "low";
const ANALYSIS_MAX_RATE_LIMIT_RETRIES = 6;
const ANALYSIS_FALLBACK_RETRY_MS = 3000;
const CLAUDE_MAX_RETRIES = 3;
const CLAUDE_FALLBACK_RETRY_MS = 2500;
const FFMPEG_BIN = join(tmpdir(), process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const FFMPEG_GZ_URL =
  "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz";
const MIN_BINARY_SIZE = 30 * 1024 * 1024;
const SCENE_FRAME_MAX_LONG_EDGE = 480;
const SCENES_PER_BATCH = Math.max(1, Math.floor(RECREATE_BATCH_SIZE / 2));

type BatchModelFrame = {
  frameIndex?: unknown;
  timestampSec?: unknown;
  isSceneStart?: unknown;
  description?: unknown;
  subjectAction?: unknown;
  movement?: unknown;
  textVisible?: unknown;
};

type BatchModelResponse = {
  batchSummary?: unknown;
  frames?: unknown;
};

type SceneBatchModelScene = {
  sceneId?: unknown;
  shortDescription?: unknown;
  summary?: unknown;
  startDescription?: unknown;
  endDescription?: unknown;
  transitionSummary?: unknown;
  recreationNotes?: unknown;
  startSubjectAction?: unknown;
  endSubjectAction?: unknown;
  startMovement?: unknown;
  endMovement?: unknown;
  startTextVisible?: unknown;
  endTextVisible?: unknown;
  visualStyleCategory?: unknown;
  visualStyleConfidence?: unknown;
  visualStyleRationale?: unknown;
  backgroundDescription?: unknown;
  onScreenTalentDescription?: unknown;
  lightingAndGradeNotes?: unknown;
  dialogueOrVoiceoverHints?: unknown;
  videoGenerationPrompt?: unknown;
  recommendedVideoModels?: unknown;
  primaryMarketingAngleLabel?: unknown;
  primaryMarketingAngleRationale?: unknown;
};

type SceneBatchModelResponse = {
  batchSummary?: unknown;
  scenes?: unknown;
};

type SceneCapturePair = {
  sceneId: string;
  startSec: number;
  endSec: number;
  startCaptureSec: number;
  endCaptureSec: number;
  /** Image URL sent to vision models (HTTPS preferred, data URL fallback). */
  startImageUrl: string;
  endImageUrl: string;
  /** Public storage URL when upload succeeded; used for GPT Image 2 references. */
  startFrameStorageUrl: string | null;
  endFrameStorageUrl: string | null;
};

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const direct = trimmed.replace(/^```json\s*|\s*```$/g, "").trim();

  try {
    return JSON.parse(direct) as Record<string, unknown>;
  } catch {
    const start = direct.indexOf("{");
    const end = direct.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(direct.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Model response did not contain valid JSON.");
  }
}

const STUDIO_VIDEO_MODEL_CHOICES_FOR_PROMPT = `Pick 2-4 recommendedVideoModels strings from this exact allowlist only (use the literal id strings):
${RECREATE_ANALYSIS_VIDEO_MODEL_ALLOWLIST.map((id) => `"${id}"`).join(", ")}`;

function parseStyleConfidence(raw: unknown): "high" | "medium" | "low" | undefined {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return undefined;
}

function mergeRecommendedModels(category: string, sanitized: string[]): string[] {
  if (sanitized.length > 0) return sanitized;
  return fallbackVideoModelsForVisualStyle(category);
}

function verifyFfmpeg(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, ["-version"], { timeout: 10_000 }, (err) => {
      resolve(!err);
    });
  });
}

async function ensureFfmpeg(): Promise<string> {
  if (typeof ffmpegStatic === "string" && ffmpegStatic && existsSync(ffmpegStatic)) {
    const ok = await verifyFfmpeg(ffmpegStatic);
    if (ok) return ffmpegStatic;
  }

  if (await verifyFfmpeg("ffmpeg")) return "ffmpeg";

  if (existsSync(FFMPEG_BIN)) {
    const size = statSync(FFMPEG_BIN).size;
    if (size > MIN_BINARY_SIZE) {
      const ok = await verifyFfmpeg(FFMPEG_BIN);
      if (ok) return FFMPEG_BIN;
    }
  }

  if (process.platform !== "linux") {
    throw new Error("ffmpeg not found on this system. Install ffmpeg or keep ffmpeg-static available.");
  }

  const res = await fetch(FFMPEG_GZ_URL, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`ffmpeg download failed: HTTP ${res.status}`);
  const gz = Buffer.from(await res.arrayBuffer());
  const bin = gunzipSync(gz);
  if (bin.length < MIN_BINARY_SIZE) throw new Error("ffmpeg binary too small");
  await writeFile(FFMPEG_BIN, bin);
  await chmod(FFMPEG_BIN, 0o755);
  const ok = await verifyFfmpeg(FFMPEG_BIN);
  if (!ok) throw new Error("ffmpeg downloaded but could not execute");
  return FFMPEG_BIN;
}

function runFfmpeg(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`ffmpeg failed: ${stderr || err.message}`));
      else resolve({ stdout, stderr });
    });
  });
}

function imageBufferToDataUrl(buf: Buffer, mediaType: string): string {
  return `data:${mediaType};base64,${buf.toString("base64")}`;
}

function groupItemsIntoBatches<T>(items: T[], maxBatchSize: number): T[][] {
  if (maxBatchSize <= 0) return [];
  const batches: T[][] = [];

  for (let idx = 0; idx < items.length; idx += maxBatchSize) {
    batches.push(items.slice(idx, idx + maxBatchSize));
  }

  return batches;
}

async function detectSceneCapturePairs(opts: {
  videoUrl: string;
  durationSec: number;
  logs: string[];
  userId: string;
}): Promise<SceneCapturePair[]> {
  const { videoUrl, durationSec, logs, userId } = opts;
  logs.push(`Downloading source video for scene detection: ${videoUrl}`);
  const download = await fetch(videoUrl, { cache: "no-store" });
  if (!download.ok) {
    throw new Error(`Could not download the uploaded video (HTTP ${download.status}).`);
  }

  const bin = await ensureFfmpeg();
  const id = randomUUID();
  const workDir = join(tmpdir(), `recreate-scenes-${id}`);
  const inputPath = join(workDir, "input.mp4");
  await mkdir(workDir, { recursive: true });
  await writeFile(inputPath, Buffer.from(await download.arrayBuffer()));

  try {
    logs.push(`Running ffmpeg scene detection with threshold ${RECREATE_SCENE_THRESHOLD}.`);
    const sceneDetect = await runFfmpeg(bin, [
      "-hide_banner",
      "-i",
      inputPath,
      "-vf",
      `select='gt(scene,${RECREATE_SCENE_THRESHOLD})',showinfo`,
      "-an",
      "-f",
      "null",
      "-",
    ]);

    const cutStarts = parseSelectedSceneTimestamps(sceneDetect.stderr);
    const scenes = buildSceneRanges(cutStarts, durationSec);
    logs.push(`Detected ${scenes.length} scenes (${Math.max(0, scenes.length - 1)} cuts).`);

    const captures = buildSceneCaptureFrames(scenes);
    const captureImages = new Map<string, { dataUrl: string; storageUrl: string | null }>();

    for (const capture of captures) {
      const output = getSceneCaptureOutputConfig(capture.captureId);
      const outputPath = join(workDir, output.fileName);
      await runFfmpeg(bin, [
        "-hide_banner",
        "-ss",
        capture.timestampSec.toFixed(3),
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-update",
        "1",
        "-vf",
        `scale='if(gte(iw,ih),${SCENE_FRAME_MAX_LONG_EDGE},-2)':'if(gte(iw,ih),-2,${SCENE_FRAME_MAX_LONG_EDGE})'`,
        "-y",
        outputPath,
      ]);

      const buf = await readFile(outputPath);
      const dataUrl = imageBufferToDataUrl(buf, output.mediaType);
      let storageUrl: string | null = null;
      try {
        storageUrl = await uploadRecreateSceneFrameJpeg(userId, buf);
        logs.push(`Uploaded scene frame ${capture.captureId} to storage.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logs.push(`Scene frame ${capture.captureId} storage upload skipped: ${msg}`);
      }
      captureImages.set(capture.captureId, { dataUrl, storageUrl });
    }

    const scenePairs: SceneCapturePair[] = scenes.map((scene: RecreateDetectedScene) => {
      const startCapture = captures.find(
        (capture) => capture.sceneId === scene.sceneId && capture.captureRole === "start",
      );
      const endCapture = captures.find(
        (capture) => capture.sceneId === scene.sceneId && capture.captureRole === "end",
      );
      const startPack = startCapture ? captureImages.get(startCapture.captureId) : null;
      const endPack = endCapture ? captureImages.get(endCapture.captureId) : null;

      if (!startCapture || !endCapture || !startPack || !endPack) {
        throw new Error(`Could not extract both start and end screenshots for ${scene.sceneId}.`);
      }

      const startImageUrl = startPack.storageUrl ?? startPack.dataUrl;
      const endImageUrl = endPack.storageUrl ?? endPack.dataUrl;

      return {
        sceneId: scene.sceneId,
        startSec: scene.startSec,
        endSec: scene.endSec,
        startCaptureSec: startCapture.timestampSec,
        endCaptureSec: endCapture.timestampSec,
        startImageUrl,
        endImageUrl,
        startFrameStorageUrl: startPack.storageUrl,
        endFrameStorageUrl: endPack.storageUrl,
      };
    });

    logs.push(
      `Extracted ${captures.length} screenshots for Claude analysis (${scenePairs.length} scenes x start/end).`,
    );
    return scenePairs;
  } finally {
    const files = await readdir(workDir).catch(() => []);
    await Promise.all(files.map((file) => unlink(join(workDir, file)).catch(() => {})));
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function normalizeBatchFrames(
  rawFrames: unknown,
  expectedFrames: UploadedRecreateFrame[],
): RecreateFrameAnalysis[] {
  const parsed = Array.isArray(rawFrames) ? (rawFrames as BatchModelFrame[]) : [];
  const byIndex = new Map<number, BatchModelFrame>();

  for (const frame of parsed) {
    const frameIndex = typeof frame.frameIndex === "number" ? frame.frameIndex : null;
    if (frameIndex === null || !Number.isFinite(frameIndex)) continue;
    byIndex.set(frameIndex, frame);
  }

  return expectedFrames.map((frame, idx) => {
    const modelFrame = byIndex.get(frame.frameIndex);
    const description =
      typeof modelFrame?.description === "string" && modelFrame.description.trim()
        ? modelFrame.description.trim()
        : `Frame ${frame.frameIndex} at ${frame.timestampSec.toFixed(1)}s.`;
    const subjectAction =
      typeof modelFrame?.subjectAction === "string" && modelFrame.subjectAction.trim()
        ? modelFrame.subjectAction.trim()
        : "No clear action extracted.";
    const movement =
      typeof modelFrame?.movement === "string" && modelFrame.movement.trim()
        ? modelFrame.movement.trim()
        : "No strong movement detected.";

    return {
      frameIndex: frame.frameIndex,
      timestampSec: frame.timestampSec,
      isSceneStart:
        typeof modelFrame?.isSceneStart === "boolean" ? modelFrame.isSceneStart : idx === 0,
      description,
      subjectAction,
      movement,
      textVisible: typeof modelFrame?.textVisible === "boolean" ? modelFrame.textVisible : false,
    };
  });
}

function buildSceneDeveloperPrompt(): string {
  return `You analyze short-form ad scenes using exactly two screenshots per scene: one from the start and one from the end.

Return strict JSON with this exact shape:
{
  "batchSummary": "short summary",
  "scenes": [
    {
      "sceneId": "scene-1",
      "shortDescription": "brief scene label",
      "summary": "overall scene summary",
      "startDescription": "what is visible at the start",
      "endDescription": "what is visible at the end",
      "transitionSummary": "how the scene evolves from start to end",
      "recreationNotes": "useful details to recreate this scene accurately",
      "startSubjectAction": "main action at the start",
      "endSubjectAction": "main action at the end",
      "startMovement": "camera or subject movement at the start",
      "endMovement": "camera or subject movement at the end",
      "startTextVisible": false,
      "endTextVisible": false,
      "visualStyleCategory": "authentic_ugc | studio_ugc | motion_graphics | claymation_stop_motion | pixar_3d_cgi | hyperreal_cgi | cinematic_live_action | meme_raw | unknown",
      "visualStyleConfidence": "high | medium | low",
      "visualStyleRationale": "why this category fits the look (materials, lensing, animation cues, set design)",
      "backgroundDescription": "detailed: location, set dressing, props, surfaces, depth, spatial layout, dominant colors",
      "onScreenTalentDescription": "who is on camera: role (creator, actor, VO-only B-roll), wardrobe, grooming, energy, eyeline, apparent mic/lav, handheld vs tripod vs gimbal feel; avoid guessing protected traits—describe only what is clearly visible",
      "lightingAndGradeNotes": "key/fill/rim, window light, studio softbox, contrast, saturation, grain, sharpness",
      "dialogueOrVoiceoverHints": "likely spoken line or VO tone; quote only if captions/lips/text in frame support it",
      "videoGenerationPrompt": "one rich English paragraph for a generative video model: include style lane (e.g. authentic UGC vs claymation vs Pixar-like 3D), camera, lens feel, action, background, wardrobe, lighting, and pacing",
      "recommendedVideoModels": ["kling-3.0/video"],
      "primaryMarketingAngleLabel": "short label for the main persuasion lever in this beat",
      "primaryMarketingAngleRationale": "1-2 sentences tied to what the viewer sees/hears"
    }
  ]
}

${STUDIO_VIDEO_MODEL_CHOICES_FOR_PROMPT}

Rules:
- Output JSON only.
- Keep every scene aligned to the provided sceneId.
- Each scene has exactly 2 images: start first, end second.
- Compare start vs end carefully and describe the evolution.
- Be concrete and verbose where it helps video recreation (background + on-screen talent + style cues).
- If the ad is clay/stop-motion/claymation, call that out explicitly (fingerprints, clay texture, stepped motion).
- If it is stylized 3D animation reminiscent of Pixar, use pixar_3d_cgi and describe rounded forms, rim light, caricature proportions.
- If it looks like a phone-filmed creator ad, lean toward authentic_ugc or studio_ugc.
- recommendedVideoModels must be an array of 2-4 allowlisted ids (literal strings). Prefer models that match the style lane (e.g. stylized CGI: sora-2-pro / veo3; fast UGC motion: kling-2.6 / seedance-fast).`;
}

function buildSceneUserPrompt(
  request: RecreateAnalyzeRequest,
  batch: SceneCapturePair[],
  batchIndex: number,
  batchCount: number,
): string {
  const sceneLines = batch.flatMap((scene, index) => [
    `${index * 2 + 1}. ${scene.sceneId}-start | scene window ${scene.startSec.toFixed(1)}s-${scene.endSec.toFixed(1)}s | captured at ${scene.startCaptureSec.toFixed(3)}s`,
    `${index * 2 + 2}. ${scene.sceneId}-end | scene window ${scene.startSec.toFixed(1)}s-${scene.endSec.toFixed(1)}s | captured at ${scene.endCaptureSec.toFixed(3)}s`,
  ]);

  return [
    `Analyze scene batch ${batchIndex + 1} of ${batchCount} for uploaded video "${request.fileName}".`,
    `Video duration: ${request.durationSec.toFixed(2)}s.`,
    "The appended screenshots appear in the exact order listed below.",
    "Each scene has 2 screenshots: start first, end second.",
    "Screenshots in this batch:",
    ...sceneLines,
    "",
    "For each scene, describe start vs end, the transition, background, on-screen talent, lighting/grade, inferred production style (UGC vs claymation vs Pixar-like CGI vs motion graphics, etc.), a rich videoGenerationPrompt, recommended Studio video models from the allowlist, and the primary marketing angle for that beat.",
  ].join("\n");
}

function normalizeSceneBatch(
  rawScenes: unknown,
  expectedScenes: SceneCapturePair[],
): Array<{
  sceneId: string;
  shortDescription: string;
  summary: string;
  startDescription: string;
  endDescription: string;
  transitionSummary: string;
  recreationNotes: string;
  startSubjectAction: string;
  endSubjectAction: string;
  startMovement: string;
  endMovement: string;
  startTextVisible: boolean;
  endTextVisible: boolean;
  visualStyleCategory: ReturnType<typeof parseRecreateVisualStyleCategory>;
  visualStyleConfidence?: "high" | "medium" | "low";
  visualStyleRationale: string;
  backgroundDescription: string;
  onScreenTalentDescription: string;
  lightingAndGradeNotes: string;
  dialogueOrVoiceoverHints: string;
  videoGenerationPrompt: string;
  recommendedVideoModels: string[];
  primaryMarketingAngleLabel: string;
  primaryMarketingAngleRationale: string;
}> {
  const parsed = Array.isArray(rawScenes) ? (rawScenes as SceneBatchModelScene[]) : [];
  const byId = new Map<string, SceneBatchModelScene>();

  for (const scene of parsed) {
    const sceneId = typeof scene.sceneId === "string" ? scene.sceneId.trim() : "";
    if (!sceneId) continue;
    byId.set(sceneId, scene);
  }

  return expectedScenes.map((scene) => {
    const modelScene = byId.get(scene.sceneId);
    const shortDescription =
      typeof modelScene?.shortDescription === "string" && modelScene.shortDescription.trim()
        ? modelScene.shortDescription.trim()
        : `${scene.sceneId} scene`;
    const summary =
      typeof modelScene?.summary === "string" && modelScene.summary.trim()
        ? modelScene.summary.trim()
        : shortDescription;
    const startDescription =
      typeof modelScene?.startDescription === "string" && modelScene.startDescription.trim()
        ? modelScene.startDescription.trim()
        : `Start of ${scene.sceneId}.`;
    const endDescription =
      typeof modelScene?.endDescription === "string" && modelScene.endDescription.trim()
        ? modelScene.endDescription.trim()
        : `End of ${scene.sceneId}.`;
    const transitionSummary =
      typeof modelScene?.transitionSummary === "string" && modelScene.transitionSummary.trim()
        ? modelScene.transitionSummary.trim()
        : "No transition summary returned.";
    const recreationNotes =
      typeof modelScene?.recreationNotes === "string" && modelScene.recreationNotes.trim()
        ? modelScene.recreationNotes.trim()
        : "No recreation notes returned.";
    const startSubjectAction =
      typeof modelScene?.startSubjectAction === "string" && modelScene.startSubjectAction.trim()
        ? modelScene.startSubjectAction.trim()
        : "No clear start action extracted.";
    const endSubjectAction =
      typeof modelScene?.endSubjectAction === "string" && modelScene.endSubjectAction.trim()
        ? modelScene.endSubjectAction.trim()
        : "No clear end action extracted.";
    const startMovement =
      typeof modelScene?.startMovement === "string" && modelScene.startMovement.trim()
        ? modelScene.startMovement.trim()
        : "No strong start movement detected.";
    const endMovement =
      typeof modelScene?.endMovement === "string" && modelScene.endMovement.trim()
        ? modelScene.endMovement.trim()
        : "No strong end movement detected.";

    const visualStyleCategory = parseRecreateVisualStyleCategory(modelScene?.visualStyleCategory);
    const visualStyleConfidence = parseStyleConfidence(modelScene?.visualStyleConfidence);
    const visualStyleRationale =
      typeof modelScene?.visualStyleRationale === "string" && modelScene.visualStyleRationale.trim()
        ? modelScene.visualStyleRationale.trim()
        : "No visual style rationale returned.";
    const backgroundDescription =
      typeof modelScene?.backgroundDescription === "string" && modelScene.backgroundDescription.trim()
        ? modelScene.backgroundDescription.trim()
        : "No detailed background description returned.";
    const onScreenTalentDescription =
      typeof modelScene?.onScreenTalentDescription === "string" && modelScene.onScreenTalentDescription.trim()
        ? modelScene.onScreenTalentDescription.trim()
        : "No on-screen talent description returned.";
    const lightingAndGradeNotes =
      typeof modelScene?.lightingAndGradeNotes === "string" && modelScene.lightingAndGradeNotes.trim()
        ? modelScene.lightingAndGradeNotes.trim()
        : "No lighting or grade notes returned.";
    const dialogueOrVoiceoverHints =
      typeof modelScene?.dialogueOrVoiceoverHints === "string" && modelScene.dialogueOrVoiceoverHints.trim()
        ? modelScene.dialogueOrVoiceoverHints.trim()
        : "No dialogue or VO hints returned.";
    const videoGenerationPromptRaw =
      typeof modelScene?.videoGenerationPrompt === "string" && modelScene.videoGenerationPrompt.trim()
        ? modelScene.videoGenerationPrompt.trim()
        : "";
    const videoGenerationPrompt =
      videoGenerationPromptRaw ||
      [shortDescription, transitionSummary, recreationNotes, `Maintain the ${visualStyleCategory} look.`]
        .filter(Boolean)
        .join(" ");

    const recommendedVideoModels = mergeRecommendedModels(
      visualStyleCategory,
      sanitizeRecreateRecommendedVideoModels(modelScene?.recommendedVideoModels),
    );

    const primaryMarketingAngleLabel =
      typeof modelScene?.primaryMarketingAngleLabel === "string" && modelScene.primaryMarketingAngleLabel.trim()
        ? modelScene.primaryMarketingAngleLabel.trim()
        : "Angle not labeled";
    const primaryMarketingAngleRationale =
      typeof modelScene?.primaryMarketingAngleRationale === "string" &&
      modelScene.primaryMarketingAngleRationale.trim()
        ? modelScene.primaryMarketingAngleRationale.trim()
        : "No marketing angle rationale returned.";

    return {
      sceneId: scene.sceneId,
      shortDescription,
      summary,
      startDescription,
      endDescription,
      transitionSummary,
      recreationNotes,
      startSubjectAction,
      endSubjectAction,
      startMovement,
      endMovement,
      startTextVisible: typeof modelScene?.startTextVisible === "boolean" ? modelScene.startTextVisible : false,
      endTextVisible: typeof modelScene?.endTextVisible === "boolean" ? modelScene.endTextVisible : false,
      visualStyleCategory,
      visualStyleConfidence,
      visualStyleRationale,
      backgroundDescription,
      onScreenTalentDescription,
      lightingAndGradeNotes,
      dialogueOrVoiceoverHints,
      videoGenerationPrompt,
      recommendedVideoModels,
      primaryMarketingAngleLabel,
      primaryMarketingAngleRationale,
    };
  });
}

type SceneDescriptionRow = ReturnType<typeof normalizeSceneBatch>[number];

function normalizeCreativeBriefSecondaryAngles(raw: unknown): RecreateCreativeBriefSecondaryAngle[] {
  if (!Array.isArray(raw)) return [];
  const out: RecreateCreativeBriefSecondaryAngle[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : "";
    const rationale = typeof o.rationale === "string" && o.rationale.trim() ? o.rationale.trim() : "";
    if (!label) continue;
    out.push({ label, rationale: rationale || "No rationale provided." });
    if (out.length >= 5) break;
  }
  return out;
}

function normalizeCreativeBriefRecord(parsed: Record<string, unknown>, scenes: RecreateScene[]): RecreateCreativeBrief {
  const first = scenes[0];
  const fromModelGlobal = parseRecreateVisualStyleCategory(parsed.globalVisualStyleCategory);
  const globalVisualStyleCategory =
    fromModelGlobal !== "unknown" ? fromModelGlobal : (first?.visualStyleCategory ?? "unknown");

  return {
    globalVisualStyleCategory,
    globalVisualStyleRationale:
      typeof parsed.globalVisualStyleRationale === "string" && parsed.globalVisualStyleRationale.trim()
        ? parsed.globalVisualStyleRationale.trim()
        : "No global style rationale returned.",
    primaryMarketingAngleLabel:
      typeof parsed.primaryMarketingAngleLabel === "string" && parsed.primaryMarketingAngleLabel.trim()
        ? parsed.primaryMarketingAngleLabel.trim()
        : first?.primaryMarketingAngleLabel ?? "Primary angle not labeled",
    primaryMarketingAngleRationale:
      typeof parsed.primaryMarketingAngleRationale === "string" && parsed.primaryMarketingAngleRationale.trim()
        ? parsed.primaryMarketingAngleRationale.trim()
        : first?.primaryMarketingAngleRationale ?? "No primary marketing angle rationale returned.",
    secondaryMarketingAngles: normalizeCreativeBriefSecondaryAngles(parsed.secondaryMarketingAngles),
    fullVideoScriptDraft:
      typeof parsed.fullVideoScriptDraft === "string" && parsed.fullVideoScriptDraft.trim()
        ? parsed.fullVideoScriptDraft.trim()
        : scenes.map((s) => `[${s.sceneId}]\n${s.summary}`).join("\n\n"),
    finalEditAssemblyNotes:
      typeof parsed.finalEditAssemblyNotes === "string" && parsed.finalEditAssemblyNotes.trim()
        ? parsed.finalEditAssemblyNotes.trim()
        : "Concatenate one generative clip per scene in scene order; match lighting between cuts where possible.",
    marketingTestingNotes:
      typeof parsed.marketingTestingNotes === "string" && parsed.marketingTestingNotes.trim()
        ? parsed.marketingTestingNotes.trim()
        : "Track which hooks and angles you have not yet A/B tested against this baseline creative.",
    productUploadCallout:
      typeof parsed.productUploadCallout === "string" && parsed.productUploadCallout.trim()
        ? parsed.productUploadCallout.trim()
        : "Upload a clear packshot or hero product image so the next pass can lock label colors, materials, and proportions to your SKU.",
  };
}

async function synthesizeRecreateCreativeBrief(opts: {
  fileName: string;
  durationSec: number;
  scenes: RecreateScene[];
  logs: string[];
}): Promise<RecreateCreativeBrief | null> {
  const { fileName, durationSec, scenes, logs } = opts;
  if (scenes.length === 0) return null;

  const payload = scenes.map((s) => ({
    sceneId: s.sceneId,
    timeRangeSec: [s.startSec, s.endSec],
    shortDescription: s.shortDescription,
    summary: s.summary,
    transitionSummary: s.transitionSummary,
    visualStyleCategory: s.visualStyleCategory,
    visualStyleRationale: s.visualStyleRationale,
    backgroundDescription: s.backgroundDescription,
    onScreenTalentDescription: s.onScreenTalentDescription,
    lightingAndGradeNotes: s.lightingAndGradeNotes,
    dialogueOrVoiceoverHints: s.dialogueOrVoiceoverHints,
    primaryMarketingAngleLabel: s.primaryMarketingAngleLabel,
    primaryMarketingAngleRationale: s.primaryMarketingAngleRationale,
    videoGenerationPrompt: s.videoGenerationPrompt,
    recommendedVideoModels: s.recommendedVideoModels,
  }));

  const system = [
    "You write one JSON object for marketers who will recreate a short ad with generative video tools.",
    "English only. Ground claims in the provided per-scene fields; if uncertain, say so briefly.",
    "The script may include placeholders like [YOUR_PRODUCT_NAME] until a product photo is uploaded.",
  ].join(" ");

  const user = [
    `Video file: "${fileName}"`,
    `Duration seconds: ${durationSec.toFixed(3)}`,
    "Per-scene structured analysis:",
    JSON.stringify(payload, null, 2),
    "",
    "Return strict JSON with keys:",
    "- globalVisualStyleCategory (enum like scenes)",
    "- globalVisualStyleRationale",
    "- primaryMarketingAngleLabel",
    "- primaryMarketingAngleRationale",
    "- secondaryMarketingAngles: [{label, rationale}] max 5",
    "- fullVideoScriptDraft: include [SCENE scene-x] headers and VO/spoken lines",
    "- finalEditAssemblyNotes: how to combine per-scene clips into the final video (pacing, J-cuts, match cuts)",
    "- marketingTestingNotes: what angles this creative stresses; which angles are under-tested for a typical brand portfolio",
    "- productUploadCallout: one imperative sentence to upload product/packshot for accurate label and color",
  ].join("\n");

  let attempt = 0;
  while (attempt < CLAUDE_MAX_RETRIES) {
    attempt += 1;
    try {
      const text = await claudeMessagesText({
        system,
        user,
        model: SCENE_ANALYSIS_MODEL,
        maxTokens: 4096,
      });
      const parsed = parseJsonObject(text);
      return normalizeCreativeBriefRecord(parsed, scenes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Claude error.";
      logs.push(`Creative brief synthesis failed on attempt ${attempt}: ${message}`);
      if (attempt >= CLAUDE_MAX_RETRIES) return null;
      await sleep(CLAUDE_FALLBACK_RETRY_MS);
    }
  }

  return null;
}

function buildDeveloperPrompt(): string {
  return `You analyze short-form ad video frames in chronological order.

You must detect likely scene starts / cuts conservatively and describe each frame.

Return strict JSON with this exact shape:
{
  "batchSummary": "short summary",
  "frames": [
    {
      "frameIndex": 0,
      "timestampSec": 0.0,
      "isSceneStart": true,
      "description": "what is visible",
      "subjectAction": "what the person or product is doing",
      "movement": "camera or subject movement",
      "textVisible": false
    }
  ]
}

Rules:
- Output JSON only.
- Keep descriptions concise but concrete.
- "isSceneStart" should be true only when the frame clearly begins a new scene or cut.
- If uncertain, prefer false over noisy false positives.
- The first frame of the very first batch should be marked as a scene start.
- Do not omit frames from the output.`;
}

function buildUserPrompt(
  request: RecreateAnalyzeRequest,
  batch: UploadedRecreateFrame[],
  batchIndex: number,
  batchCount: number,
): string {
  const frameLines = batch
    .map(
      (frame) =>
        `- frameIndex=${frame.frameIndex}, timestampSec=${frame.timestampSec.toFixed(1)}, imageUrl=${frame.imageUrl}`,
    )
    .join("\n");

  return [
    `Analyze batch ${batchIndex + 1} of ${batchCount} for uploaded video "${request.fileName}".`,
    `Video duration: ${request.durationSec.toFixed(2)}s.`,
    `Frame interval: ${request.frameIntervalSec.toFixed(1)}s.`,
    request.truncated ? "The full video was truncated before analysis because of safety caps." : "The analysis covers the full selected range.",
    "Frames in this batch:",
    frameLines,
    "",
    "For each frame, describe what is happening, what the person or product does, and whether the shot appears to start a new scene.",
  ].join("\n");
}

function isValidFrameInput(value: unknown): value is UploadedRecreateFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Record<string, unknown>;
  return (
    typeof frame.frameIndex === "number" &&
    Number.isFinite(frame.frameIndex) &&
    typeof frame.timestampSec === "number" &&
    Number.isFinite(frame.timestampSec) &&
    typeof frame.imageUrl === "string" &&
    /^https?:\/\//i.test(frame.imageUrl)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runVisionBatchWithRetries(opts: {
  logs: string[];
  batchLabel: string;
  developer: string;
  userText: string;
  imageUrls: string[];
}): Promise<string> {
  let text = "";
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      const response = await openaiResponsesTextWithImages({
        developer: opts.developer,
        userText: opts.userText,
        imageUrls: opts.imageUrls,
        model: ANALYSIS_MODEL,
        imageDetail: ANALYSIS_IMAGE_DETAIL,
      });
      text = response.text;
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown OpenAI error.";
      const retryAfterMs = parseOpenAiRetryAfterMs(message);
      const isRateLimited = /rate limit/i.test(message) || retryAfterMs !== null;

      if (!isRateLimited || attempt > ANALYSIS_MAX_RATE_LIMIT_RETRIES) {
        throw err;
      }

      const waitMs = retryAfterMs ?? ANALYSIS_FALLBACK_RETRY_MS;
      opts.logs.push(
        `${opts.batchLabel} hit a rate limit on attempt ${attempt}. Waiting ${(waitMs / 1000).toFixed(2)}s before retrying.`,
      );
      await sleep(waitMs);
    }
  }

  return text;
}

async function runClaudeSceneBatchWithRetries(opts: {
  logs: string[];
  batchLabel: string;
  system: string;
  user: string;
  imageUrls: string[];
}): Promise<string> {
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return await claudeMessagesTextWithImages({
        system: opts.system,
        user: opts.user,
        imageUrls: opts.imageUrls,
        model: SCENE_ANALYSIS_MODEL,
        maxTokens: 8192,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown Claude error.";
      const isRetryable = /rate limit|overloaded|timeout|timed out|temporarily unavailable|503|529/i.test(
        message,
      );

      if (!isRetryable || attempt >= CLAUDE_MAX_RETRIES) {
        throw err;
      }

      opts.logs.push(
        `${opts.batchLabel} hit a Claude retryable error on attempt ${attempt}. Waiting ${(CLAUDE_FALLBACK_RETRY_MS / 1000).toFixed(2)}s before retrying.`,
      );
      await sleep(CLAUDE_FALLBACK_RETRY_MS);
    }
  }
}

export async function POST(req: Request) {
  const { user, response } = await requireSupabaseUser();
  if (response) return response;
  if (!user?.id) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const logs: string[] = [];

  try {
    const body = (await req.json()) as Partial<RecreateAnalyzeRequest>;
    const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : "uploaded-video";
    const durationSec = typeof body.durationSec === "number" && body.durationSec > 0 ? body.durationSec : 0;
    const frameIntervalSec =
      typeof body.frameIntervalSec === "number" && body.frameIntervalSec > 0 ? body.frameIntervalSec : 0.1;
    const truncated = body.truncated === true;
    const videoUrl =
      typeof body.videoUrl === "string" && /^https?:\/\//i.test(body.videoUrl.trim())
        ? body.videoUrl.trim()
        : null;
    const frames = Array.isArray(body.frames) ? body.frames.filter(isValidFrameInput) : [];

    if (!durationSec) {
      return NextResponse.json({ error: "Missing or invalid `durationSec`." }, { status: 400 });
    }
    if (!videoUrl && frames.length === 0) {
      return NextResponse.json({ error: "Add at least one uploaded frame." }, { status: 400 });
    }

    const safeRequest: RecreateAnalyzeRequest = {
      fileName,
      durationSec,
      frameIntervalSec,
      truncated,
      videoUrl,
      frames,
    };

    if (videoUrl) {
      logs.push(`Using scene-detection pipeline for ${fileName}.`);
      const sceneCaptures = await detectSceneCapturePairs({
        videoUrl,
        durationSec,
        logs,
        userId: user.id,
      });
      const sceneBatches = groupItemsIntoBatches(sceneCaptures, SCENES_PER_BATCH);
      logs.push(
        `Split ${sceneCaptures.length} detected scenes into ${sceneBatches.length} Claude batches (${SCENES_PER_BATCH} scenes max per batch).`,
      );

      const sceneDescriptions = new Map<string, SceneDescriptionRow>();

      for (const [batchIndex, batchScenes] of sceneBatches.entries()) {
        const batchLabel = `Scene batch ${batchIndex + 1}/${sceneBatches.length}`;
        logs.push(`${batchLabel} starting with ${batchScenes.length} scenes / ${batchScenes.length * 2} screenshots.`);
        const text = await runClaudeSceneBatchWithRetries({
          logs,
          batchLabel,
          system: buildSceneDeveloperPrompt(),
          user: buildSceneUserPrompt(safeRequest, batchScenes, batchIndex, sceneBatches.length),
          imageUrls: batchScenes.flatMap((scene) => [scene.startImageUrl, scene.endImageUrl]),
        });
        logs.push(`${batchLabel} responded with ${text.length} characters.`);

        const parsed = parseJsonObject(text) as SceneBatchModelResponse;
        for (const scene of normalizeSceneBatch(parsed.scenes, batchScenes)) {
          sceneDescriptions.set(scene.sceneId, scene);
        }
        const batchSummary =
          typeof parsed.batchSummary === "string" && parsed.batchSummary.trim()
            ? parsed.batchSummary.trim()
            : "No batch summary returned.";
        logs.push(`${batchLabel} parsed successfully: ${batchSummary}`);
      }

      const scenes: RecreateScene[] = sceneCaptures.map((cap) => {
        const description = sceneDescriptions.get(cap.sceneId);
        const styleCat = description?.visualStyleCategory ?? "unknown";
        const models =
          description?.recommendedVideoModels && description.recommendedVideoModels.length > 0
            ? description.recommendedVideoModels
            : fallbackVideoModelsForVisualStyle(styleCat);
        return {
          sceneId: cap.sceneId,
          startFrameIndex: Math.round(cap.startSec * 10),
          endFrameIndex: Math.max(Math.round(cap.endSec * 10) - 1, Math.round(cap.startSec * 10)),
          startSec: cap.startSec,
          endSec: cap.endSec,
          ...(cap.startFrameStorageUrl ? { sceneStartImageUrl: cap.startFrameStorageUrl } : {}),
          ...(cap.endFrameStorageUrl ? { sceneEndImageUrl: cap.endFrameStorageUrl } : {}),
          shortDescription: description?.shortDescription ?? `${cap.sceneId} scene`,
          summary: description?.summary ?? "No scene summary returned.",
          startDescription: description?.startDescription ?? "No start description returned.",
          endDescription: description?.endDescription ?? "No end description returned.",
          transitionSummary: description?.transitionSummary ?? "No transition summary returned.",
          recreationNotes: description?.recreationNotes ?? "No recreation notes returned.",
          visualStyleCategory: description?.visualStyleCategory ?? "unknown",
          visualStyleConfidence: description?.visualStyleConfidence,
          visualStyleRationale: description?.visualStyleRationale,
          backgroundDescription: description?.backgroundDescription,
          onScreenTalentDescription: description?.onScreenTalentDescription,
          lightingAndGradeNotes: description?.lightingAndGradeNotes,
          dialogueOrVoiceoverHints: description?.dialogueOrVoiceoverHints,
          videoGenerationPrompt: description?.videoGenerationPrompt,
          recommendedVideoModels: models,
          primaryMarketingAngleLabel: description?.primaryMarketingAngleLabel,
          primaryMarketingAngleRationale: description?.primaryMarketingAngleRationale,
        };
      });

      const frames: RecreateFrameAnalysisWithScene[] = sceneCaptures.flatMap((cap, index) => {
        const description = sceneDescriptions.get(cap.sceneId);
        return [
          {
            frameIndex: index * 2,
            timestampSec: cap.startCaptureSec,
            isSceneStart: true,
            captureRole: "start" as const,
            description: description?.startDescription ?? `Start of ${cap.sceneId}.`,
            subjectAction: description?.startSubjectAction ?? "No clear start action extracted.",
            movement: description?.startMovement ?? "No strong start movement detected.",
            textVisible: description?.startTextVisible ?? false,
            sceneId: cap.sceneId,
          },
          {
            frameIndex: index * 2 + 1,
            timestampSec: cap.endCaptureSec,
            isSceneStart: false,
            captureRole: "end" as const,
            description: description?.endDescription ?? `End of ${cap.sceneId}.`,
            subjectAction: description?.endSubjectAction ?? "No clear end action extracted.",
            movement: description?.endMovement ?? "No strong end movement detected.",
            textVisible: description?.endTextVisible ?? false,
            sceneId: cap.sceneId,
          },
        ];
      });

      const segmentationSummary =
        scenes.length === 1
          ? "1 scene detected from ffmpeg scene detection."
          : `${scenes.length} scenes detected from ffmpeg scene detection.`;
      const videoSummary = scenes
        .map((scene) => `${scene.sceneId} (${scene.startSec.toFixed(1)}s-${scene.endSec.toFixed(1)}s): ${scene.shortDescription}`)
        .join(" ");

      logs.push(`Scene-detection pipeline completed with ${scenes.length} scenes.`);

      logs.push(`Synthesizing global creative brief with ${SCENE_ANALYSIS_MODEL}.`);
      const creativeBrief = await synthesizeRecreateCreativeBrief({
        fileName,
        durationSec,
        scenes,
        logs,
      });
      if (creativeBrief) {
        logs.push("Creative brief synthesis succeeded.");
      } else {
        logs.push("Creative brief synthesis skipped or failed.");
      }

      return NextResponse.json({
        model: SCENE_ANALYSIS_MODEL,
        frameIntervalSec,
        analyzedFrameCount: frames.length,
        sceneCount: scenes.length,
        truncated: false,
        scenes,
        frames,
        segmentationSummary,
        videoSummary,
        creativeBrief,
        logs,
      });
    }

    logs.push(`Received ${frames.length} uploaded frames for ${fileName}.`);
    const batches = groupFramesIntoBatches(frames, RECREATE_BATCH_SIZE);
    logs.push(
      `Split frames into ${batches.length} GPT batches (max ${RECREATE_BATCH_SIZE} images per batch, detail=${ANALYSIS_IMAGE_DETAIL}).`,
    );

    const mergedFrameAnalyses: RecreateFrameAnalysis[] = [];

    for (const [batchIndex, batch] of batches.entries()) {
      const batchLabel = `Batch ${batchIndex + 1}/${batches.length}`;
      logs.push(`${batchLabel} starting with ${batch.length} frames.`);
      const text = await runVisionBatchWithRetries({
        logs,
        batchLabel,
        developer: buildDeveloperPrompt(),
        userText: buildUserPrompt(safeRequest, batch, batchIndex, batches.length),
        imageUrls: batch.map((frame) => frame.imageUrl),
      });
      logs.push(`${batchLabel} responded with ${text.length} characters.`);

      const parsed = parseJsonObject(text) as BatchModelResponse;
      const normalizedFrames = normalizeBatchFrames(parsed.frames, batch).map((frame, index) => ({
        ...frame,
        isSceneStart: batchIndex === 0 && index === 0 ? true : frame.isSceneStart,
      }));

      if (normalizedFrames.length !== batch.length) {
        throw new Error(`Batch ${batchIndex + 1} returned ${normalizedFrames.length} frames for ${batch.length} inputs.`);
      }

      mergedFrameAnalyses.push(...normalizedFrames);
      const batchSummary =
        typeof parsed.batchSummary === "string" && parsed.batchSummary.trim()
          ? parsed.batchSummary.trim()
          : "No batch summary returned.";
      logs.push(`${batchLabel} parsed successfully: ${batchSummary}`);
    }

    const merged = mergeBatchFrameAnalyses(mergedFrameAnalyses);
    logs.push(`Merged frame analyses into ${merged.scenes.length} scenes.`);

    return NextResponse.json({
      model: ANALYSIS_MODEL,
      frameIntervalSec,
      analyzedFrameCount: merged.frames.length,
      sceneCount: merged.scenes.length,
      truncated,
      scenes: merged.scenes,
      frames: merged.frames,
      segmentationSummary: merged.segmentationSummary,
      videoSummary: merged.videoSummary,
      creativeBrief: null,
      logs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to analyze recreate frames.";
    logs.push(`Analysis failed: ${message}`);
    return NextResponse.json({ error: message, logs }, { status: 502 });
  }
}

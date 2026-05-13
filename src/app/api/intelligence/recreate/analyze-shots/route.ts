export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";

import {
  buildVisionAnalysisBatches,
  mergeShotBatches,
  parseVisionAnalysisJson,
  reduceShotsToClaudeKeyframes,
  type DenseFramePoint,
  type ShotFrameAnalysis,
} from "@/lib/intelligenceRecreateShotAnalysis";
import { openaiResponsesTextWithImages } from "@/lib/openaiResponses";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

type AnalyzeShotsBody = {
  frames?: DenseFramePoint[];
  durationSec?: number;
  ad?: {
    headline?: string;
    body?: string;
    platform?: string;
  };
  productDescription?: string;
};

function sanitizeFrames(input: unknown): DenseFramePoint[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item): DenseFramePoint | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const timestampSec =
        typeof record.timestampSec === "number" ? record.timestampSec : Number(record.timestampSec);
      const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl.trim() : "";
      if (!Number.isFinite(timestampSec) || !/^https?:\/\//i.test(imageUrl)) return null;
      return {
        timestampSec: Math.max(0, Math.round(timestampSec * 10) / 10),
        imageUrl,
      };
    })
    .filter((item): item is DenseFramePoint => item !== null);
}

function buildDeveloperPrompt(): string {
  return [
    "You analyze short-form ad frames for shot boundaries and branding cues.",
    "Return ONLY JSON.",
    "Output an array where each item maps to one input image in the same order.",
    "Each item must contain: timestampSec, shotBoundary, brandingVisible, packagingVisible, textVisible, actionSummary.",
    "Mark shotBoundary true only when the frame starts a clearly new shot, camera setup, or branded/product beat.",
    "Keep actionSummary short and literal.",
  ].join(" ");
}

function buildUserPrompt(batch: DenseFramePoint[], body: AnalyzeShotsBody): string {
  const lines = [
    "Frames are attached in the same order as listed below.",
    ...batch.map((frame, index) => `Frame ${index + 1}: ${frame.timestampSec.toFixed(1)}s`),
  ];

  const headline = body.ad?.headline?.trim();
  const adBody = body.ad?.body?.trim();
  const platform = body.ad?.platform?.trim();
  const productDescription = body.productDescription?.trim();

  if (platform) lines.push(`Platform: ${platform}.`);
  if (headline) lines.push(`Headline: ${headline}.`);
  if (adBody) lines.push(`Body: ${adBody}.`);
  if (productDescription) lines.push(`User product context: ${productDescription}.`);

  lines.push("Return strict JSON only.");
  return lines.join("\n");
}

export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  let body: AnalyzeShotsBody;
  try {
    body = (await req.json()) as AnalyzeShotsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const frames = sanitizeFrames(body.frames);
  if (frames.length === 0) {
    return NextResponse.json({ error: "Add at least one frame." }, { status: 400 });
  }

  const batches = buildVisionAnalysisBatches(frames, 12);
  const analyzedBatches: ShotFrameAnalysis[][] = [];

  try {
    for (const batch of batches) {
      const { text } = await openaiResponsesTextWithImages({
        developer: buildDeveloperPrompt(),
        userText: buildUserPrompt(batch, body),
        imageUrls: batch.map((frame) => frame.imageUrl),
        model: "gpt-4o-mini",
      });
      const parsed = parseVisionAnalysisJson(text).map((item, index) => ({
        ...item,
        timestampSec: batch[index]?.timestampSec ?? item.timestampSec,
        keyFrameUrl: batch[index]?.imageUrl,
      }));
      analyzedBatches.push(parsed);
    }

    const shots = mergeShotBatches(analyzedBatches);
    const keyframes = reduceShotsToClaudeKeyframes(shots, 8);

    return NextResponse.json({
      shots,
      keyframes,
      analyzedFrameCount: frames.length,
      durationSec: typeof body.durationSec === "number" ? body.durationSec : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shot analysis failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

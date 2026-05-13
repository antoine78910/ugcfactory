export type ShotFrameAnalysis = {
  timestampSec: number;
  shotBoundary: boolean;
  brandingVisible?: boolean;
  packagingVisible?: boolean;
  textVisible?: boolean;
  actionSummary: string;
  keyFrameUrl?: string;
};

export type ReferenceShot = {
  shotId: string;
  startSec: number;
  endSec: number;
  keyFrameUrl: string;
  actionSummary: string;
  brandingVisible: boolean;
  packagingVisible: boolean;
  textVisible: boolean;
};

export type DenseFramePoint = {
  timestampSec: number;
  imageUrl: string;
};

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildDenseSampleTimeline(durationSec: number): number[] {
  const safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  if (safeDuration <= 0) return [0];

  const denseMaxSec = Math.min(safeDuration, 12);
  const reserveForTail = safeDuration > 12 ? 4 : 0;
  const denseBudget = Math.max(1, 120 - reserveForTail);
  const points: number[] = [];
  for (let time = 0; time < denseMaxSec; time += 0.1) {
    if (points.length >= denseBudget) break;
    points.push(roundTenth(time));
  }
  const finalDensePoint = roundTenth(Math.max(0, denseMaxSec - 0.1));
  if (points.length < denseBudget && !points.includes(finalDensePoint)) points.push(finalDensePoint);

  if (safeDuration > 12) {
    const tailCandidates = [0.25, 0.5, 0.75, 0.9].map((fraction) =>
      roundTenth(12 + (safeDuration - 12) * fraction),
    );
    for (const candidate of tailCandidates) {
      if (candidate < safeDuration && !points.includes(candidate)) {
        points.push(candidate);
      }
    }
  }

  return points.slice(0, 120);
}

export function mergeShotBatches(batches: ShotFrameAnalysis[][]): ReferenceShot[] {
  const frames = batches
    .flat()
    .filter((frame) => Number.isFinite(frame.timestampSec))
    .sort((a, b) => a.timestampSec - b.timestampSec);

  if (frames.length === 0) return [];

  const shots: ReferenceShot[] = [];
  let currentStart = frames[0].timestampSec;
  let current = frames[0];
  let shotIndex = 1;

  for (let index = 1; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame.shotBoundary) {
      shots.push({
        shotId: `shot-${shotIndex}`,
        startSec: currentStart,
        endSec: frame.timestampSec,
        keyFrameUrl: current.keyFrameUrl ?? `frame-${shotIndex}`,
        actionSummary: current.actionSummary,
        brandingVisible: Boolean(current.brandingVisible),
        packagingVisible: Boolean(current.packagingVisible),
        textVisible: Boolean(current.textVisible),
      });
      shotIndex += 1;
      currentStart = frame.timestampSec;
    }

    current = {
      ...current,
      ...frame,
      brandingVisible: Boolean(current.brandingVisible) || Boolean(frame.brandingVisible),
      packagingVisible: Boolean(current.packagingVisible) || Boolean(frame.packagingVisible),
      textVisible: Boolean(current.textVisible) || Boolean(frame.textVisible),
      actionSummary:
        frame.actionSummary.trim().length >= current.actionSummary.trim().length
          ? frame.actionSummary
          : current.actionSummary,
    };
  }

  shots.push({
    shotId: `shot-${shotIndex}`,
    startSec: currentStart,
    endSec: current.timestampSec,
    keyFrameUrl: current.keyFrameUrl ?? `frame-${shotIndex}`,
    actionSummary: current.actionSummary,
    brandingVisible: Boolean(current.brandingVisible),
    packagingVisible: Boolean(current.packagingVisible),
    textVisible: Boolean(current.textVisible),
  });

  return shots;
}

export function reduceShotsToClaudeKeyframes(shots: ReferenceShot[], maxFrames = 8): ReferenceShot[] {
  if (shots.length <= maxFrames) return shots;

  const [opening, ...rest] = shots;
  const ranked = [...rest].sort((left, right) => {
    const leftScore =
      (left.brandingVisible ? 4 : 0) + (left.packagingVisible ? 3 : 0) + (left.textVisible ? 1 : 0);
    const rightScore =
      (right.brandingVisible ? 4 : 0) + (right.packagingVisible ? 3 : 0) + (right.textVisible ? 1 : 0);
    return rightScore - leftScore || left.startSec - right.startSec;
  });

  return [opening, ...ranked.slice(0, Math.max(0, maxFrames - 1))].sort((a, b) => a.startSec - b.startSec);
}

export function buildVisionAnalysisBatches(frames: DenseFramePoint[], maxPerBatch = 12): DenseFramePoint[][] {
  const safeMax = Math.max(1, Math.floor(maxPerBatch));
  const out: DenseFramePoint[][] = [];
  for (let index = 0; index < frames.length; index += safeMax) {
    out.push(frames.slice(index, index + safeMax));
  }
  return out;
}

export function parseVisionAnalysisJson(raw: string): ShotFrameAnalysis[] {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch?.[1]?.trim() || trimmed;
  const parsed = JSON.parse(candidate) as unknown;
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item): ShotFrameAnalysis | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const timestampSec = typeof record.timestampSec === "number" ? record.timestampSec : Number(record.timestampSec);
      if (!Number.isFinite(timestampSec)) return null;
      return {
        timestampSec,
        shotBoundary: Boolean(record.shotBoundary),
        brandingVisible: Boolean(record.brandingVisible),
        packagingVisible: Boolean(record.packagingVisible),
        textVisible: Boolean(record.textVisible),
        actionSummary:
          typeof record.actionSummary === "string" && record.actionSummary.trim().length > 0
            ? record.actionSummary.trim()
            : "Scene continues",
      };
    })
    .filter((item): item is ShotFrameAnalysis => item !== null);
}

export type RecreateDetectedScene = {
  sceneId: string;
  startSec: number;
  endSec: number;
};

export const RECREATE_SCENE_THRESHOLD = 0.27;
export const RECREATE_SCENE_END_CAPTURE_EPSILON_SEC = 0.2;

export type RecreateSceneCapture = {
  captureId: string;
  sceneId: string;
  captureRole: "start" | "end";
  timestampSec: number;
};

export function getSceneCaptureOutputConfig(captureId: string): {
  fileName: string;
  mediaType: "image/png";
} {
  return {
    fileName: `${captureId}.png`,
    mediaType: "image/png",
  };
}

function roundToMillis(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function parseSelectedSceneTimestamps(stderr: string): number[] {
  const matches = stderr.matchAll(/pts_time:([0-9]+(?:\.[0-9]+)?)/g);
  const unique = new Set<number>();

  for (const match of matches) {
    const value = Number.parseFloat(match[1] ?? "");
    if (!Number.isFinite(value)) continue;
    unique.add(roundToMillis(value));
  }

  return [...unique].sort((a, b) => a - b);
}

export function buildSceneRanges(sceneStartsSec: number[], durationSec: number): RecreateDetectedScene[] {
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? roundToMillis(durationSec) : 0;
  if (!duration) return [];

  const starts = [...new Set(sceneStartsSec.map((value) => roundToMillis(value)).filter((value) => value >= 0 && value < duration))]
    .sort((a, b) => a - b);

  if (starts.length === 0 || starts[0] !== 0) {
    starts.unshift(0);
  }

  return starts.map((startSec, index) => ({
    sceneId: `scene-${index + 1}`,
    startSec,
    endSec: index < starts.length - 1 ? starts[index + 1]! : duration,
  }));
}

export function buildSceneCaptureFrames(scenes: RecreateDetectedScene[]): RecreateSceneCapture[] {
  return scenes.flatMap((scene) => {
    const startSec = roundToMillis(scene.startSec);
    const endSec = roundToMillis(
      Math.max(scene.startSec, scene.endSec - RECREATE_SCENE_END_CAPTURE_EPSILON_SEC),
    );

    return [
      {
        captureId: `${scene.sceneId}-start`,
        sceneId: scene.sceneId,
        captureRole: "start" as const,
        timestampSec: startSec,
      },
      {
        captureId: `${scene.sceneId}-end`,
        sceneId: scene.sceneId,
        captureRole: "end" as const,
        timestampSec: endSec,
      },
    ];
  });
}

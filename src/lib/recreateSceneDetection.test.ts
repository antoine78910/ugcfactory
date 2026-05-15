import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSceneCaptureFrames,
  getSceneCaptureOutputConfig,
  buildSceneRanges,
  parseSelectedSceneTimestamps,
} from "./recreateSceneDetection";

test("parseSelectedSceneTimestamps extracts unique pts_time values from ffmpeg showinfo logs", () => {
  const stderr = `
[Parsed_showinfo_1 @ 000001] n:   0 pts:      0 pts_time:0       pos:     123 fmt:yuv420p
[Parsed_showinfo_1 @ 000001] n:   1 pts:  15360 pts_time:1.000   pos:    4567 fmt:yuv420p
[Parsed_showinfo_1 @ 000001] n:   2 pts:  30720 pts_time:2.000   pos:    8910 fmt:yuv420p
[Parsed_showinfo_1 @ 000001] n:   2 pts:  30720 pts_time:2.000   pos:    8910 fmt:yuv420p
`;

  assert.deepEqual(parseSelectedSceneTimestamps(stderr), [0, 1, 2]);
});

test("buildSceneRanges derives start/end windows from detected scene starts", () => {
  const scenes = buildSceneRanges([0, 1.2, 3.5], 5);

  assert.deepEqual(
    scenes.map((scene) => ({
      sceneId: scene.sceneId,
      startSec: scene.startSec,
      endSec: scene.endSec,
    })),
    [
      { sceneId: "scene-1", startSec: 0, endSec: 1.2 },
      { sceneId: "scene-2", startSec: 1.2, endSec: 3.5 },
      { sceneId: "scene-3", startSec: 3.5, endSec: 5 },
    ],
  );
});

test("buildSceneCaptureFrames creates start and end captures for each scene", () => {
  const captures = buildSceneCaptureFrames([
    { sceneId: "scene-1", startSec: 0, endSec: 1.2 },
    { sceneId: "scene-2", startSec: 1.2, endSec: 3.5 },
  ]);

  assert.deepEqual(
    captures.map((capture) => ({
      captureId: capture.captureId,
      sceneId: capture.sceneId,
      captureRole: capture.captureRole,
      timestampSec: capture.timestampSec,
    })),
    [
      { captureId: "scene-1-start", sceneId: "scene-1", captureRole: "start", timestampSec: 0 },
      { captureId: "scene-1-end", sceneId: "scene-1", captureRole: "end", timestampSec: 1 },
      { captureId: "scene-2-start", sceneId: "scene-2", captureRole: "start", timestampSec: 1.2 },
      { captureId: "scene-2-end", sceneId: "scene-2", captureRole: "end", timestampSec: 3.3 },
    ],
  );
});

test("buildSceneCaptureFrames clamps very short scenes so end capture stays inside the scene", () => {
  const captures = buildSceneCaptureFrames([{ sceneId: "scene-1", startSec: 2.4, endSec: 2.45 }]);

  assert.deepEqual(
    captures.map((capture) => capture.timestampSec),
    [2.4, 2.4],
  );
});

test("getSceneCaptureOutputConfig uses png for stable still extraction", () => {
  assert.deepEqual(getSceneCaptureOutputConfig("scene-1-start"), {
    fileName: "scene-1-start.png",
    mediaType: "image/png",
  });
});

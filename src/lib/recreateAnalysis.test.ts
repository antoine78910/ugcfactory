import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFrameTimestamps,
  groupFramesIntoBatches,
  mergeBatchFrameAnalyses,
  type UploadedRecreateFrame,
} from "./recreateAnalysis";
import { sanitizeRecreateRecommendedVideoModels } from "./recreateVideoModelRecommendations";

test("buildFrameTimestamps uses 0.1s cadence and respects caps", () => {
  const out = buildFrameTimestamps(20, 0.1, 15, 150);
  assert.equal(out[0], 0);
  assert.equal(out[1], 0.1);
  assert.equal(out.length, 150);
  assert.equal(out.at(-1), 14.9);
});

test("groupFramesIntoBatches splits frames into max-12 batches", () => {
  const frames: UploadedRecreateFrame[] = Array.from({ length: 25 }, (_, i) => ({
    frameIndex: i,
    timestampSec: i / 10,
    imageUrl: `https://example.com/${i}.jpg`,
  }));
  const batches = groupFramesIntoBatches(frames, 12);
  assert.deepEqual(batches.map((batch) => batch.length), [12, 12, 1]);
});

test("mergeBatchFrameAnalyses derives stable scenes from cut markers", () => {
  const merged = mergeBatchFrameAnalyses([
    {
      frameIndex: 0,
      timestampSec: 0,
      isSceneStart: true,
      description: "Person faces camera",
      subjectAction: "Speaks to camera",
      movement: "Static close-up",
      textVisible: false,
    },
    {
      frameIndex: 1,
      timestampSec: 0.1,
      isSceneStart: false,
      description: "Person keeps talking",
      subjectAction: "Keeps speaking",
      movement: "Minor head motion",
      textVisible: false,
    },
    {
      frameIndex: 2,
      timestampSec: 0.2,
      isSceneStart: true,
      description: "Product close-up",
      subjectAction: "Shows bottle",
      movement: "Push-in",
      textVisible: false,
    },
  ]);
  assert.equal(merged.scenes.length, 2);
  assert.equal(merged.scenes[0]?.startFrameIndex, 0);
  assert.equal(merged.scenes[0]?.endFrameIndex, 1);
  assert.equal(merged.scenes[1]?.startFrameIndex, 2);
});

test("mergeBatchFrameAnalyses assigns scene ids back onto frames", () => {
  const merged = mergeBatchFrameAnalyses([
    {
      frameIndex: 0,
      timestampSec: 0,
      isSceneStart: true,
      description: "Hook shot",
      subjectAction: "Looks at camera",
      movement: "Static",
      textVisible: false,
    },
    {
      frameIndex: 1,
      timestampSec: 0.1,
      isSceneStart: false,
      description: "Hook shot continues",
      subjectAction: "Still looking",
      movement: "Static",
      textVisible: false,
    },
  ]);
  assert.equal(merged.frames[0]?.sceneId, "scene-1");
  assert.equal(merged.frames[1]?.sceneId, "scene-1");
});

test("buildFrameTimestamps samples entire short videos without truncation", () => {
  const out = buildFrameTimestamps(0.35, 0.1, 15, 150);
  assert.deepEqual(out, [0, 0.1, 0.2, 0.3]);
});

test("sanitizeRecreateRecommendedVideoModels keeps allowlisted ids in order", () => {
  assert.deepEqual(sanitizeRecreateRecommendedVideoModels(["kling-3.0/video", "bogus", "kling-3.0/video"]), [
    "kling-3.0/video",
  ]);
  assert.deepEqual(
    sanitizeRecreateRecommendedVideoModels([
      "openai/sora-2",
      "veo3_fast",
      "kling-2.6/video",
      "bytedance/seedance-2",
      "kling-3.0/video",
    ]),
    ["openai/sora-2", "veo3_fast", "kling-2.6/video", "bytedance/seedance-2"],
  );
});

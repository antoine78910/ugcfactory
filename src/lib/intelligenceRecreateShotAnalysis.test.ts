import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDenseSampleTimeline,
  buildVisionAnalysisBatches,
  mergeShotBatches,
  parseVisionAnalysisJson,
  reduceShotsToClaudeKeyframes,
} from "./intelligenceRecreateShotAnalysis";

test("buildDenseSampleTimeline caps dense frames at 120 and keeps 0.1s cadence", () => {
  const out = buildDenseSampleTimeline(18);
  assert.equal(out[0], 0);
  assert.equal(out[1], 0.1);
  assert.equal(out.length <= 120, true);
  assert.equal(out.some((t) => t > 12), true);
});

test("mergeShotBatches merges overlapping frame labels into a stable shot timeline", () => {
  const merged = mergeShotBatches([
    [{ timestampSec: 0, shotBoundary: true, actionSummary: "Hook close-up" }],
    [{ timestampSec: 0.6, shotBoundary: false, actionSummary: "Hook close-up continues" }],
    [{ timestampSec: 1.2, shotBoundary: true, actionSummary: "Product reveal" }],
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.startSec, 0);
  assert.equal(merged[1]?.startSec, 1.2);
});

test("reduceShotsToClaudeKeyframes prioritizes branded packaging and opening shot", () => {
  const out = reduceShotsToClaudeKeyframes([
    {
      shotId: "s1",
      startSec: 0,
      endSec: 0.7,
      keyFrameUrl: "a",
      brandingVisible: false,
      packagingVisible: false,
      textVisible: false,
      actionSummary: "Hook",
    },
    {
      shotId: "s2",
      startSec: 0.7,
      endSec: 1.4,
      keyFrameUrl: "b",
      brandingVisible: true,
      packagingVisible: true,
      textVisible: false,
      actionSummary: "Packaging close-up",
    },
  ]);
  assert.deepEqual(
    out.map((shot) => shot.keyFrameUrl),
    ["a", "b"],
  );
});

test("buildVisionAnalysisBatches keeps batches at 12 frames max", () => {
  const frames = Array.from({ length: 25 }, (_, index) => ({
    timestampSec: index * 0.1,
    imageUrl: `https://example.com/frame-${index}.jpg`,
  }));
  const batches = buildVisionAnalysisBatches(frames, 12);
  assert.equal(batches.length, 3);
  assert.equal(batches[0]?.length, 12);
  assert.equal(batches[1]?.length, 12);
  assert.equal(batches[2]?.length, 1);
});

test("parseVisionAnalysisJson extracts JSON payload from fenced model output", () => {
  const parsed = parseVisionAnalysisJson(`\`\`\`json
[
  {
    "timestampSec": 0,
    "shotBoundary": true,
    "brandingVisible": true,
    "packagingVisible": true,
    "textVisible": false,
    "actionSummary": "Bottle enters frame"
  }
]
\`\`\``);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.brandingVisible, true);
  assert.equal(parsed[0]?.actionSummary, "Bottle enters frame");
});

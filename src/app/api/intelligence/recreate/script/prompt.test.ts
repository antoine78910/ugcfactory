import test from "node:test";
import assert from "node:assert/strict";

import { buildUserPrompt } from "./route";

test("buildUserPrompt includes explicit brand swap and precise shot timings", () => {
  const prompt = buildUserPrompt(
    {
      ad: {},
      videoFirstFrameUrl: "https://example.com/start.jpg",
      referenceImageUrls: [],
      productImageUrls: ["https://example.com/p1.jpg"],
      productDescription: "Hydrating serum",
      clipType: "custom",
      aspectRatio: "9:16",
      durationSec: 10,
      shotAnalysis: {
        shots: [
          {
            shotId: "s1",
            startSec: 0,
            endSec: 0.7,
            keyFrameUrl: "https://example.com/start.jpg",
            actionSummary: "Creator holds bottle near camera",
            brandingVisible: true,
            packagingVisible: true,
            textVisible: false,
          },
        ],
        keyframes: [],
        analyzedFrameCount: 12,
      },
    },
    "https://example.com/start.jpg",
    [],
    ["https://example.com/p1.jpg"],
  );
  assert.match(prompt, /0\.0-0\.7s|0\.0–0\.7s/);
  assert.match(prompt, /replace/i);
  assert.match(prompt, /logo|packaging|label/i);
});

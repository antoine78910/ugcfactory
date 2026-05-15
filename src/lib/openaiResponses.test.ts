import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOpenaiResponsesImageContent,
  parseOpenAiRetryAfterMs,
} from "./openaiResponses";

test("buildOpenaiResponsesImageContent applies requested image detail and caps image count", () => {
  const content = buildOpenaiResponsesImageContent({
    userText: "Analyze these frames",
    imageUrls: Array.from({ length: 15 }, (_, index) => `https://example.com/frame-${index}.jpg`),
    imageDetail: "low",
  });

  const inputImages = content.filter(
    (part): part is { type: "input_image"; image_url: string; detail: "low" | "auto" | "high" } =>
      typeof part === "object" && part !== null && "type" in part && part.type === "input_image",
  );

  assert.equal(inputImages.length, 12);
  assert.equal(inputImages.every((part) => part.detail === "low"), true);
});

test("parseOpenAiRetryAfterMs extracts retry delay from OpenAI rate limit message", () => {
  const waitMs = parseOpenAiRetryAfterMs(
    "429 Rate limit reached for gpt-4o-mini on tokens per min (TPM): Limit 200000, Used 200000, Requested 9180. Please try again in 2.754s.",
  );

  assert.equal(waitMs, 2754);
});

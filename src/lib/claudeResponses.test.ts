import assert from "node:assert/strict";
import test from "node:test";

import { parseBase64DataImageUrl } from "./claudeResponses";

test("parseBase64DataImageUrl decodes supported image data urls", () => {
  const pngBase64 = Buffer.from("fake-image-bytes").toString("base64");
  const parsed = parseBase64DataImageUrl(`data:image/png;base64,${pngBase64}`);

  assert.equal(parsed?.mediaType, "image/png");
  assert.equal(parsed?.buffer.toString("utf8"), "fake-image-bytes");
});

test("parseBase64DataImageUrl rejects invalid data urls", () => {
  assert.equal(parseBase64DataImageUrl("https://example.com/image.jpg"), null);
  assert.equal(parseBase64DataImageUrl("data:text/plain;base64,SGVsbG8="), null);
});

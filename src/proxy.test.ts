import assert from "node:assert/strict";
import test from "node:test";

import { isExcludedFromStudioRewrite } from "./proxy";

test("/recreate is excluded from studio rewrite", () => {
  assert.equal(isExcludedFromStudioRewrite("/recreate"), true);
});

test("/projects-onboarding is excluded from studio rewrite", () => {
  assert.equal(isExcludedFromStudioRewrite("/projects-onboarding"), true);
  assert.equal(isExcludedFromStudioRewrite("/projects-onboarding/projects"), true);
  assert.equal(isExcludedFromStudioRewrite("/projects-onboarding/projects/abc"), true);
});

test("static product videos are not rewritten into the studio shell", () => {
  assert.equal(isExcludedFromStudioRewrite("/link-to-ad/product-videos/pixelplay.mp4"), true);
  assert.equal(isExcludedFromStudioRewrite("/link-to-ad/product-videos/cat brush.mp4"), true);
});

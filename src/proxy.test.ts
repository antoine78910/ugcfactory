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

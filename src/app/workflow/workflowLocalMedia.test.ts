import assert from "node:assert/strict";
import test from "node:test";

import { isWorkflowIdbMediaUrl, WORKFLOW_IDB_MEDIA_PREFIX } from "./workflowLocalMedia.ts";

test("isWorkflowIdbMediaUrl recognizes persisted local media pointers", () => {
  assert.equal(isWorkflowIdbMediaUrl(`${WORKFLOW_IDB_MEDIA_PREFIX}abc`), true);
  assert.equal(isWorkflowIdbMediaUrl("https://cdn.example/img.jpg"), false);
  assert.equal(isWorkflowIdbMediaUrl("blob:https://app.youry.io/x"), false);
});

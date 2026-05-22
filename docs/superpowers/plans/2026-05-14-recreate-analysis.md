# Recreate Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an analysis-only `/recreate` page that uploads a local video, extracts screenshots every `0.1s`, analyzes them with `gpt-4o-mini`, and shows verbose logs plus scene and frame summaries.

**Architecture:** Keep dense frame extraction and upload in the browser, send ordered uploaded frame URLs to a new server analysis route, batch the images through the existing OpenAI Responses helper, then render the merged segmentation and logs on a dedicated page. Use small shared pure helpers for timeline generation and batch/result normalization so the route and UI stay simple.

**Tech Stack:** Next.js App Router, React 19, TypeScript, OpenAI Responses API, existing upload helpers, Node test runner with `tsx` for focused helper tests.

---

### Task 1: Shared recreate analysis types and pure helpers

**Files:**
- Create: `src/lib/recreateAnalysis.ts`
- Create: `src/lib/recreateAnalysis.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing helper tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFrameTimestamps,
  groupFramesIntoBatches,
  mergeBatchFrameAnalyses,
} from "./recreateAnalysis";

test("buildFrameTimestamps uses 0.1s cadence and respects caps", () => {
  const out = buildFrameTimestamps(20, 0.1, 15, 150);
  assert.equal(out[0], 0);
  assert.equal(out[1], 0.1);
  assert.equal(out.length, 150);
  assert.equal(out.at(-1), 14.9);
});

test("groupFramesIntoBatches splits frames into max-12 batches", () => {
  const frames = Array.from({ length: 25 }, (_, i) => ({
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
```

- [ ] **Step 2: Run the helper tests and verify red**

Run: `npx tsx --test src/lib/recreateAnalysis.test.ts`

Expected: FAIL because the helper module does not exist yet.

- [ ] **Step 3: Add the minimal helper implementation**

```ts
export type UploadedRecreateFrame = {
  frameIndex: number;
  timestampSec: number;
  imageUrl: string;
};

export type RecreateFrameAnalysis = {
  frameIndex: number;
  timestampSec: number;
  isSceneStart: boolean;
  description: string;
  subjectAction: string;
  movement: string;
  textVisible: boolean;
};

export function buildFrameTimestamps(durationSec: number, intervalSec: number, maxDurationSec: number, maxFrames: number): number[] {
  // round to tenths, cap by duration and frame count
}

export function groupFramesIntoBatches(frames: UploadedRecreateFrame[], maxBatchSize: number): UploadedRecreateFrame[][] {
  // simple ordered chunking
}

export function mergeBatchFrameAnalyses(frames: RecreateFrameAnalysis[]) {
  // derive scene ranges and summaries from per-frame cut markers
}
```

- [ ] **Step 4: Run the helper tests again**

Run: `npx tsx --test src/lib/recreateAnalysis.test.ts`

Expected: PASS.

- [ ] **Step 5: Add the focused test runner dependency if needed**

Run: `npm install -D tsx`

Expected: `package.json` includes `tsx` in `devDependencies`.

### Task 2: Recreate analysis API route

**Files:**
- Create: `src/app/api/recreate/analyze/route.ts`
- Modify: `src/lib/recreateAnalysis.ts`
- Modify: `src/lib/openaiResponses.ts`
- Test: `src/lib/recreateAnalysis.test.ts`

- [ ] **Step 1: Extend the failing helper test to cover scene assignment**

```ts
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
```

- [ ] **Step 2: Run the helper tests and verify red**

Run: `npx tsx --test src/lib/recreateAnalysis.test.ts`

Expected: FAIL until the merged output includes `sceneId`.

- [ ] **Step 3: Implement the analysis route**

```ts
export async function POST(req: Request) {
  const body = await req.json();
  // validate input
  // build ordered batches of <= 12 frames
  // call openaiResponsesTextWithImages with gpt-4o-mini
  // parse strict JSON for each batch
  // merge all frame analyses into scenes + summaries
  // return structured response with server logs
}
```

- [ ] **Step 4: Re-run the helper tests**

Run: `npx tsx --test src/lib/recreateAnalysis.test.ts`

Expected: PASS.

### Task 3: `/recreate` page and extraction/upload workflow

**Files:**
- Create: `src/app/recreate/page.tsx`
- Create: `src/app/recreate/RecreateAnalysisClient.tsx`
- Modify: `src/lib/recreateAnalysis.ts`

- [ ] **Step 1: Add a failing helper test for short video sampling**

```ts
test("buildFrameTimestamps samples entire short videos without truncation", () => {
  const out = buildFrameTimestamps(0.35, 0.1, 15, 150);
  assert.deepEqual(out, [0, 0.1, 0.2, 0.3]);
});
```

- [ ] **Step 2: Run the helper tests and verify red**

Run: `npx tsx --test src/lib/recreateAnalysis.test.ts`

Expected: FAIL until rounding and last-frame inclusion are correct.

- [ ] **Step 3: Implement the page and client**

```tsx
export default function RecreatePage() {
  return <RecreateAnalysisClient />;
}

// client:
// - accept local video file
// - extract frames every 0.1s
// - upload frames with verbose progress logs
// - call /api/recreate/analyze
// - render logs, scene cards, frame table, and summaries
```

- [ ] **Step 4: Re-run the helper tests**

Run: `npx tsx --test src/lib/recreateAnalysis.test.ts`

Expected: PASS.

### Task 4: Verification

**Files:**
- Modify: `src/app/recreate/RecreateAnalysisClient.tsx`
- Modify: `src/app/api/recreate/analyze/route.ts`
- Modify: `src/lib/recreateAnalysis.ts`
- Modify: `package.json`

- [ ] **Step 1: Run focused tests**

Run: `npx tsx --test src/lib/recreateAnalysis.test.ts`

Expected: PASS.

- [ ] **Step 2: Run TypeScript verification**

Run: `npx tsc --noEmit`

Expected: exit code `0`.

- [ ] **Step 3: Run targeted lint**

Run: `.\node_modules\.bin\eslint.cmd "src/app/recreate/page.tsx" "src/app/recreate/RecreateAnalysisClient.tsx" "src/app/api/recreate/analyze/route.ts" "src/lib/recreateAnalysis.ts" "src/lib/recreateAnalysis.test.ts"`

Expected: exit code `0`.

- [ ] **Step 4: Manual smoke check**

Run manually in the app:

1. Open `/recreate`.
2. Upload a short ad video.
3. Confirm visible logs for extraction, upload, batching, and merge.
4. Confirm the result shows scene start/end frames, short scene descriptions, per-frame descriptions, and final summaries.

# Intelligence Recreate Shot Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dense low-cost shot analysis to the Intelligence recreate flow so the final recreate script is more faithful shot-by-shot and explicitly swaps competitor branding for the user's brand.

**Architecture:** Keep the browser responsible for dense frame extraction from the reference video, run a cheap batched vision analysis pass on those frames through a new API route, then reduce the result to a capped set of keyframes and structured shot summaries that are passed into the existing Claude script route. The current first-frame recreate remains the fallback path when dense analysis fails.

**Tech Stack:** Next.js App Router, React 19, TypeScript, OpenAI Responses API, Anthropic Claude, existing upload/download helpers, targeted `tsx --test` helper tests if lightweight test infra must be introduced.

---

### Task 1: Shared shot-analysis types and pure helpers

**Files:**
- Create: `src/lib/intelligenceRecreateShotAnalysis.ts`
- Create: `src/lib/intelligenceRecreateShotAnalysis.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing helper tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDenseSampleTimeline,
  mergeShotBatches,
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
    { shotId: "s1", startSec: 0, endSec: 0.7, keyFrameUrl: "a", brandingVisible: false, packagingVisible: false, textVisible: false, actionSummary: "Hook" },
    { shotId: "s2", startSec: 0.7, endSec: 1.4, keyFrameUrl: "b", brandingVisible: true, packagingVisible: true, textVisible: false, actionSummary: "Packaging close-up" },
  ]);
  assert.deepEqual(out.map((shot) => shot.keyFrameUrl), ["a", "b"]);
});
```

- [ ] **Step 2: Run the helper tests and watch them fail**

Run: `npx tsx --test src/lib/intelligenceRecreateShotAnalysis.test.ts`

Expected: FAIL because `src/lib/intelligenceRecreateShotAnalysis.ts` does not exist yet.

- [ ] **Step 3: Add minimal pure helper implementation**

```ts
export type DenseFramePoint = { timestampSec: number; frameUrl: string };
export type ShotFrameAnalysis = {
  timestampSec: number;
  shotBoundary: boolean;
  brandingVisible: boolean;
  packagingVisible: boolean;
  textVisible: boolean;
  actionSummary: string;
};

export type ReferenceShot = {
  shotId: string;
  startSec: number;
  endSec: number;
  keyFrameUrl: string;
  actionSummary: string;
  brandingVisible: boolean;
  packagingVisible: boolean;
  textVisible: boolean;
};

export function buildDenseSampleTimeline(durationSec: number): number[] {
  // dense 0.1s cadence, first 12s, then sparse tail samples
}

export function mergeShotBatches(batches: ShotFrameAnalysis[][]): ReferenceShot[] {
  // convert per-frame annotations into stable shot ranges
}

export function reduceShotsToClaudeKeyframes(shots: ReferenceShot[], maxFrames = 8): ReferenceShot[] {
  // keep opening shot and highest-value shots under cap
}
```

- [ ] **Step 4: Run the helper tests again**

Run: `npx tsx --test src/lib/intelligenceRecreateShotAnalysis.test.ts`

Expected: PASS with all helper tests green.

- [ ] **Step 5: Add the minimal test runner dependency if `tsx` is missing**

Run: `npm install -D tsx`

Expected: `package.json` gains `tsx` in `devDependencies` so the focused tests can run without a full framework migration.

### Task 2: Low-cost shot-analysis API route

**Files:**
- Create: `src/app/api/intelligence/recreate/analyze-shots/route.ts`
- Modify: `src/lib/openaiResponses.ts`
- Modify: `src/lib/intelligenceRecreateShotAnalysis.ts`
- Test: `src/lib/intelligenceRecreateShotAnalysis.test.ts`

- [ ] **Step 1: Add a failing test for batch prompt parsing / merge behavior**

```ts
test("mergeShotBatches keeps later branded shot metadata after batch stitching", () => {
  const merged = mergeShotBatches([
    [
      { timestampSec: 0, shotBoundary: true, brandingVisible: false, packagingVisible: false, textVisible: false, actionSummary: "Creator hook" },
      { timestampSec: 0.5, shotBoundary: true, brandingVisible: true, packagingVisible: true, textVisible: false, actionSummary: "Bottle close-up" },
    ],
  ]);
  assert.equal(merged[1]?.brandingVisible, true);
  assert.equal(merged[1]?.packagingVisible, true);
});
```

- [ ] **Step 2: Run the helper test and verify red**

Run: `npx tsx --test src/lib/intelligenceRecreateShotAnalysis.test.ts`

Expected: FAIL until branded shot metadata survives merge.

- [ ] **Step 3: Implement the route and prompt batching**

```ts
export async function POST(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  // parse { frames, durationSec, ad, productDescription }
  // batch frame URLs in chunks of <= 12
  // call openaiResponsesTextWithImages({ model: "gpt-4o-mini", ... })
  // parse strict JSON blocks
  // merge batches with mergeShotBatches(...)
  // reduce to Claude keyframes with reduceShotsToClaudeKeyframes(...)
  // return { shots, keyframes, analyzedFrameCount }
}
```

- [ ] **Step 4: Re-run the helper test**

Run: `npx tsx --test src/lib/intelligenceRecreateShotAnalysis.test.ts`

Expected: PASS.

### Task 3: Recreate dialog dense extraction + analysis UX

**Files:**
- Modify: `src/app/intelligence/_components/AdRecreateDialog.tsx`
- Modify: `src/lib/intelligenceRecreateShotAnalysis.ts`
- Test: `src/lib/intelligenceRecreateShotAnalysis.test.ts`

- [ ] **Step 1: Add a failing helper test for dense sample generation**

```ts
test("buildDenseSampleTimeline samples full short videos and appends sparse tail samples for long videos", () => {
  assert.equal(buildDenseSampleTimeline(4).at(-1), 3.9);
  assert.equal(buildDenseSampleTimeline(20).some((t) => t >= 15), true);
});
```

- [ ] **Step 2: Run the helper test and verify red**

Run: `npx tsx --test src/lib/intelligenceRecreateShotAnalysis.test.ts`

Expected: FAIL until long-video tail sampling exists.

- [ ] **Step 3: Implement the dialog integration**

```ts
const [analysisState, setAnalysisState] = useState<
  | { kind: "idle" }
  | { kind: "extracting" }
  | { kind: "analyzing" }
  | { kind: "ready"; shots: ReferenceShot[]; analyzedFrameCount: number }
  | { kind: "failed"; message: string }
>({ kind: "idle" });

// after first-frame extraction:
// 1. build dense timestamps
// 2. extract dense JPEG data URLs
// 3. upload only the reduced / needed frames
// 4. POST /api/intelligence/recreate/analyze-shots
// 5. keep fallback if analysis fails
```

- [ ] **Step 4: Update the recreate loading copy**

```tsx
{analysisState.kind === "extracting" ? "Extracting frames..." : null}
{analysisState.kind === "analyzing" ? "Analyzing shots..." : null}
{draftBusy ? "Drafting recreate script..." : null}
```

- [ ] **Step 5: Re-run the helper tests**

Run: `npx tsx --test src/lib/intelligenceRecreateShotAnalysis.test.ts`

Expected: PASS.

### Task 4: Claude script route upgrade for shot-by-shot brand swap

**Files:**
- Modify: `src/app/api/intelligence/recreate/script/route.ts`
- Modify: `src/lib/intelligenceRecreateShotAnalysis.ts`
- Create: `src/app/api/intelligence/recreate/script/prompt.test.ts`

- [ ] **Step 1: Write a failing prompt-builder test**

```ts
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
    },
    "https://example.com/start.jpg",
    [],
    ["https://example.com/p1.jpg"],
    [
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
  );
  assert.match(prompt, /0\.0-0\.7s|0\.0–0\.7s/);
  assert.match(prompt, /replace/i);
  assert.match(prompt, /logo|packaging|label/i);
});
```

- [ ] **Step 2: Run the prompt test and verify red**

Run: `npx tsx --test src/app/api/intelligence/recreate/script/prompt.test.ts`

Expected: FAIL because the route does not yet accept shot summaries or emit the stronger wording.

- [ ] **Step 3: Implement the prompt route changes**

```ts
type Body = {
  // existing fields...
  shotAnalysis?: {
    shots: ReferenceShot[];
    keyframes?: ReferenceShot[];
    analyzedFrameCount?: number;
  };
};

function buildSystemPrompt(): string {
  return `... describe the ad shot-by-shot with narrow timestamps ...
replace every visible competitor logo, packaging mark, label, product body mark, and app brand surface with the user's brand ...
preserve framing, action, timing, and pacing ...`;
}
```

- [ ] **Step 4: Run the prompt test again**

Run: `npx tsx --test src/app/api/intelligence/recreate/script/prompt.test.ts`

Expected: PASS.

### Task 5: End-to-end verification

**Files:**
- Modify: `src/app/intelligence/_components/AdRecreateDialog.tsx`
- Modify: `src/app/api/intelligence/recreate/analyze-shots/route.ts`
- Modify: `src/app/api/intelligence/recreate/script/route.ts`
- Modify: `src/lib/intelligenceRecreateShotAnalysis.ts`

- [ ] **Step 1: Run focused tests**

Run: `npx tsx --test src/lib/intelligenceRecreateShotAnalysis.test.ts src/app/api/intelligence/recreate/script/prompt.test.ts`

Expected: PASS.

- [ ] **Step 2: Run TypeScript verification**

Run: `npx tsc --noEmit`

Expected: exit code `0`.

- [ ] **Step 3: Run targeted lint**

Run: `.\node_modules\.bin\eslint.cmd "src/app/intelligence/_components/AdRecreateDialog.tsx" "src/app/api/intelligence/recreate/analyze-shots/route.ts" "src/app/api/intelligence/recreate/script/route.ts" "src/lib/intelligenceRecreateShotAnalysis.ts" "src/lib/intelligenceRecreateShotAnalysis.test.ts" "src/app/api/intelligence/recreate/script/prompt.test.ts"`

Expected: exit code `0`.

- [ ] **Step 4: Manual recreate smoke check**

Run manually in the app:

1. Open an Intelligence ad that has a real `videoUrl`.
2. Launch `Recreate`.
3. Confirm loading progresses through frame extraction, shot analysis, then prompt drafting.
4. Confirm the generated prompt contains tighter timing windows and explicit brand swap wording.
5. Confirm recreate still works if shot analysis fails and falls back to the old first-frame path.

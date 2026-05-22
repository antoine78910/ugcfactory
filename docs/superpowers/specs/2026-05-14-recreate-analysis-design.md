# Recreate page: GPT-only video analysis with dense frame logs

## Context

The codebase already has two recreate-related entry points:

- `src/app/intelligence/_components/AdRecreateDialog.tsx`, which extracts the competitor video's first frame and sends it to `POST /api/intelligence/recreate/script`.
- `src/app/_components/AdsStudioRecreatePromptDialog.tsx`, which does a similar "draft prompt from reference media" flow for Ads Studio.

Both flows focus on drafting a recreate prompt. They do not provide a dedicated `/recreate` page for raw video analysis, scene segmentation, per-frame descriptions, or verbose live logs.

The requested first version is intentionally analysis-only:

- upload a video on `/recreate`,
- extract screenshots every `0.1s`,
- analyze the extracted frames with OpenAI only,
- use `gpt-4o-mini` for the full analysis pass,
- show every important processing step and log in the UI for local debugging,
- return a structured segmentation plus detailed descriptions,
- do not use Claude,
- do not generate a recreate prompt yet,
- do not launch video generation yet.

## Goals

- Add a dedicated `/recreate` page for uploading a local ad video and analyzing it.
- Sample the video at `0.1s` cadence in the browser.
- Keep the analysis pipeline GPT-only, with `gpt-4o-mini` as the first-version model.
- Detect scene changes / cuts and produce a clean segmentation timeline.
- Return scene-level and frame-level descriptions that are easy to inspect.
- Surface verbose logs for each phase so local runs are transparent.

## Non-goals

- Generating a recreate prompt from the analysis.
- Launching a model generation job after analysis.
- Using Claude anywhere in this flow.
- Automatically optimizing cost or latency beyond basic hard caps for safety.
- Pixel editing, logo replacement, or inpainting.

## User experience

### Page

Add a standalone page at `src/app/recreate/page.tsx`.

This page should include:

- a video upload input for a local file,
- a compact settings section,
- an `Analyze` button,
- a live log panel,
- a results section rendered after analysis completes.

### Initial controls

The first version should keep the configuration minimal:

- model: fixed to `gpt-4o-mini` in the pipeline, but displayed in the UI so it is obvious which model was used,
- frame interval: fixed to `0.1s`,
- verbose logs: always on for this first local-debug version.

There is no need for a model picker or advanced controls in v1.

### Logs panel

The page should display a visible chronological log stream during execution.

Expected log categories:

- video accepted,
- video metadata loaded,
- frame extraction started,
- individual frame capture progress,
- total frames captured,
- upload progress,
- analysis batch start / end,
- number of images sent per batch,
- raw batch response accepted / parsed,
- shot merge progress,
- final segmentation counts,
- final summaries ready,
- failures and fallbacks.

The tone of the logs should be explicit and debugging-friendly. This is a local tool, so verbosity is preferred over polish.

## Technical design

### A. Client-side dense frame extraction

The browser should handle frame extraction from the uploaded local video file.

Reasons:

- the app already has browser-based frame extraction patterns in recreate dialogs,
- this avoids introducing a server-side `ffmpeg` dependency in the first version,
- it makes progress reporting more direct in the UI.

The extraction flow should:

1. create an object URL from the uploaded file,
2. load the video element and read metadata,
3. compute timestamps at `0.1s` cadence,
4. seek to each timestamp and draw the frame to a canvas,
5. export JPEG screenshots,
6. keep an in-memory record of:
   - frame index,
   - timestamp,
   - data URL preview,
   - uploaded CDN URL once available.

### B. Safety caps

Dense extraction can become expensive quickly. The first version should include explicit caps.

Recommended default caps:

- analyze at most the first `15s` of video,
- or stop at `150` extracted frames,
- whichever comes first.

This keeps the feature close to the requested `0.1s` cadence while avoiding runaway memory or API cost in v1.

If the uploaded video is longer than the cap, the logs and final summary must state that the analysis was truncated.

### C. Frame upload

The server route cannot directly inspect browser-only data URLs, so extracted frames should be uploaded before the OpenAI analysis pass.

Use the existing CDN upload helpers already present in the codebase:

- `uploadBlobUrlToCdn(...)`
- or a closely related helper if a file-based path is cleaner

Each uploaded frame should preserve its ordering metadata on the client:

- `frameIndex`
- `timestampSec`
- `imageUrl`

### D. Analysis route

Add a dedicated API route:

- `POST /api/recreate/analyze`

This route should receive:

- video metadata,
- ordered frame descriptors,
- analysis config,
- an instruction that logs are requested.

Suggested request shape:

```ts
type RecreateAnalyzeFrameInput = {
  frameIndex: number;
  timestampSec: number;
  imageUrl: string;
};

type RecreateAnalyzeRequest = {
  fileName: string;
  durationSec: number;
  frameIntervalSec: number;
  truncated: boolean;
  frames: RecreateAnalyzeFrameInput[];
};
```

### E. GPT batch analysis strategy

`src/lib/openaiResponses.ts` already contains `openaiResponsesTextWithImages(...)`, which caps image inputs to 12 URLs. The new route should batch frames accordingly.

Recommended first-version strategy:

1. split frames into ordered batches of up to `12`,
2. send each batch to `gpt-4o-mini`,
3. ask for strict JSON output,
4. parse each batch result,
5. merge the batch results into one global timeline,
6. derive the final scene segmentation and summaries.

Each batch prompt should ask the model to return, for every frame:

- frame index,
- timestamp,
- whether this frame looks like the start of a new scene / cut,
- a short description of what is visible,
- the main subject action,
- visible movement / camera motion,
- whether text is visible,
- whether packaging / product / face / UI are visible.

The prompt should also ask the model to provide a provisional summary of the batch so that logs can surface meaningful intermediate output.

### F. Final merged result

After all batches are analyzed, the route should merge them into a structured response.

Expected top-level result:

```ts
type RecreateScene = {
  sceneId: string;
  startFrameIndex: number;
  endFrameIndex: number;
  startSec: number;
  endSec: number;
  shortDescription: string;
  summary: string;
};

type RecreateFrameAnalysis = {
  frameIndex: number;
  timestampSec: number;
  description: string;
  subjectAction: string;
  movement: string;
  textVisible: boolean;
  sceneId: string;
};

type RecreateAnalyzeResponse = {
  model: "gpt-4o-mini";
  frameIntervalSec: number;
  analyzedFrameCount: number;
  sceneCount: number;
  truncated: boolean;
  scenes: RecreateScene[];
  frames: RecreateFrameAnalysis[];
  segmentationSummary: string;
  videoSummary: string;
  logs: string[];
};
```

### G. Scene segmentation rules

The final result should prioritize the segmentation output requested by the user:

- keep only the start frame and end frame of each scene in the scene-level summary,
- attach a short description to each scene,
- also keep the detailed frame-by-frame analysis for inspection below,
- include a global segmentation summary that states how many cuts / scenes were detected and how the ad evolves over time.

If there is uncertainty between two nearby frame boundaries, prefer stable scene grouping over noisy micro-cuts.

### H. Result rendering on the page

The page should show:

1. upload metadata
2. extraction summary
3. total screenshots taken
4. total screenshots uploaded
5. total GPT batches sent
6. segmentation summary
7. scene cards
8. frame-by-frame breakdown
9. final overall summary

Each scene card should show:

- scene number,
- start frame,
- end frame,
- start time,
- end time,
- short description,
- summary.

Each frame row should show:

- frame number,
- timestamp,
- scene id,
- description,
- action,
- movement.

It is acceptable for the first version to render this as a debug-heavy interface rather than a polished production UI.

## Error handling

### Extraction failures

If the browser cannot decode the video or seek frames reliably:

- stop the run,
- write an explicit error log,
- render a clear error state in the page.

### Upload failures

If a screenshot fails to upload:

- log the failing frame index,
- stop the run,
- return a visible error state.

The first version does not need partial recovery. Deterministic failure with explicit logs is better than hidden retries.

### Model / parse failures

If a GPT batch fails or returns invalid JSON:

- log the batch index,
- log the parse failure reason,
- abort the full analysis,
- show the partial logs already collected.

## Observability

This feature is explicitly intended for local iteration, so logs are part of the product for now.

Implementation should support:

- client logs that update during extraction and upload,
- server-returned logs from the analysis route,
- a merged UI log timeline.

The UI does not need streaming transport in v1. Appending logs phase by phase on the client is sufficient as long as the user can see:

- what is happening,
- how many screenshots were taken,
- how many were sent,
- which batch is being analyzed,
- what the final segmentation contains.

## Open questions deliberately fixed for v1

To avoid blocking implementation, the following choices are fixed now:

- analysis is local-upload only, not remote URL input,
- model is `gpt-4o-mini`,
- cadence is `0.1s`,
- this page is analysis-only,
- no Claude,
- no generation step after analysis.

## Success criteria

- `/recreate` exists and accepts a local video upload.
- The browser extracts screenshots every `0.1s` until the configured safety cap.
- The UI visibly shows extraction, upload, analysis, and merge logs.
- The backend analyzes the frames with `gpt-4o-mini` only.
- The final output includes:
  - scene count,
  - scene start/end frames,
  - short scene descriptions,
  - per-frame descriptions,
  - segmentation summary,
  - overall video summary.
- No new lint or type errors are introduced in touched files.

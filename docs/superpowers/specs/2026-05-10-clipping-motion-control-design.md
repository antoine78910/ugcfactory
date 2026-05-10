# Clipping Studio: Kling 3.0 motion control on hook

## Context

The Clipping Studio at [src/app/clipping/ClippingStudio.tsx](../../../src/app/clipping/ClippingStudio.tsx) records a webcam-only "hook" phase followed by a split-screen phase with a template video. After export, users can download the merged clip. We want to add an opt-in motion-control pass on the **hook portion only** using the existing Kling 3.0 plumbing at [/api/kling/motion-control](../../../src/app/api/kling/motion-control/route.ts).

## User goal

After a take, the clipper sees their clip and a panel with:

- a clear cost in credits derived from the hook duration,
- the number of motion-control jobs needed (always 1 with Kling 3.0 since the hook slider is capped at 30s),
- a one-click button to send the hook to Kling 3.0 motion control,
- the resulting motion-controlled video, played back inline when ready.

## Inputs sent to Kling

Kling motion-control needs `imageUrl` (character still) and `videoUrl` (motion reference).

- **Motion reference (`videoUrl`)** = hook clip only (webcam, full-frame). Captured by a parallel `MediaRecorder` started at `recording_hook` and stopped at hook end.
- **Character image (`imageUrl`)**:
  - Default: a still extracted from the hook canvas at the mid-point of the hook (a `canvas.toBlob` call when half the hook elapsed).
  - Alternative: an image uploaded by the user via a file input. When uploaded, it overrides the auto-extracted frame.
- **Quality**: `720p` (default, 0.85 cr/s) or `1080p` (1.3 cr/s). Picker in the panel.
- **Model family**: `kling-3.0` only.
- **`backgroundSource`**: `input_video` so the background comes from the hook recording (keeps the clipper's setting).

## Cost display

Computed client-side via [`calculateMotionControlCreditsFromDuration`](../../../src/lib/pricing.ts) (mirrors the server preflight). For Kling 3.0 the hook (3–30s slider) always fits in **one** generation. The panel always reads:

> `Hook · Ns · 1 generation · X credits`

If a future change pushes the hook beyond 30s, the panel will derive `jobsNeeded = ceil(durationSec / 30)` and total cost as `jobsNeeded × calculateMotionControlCreditsFromDuration(...)`.

## Recording capture

A parallel `MediaRecorder` (`hookRecorderRef`) captures only the hook phase. It consumes the same canvas `captureStream(RECORDING_FPS)` that the main recorder uses; multiple `MediaRecorder` instances on one MediaStream is supported by the WebRTC spec. Audio: video-only (template audio doesn't play during the hook anyway).

Lifecycle:

| Event                      | Action                                                                 |
|----------------------------|------------------------------------------------------------------------|
| `recording_hook` start     | Start `hookRecorderRef`, schedule mid-hook canvas snapshot             |
| Hook duration midpoint     | `canvas.toBlob` → `hookFrameBlob` (PNG)                                |
| Hook end                   | Stop `hookRecorderRef`, assemble `hookBlob` (mp4/webm)                 |
| Retake hook                | Discard previous `hookBlob` + frame, restart capture next time         |

## UI

A new collapsible panel renders only on `stage === "done"` and `hookBlob` is set, below the existing video + download row in the main section. Layout (inside the existing `<section>` after the download buttons):

```
┌─ Motion control (Kling 3.0) ─────────────────────────┐
│  Source           ( ◉ Hook frame   ○ Upload image )  │
│  [ image preview ─ either auto-frame or uploaded ]   │
│                                                       │
│  Quality          ( ◉ 720p         ○ 1080p          ) │
│                                                       │
│  Hook · 12s · 1 generation                            │
│  Estimated cost: 11 credits                          │
│                                                       │
│  [ Generate motion control  ▶ ]                      │
└──────────────────────────────────────────────────────┘
```

While running:

```
[ Skeleton 9:16 with shimmer ]   "Generating motion control… ~2 min"
```

When done, the result video replaces the skeleton and gets its own download button (`clip-motion-${clipId}.mp4`).

## Backend / API flow

```
[Client]
  hookBlob, characterImageBlob
    ↓ POST /api/uploads (multipart, ×2)
  publicUrls: { videoUrl, imageUrl }
    ↓ POST /api/kling/motion-control
       { imageUrl, videoUrl, quality, motionFamily: "kling-3.0",
         backgroundSource: "input_video", videoDurationSeconds: hookDuration }
    ↓
  { taskId, model, provider }
  upsertMotionPendingJob({ taskId, ... })
    ↓ poll /api/studio/generations/poll until status=succeeded
  resultUrl  →  <video src=resultUrl>
```

The server already handles plan gating (`canUseMotionControl`) and credit preflight (`assertSufficientCreditsResponse`). Client doesn't debit; server does.

## Edge cases

- **Hook < 3s**: Server rejects. Client disables button when `hookDuration < 3` and shows a tooltip.
- **Plan gate fails (HTTP 403)**: Show inline error with upgrade CTA reusing `motionControlUpgradeMessage` shape.
- **Insufficient credits (HTTP 402)**: Inline error with required vs available count.
- **Upload fails**: Inline error, button re-enabled, no Kling call dispatched.
- **Polling stalls / 5xx**: Existing `studioGenerationsPoll` handles retries; surface a final error after timeout.
- **User retakes hook**: Discard `hookBlob` and `hookFrameBlob`; the panel disappears until next export.
- **Page reload mid-job**: `motionControlPendingSession` reads `sessionStorage` on mount; if a job for this clip is still pending, the panel re-attaches with the skeleton until poll resolves.

## Files touched

- `src/app/clipping/ClippingStudio.tsx`
  - New refs: `hookRecorderRef`, `hookChunksRef`, `hookBlobRef`, `hookFrameBlobRef`
  - New state: `hookBlob`, `hookFrameBlob`, `motionTaskId`, `motionResultUrl`, `motionStatus`, `motionQuality`, `motionImageSource`, `customCharacterImage`
  - Lifecycle additions in `startMediaRecorder`, hook countdown handler, hook stop handler, retake handler
  - New panel rendered in the `stage === "done"` branch
  - Upload helper (reuses `/api/uploads`)
  - Submit handler that calls `/api/kling/motion-control` and seeds `motionControlPendingSession`
  - `useEffect` that polls pending motion jobs from sessionStorage on mount + after submit, hydrating from `/api/studio/generations/poll`

No server-side changes. No DB migrations. No new env vars.

## Out of scope

- Auto-trigger on export (rejected; user selected button-driven).
- Chunking long hooks (slider max 30s, Kling 3.0 supports it).
- Cropping the hook to face only (the hook canvas is already a 3:4 portrait card centered on the user — no further face crop needed).
- Motion-controlling the split-screen phase (not asked for; would conflict with the visible template).

## Testing plan

Manual (no test infra for the studio canvas pipeline):

1. Record a 5s hook + 8s template clip → verify `hookBlob` is roughly the hook duration and plays in isolation.
2. Verify auto-extracted character frame is a clear webcam still (PNG, 1080×1920).
3. Verify cost display: 5s @ 720p = 5 credits, 5s @ 1080p = 7 credits, 12s @ 720p = 11 credits.
4. Submit at 720p with Hook frame → confirm task gets created, polled, and the resulting video plays.
5. Submit with a user-uploaded character → confirm `imageUrl` is the uploaded one.
6. Retake hook → confirm panel hides until next export.
7. Reload page mid-job → confirm panel re-attaches and resumes polling.
8. Plan = free → button disabled with upgrade prompt.

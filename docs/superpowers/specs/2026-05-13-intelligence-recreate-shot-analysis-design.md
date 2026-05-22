# Intelligence recreate: dense shot analysis + brand swap

## Context

Today the Intelligence recreate flow extracts only the competitor video's opening frame in [src/app/intelligence/_components/AdRecreateDialog.tsx](../../../src/app/intelligence/_components/AdRecreateDialog.tsx), then sends that frame plus a few static references and the user's product images to [src/app/api/intelligence/recreate/script/route.ts](../../../src/app/api/intelligence/recreate/script/route.ts).

That route asks Claude Opus to write a Seedance prompt, but it only has a shallow visual view of the ad:

- one real frame from the video start,
- up to three extra reference images,
- up to three product images.

This is why the generated script can collapse multiple beats into broad ranges like `0–2s`, miss cuts or gestures later in the ad, and under-specify where competitor branding must be replaced by the user's own brand.

The requested improvement is:

> Analyze the reference video much more densely internally, understand shots / cuts / actions / visible logos, keep Claude costs under control, and generate a much more faithful recreate script with explicit brand swap instructions.

The user explicitly wants a cheap detector model for the dense analysis pass, then the existing high-quality script writer can keep generating the final recreate prompt.

## Goals

- Preserve the current recreate UX while making the generated script much more specific shot-by-shot.
- Internally sample the reference video at roughly `0.1s` granularity without sending all of those frames to Claude.
- Detect cuts, shot changes, product actions, logo visibility, packaging visibility, and screen / CTA changes using a lower-cost vision model.
- Strengthen the final prompt so it explicitly swaps competitor branding for the user's branding on packaging, product, labels, app screens, and visible logos.
- Keep final-script cost bounded by sending Claude only the opening frame plus a compact set of keyframes.

## Design

### A. Dense frame extraction in the recreate client

Add a reusable client helper near the recreate flow to extract JPEG frames from a local or downloaded video blob at dense timestamps.

Behavior:

- Target cadence: `0.1s`.
- Hard cap the extraction budget so the browser does not explode on longer videos:
  - default target: first `12s`,
  - maximum extracted frames: `120`,
  - for shorter videos, sample full duration,
  - for longer videos, sample the first `12s` densely and then append a few sparse tail frames for end-card context.
- Reuse the existing `/api/download` proxy and browser `<video>` extraction pattern already used in `AdRecreateDialog`.
- Upload only the frames that survive the later reduction step; dense intermediate frames stay client-side unless a server analysis endpoint needs them uploaded temporarily.

This keeps fidelity high where most UGC ads do most of their work: hook, first reveal, product handling, CTA transition.

### B. Low-cost shot analysis pass

Add a new route:

- `POST /api/intelligence/recreate/analyze-shots`

This route receives:

- reference video metadata,
- ordered dense frame URLs with timestamps,
- optional ad headline / body / platform,
- optional product description.

Use [src/lib/openaiResponses.ts](../../../src/lib/openaiResponses.ts) with `openaiResponsesTextWithImages(...)` and a cheap vision-capable model, defaulting to `gpt-4o-mini`.

Why this model:

- cheap enough for dense pre-analysis,
- good enough to detect cuts, framing changes, visible branding, packaging, and main actions,
- already matches the repo's existing OpenAI Responses helper pattern.

Because the helper already caps image inputs to `12`, the route will analyze the dense frames in batches. Each batch prompt will ask the model to output strict JSON describing:

- frame timestamps,
- probable shot boundaries,
- whether the product / packaging is visible,
- whether a competitor logo or brand mark is visible,
- what the subject is doing,
- whether the frame looks like a continuation of the previous shot,
- whether text / CTA / screen UI appears.

Then the route merges batch results into a normalized shot timeline.

### C. Keyframe reduction before Claude

The analyzer output becomes a compact shot summary:

- one opening frame,
- one representative frame per shot,
- optionally one extra frame when a shot contains a meaningful product / branding transition,
- hard cap: `8` competitor reference frames total for the Claude stage.

Selection priority:

1. opening frame,
2. frames with clear shot boundaries,
3. frames where competitor branding or packaging is visible,
4. frames where the product is handled, opened, applied, or shown close-up,
5. frames where CTA / app UI / end card changes.

This keeps the final Claude payload under the current practical image budget:

- up to `8` competitor keyframes,
- up to `3` product images,
- total stays within the current `12`-image helper cap.

### D. Stronger final prompt generation with brand swap instructions

Extend [src/app/api/intelligence/recreate/script/route.ts](../../../src/app/api/intelligence/recreate/script/route.ts) to accept a structured shot analysis payload, for example:

```ts
type ReferenceShot = {
  shotId: string;
  startSec: number;
  endSec: number;
  keyFrameUrl: string;
  actionSummary: string;
  brandingVisible: boolean;
  packagingVisible: boolean;
  textVisible: boolean;
};
```

The Claude prompt should no longer infer the whole ad only from the first frame. It should receive:

- the opening frame,
- the reduced set of shot keyframes,
- the structured shot summaries,
- the user's product images.

Revise the system prompt so Claude must:

- describe the ad shot-by-shot with tighter timings such as `0.0–0.7s`, `0.7–1.4s`, `1.4–2.3s`,
- preserve framing, movement, pacing, and action of the competitor ad as closely as possible,
- replace any visible competitor brand elements with the user's brand,
- explicitly map brand swap targets:
  - product body,
  - packaging,
  - label,
  - cap / closure,
  - app screen if relevant,
  - any visible logo or wordmark,
- mention when the recreated version should keep the same gesture but with the user's product inserted into the same position and angle.

Important wording change: the prompt should stop saying only "substitute the user's product". It should say that all visible competitor brand identifiers must be replaced by the user's brand identity while preserving the original ad's composition and timing.

### E. UI changes in `AdRecreateDialog`

In [AdRecreateDialog.tsx](../../../src/app/intelligence/_components/AdRecreateDialog.tsx):

- after extracting the start frame, run the dense shot-analysis phase before drafting the script,
- show explicit progress states:
  - `Extracting frames...`
  - `Analyzing shots...`
  - `Drafting recreate script...`
- keep the current fallback behavior:
  - if dense analysis fails, still allow recreate using the opening frame + current references,
  - surface a soft warning instead of blocking the dialog.

Optional but recommended small UI detail:

- expose a tiny note in review mode like `High-fidelity analysis: 6 shots detected`.

### F. Cost model

Compared with today's flow, the new pipeline adds one cheap pre-analysis pass and a slightly richer Claude prompt input.

Expected effect:

- **OpenAI mini cost:** increases from `0` to a small bounded amount per recreate because dense frames are analyzed in batches.
- **Claude cost:** increases moderately, but much less than sending dense `0.1s` frames directly to Claude, because Claude still receives only reduced keyframes.
- **Latency:** increases by one analysis step, but should remain acceptable because the cheap model handles the expensive visual triage.

Net: yes, the recreate script gets more expensive than today, but the increase should be controlled and materially cheaper than a naive "send every `0.1s` frame to Claude" design.

## Out of scope

- Pixel-level automatic logo replacement or inpainting. This design improves the script and brand-swap instructions; it does not directly edit frames.
- Model-selection UX after recreate prompt generation (`Seedance 2.0`, `Kling 3.0`, `Sora 2 Pro`, `Veo 3.1`) — separate follow-up task.
- Dashboard `similar shops` recommendations and top-5 ads surface — separate follow-up task.
- Persisting every dense intermediate frame to storage.

## Risks and mitigations

- **Too many frames / browser memory pressure**  
  Mitigation: hard-cap dense extraction to `120` frames and compress to JPEG thumbnails before analysis.

- **Vision model inconsistently detecting cuts**  
  Mitigation: use overlapping batches and merge boundaries conservatively; when uncertain, keep more keyframes instead of fewer.

- **Claude prompt becomes too long**  
  Mitigation: pass structured shot summaries and capped keyframes, not raw dense frames or verbose OCR dumps.

- **Brand swap still too vague**  
  Mitigation: make packaging / label / logo replacement an explicit required section of the system prompt rather than an implied instruction.

- **Analysis failure blocks recreate**  
  Mitigation: degrade gracefully to the current first-frame flow with a warning.

## Success criteria

- Recreate scripts describe multiple fine-grained beats instead of broad ranges like `0–2s` unless the source ad truly has one static beat.
- When the source ad shows branded packaging or product close-ups, the generated script explicitly instructs replacing competitor branding with the user's branding in the same shot context.
- Recreate continues working when dense analysis fails, but logs / UI make it obvious the flow fell back.
- No new lint or type errors in touched files.

## Validation plan

1. Unit / helper validation for timestamp generation and keyframe reduction.
2. Manual recreate test with:
   - a talking-head ad with several jump cuts,
   - a packaging-heavy unboxing ad,
   - an app ad with UI / logo changes.
3. Confirm the final prompt contains:
   - sub-second or narrow timestamp ranges,
   - explicit brand swap instructions,
   - packaging / logo replacement language when relevant.
4. Compare cost / latency of:
   - current flow,
   - dense-analysis flow,
   - fallback flow.
5. Run `npx tsc --noEmit` and targeted `eslint` on touched files.

## Expected files touched

- New: `src/app/api/intelligence/recreate/analyze-shots/route.ts`
- New helper(s) for dense frame extraction / reduction in the recreate flow
- Update: `src/app/intelligence/_components/AdRecreateDialog.tsx`
- Update: `src/app/api/intelligence/recreate/script/route.ts`
- Possibly update shared OpenAI / recreate typing helpers if the shot-analysis payload is shared across routes

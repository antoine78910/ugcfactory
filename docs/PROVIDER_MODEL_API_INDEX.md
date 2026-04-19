# Provider model → official API docs

Single index of **official documentation URLs** and where **in-app credits / USD** are defined. Update provider prices there first, then align `src/lib/pricing.ts` (and any fixed tiers).

## Credits and cost (where to edit)

- **Primary:** `src/lib/pricing.ts` — image/video tiers, Kling per-second curves, Sora/Veo fixed tiers, Topaz, WaveSpeed translate rule, Seedance video heuristics.
- **Public snapshot:** `GET /api/pricing` — `src/app/api/pricing/route.ts`.
- **Studio billing call sites:** `calculateVideoCreditsForModel`, `calculateImageCredits*`, etc. from `pricing.ts`.

## Studio job persistence (`studio_generations`)

Server writes use **only** these insert paths:

| Flow | Route / code | Notes |
| ---- | ------------ | ----- |
| Studio Image (KIE) | `POST /api/studio/generations/start` | Inserts rows **without** `model` (picker id is not stored on the row today). |
| Video (Kling / Veo / PiAPI), motion control, translate repair, workflow, Topaz image upscale, Link-to-Ad, motion/translate pending repair | `POST /api/studio/generations/register` | Persists optional `model` (picker / provider id) when present; **retries without `model`** if the DB has no `studio_generations.model` column (same pattern as `aspect_ratio`). |
| Voice change (ElevenLabs) | `POST /api/elevenlabs/speech-to-speech` | Direct insert, no `model` field. |

Apply `supabase/studio_generations.sql` + `studio_generations_aspect_ratio.sql` on new environments so optional columns exist; the app avoids sending `model` until the column is present everywhere you care about.

## Text-to-video vs image-to-video (KIE)

Several pickers use **one UI id**; the backend resolves to **two KIE `model` strings** depending on reference image presence.

- **Implementation:** `resolveKieVideoPickerToMarketModel()` in `src/lib/kieVideoModelResolver.ts` (used by `src/app/api/kling/generate/route.ts`).

| UI picker id        | No image                         | With reference image              |
| ------------------- | -------------------------------- | --------------------------------- |
| `kling-2.6/video`   | `kling-2.6/text-to-video`        | `kling-2.6/image-to-video`        |
| `openai/sora-2`     | `sora-2-text-to-video`           | `sora-2-image-to-video`           |
| `openai/sora-2-pro` | `sora-2-pro-text-to-video`       | `sora-2-pro-image-to-video`       |

---

## Translate (WaveSpeed / HeyGen)

| Product        | Docs |
| -------------- | ---- |
| Video translate | [HeyGen Video Translate on WaveSpeedAI](https://wavespeed.ai/models/heygen/video-translate) |

**Public list price (docs):** $0.0375 per second of video.  
**App rule:** see `WAVESPEED_HEYGEN_TRANSLATE_*` in `src/lib/pricing.ts`.

---

## Motion control (KIE Market)

| Model        | Docs |
| ------------ | ---- |
| Kling 3.0    | [motion-control-v3](https://docs.kie.ai/market/kling/motion-control-v3) |
| Kling 2.6    | [motion-control](https://docs.kie.ai/market/kling/motion-control) |

**Request shape:** KIE expects `input.mode` as **`720p` or `1080p`** (not `std` / `pro`). Studio labels the control **Background source** for both families: Kling 3.0 sends `background_source` (`input_video` / `input_image`); Kling 2.6 maps the same choice to `character_orientation` (`video` / `image`) because that API has no `background_source` field (`image` orientation: reference clip **≤10s** per provider docs).

**Credits:** `MOTION_CONTROL_CREDITS_PER_SECOND` and `calculateMotionControlCreditsFromDuration` in `src/lib/pricing.ts`.

**API:** `POST /api/kling/motion-control` — body `motionFamily`: `kling-3.0` (default) or `kling-2.6`.

---

## Image (KIE Market)

| Model / flow | Docs |
| ------------ | ---- |
| Nano Banana 2 | [nano-banana-2](https://docs.kie.ai/market/google/nanobanana2) |
| Nano Banana Pro | [pro / nano-banana-pro](https://docs.kie.ai/market/google/pro-image-to-image) |
| Nano Banana | [nano-banana](https://docs.kie.ai/market/google/nano-banana) |
| Seedream 4.5 text-to-image | [4-5-text-to-image](https://docs.kie.ai/market/seedream/4-5-text-to-image) |
| Seedream 5 Lite **no** input image | [5-lite-text-to-image](https://docs.kie.ai/market/seedream/5-lite-text-to-image) |
| Seedream 5 Lite **with** input image | [5-lite-image-to-image](https://docs.kie.ai/market/seedream-5-lite-image-to-image) |

**Credits:** `IMAGE_MODEL` and related helpers in `src/lib/pricing.ts`; image picker routing in `src/lib/studioImageModels.ts` (and API routes under `src/app/api/studio/`).

**Studio picker hints:** `src/lib/studioImagePickerCapabilities.ts` (aspect / resolution row text per model).

---

## Video — KIE Market

**Task status (all Market jobs):** [Get task details / `recordInfo`](https://docs.kie.ai/market/common/get-task-detail) — JSON envelope uses **`code`** + **`msg`** (not `message`). Terminal codes (e.g. **422** `recordInfo is null`, **501** generation failed, **500** server error) must surface to the client; implementation: `kieMarketRecordInfo` in `src/lib/kieMarket.ts`, proxied by `GET /api/kling/status`.

| Model / flow | Docs |
| ------------ | ---- |
| Kling 2.6 text-to-video | [text-to-video](https://docs.kie.ai/market/kling/text-to-video) |
| Kling 2.6 image-to-video | [image-to-video](https://docs.kie.ai/market/kling/image-to-video) |
| Kling 3.0 | [kling-3-0](https://docs.kie.ai/market/kling/kling-3-0) — single-shot supports **first + last** frames via `image_urls` (length 1–2) plus optional **`kling_elements`** (`@element_name` in the prompt, 2–4 URLs per element, max 3 elements). |
| Sora 2 text-to-video | [sora-2-text-to-video](https://docs.kie.ai/market/sora2/sora-2-text-to-video) |
| Sora 2 image-to-video | [sora-2-image-to-video](https://docs.kie.ai/market/sora2/sora-2-image-to-video) |
| Sora 2 Pro text-to-video | [sora-2-pro-text-to-video](https://docs.kie.ai/market/sora2/sora-2-pro-text-to-video) |
| Sora 2 Pro image-to-video | [sora-2-pro-image-to-video](https://docs.kie.ai/market/sora2/sora-2-pro-image-to-video) |
| Veo 3.1 (`veo3` Quality, `veo3_fast` Fast, `veo3_lite` Lite — same credits for text- and image-to-video per tier) | [generate-veo-3-video](https://docs.kie.ai/veo3-api/generate-veo-3-video) |

**Implementation:** `src/app/api/kie/veo/generate/route.ts`, `src/lib/kie.ts` (Veo payload), `src/lib/pricing.ts` (`VEO_3_1_*`, `calculateVeo31Credits`). Kling Market: `src/app/api/kling/generate/route.ts`, `src/lib/kieMarket.ts`, `kieVideoModelResolver.ts`.

**Studio UI (duration / aspect / quality per picker):** `src/lib/studioVideoModelCapabilities.ts` — keep in sync with `validateStudioVideoJobDuration` and the generate route.

---

## Video — Seedance (PiAPI)

Studio ids: `bytedance/seedance-2` (Pro), `bytedance/seedance-2-fast` (Fast), `bytedance/seedance-2-preview`, `bytedance/seedance-2-fast-preview`.

| Topic | Link |
| ----- | ---- |
| Seedance 2 API | [seedance-2](https://piapi.ai/docs/seedance-api/seedance-2) |
| Seedance 2 Preview API | [seedance-2-preview](https://piapi.ai/docs/seedance-api/seedance-2-preview) |
| Model comparison (pricing $/s, duration, modes) | [model-comparison](https://piapi.ai/docs/seedance-api/model-comparison) |

**Reference images in prompts (PiAPI):** `@image1`, `@image2`, … match the **order** of `image_urls` (1-based). Seedance 2 Pro supports **`first_last_frames`** (1–2 images) and **`omni_reference`** (up to **12** images + optional short video/audio per docs). Preview supports up to **9** `image_urls`. The app mirrors frames to Supabase then sends public URLs (`mirrorImageUrlForPiapiSeedance`).

**Studio “Elements” for Seedance:** The same element library allows **1–4** URLs per element (PiAPI); **Kling 3.0** still requires **2–4** per element (KIE). URLs are flattened after the start frame and before the optional end frame; the Seedance request uses `omni_reference` when elements are present (or when there are more than two unique images). If the prompt omits `@imageN`, `ensureSeedancePromptImageTags` in `piapiSeedance.ts` prepends tags.

**Short copy for UI:** Preview models are the older preview pipeline; **Seedance 2** / **Seedance 2 Fast** use the current `seedance-2` / `seedance-2-fast` task types (higher quality vs lower cost — see comparison table).

**Implementation:** `src/lib/piapiSeedance.ts` (`SEEDANCE_PRO_MAX_IMAGE_URLS`, `SEEDANCE_PREVIEW_MAX_IMAGE_URLS`, `ensureSeedancePromptImageTags`), `src/app/api/kling/generate/route.ts` (PiAPI branch).

---

## Upscale (KIE Market)

| Product | Docs |
| ------- | ---- |
| Topaz image | [image-upscale](https://docs.kie.ai/market/topaz/image-upscale) |
| Topaz video | [video-upscale](https://docs.kie.ai/market/topaz/video-upscale) |

**Credits:** `TOPAZ_IMAGE_UPSCALER`, `TOPAZ_VIDEO_UPSCALER` in `src/lib/pricing.ts`.

---

## Environment variables (typical)

- **KIE:** `KIE_API_KEY` (or legacy `VEO3_API_KEY` — see `src/lib/kie.ts`).
- **PiAPI (Seedance):** `PIAPI_API_KEY`.
- **WaveSpeed (translate):** `WAVESPEED_API_KEY` (if used by your translate integration).

# Provider model → official API docs

Single index of **official documentation URLs** and where **in-app credits / USD** are defined. Update provider prices there first, then align `src/lib/pricing.ts` (and any fixed tiers).

## Credits and cost (where to edit)

- **Primary:** `src/lib/pricing.ts` — image/video tiers, Kling per-second curves, Sora/Veo fixed tiers, Topaz, WaveSpeed translate rule, Seedance video heuristics.
- **Public snapshot:** `GET /api/pricing` — `src/app/api/pricing/route.ts`.
- **Studio billing call sites:** `calculateVideoCreditsForModel`, `calculateImageCredits*`, etc. from `pricing.ts`.

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

**Credits:** `MOTION_CONTROL_CREDITS_PER_SECOND` and `calculateMotionControlCreditsFromDuration` in `src/lib/pricing.ts`.

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

---

## Video — KIE Market

| Model / flow | Docs |
| ------------ | ---- |
| Kling 2.6 text-to-video | [text-to-video](https://docs.kie.ai/market/kling/text-to-video) |
| Kling 2.6 image-to-video | [image-to-video](https://docs.kie.ai/market/kling/image-to-video) |
| Kling 3.0 | [kling-3-0](https://docs.kie.ai/market/kling/kling-3-0) |
| Sora 2 text-to-video | [sora-2-text-to-video](https://docs.kie.ai/market/sora2/sora-2-text-to-video) |
| Sora 2 image-to-video | [sora-2-image-to-video](https://docs.kie.ai/market/sora2/sora-2-image-to-video) |
| Sora 2 Pro text-to-video | [sora-2-pro-text-to-video](https://docs.kie.ai/market/sora2/sora-2-pro-text-to-video) |
| Sora 2 Pro image-to-video | [sora-2-pro-image-to-video](https://docs.kie.ai/market/sora2/sora-2-pro-image-to-video) |
| Veo 3.1 (quality only in product) | [generate-veo-3-video](https://docs.kie.ai/veo3-api/generate-veo-3-video) |

**Implementation:** `src/app/api/kling/generate/route.ts`, `src/lib/kie.ts` (Veo), `kieVideoModelResolver.ts`.

---

## Video — Seedance (PiAPI)

Studio ids: `bytedance/seedance-2` (Pro), `bytedance/seedance-2-fast` (Fast), `bytedance/seedance-2-preview`, `bytedance/seedance-2-fast-preview`.

| Topic | Link |
| ----- | ---- |
| Seedance 2 API | [seedance-2](https://piapi.ai/docs/seedance-api/seedance-2) |
| Seedance 2 Preview API | [seedance-2-preview](https://piapi.ai/docs/seedance-api/seedance-2-preview) |
| Model comparison (pricing $/s, duration, modes) | [model-comparison](https://piapi.ai/docs/seedance-api/model-comparison) |

**Short copy for UI:** Preview models are the older preview pipeline; **Seedance 2** / **Seedance 2 Fast** use the current `seedance-2` / `seedance-2-fast` task types (higher quality vs lower cost — see comparison table).

**Implementation:** `src/lib/piapiSeedance.ts`, `src/app/api/kling/generate/route.ts` (PiAPI branch).

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

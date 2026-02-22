# Architecture (MVP) — UGC Automation

This project is a small **Next.js App Router** app that:

- provides a UI to enter a prompt + upload a product image
- uploads the product image to a local `public/uploads/` folder (MVP)
- calls **NanoBanana** to generate/edit an image
- calls **KIE** to generate a short UGC video from the generated image (Veo 3.1 + Market models like Kling 3.0)
- polls task status (and also accepts callbacks)

## Folder structure

```
ugc-automation/
  src/
    app/
      api/
        nanobanana/
          callback/route.ts   # receives NanoBanana POST callbacks (fast, idempotent)
          generate/route.ts   # server-side call to /generate (returns taskId)
          task/route.ts       # server-side call to /record-info (returns status/result)
        kling/
          generate/route.ts   # server-side call to KIE Market createTask (Kling 3.0)
          status/route.ts     # server-side call to KIE Market recordInfo
        uploads/route.ts      # accepts multipart upload -> public URL
      page.tsx                # UI (prompt + language + upload + results)
      layout.tsx              # global layout + Toaster
    lib/
      env.ts                  # typed env helpers
      nanobanana.ts           # NanoBanana client helpers (server-only)
      kling3.ts               # legacy Kling3 client helpers (server-only, unused in KIE flow)
      kieMarket.ts            # KIE Market client helpers (server-only)
      storage.ts              # simple file-based persistence for callbacks
```

## Runtime / data flow

1. UI uploads the product image to `POST /api/uploads` (stores it under `public/uploads/`)
2. UI calls `POST /api/nanobanana/generate` with `{ prompt, imageUrl? }`
3. Server calls NanoBanana `POST /api/v1/nanobanana/generate` with `callBackUrl`
4. UI polls `GET /api/nanobanana/task?taskId=...` until `successFlag` becomes `1`
5. When NanoBanana calls back, `POST /api/nanobanana/callback` stores the payload on disk
6. UI calls `POST /api/kling/generate` (backed by KIE Market) and polls `GET /api/kling/status?taskId=...` for a video URL

## Notes (important)

- `NANOBANANA_API_KEY` is **server-only**. Do not put it in any `NEXT_PUBLIC_*` variable.
- `KIE_API_KEY` is **server-only**. Do not put it in any `NEXT_PUBLIC_*` variable.
- For **image editing** (`IMAGETOIAMGE`), NanoBanana needs to fetch your `imageUrl` from the public internet.
  - Local dev requires a public tunnel (ex: ngrok) and setting `APP_URL` accordingly.


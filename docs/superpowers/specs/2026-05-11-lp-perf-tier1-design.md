# Landing page performance — Tier 1

## Problem

Lighthouse run against `https://www.youry.io/` reports:

| Metric | Value | Target |
|---|---|---|
| FCP | 0.5 s | < 1.8 s ✓ |
| LCP | 0.7 s | < 2.5 s ✓ |
| **TBT** | **1,880 ms** | < 200 ms ✗ |
| CLS | 0 | < 0.1 ✓ |
| Speed Index | 3.4 s | < 3.4 s ~ |
| **Network payload** | **16.8 MB** | — ✗ |

The LP is already well-architected for static delivery (`force-static`, revalidate 1 h, code-split `AppProviders`, lazy 3rd-party scripts via `loadOnFirstInteraction`). What's left:

- **13.5 MB** comes from 10 hero carousel clips in `/public/studio/0328(1..10).mp4`. They mount with `preload="metadata" autoPlay`, so all 10 moov atoms fetch in parallel and 10 GPU decoders spin up at once.
- 156 KiB unused JS in two chunks (`8046ad91…`, `aab00883…`) — likely a build artefact from a previous run; revisit after this lands.
- 15 KiB legacy polyfills — same as above.
- Hero "step" image served at 640×358 for a 303×172 display box (18 KiB wasted).
- `cdn.heyo.so` + `scripts.clarity.ms` only have no DNS resolution hint, costing ~200 ms when the chat/replay scripts fire on first interaction.

## Tier 1 design

### A — Re-encode + posterise the 10 hero clips

[`tools/optimize-studio-videos.mjs`](../../../tools/optimize-studio-videos.mjs) wraps `ffmpeg`. For each clip in `public/studio/`:

1. `libx264 -preset slow -crf 30 -vf scale=-2:480 -an -movflags +faststart` → in-place replace. CRF 30 + dropping the silent audio track + 480p (matches source height) reliably hits 15-25 % of original size at this content type (24 fps, single-subject vertical clip). Output ~250-400 KB per clip.
2. `ffmpeg -ss 0.5 -vframes 1 -vf scale=320:-1 -q:v 6` → JPEG poster into `public/studio/posters/<name>.jpg` (~15-25 KB each).

Result observed on this repo:

```
videos:  15,655 KB → 2,502 KB (16 %)
posters: 166 KB
net:     -12,987 KB
```

Script is idempotent — re-running it re-encodes from the already-shrunk file, so the user (or CI) only needs to run it after adding/replacing source assets.

### B — Rotation-aware video mounting in `HeroVideoCarousel3D`

[`src/app/HeroVideoCarousel3D.tsx`](../../../src/app/HeroVideoCarousel3D.tsx) is rewritten so that:

- Every `<video>` ships `poster={posterUrl}` and `preload="none"`. No HTML `autoPlay` attribute.
- A 250 ms `setInterval` re-evaluates which panels are within ±100° of front (derived from `Date.now()` against the 36 s CSS animation period — no need to read computed styles every tick).
- Front panels get `preload="metadata"` + `play()`. Back panels get `pause()` and keep their poster.
- `prefers-reduced-motion` keeps the ring frozen (CSS) and the JS picks panels statically front of the frozen pose so the user still sees motion in the front clips even with the ring still.
- IntersectionObserver kills the loop when the ring scrolls off screen and re-arms it on re-entry.
- `visibilitychange` pauses everything when the tab is hidden.

Concurrency budget: at most ~5-6 videos can be in the "front" window at any time. Each panel will eventually warm up after one revolution (36 s), but only one at a time crosses the threshold so the browser's HTTP/2 queue is never saturated.

### C — Preconnect hints

`<link rel="dns-prefetch" href="https://cdn.heyo.so" />` and `<link rel="dns-prefetch" href="https://scripts.clarity.ms" />` added to [`src/app/layout.tsx`](../../../src/app/layout.tsx). Both scripts load on first interaction (12-15 s post-load); dns-prefetch keeps the cost off the critical path while still warming the resolver.

### D — Step image `sizes` tightening

[`src/app/page.tsx`](../../../src/app/page.tsx) Step images now use `sizes="(max-width: 768px) 88vw, (max-width: 1280px) 32vw, 360px"` instead of `(max-width: 768px) 90vw, 360px`. The intermediate 32vw breakpoint matches the actual 3-column desktop layout, so Next.js's image optimizer picks a smaller variant (≈384 px instead of 640 px) on typical 1280-1440 px screens. ~18 KiB savings on the flagged image; nothing visual changes.

## Out of scope (deferred)

- The 156 KiB unused JS / 15 KiB polyfill findings need a fresh Lighthouse run against this build to confirm they still appear. `browserslist` in `package.json` already targets Chrome 97+ / Safari 15.4+, which doesn't need polyfills for `Array.at`, `Object.fromEntries`, etc. If a re-audit still flags them, look for a dep that imports `core-js` or `regenerator-runtime` directly.
- Heyo's avatar PNG ships with no Cache-Control header (`heyo.so/embed/.../avatar`). Fix is upstream — either get Heyo support to add a TTL, or proxy it through `/api/media` (which already caches aggressively for 1 day + 7 day SWR).
- AVIF for the carousel ring background — currently a single Next.js-optimised PNG; already serves WebP/AVIF via `next/image`.

## Validation

After this lands:

| Metric | Expected change |
|---|---|
| LP transferred bytes (cold) | -12 to -13 MB |
| Hero video concurrent decoders | 10 → ~5 |
| TBT (Lighthouse mobile) | -500 to -1000 ms |
| LCP | unchanged or slightly better |
| First-interaction time for Heyo chat | -200 ms |

Manual checks:

1. Open `/` in Chrome DevTools → Network → throttle Slow 3G. Hard reload. Confirm < 3 MB transfers in the first 5 s and `/studio/posters/*.jpg` are visible immediately on the ring.
2. Scroll the ring out of viewport; check Network panel — no video bytes streaming.
3. Open in macOS Safari 15.4 (or use BrowserStack) — confirm ring spins and at least the front panels play.
4. Toggle "Reduce motion" in OS preferences — ring freezes, only front-facing clips play.
5. Re-run Lighthouse mobile against the deployed LP — expect TBT to drop to roughly 700-900 ms and payload to land near 3 MB.

## Files touched

- New: `tools/optimize-studio-videos.mjs`, `public/studio/posters/*.jpg` (10 posters).
- Replaced in place: 10 × `public/studio/0328(N).mp4`.
- Code: `src/app/HeroVideoCarousel3D.tsx`, `src/app/layout.tsx`, `src/app/page.tsx`.

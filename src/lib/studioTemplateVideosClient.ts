"use client";

import type { StudioTemplateVideoItem } from "@/lib/studioTemplateVideosTypes";

let cached: StudioTemplateVideoItem[] | null = null;
let inflight: Promise<StudioTemplateVideoItem[]> | null = null;

/** Fire-and-forget: start the template manifest fetch (deduped). */
export function warmStudioTemplateVideosFetch(): void {
  void getStudioTemplateVideosCached();
}

/**
 * Cached, deduped fetch of `/api/studio/template-videos` so Ads Studio and nav prefetch
 * share one network round-trip.
 */
export function getStudioTemplateVideosCached(): Promise<StudioTemplateVideoItem[]> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = fetch("/api/studio/template-videos?kind=product", { priority: "high" })
    .then((res) => res.json().catch(() => null))
    .then((json: { videos?: StudioTemplateVideoItem[] } | null) => {
      const videos = Array.isArray(json?.videos) ? json.videos : [];
      cached = videos;
      inflight = null;
      return videos;
    })
    .catch(() => {
      inflight = null;
      return [];
    });
  return inflight;
}

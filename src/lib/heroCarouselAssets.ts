/** Bump when replacing hero carousel files under `public/studio/hero-carousel/`. */
export const HERO_CAROUSEL_ASSET_VERSION = "20260525";

/**
 * Fixed order: alternating new UGC (0520) and legacy clips (0328), 10 unique files.
 * Files live in `public/studio/hero-carousel/01.mp4` … `10.mp4` (no duplicate hashes).
 */
const HERO_CAROUSEL_SLOTS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"] as const;

const HERO_STUDIO_VIDEO_PATHS = HERO_CAROUSEL_SLOTS.map(
  (slot) => `/studio/hero-carousel/${slot}.mp4`,
) as readonly string[];

export function heroCarouselVideoUrl(path: string): string {
  const base = path.split("?")[0] ?? path;
  return `${base}?v=${HERO_CAROUSEL_ASSET_VERSION}`;
}

export const HERO_STUDIO_VIDEOS: readonly string[] = HERO_STUDIO_VIDEO_PATHS.map(heroCarouselVideoUrl);

export function heroCarouselPosterUrl(videoSrc: string): string | undefined {
  const match = videoSrc.match(/^(.*\/)([^/?]+)\.mp4/i);
  if (!match) return undefined;
  const [, dir, base] = match;
  return `${dir}posters/${base}.jpg?v=${HERO_CAROUSEL_ASSET_VERSION}`;
}

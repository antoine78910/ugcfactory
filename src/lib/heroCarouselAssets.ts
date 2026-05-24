/** Bump when replacing `public/studio/0328(*).mp4` or posters so browsers skip stale immutable cache. */
export const HERO_CAROUSEL_ASSET_VERSION = "20260524";

const HERO_STUDIO_VIDEO_PATHS = [
  "/studio/0328(1).mp4",
  "/studio/0328(2).mp4",
  "/studio/0328(3).mp4",
  "/studio/0328(4).mp4",
  "/studio/0328(5).mp4",
  "/studio/0328(6).mp4",
  "/studio/0328(7).mp4",
  "/studio/0328(8).mp4",
  "/studio/0328(9).mp4",
  "/studio/0328(10).mp4",
] as const;

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

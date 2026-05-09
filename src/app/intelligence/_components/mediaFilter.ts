import type { TTAd } from "@/lib/intelligenceProvider";

export type MediaFilter = "videos" | "all" | "images";

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|avi|mkv|m3u8)(?:$|[?#])/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|avif|svg)(?:$|[?#])/i;

function normalizeUrl(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasVideoMedia(ad: TTAd): boolean {
  const videoUrl = normalizeUrl(ad.videoUrl);
  if (videoUrl.length > 0) return true;

  const previewUrl = normalizeUrl(ad.previewUrl);
  return previewUrl.length > 0 && VIDEO_EXT_RE.test(previewUrl);
}

function hasImageMedia(ad: TTAd): boolean {
  const thumbnailUrl = normalizeUrl(ad.thumbnailUrl);
  const imageUrl = normalizeUrl(ad.imageUrl);
  const previewUrl = normalizeUrl(ad.previewUrl);

  if (thumbnailUrl.length > 0 || imageUrl.length > 0) return true;
  return previewUrl.length > 0 && IMAGE_EXT_RE.test(previewUrl);
}

export function filterAdsByMedia(rows: TTAd[], mediaFilter: MediaFilter): TTAd[] {
  return rows.filter((ad) => {
    const hasVideo = hasVideoMedia(ad);
    const hasImage = hasImageMedia(ad);

    if (mediaFilter === "videos") return hasVideo;
    if (mediaFilter === "images") return hasImage && !hasVideo;
    return true;
  });
}

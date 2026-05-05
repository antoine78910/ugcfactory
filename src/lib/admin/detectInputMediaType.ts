export type InputMediaType = "image" | "video" | "audio" | "url";

const IMG_EXT = /\.(png|jpe?g|webp|gif|avif|heic|heif)(?:\?|$)/i;
const VID_EXT = /\.(mp4|webm|mov|m4v|mkv)(?:\?|$)/i;
const AUD_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)(?:\?|$)/i;

/**
 * Best-effort URL-based classification of generation inputs (image, video, audio,
 * or generic url like a product page). Used in /admin to render the right preview.
 */
export function detectInputMediaType(url: string): InputMediaType {
  const u = url.trim();
  if (!u) return "url";
  if (IMG_EXT.test(u)) return "image";
  if (VID_EXT.test(u)) return "video";
  if (AUD_EXT.test(u)) return "audio";
  if (/\/audio\//i.test(u)) return "audio";
  if (/\/video\//i.test(u)) return "video";
  if (/\/image\//i.test(u) || /\/photo\//i.test(u)) return "image";
  return "url";
}

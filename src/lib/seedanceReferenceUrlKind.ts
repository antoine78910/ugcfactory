/**
 * Classify public HTTPS URLs (e.g. Supabase storage) for Seedance reference ordering:
 * PiAPI expects separate `image_urls`, `video_urls`, and `audio_urls` arrays.
 */
export function inferSeedanceReferenceKindFromUrl(raw: string): "image" | "video" | "audio" {
  const s = String(raw ?? "").trim();
  if (!s) return "image";
  let pathname = "";
  try {
    const href = s.startsWith("//") ? `https:${s}` : s;
    pathname = new URL(href).pathname.toLowerCase();
  } catch {
    pathname = (s.split("?")[0] ?? s).toLowerCase();
  }
  if (/\.(mp4|mov|webm|m4v)(\b|$)/i.test(pathname)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\b|$)/i.test(pathname)) return "audio";
  return "image";
}

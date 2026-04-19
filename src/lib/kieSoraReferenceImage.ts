/**
 * KIE Sora image-to-video requires a publicly reachable image URL (see
 * https://docs.kie.ai/market/sora2/sora-2-pro-image-to-video ).
 * Blob / data URLs must not flip the request to image-to-video, use text-to-video instead.
 */
export function isKieServableReferenceImageUrl(raw: string | null | undefined): boolean {
  const u = String(raw ?? "").trim();
  if (!u) return false;
  if (/^(blob:|data:|file:)/i.test(u)) return false;
  try {
    const href = u.startsWith("//") ? `https:${u}` : u;
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

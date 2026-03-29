/**
 * Use same-origin `/api/media` for remote http(s) assets so <video>/<img> can load
 * providers that block hotlinking or require Range requests (fixes black video previews).
 */
export function proxiedMediaSrc(url: string | null | undefined): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("blob:") || u.startsWith("data:")) return u;
  if (u.startsWith("/api/media")) return u;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return u;
    return `/api/media?url=${encodeURIComponent(u)}`;
  } catch {
    return u;
  }
}

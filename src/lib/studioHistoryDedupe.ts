import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";

function isProbablyVideoUrl(url: string | undefined): boolean {
  const u = (url || "").trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith("blob:")) return true;
  return (
    u.includes(".mp4") ||
    u.includes(".mov") ||
    u.includes(".webm") ||
    u.includes("video/mp4") ||
    u.includes("video/quicktime") ||
    u.includes("video/webm")
  );
}

function normalizeImageUrlKey(url: string): string {
  const t = url.trim();
  if (!t) return "";
  try {
    const u = new URL(t);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return t.split("?")[0].split("#")[0];
  }
}

/**
 * Keep a single history card per distinct image URL (newest `createdAt` wins).
 * Videos, non-ready rows, and rows without `mediaUrl` are left as-is.
 */
export function dedupeStudioImageHistoryByMediaUrl(items: StudioHistoryItem[]): StudioHistoryItem[] {
  const bestByKey = new Map<string, StudioHistoryItem>();
  for (const item of items) {
    if (item.kind !== "image" || item.status !== "ready") continue;
    const raw = item.mediaUrl?.trim();
    if (!raw || isProbablyVideoUrl(raw)) continue;
    const key = normalizeImageUrlKey(raw);
    if (!key) continue;
    const prev = bestByKey.get(key);
    if (!prev || item.createdAt > prev.createdAt) bestByKey.set(key, item);
  }
  return items.filter((item) => {
    if (item.kind !== "image" || item.status !== "ready") return true;
    const raw = item.mediaUrl?.trim();
    if (!raw || isProbablyVideoUrl(raw)) return true;
    const key = normalizeImageUrlKey(raw);
    if (!key) return true;
    return bestByKey.get(key)?.id === item.id;
  });
}

"use client";

type AvatarLikeItem = {
  kind?: string;
  status?: string;
  mediaUrl?: string;
  createdAt?: number;
};

const LS_AVATAR_HISTORY = "ugc_studio_avatar_history_v1";

function pickLatestAvatarUrl(items: AvatarLikeItem[]): string | null {
  let bestUrl: string | null = null;
  let bestTs = -1;
  for (const it of items) {
    if (it?.kind !== "image" || it?.status !== "ready") continue;
    const url = typeof it.mediaUrl === "string" ? it.mediaUrl.trim() : "";
    if (!url) continue;
    const ts = typeof it.createdAt === "number" ? it.createdAt : 0;
    if (ts >= bestTs) {
      bestTs = ts;
      bestUrl = url;
    }
  }
  return bestUrl;
}

export function readLatestAvatarUrlFromLocal(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_AVATAR_HISTORY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return pickLatestAvatarUrl(parsed as AvatarLikeItem[]);
  } catch {
    return null;
  }
}

export async function loadLatestAvatarUrl(): Promise<string | null> {
  try {
    const res = await fetch("/api/studio/generations?kind=avatar", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { data?: AvatarLikeItem[] };
      const data = Array.isArray(json.data) ? json.data : [];
      const fromServer = pickLatestAvatarUrl(data);
      if (fromServer) return fromServer;
    }
  } catch {
    // Fall back to local avatar history.
  }
  return readLatestAvatarUrlFromLocal();
}

function pickAvatarUrlsNewestFirst(items: AvatarLikeItem[]): string[] {
  const rows = items
    .filter((it) => it?.kind === "image" && it?.status === "ready" && typeof it.mediaUrl === "string")
    .map((it) => ({
      url: String(it.mediaUrl).trim(),
      ts: typeof it.createdAt === "number" ? it.createdAt : 0,
    }))
    .filter((x) => x.url.length > 0)
    .sort((a, b) => b.ts - a.ts);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r.url);
  }
  return out;
}

export function readAvatarUrlsFromLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_AVATAR_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return pickAvatarUrlsNewestFirst(parsed as AvatarLikeItem[]);
  } catch {
    return [];
  }
}

export async function loadAvatarUrls(): Promise<string[]> {
  try {
    const res = await fetch("/api/studio/generations?kind=avatar", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { data?: AvatarLikeItem[] };
      const data = Array.isArray(json.data) ? json.data : [];
      const urls = pickAvatarUrlsNewestFirst(data);
      if (urls.length > 0) return urls;
    }
  } catch {
    // Fall back to local avatar history.
  }
  return readAvatarUrlsFromLocal();
}


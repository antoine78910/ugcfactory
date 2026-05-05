import type { StudioHistoryItem } from "@/app/_components/StudioGenerationsHistory";

/**
 * Merge server `studio_generations` rows (as history items) with optimistic / local-only rows.
 * Matches Create → Video behavior: keep “ready” items with a URL for 24h if the server list
 * does not yet include the same media URL (DB/register lag), and hide duplicate stuck “generating”
 * server rows when the client already has a ready copy for the same row id.
 */
export function mergeStudioHistoryWithServer(
  serverItems: StudioHistoryItem[],
  prev: StudioHistoryItem[],
): StudioHistoryItem[] {
  const shieldedServerIds = new Set(
    prev
      .filter((i) => i.status === "ready" && i.mediaUrl?.trim() && i.studioGenerationId)
      .map((i) => String(i.studioGenerationId).trim())
      .filter(Boolean),
  );
  const serverFiltered = serverItems.filter((s) => {
    /**
     * Only hide a server row when the client already shows “ready” **and** the server copy is still a
     * stale “generating” shell for the same row. Dropping every server row whose id matched used to
     * fight the poll/GET merge and made Translate / Motion history flicker (videos vanish/reappear).
     */
    if (shieldedServerIds.has(s.id)) {
      const serverStaleGenerating = s.status === "generating" && !s.mediaUrl?.trim();
      if (serverStaleGenerating) return false;
    }
    const stuckGenerating = s.status === "generating" && !s.mediaUrl?.trim();
    if (
      stuckGenerating &&
      prev.some(
        (p) =>
          p.status === "ready" &&
          Boolean(p.mediaUrl?.trim()) &&
          (p.label || "").trim() === (s.label || "").trim() &&
          Math.abs(p.createdAt - s.createdAt) < 30 * 60 * 1000,
      )
    ) {
      return false;
    }
    return true;
  });

  const serverFilteredWithAspect = serverFiltered.map((s) => {
    if (s.aspectRatio?.trim()) return s;
    const fromPrev = prev.find((p) => p.id === s.id && p.aspectRatio?.trim());
    return fromPrev ? { ...s, aspectRatio: fromPrev.aspectRatio } : s;
  });

  const serverIds = new Set(serverFilteredWithAspect.map((i) => i.id));
  const serverTaskIds = new Set(
    serverFilteredWithAspect
      .map((i) => (i.externalTaskId ?? "").trim())
      .filter((x): x is string => Boolean(x)),
  );
  const serverMediaUrls = new Set(
    serverFilteredWithAspect.flatMap((i) => (i.mediaUrl?.trim() ? [i.mediaUrl.trim()] : [])),
  );
  const now = Date.now();
  /** Local-only optimistic rows (no provider task / DB row yet). */
  const KEEP_EPHEMERAL_MS = 5 * 60 * 1000;
  /**
   * PiAPI Seedance / KIE Market video jobs often exceed 5 minutes; dropping the optimistic row
   * before the server list includes the same `studio_generations` id made the card vanish while the
   * provider was still processing (see merge with `studioGenerationId` / `externalTaskId`).
   */
  const KEEP_REGISTERED_GENERATING_MS = 60 * 60 * 1000;
  const KEEP_READY_MS = 24 * 60 * 60 * 1000;
  const kept = prev.filter((i) => {
    if (serverIds.has(i.id)) return false;
    const sg = i.studioGenerationId?.trim();
    if (sg && serverIds.has(sg)) {
      return false;
    }
    const et = i.externalTaskId?.trim();
    if (et && serverTaskIds.has(et)) {
      return false;
    }
    if (
      i.status === "ready" &&
      i.mediaUrl?.trim() &&
      !serverMediaUrls.has(i.mediaUrl.trim()) &&
      now - i.createdAt < KEEP_READY_MS
    ) {
      return true;
    }
    if (i.status === "failed") {
      return now - i.createdAt < KEEP_EPHEMERAL_MS;
    }
    if (i.status === "generating") {
      const linked =
        Boolean(sg) ||
        Boolean(i.externalTaskId?.trim());
      const maxAge = linked ? KEEP_REGISTERED_GENERATING_MS : KEEP_EPHEMERAL_MS;
      return now - i.createdAt < maxAge;
    }
    return false;
  });
  if (!kept.length) return serverFilteredWithAspect;
  return [...kept, ...serverFilteredWithAspect].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Merge a server first-page response (newest N items) with `prev` while preserving older
 * paginated items that the user already scrolled into via "Load more". Items in `prev` whose
 * `createdAt` is older than the oldest item in `serverItems` are kept verbatim — the server
 * page can't reach them anyway. Newer items go through `mergeStudioHistoryWithServer` so all
 * existing optimistic / dedupe logic still applies.
 */
export function mergeStudioHistoryFirstPageWithLocal(
  serverItems: StudioHistoryItem[],
  prev: StudioHistoryItem[],
): StudioHistoryItem[] {
  if (serverItems.length === 0) {
    // Server returned nothing for this page; keep prev untouched. (Optimistic items expire on
    // their own through normal merges when a real first page arrives.)
    return prev;
  }
  let oldestServer = serverItems[0]!.createdAt;
  for (const s of serverItems) {
    if (s.createdAt < oldestServer) oldestServer = s.createdAt;
  }
  const olderTail = prev.filter((p) => p.createdAt < oldestServer);
  const recentPrev = prev.filter((p) => p.createdAt >= oldestServer);
  const mergedRecent = mergeStudioHistoryWithServer(serverItems, recentPrev);
  if (olderTail.length === 0) return mergedRecent;
  // Filter older items that have somehow appeared in the merged set (shouldn't happen, but
  // dedupe by id to be safe).
  const recentIds = new Set(mergedRecent.map((i) => i.id));
  const olderClean = olderTail.filter((i) => !recentIds.has(i.id));
  return [...mergedRecent, ...olderClean].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Append the next page (older items, fetched via `?before=…`) to the existing list.
 * De-duplicates by id (server may include the cursor row depending on inclusive/exclusive query).
 */
export function appendStudioHistoryNextPage(
  prev: StudioHistoryItem[],
  nextPage: StudioHistoryItem[],
): StudioHistoryItem[] {
  if (nextPage.length === 0) return prev;
  const seen = new Set(prev.map((i) => i.id));
  const additions = nextPage.filter((i) => !seen.has(i.id));
  if (additions.length === 0) return prev;
  return [...prev, ...additions].sort((a, b) => b.createdAt - a.createdAt);
}

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

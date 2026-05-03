import {
  linkToAdProductPhotoPickerUrls,
  normalizePipelineByAngle,
  readUniverseFromExtracted,
} from "@/lib/linkToAdUniverse";

/** Cap runs scanned for Ads Studio / Video pickers — keeps first paint fast. */
export const LTA_RUNS_REF_PICKER_SLICE = 60;

export type ElementRefPickLtaMedia = { url: string; kind: "image" | "video"; posterUrl?: string };

export type ElementRefPickLtaGroup = {
  id: string;
  createdAt: number;
  generatedMedia: ElementRefPickLtaMedia[];
  productMedia: ElementRefPickLtaMedia[];
};

export type LtaRunsListJson = { data?: { id?: string; created_at?: string; extracted?: unknown }[] };

/**
 * Build Link-to-Ad project groups with product photos + generated media for reference pickers.
 * Shared by Studio Video element picker and Ads Studio ref dialogs.
 */
export function buildLtaGroupsFromRunsListJson(runsJson: LtaRunsListJson): {
  ltaGroups: ElementRefPickLtaGroup[];
  projectsModeByRunId: Record<string, "generated" | "product">;
} {
  const ltaGroups: ElementRefPickLtaGroup[] = [];
  for (const row of (runsJson.data ?? []).slice(0, LTA_RUNS_REF_PICKER_SLICE)) {
    const snap = readUniverseFromExtracted(row.extracted);
    if (!snap) continue;
    const productMedia = linkToAdProductPhotoPickerUrls(snap)
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
      .slice(0, 3)
      .map((url) => ({ url, kind: "image" as const }));
    const generatedMap = new Map<string, ElementRefPickLtaMedia>();
    const addGenerated = (
      u: string | null | undefined,
      kind: "image" | "video",
      videoPosterUrl?: string | null,
    ) => {
      const t = String(u ?? "").trim();
      if (!t) return;
      const key = `${kind}:${t}`;
      if (generatedMap.has(key)) return;
      const poster = videoPosterUrl?.trim();
      generatedMap.set(
        key,
        kind === "video" && poster ? { url: t, kind, posterUrl: poster } : { url: t, kind },
      );
    };
    for (const u of snap.nanoBananaImageUrls ?? []) addGenerated(u, "image");
    addGenerated(snap.nanoBananaImageUrl, "image");
    const triple = normalizePipelineByAngle(snap);
    for (const p of triple) {
      for (const u of p.nanoBananaImageUrls ?? []) addGenerated(u, "image");
      addGenerated(p.nanoBananaImageUrl, "image");
      const slots = p.klingByReferenceIndex ?? [];
      for (let si = 0; si < slots.length; si++) {
        const slot = slots[si];
        const frameUrl =
          (Array.isArray(p.nanoBananaImageUrls) && p.nanoBananaImageUrls[si]?.trim()) ||
          p.nanoBananaImageUrl?.trim() ||
          undefined;
        addGenerated(slot?.videoUrl, "video", frameUrl);
        addGenerated(slot?.videoUrlPart2, "video", frameUrl);
      }
    }
    const selIdx = snap.nanoBananaSelectedImageIndex ?? 0;
    const klingPoster =
      snap.nanoBananaImageUrls?.[selIdx]?.trim() ||
      snap.nanoBananaImageUrl?.trim() ||
      snap.nanoBananaImageUrls?.[0]?.trim() ||
      undefined;
    addGenerated(snap.klingVideoUrl, "video", klingPoster);
    const generatedMedia = [...generatedMap.values()].slice(0, 6);
    if (productMedia.length === 0 && generatedMedia.length === 0) continue;
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
    ltaGroups.push({
      id: row.id || `lta-${createdAt}-${generatedMedia[0]?.url ?? productMedia[0]?.url ?? "run"}`,
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      generatedMedia,
      productMedia,
    });
  }
  ltaGroups.sort((a, b) => b.createdAt - a.createdAt);
  const projectsModeByRunId: Record<string, "generated" | "product"> = {};
  for (const g of ltaGroups) {
    projectsModeByRunId[g.id] = g.generatedMedia.length > 0 ? "generated" : "product";
  }
  return { ltaGroups, projectsModeByRunId };
}

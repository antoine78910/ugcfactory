import {
  STUDIO_IMAGE_TAB_KINDS,
  STUDIO_VIDEO_TAB_KINDS,
} from "@/lib/studioGenerationKinds";
import type { StudioGenerationRow } from "@/lib/studioGenerationsMap";

function kindQueryMatchesTab(requested: string[], tab: readonly string[]): boolean {
  if (requested.length !== tab.length) return false;
  const set = new Set(requested);
  for (const k of tab) {
    if (!set.has(k)) return false;
  }
  return true;
}

export function isStudioImageTabKindQuery(requestedKinds: string[]): boolean {
  return kindQueryMatchesTab(requestedKinds, STUDIO_IMAGE_TAB_KINDS);
}

export function isStudioVideoTabKindQuery(requestedKinds: string[]): boolean {
  if (kindQueryMatchesTab(requestedKinds, STUDIO_VIDEO_TAB_KINDS)) return true;
  return requestedKinds.length === 1 && requestedKinds[0] === "studio_video";
}

const LEGACY_LTA_LABEL_PREFIX = "link to ad";

/**
 * Rows created before dedicated L2A kinds still use `studio_image` / `studio_video` with a "Link to Ad …" label.
 * Hide them from Create → Image / Video tab API responses so Studio history stays clean.
 */
export function filterLegacyLinkToAdFromTabRows(
  rows: StudioGenerationRow[],
  requestedKinds: string[],
): StudioGenerationRow[] {
  const imageTab = isStudioImageTabKindQuery(requestedKinds);
  const videoTab = isStudioVideoTabKindQuery(requestedKinds);
  if (!imageTab && !videoTab) return rows;
  return rows.filter((r) => {
    const lab = (r.label ?? "").trim().toLowerCase();
    if (!lab.startsWith(LEGACY_LTA_LABEL_PREFIX)) return true;
    if (imageTab && r.kind === "studio_image") return false;
    if (videoTab && r.kind === "studio_video") return false;
    return true;
  });
}

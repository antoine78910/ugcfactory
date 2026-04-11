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

/** Legacy translate rows stored as `motion_control` (FR + EN UI labels). */
const LEGACY_TRANSLATE_LABEL_PREFIXES = ["traduction", "translation"] as const;

/**
 * True only for **product** Link to Ad job titles (e.g. `Link to Ad · Angle 1 · image`),
 * not user-written Studio prompts that happen to start with "link to ad …".
 * Matching only `link to ad` + delimiter avoids hiding legitimate Create → Video rows.
 */
function labelLooksLikeLegacyLinkToAdProductEntry(label: string): boolean {
  const lab = label.trim().toLowerCase();
  if (!lab.startsWith("link to ad")) return false;
  const after = lab.slice("link to ad".length).trimStart();
  return after.startsWith("·") || after.startsWith("•");
}

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
  const motionControlTab = requestedKinds.length === 1 && requestedKinds[0] === "motion_control";
  if (!imageTab && !videoTab && !motionControlTab) return rows;
  return rows.filter((r) => {
    const lab = (r.label ?? "").trim().toLowerCase();
    if (imageTab || videoTab) {
      if (labelLooksLikeLegacyLinkToAdProductEntry(r.label ?? "")) {
        if (imageTab && r.kind === "studio_image") return false;
        if (videoTab && r.kind === "studio_video") return false;
      }
    }
    if (motionControlTab && r.kind === "motion_control") {
      // Before `studio_translate_video`, Translate jobs were stored as `motion_control`.
      // Hide those legacy rows in the Motion Control tab.
      const provider = String(r.provider ?? "").toLowerCase();
      if (provider === "wavespeed") return false;
      if (LEGACY_TRANSLATE_LABEL_PREFIXES.some((p) => lab.startsWith(p))) return false;
    }
    return true;
  });
}

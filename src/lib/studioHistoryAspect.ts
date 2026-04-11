/**
 * Maps stored aspect labels (e.g. "9:16", "3:4", "auto") to a CSS `aspect-ratio` value
 * for studio history thumbnails so cards match the format the user picked.
 */

export type StudioHistoryAspectKind = "image" | "video" | "motion" | "audio";

const RATIO_RE = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/;

function parseColonRatio(s: string): string | null {
  const m = s.trim().match(RATIO_RE);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return `${w} / ${h}`;
}

/** CSS aspect-ratio value for history media frame. */
export function studioHistoryAspectRatioCssValue(
  aspectRatio: string | undefined,
  kind: StudioHistoryAspectKind,
): string {
  const raw = (aspectRatio ?? "").trim().toLowerCase();
  if (raw && raw !== "auto") {
    const parsed = parseColonRatio(raw);
    if (parsed) return parsed;
  }
  if (kind === "image") return "3 / 4";
  if (kind === "audio") return "1 / 1";
  return "9 / 16";
}

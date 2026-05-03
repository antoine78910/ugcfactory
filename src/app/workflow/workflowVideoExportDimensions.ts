/**
 * Expected output pixel size for workflow video/motion from resolution preset + aspect ratio.
 * Aligns with PiAPI Seedance `resolution` (short side ≈ 720 or 1080 for 720p / 1080p tiers).
 */
export function workflowVideoExportPixelDimensions(
  resolutionLabel: string,
  aspectRatioStr: string,
): { width: number; height: number } {
  const raw = resolutionLabel.trim().toLowerCase();
  const shortEdge = raw === "1080p" ? 1080 : raw === "720p" ? 720 : 480;

  const parts = aspectRatioStr
    .trim()
    .split(":")
    .map((x) => Number(String(x).trim()));
  const rw = parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) ? parts[0]! : 16;
  const rh = parts.length >= 2 && Number.isFinite(parts[1]) ? parts[1]! : 9;
  const ar = rw / rh;
  if (!Number.isFinite(ar) || ar <= 0 || rh <= 0) {
    return { width: 1920, height: 1080 };
  }

  if (ar >= 1) {
    const height = shortEdge;
    const width = Math.max(1, Math.round((rw / rh) * height));
    return { width, height };
  }

  const width = shortEdge;
  const height = Math.max(1, Math.round((rh / rw) * width));
  return { width, height };
}

/** PiAPI Seedance `input.resolution` enum (default on API is 480p if omitted). */
export type PiapiSeedanceResolutionTier = "480p" | "720p" | "1080p";

export function workflowVideoResolutionToPiapiSeedance(resolutionLabel: string): PiapiSeedanceResolutionTier {
  const t = resolutionLabel.trim().toLowerCase();
  if (t === "1080p") return "1080p";
  if (t === "720p") return "720p";
  return "720p";
}

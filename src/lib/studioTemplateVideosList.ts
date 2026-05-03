import { readdir } from "node:fs/promises";
import path from "node:path";
import type { StudioTemplateVideoItem } from "@/lib/studioTemplateVideosTypes";

function toLabel(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  if (base.trim().toLowerCase() === "ugc") return "UGC Woman";
  return base;
}

/** Lists `public/studio/template` video files (server-only). */
export async function listStudioTemplateVideosFromDisk(): Promise<StudioTemplateVideoItem[]> {
  try {
    const dir = path.join(process.cwd(), "public", "studio", "template");
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && /\.(mp4|webm|mov)$/i.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((name) => ({
        filename: name,
        label: toLabel(name),
        url: `/studio/template/${encodeURIComponent(name)}`,
      }));
  } catch {
    return [];
  }
}

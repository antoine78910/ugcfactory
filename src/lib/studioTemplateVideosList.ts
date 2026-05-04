import { readdir } from "node:fs/promises";
import path from "node:path";
import type { StudioTemplateVideoItem } from "@/lib/studioTemplateVideosTypes";

/** Product ads vs app-style templates — maps to `public/studio/template` and `public/studio/template-app`. */
export type StudioTemplateVideoListKind = "product" | "app";

const TEMPLATE_PUBLIC_SUBDIR: Record<StudioTemplateVideoListKind, string> = {
  product: "template",
  app: "template-app",
};

function toLabel(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  if (base.trim().toLowerCase() === "ugc") return "UGC Woman";
  return base;
}

/** Lists template videos under `public/studio/<subdir>/` (server-only). */
export async function listStudioTemplateVideosFromDisk(
  kind: StudioTemplateVideoListKind = "product",
): Promise<StudioTemplateVideoItem[]> {
  const subdir = TEMPLATE_PUBLIC_SUBDIR[kind] ?? TEMPLATE_PUBLIC_SUBDIR.product;
  try {
    const dir = path.join(process.cwd(), "public", "studio", subdir);
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && /\.(mp4|webm|mov)$/i.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((name) => ({
        filename: name,
        label: toLabel(name),
        url: `/studio/${subdir}/${encodeURIComponent(name)}`,
      }));
  } catch {
    return [];
  }
}

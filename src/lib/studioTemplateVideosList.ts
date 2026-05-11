import { readdir } from "node:fs/promises";
import path from "node:path";
import type { StudioTemplateVideoItem } from "@/lib/studioTemplateVideosTypes";

/**
 * Product ads vs app-style templates.
 * - Product: `public/studio/template`
 * - App: `public/studio/template-app` plus optional `public/studio/app-template-preview` (new app previews)
 * - Clipping-only templates are isolated under `public/studio/template-clipping`
 */
export type StudioTemplateVideoListKind = "product" | "app";

const PRODUCT_TEMPLATE_SUBDIR = "template";
/** Clipping Studio reference videos only — never listed in Ads Studio. */
export const CLIP_TEMPLATE_SUBDIR = "template-clipping";
/** Primary app template videos. */
const APP_TEMPLATE_SUBDIR = "template-app";
/** Extra folder for new app template preview videos (same URL rules as product `template/`). */
const APP_TEMPLATE_PREVIEW_SUBDIR = "app-template-preview";

/** Basenames (no extension) hidden from the App templates grid only. */
const APP_TEMPLATE_LISTING_EXCLUDED_BASE_NAMES = new Set(["0504 (1)(2)"]);

function toLabel(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  if (base.trim().toLowerCase() === "ugc") return "UGC Woman";
  return base;
}

async function listTemplateVideosInPublicStudioSubdir(subdir: string): Promise<StudioTemplateVideoItem[]> {
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

function mergeTemplateItemsByFilename(layers: StudioTemplateVideoItem[][]): StudioTemplateVideoItem[] {
  const byFilename = new Map<string, StudioTemplateVideoItem>();
  for (const layer of layers) {
    for (const item of layer) {
      byFilename.set(item.filename, item);
    }
  }
  return [...byFilename.values()].sort((a, b) =>
    a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function isExcludedFromAppTemplateListing(filename: string): boolean {
  const base = filename.replace(/\.[^.]+$/, "").trim().toLowerCase();
  return APP_TEMPLATE_LISTING_EXCLUDED_BASE_NAMES.has(base);
}

/** Clipping library only: fully isolated from Ads Studio template folders. */
export async function listClippingTemplateVideosFromDisk(): Promise<StudioTemplateVideoItem[]> {
  const dedicated = await listTemplateVideosInPublicStudioSubdir(CLIP_TEMPLATE_SUBDIR);
  return dedicated;
}

/** Lists template preview videos for Ads Studio (server-only). */
export async function listStudioTemplateVideosFromDisk(
  kind: StudioTemplateVideoListKind = "product",
): Promise<StudioTemplateVideoItem[]> {
  if (kind === "product") {
    return listTemplateVideosInPublicStudioSubdir(PRODUCT_TEMPLATE_SUBDIR);
  }
  const appMain = await listTemplateVideosInPublicStudioSubdir(APP_TEMPLATE_SUBDIR);
  const appPreview = await listTemplateVideosInPublicStudioSubdir(APP_TEMPLATE_PREVIEW_SUBDIR);
  return mergeTemplateItemsByFilename([appMain, appPreview]).filter(
    (item) => !isExcludedFromAppTemplateListing(item.filename),
  );
}

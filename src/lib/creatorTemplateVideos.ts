import { readdir } from "node:fs/promises";
import path from "node:path";

import { CREATOR_PRODUCT_TEMPLATES } from "@/lib/creatorProductTemplates";

/** Drop pre-made Link to Ad videos here. Match is by product name, not by id. */
export const CREATOR_TEMPLATE_VIDEO_DIR = path.join(
  process.cwd(),
  "public",
  "link-to-ad",
  "product-videos",
);

const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

/**
 * Extra filenames the product is known by.
 * The display name is always included (so "cat brush.mp4" is listed under Pet comb).
 */
const EXTRA_ALIASES: Record<string, string[]> = {
  pixelplay: ["pixel play"],
  "pet-comb": ["cat brush", "cat comb", "pet brush", "flea comb"],
  "veggie-slicer": ["veggie slicer", "vegetable slicer", "cubehexa"],
  "spoon-scale": ["kitchen spoon scale", "cuillere balance"],
  "bat-lights": ["bat lights", "bat light", "led bat"],
  "christmas-projector": ["christmas ceiling projector", "christmas lamp"],
  "phomemo-t02": ["phomemo", "phomemo t02", "t02 printer"],
};

export function normalizeVideoLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function aliasesFor(templateId: string): string[] {
  const template = CREATOR_PRODUCT_TEMPLATES.find((item) => item.id === templateId);
  const name = template?.name ?? "";
  return [...new Set([name, ...(EXTRA_ALIASES[templateId] ?? [])].map(normalizeVideoLabel).filter(Boolean))];
}

function scoreFilename(filename: string, aliases: string[]): number {
  const label = normalizeVideoLabel(filename);
  if (!label) return 0;
  const fileTokens = label.split(" ").filter(Boolean);
  let best = 0;
  for (const alias of aliases) {
    if (label === alias) {
      best = Math.max(best, 100);
      continue;
    }
    const aliasTokens = alias.split(" ").filter((token) => token.length >= 3);
    if (!aliasTokens.length) continue;
    if (aliasTokens.every((token) => fileTokens.includes(token))) {
      best = Math.max(best, 70 + Math.min(25, alias.length));
    }
  }
  return best;
}

export async function findCreatorTemplateVideo(
  templateId: string,
): Promise<{ filename: string; url: string } | null> {
  const aliases = aliasesFor(templateId);
  if (!aliases.length) return null;
  let names: string[] = [];
  try {
    const entries = await readdir(CREATOR_TEMPLATE_VIDEO_DIR, { withFileTypes: true });
    names = entries.filter((entry) => entry.isFile() && VIDEO_EXT.test(entry.name)).map((entry) => entry.name);
  } catch {
    return null;
  }

  let bestName = "";
  let bestScore = 0;
  for (const name of names) {
    const score = scoreFilename(name, aliases);
    if (score > bestScore || (score === bestScore && score > 0 && name.length < bestName.length)) {
      bestScore = score;
      bestName = name;
    }
  }
  if (bestScore < 70 || !bestName) return null;
  return {
    filename: bestName,
    url: `/link-to-ad/product-videos/${encodeURIComponent(bestName)}`,
  };
}

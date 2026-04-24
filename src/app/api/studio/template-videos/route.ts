import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function toLabel(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  // Keep legacy gallery naming for the primary UGC card.
  if (base.trim().toLowerCase() === "ugc") return "UGC Woman";
  return base;
}

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "studio", "template");
    const entries = await readdir(dir, { withFileTypes: true });
    const videos = entries
      .filter((e) => e.isFile() && /\.(mp4|webm|mov)$/i.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((name) => ({
        filename: name,
        label: toLabel(name),
        url: `/studio/template/${encodeURIComponent(name)}`,
      }));

    return NextResponse.json({ videos });
  } catch {
    return NextResponse.json({ videos: [] });
  }
}

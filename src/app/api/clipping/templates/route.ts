export const runtime = "nodejs";

import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

type TemplateListItem = {
  filename: string;
  label: string;
  url: string;
};

function toLabel(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "studio", "template");
    const entries = await readdir(dir, { withFileTypes: true });
    const templates: TemplateListItem[] = entries
      .filter((entry) => entry.isFile() && /\.(mp4|webm|mov)$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((name) => ({
        filename: name,
        label: toLabel(name),
        url: `/studio/template/${encodeURIComponent(name)}`,
      }));
    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ templates: [] });
  }
}

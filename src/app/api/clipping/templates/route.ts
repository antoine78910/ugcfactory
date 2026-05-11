export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { listClippingTemplateVideosFromDisk } from "@/lib/studioTemplateVideosList";

type TemplateListItem = {
  filename: string;
  label: string;
  url: string;
};

export async function GET() {
  try {
    const items = await listClippingTemplateVideosFromDisk();
    const templates: TemplateListItem[] = items.map((v) => ({
      filename: v.filename,
      label: v.label,
      url: v.url,
    }));
    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ templates: [] });
  }
}

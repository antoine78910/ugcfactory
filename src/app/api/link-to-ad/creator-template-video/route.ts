import { NextResponse } from "next/server";

import {
  CREATOR_PRODUCT_TEMPLATES,
  creatorTemplateUgcVideoUrl,
  creatorTemplateVideoUrl,
} from "@/lib/creatorProductTemplates";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const templateId = new URL(request.url).searchParams.get("templateId")?.trim() ?? "";
  const template = CREATOR_PRODUCT_TEMPLATES.find((item) => item.id === templateId);
  if (!template) {
    return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  }
  const url = creatorTemplateVideoUrl(template.id);
  const ugcUrl = creatorTemplateUgcVideoUrl(template.id);
  return NextResponse.json({
    video: url ? { filename: template.videoFile, url } : null,
    ugc: ugcUrl ? { filename: template.ugcVideoFile, url: ugcUrl } : null,
  });
}

import { NextResponse } from "next/server";

import { CREATOR_PRODUCT_TEMPLATES } from "@/lib/creatorProductTemplates";
import { findCreatorTemplateVideo } from "@/lib/creatorTemplateVideos";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const templateId = new URL(request.url).searchParams.get("templateId")?.trim() ?? "";
  if (!CREATOR_PRODUCT_TEMPLATES.some((item) => item.id === templateId)) {
    return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  }
  const video = await findCreatorTemplateVideo(templateId);
  return NextResponse.json({ video });
}

import { NextResponse } from "next/server";
import {
  listStudioTemplateVideosFromDisk,
  type StudioTemplateVideoListKind,
} from "@/lib/studioTemplateVideosList";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind: StudioTemplateVideoListKind = searchParams.get("kind") === "app" ? "app" : "product";
  const videos = await listStudioTemplateVideosFromDisk(kind);
  return NextResponse.json(
    { videos, kind },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=86400",
      },
    },
  );
}

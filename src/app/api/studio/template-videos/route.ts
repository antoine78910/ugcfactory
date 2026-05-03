import { NextResponse } from "next/server";
import { listStudioTemplateVideosFromDisk } from "@/lib/studioTemplateVideosList";

export async function GET() {
  const videos = await listStudioTemplateVideosFromDisk();
  return NextResponse.json(
    { videos },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=86400",
      },
    },
  );
}

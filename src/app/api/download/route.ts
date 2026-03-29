export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { isPrivateHost, parsePublicHttpUrl } from "@/lib/ssrfHttpUrl";

function safeFilenameFromUrl(u: URL) {
  const last = u.pathname.split("/").filter(Boolean).pop() || "ugc-video.mp4";
  const name = last.includes(".") ? last : `${last}.mp4`;
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const urlParam = (searchParams.get("url") ?? "").trim();
  const target = parsePublicHttpUrl(urlParam);
  if (!target) {
    return NextResponse.json({ error: "Missing or invalid `url` query param." }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Upstream download failed: HTTP ${upstream.status}` },
        { status: 502 },
      );
    }

    const finalUrl = upstream.url ? new URL(upstream.url) : null;
    if (finalUrl && isPrivateHost(finalUrl.hostname)) {
      return NextResponse.json({ error: "URL not allowed." }, { status: 400 });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const filename = safeFilenameFromUrl(target);

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

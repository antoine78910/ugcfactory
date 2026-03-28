export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

/** Reject requests targeting private/internal IP ranges (SSRF protection). */
function isPrivateHost(hostname: string): boolean {
  // IPv4 private ranges
  if (/^127\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true; // link-local (AWS metadata)
  if (hostname === "localhost") return true;
  // IPv6 loopback / private
  if (hostname === "::1" || hostname === "[::1]") return true;
  if (/^fc/i.test(hostname) || /^fd/i.test(hostname)) return true;
  return false;
}

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
  if (!urlParam) {
    return NextResponse.json({ error: "Missing `url` query param." }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: "Invalid `url`." }, { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) URLs are allowed." }, { status: 400 });
  }

  if (isPrivateHost(target.hostname)) {
    return NextResponse.json({ error: "URL not allowed." }, { status: 400 });
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

    // Verify the final URL after redirects isn't private
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

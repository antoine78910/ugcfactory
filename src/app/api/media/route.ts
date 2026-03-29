export const runtime = "nodejs";

import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { isPrivateHost, parsePublicHttpUrl } from "@/lib/ssrfHttpUrl";

function safeFilenameFromUrl(u: URL) {
  const last = u.pathname.split("/").filter(Boolean).pop() || "media";
  const name = last.includes(".") ? last : `${last}.bin`;
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const PASS_THROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
] as const;

/**
 * Inline playback / image load through the app origin (auth required).
 * Forwards Range so video elements can seek and show frames immediately.
 */
export async function GET(req: Request) {
  const { response } = await requireSupabaseUser();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const urlParam = (searchParams.get("url") ?? "").trim();
  const target = parsePublicHttpUrl(urlParam);
  if (!target) {
    return Response.json({ error: "Missing or invalid `url`." }, { status: 400 });
  }

  const range = req.headers.get("range");
  const filename = safeFilenameFromUrl(target);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          ...(range ? { Range: range } : {}),
          "User-Agent": "UGC-Studio-MediaProxy/1.0",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    const finalUrl = upstream.url ? new URL(upstream.url) : null;
    if (finalUrl && isPrivateHost(finalUrl.hostname)) {
      return Response.json({ error: "URL not allowed." }, { status: 400 });
    }

    if (!upstream.ok || !upstream.body) {
      return Response.json(
        { error: `Upstream failed: HTTP ${upstream.status}` },
        { status: 502 },
      );
    }

    const out = new Headers();
    for (const h of PASS_THROUGH_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    out.set("Content-Disposition", `inline; filename="${filename}"`);
    out.set("Cache-Control", "private, max-age=300");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: out,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return Response.json({ error: message }, { status: 502 });
  }
}

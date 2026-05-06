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

function isRenderableMediaContentType(ct: string): boolean {
  const t = (ct || "").toLowerCase();
  return t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/");
}

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
  const ifNoneMatch = req.headers.get("if-none-match");
  const ifModifiedSince = req.headers.get("if-modified-since");
  const filename = safeFilenameFromUrl(target);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          ...(range ? { Range: range } : {}),
          ...(ifNoneMatch ? { "If-None-Match": ifNoneMatch } : {}),
          ...(ifModifiedSince ? { "If-Modified-Since": ifModifiedSince } : {}),
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,fr-FR;q=0.8,fr;q=0.7",
          Referer: `${target.origin}/`,
          Origin: target.origin,
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    const finalUrl = upstream.url ? new URL(upstream.url) : null;
    if (finalUrl && isPrivateHost(finalUrl.hostname)) {
      return Response.json({ error: "URL not allowed." }, { status: 400 });
    }

    // Forward 304 Not Modified directly so the browser keeps using its cached body.
    if (upstream.status === 304) {
      const out = new Headers();
      for (const h of PASS_THROUGH_HEADERS) {
        const v = upstream.headers.get(h);
        if (v) out.set(h, v);
      }
      out.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800, immutable");
      return new Response(null, { status: 304, headers: out });
    }

    if (!upstream.ok || !upstream.body) {
      return Response.json(
        { error: `Upstream failed: HTTP ${upstream.status}` },
        { status: 502 },
      );
    }
    const upstreamCt = (upstream.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!isRenderableMediaContentType(upstreamCt)) {
      return Response.json(
        {
          error:
            "Upstream did not return a media file. The source may be protected by Cloudflare/Kasada hotlink rules.",
          code: "NON_MEDIA_UPSTREAM",
          contentType: upstreamCt || null,
        },
        { status: 502 },
      );
    }

    const out = new Headers();
    for (const h of PASS_THROUGH_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    out.set("Content-Disposition", `inline; filename="${filename}"`);
    // Treat the proxied URL as immutable: the upstream URL itself acts as the cache key
    // (it almost always carries a signed token / hash). This lets the browser skip the
    // network on subsequent loads, fixing the multi-second / multi-minute reloads in the
    // history grid. `stale-while-revalidate` keeps things snappy if the entry just expired.
    out.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800, immutable");
    // Make sure intermediaries vary on the requesting cookie (auth) so we never leak
    // one user's signed media to another in a shared cache.
    if (!out.has("Vary")) out.set("Vary", "Cookie, Range");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: out,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return Response.json({ error: message }, { status: 502 });
  }
}

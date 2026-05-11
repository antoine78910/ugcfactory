/**
 * Use same-origin `/api/media` for remote http(s) assets so <video>/<img> can load
 * providers that block hotlinking or require Range requests (fixes black video previews).
 *
 * Stable, CORS/Range-friendly origins (e.g. our Supabase Storage public bucket, or
 * URLs pinned to NEXT_PUBLIC_MEDIA_DIRECT_HOSTS) are returned untouched so the
 * browser fetches them directly from the CDN — much faster than proxying.
 */

/** Hard-coded hosts known to support direct hotlink + Range without CORS issues. */
const DIRECT_HOSTNAME_SUFFIXES: readonly string[] = [
  // Supabase Storage / Studio CDN (set via NEXT_PUBLIC_SUPABASE_URL)
  ".supabase.co",
  ".supabase.in",
  // Common public CDNs we trust for inline media
  "cdn.shopify.com",
  "images.ctfassets.net",
];

/** Path fragments that always indicate a stable public asset, regardless of host. */
const DIRECT_PATH_FRAGMENTS: readonly string[] = [
  "/storage/v1/object/public/",
];

function envDirectHosts(): string[] {
  const raw = (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MEDIA_DIRECT_HOSTS : "") || "";
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function envSupabaseHost(): string | null {
  const raw = (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL : "") || "";
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isDirectMediaUrl(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  for (const frag of DIRECT_PATH_FRAGMENTS) {
    if (path.includes(frag)) return true;
  }

  // Shopify product/collection assets served from the store's own domain (not only cdn.shopify.com).
  if (/^\/cdn\/shop\//i.test(path)) return true;

  for (const suffix of DIRECT_HOSTNAME_SUFFIXES) {
    if (suffix.startsWith(".")) {
      if (host.endsWith(suffix)) return true;
    } else if (host === suffix) {
      return true;
    }
  }

  const supabaseHost = envSupabaseHost();
  if (supabaseHost && host === supabaseHost) return true;

  for (const allowed of envDirectHosts()) {
    if (allowed.startsWith(".")) {
      if (host.endsWith(allowed)) return true;
    } else if (host === allowed) {
      return true;
    }
  }

  return false;
}

export function proxiedMediaSrc(url: string | null | undefined): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("blob:") || u.startsWith("data:")) return u;
  if (u.startsWith("/api/media")) return u;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return u;
    if (isDirectMediaUrl(parsed)) return u;
    return `/api/media?url=${encodeURIComponent(u)}`;
  } catch {
    return u;
  }
}

/**
 * Same as {@link proxiedMediaSrc} but appends `w=<width>` so `/api/media` can return a
 * resized WebP thumbnail (image upstreams only — video/audio fall back to the original
 * stream). Use for grid tiles and posters where the full-resolution asset is wasteful.
 * Direct-host URLs (Supabase Storage etc.) currently skip the proxy and are returned as-is;
 * `w` has no effect on those because Supabase Storage doesn't honor a `?w=` query param.
 * Future improvement: rewrite Supabase URLs to the `/storage/v1/render/image/public/` form.
 */
export function thumbProxiedMediaSrc(
  url: string | null | undefined,
  width: number,
): string {
  const base = proxiedMediaSrc(url);
  if (!base) return base;
  if (!base.startsWith("/api/media")) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}w=${Math.max(1, Math.floor(width))}`;
}

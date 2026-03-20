/** Normalize store URLs for matching saved runs / projects (no hash, no query, no trailing slash). */
export function normalizeStoreUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    const href = u.toString();
    return href.endsWith("/") ? href.slice(0, -1) : href;
  } catch {
    const t = url.trim();
    const noSlash = t.endsWith("/") ? t.slice(0, -1) : t;
    return noSlash.toLowerCase();
  }
}

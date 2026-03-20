/**
 * Resolve image URLs from HTML / LLM output so <img> and links work.
 * Relative paths must use the product page as base; LLM URLs must match real candidates when possible.
 */

export function absolutizeImageUrl(raw: string, basePageUrl: string): string | null {
  const t = raw.trim();
  if (!t || t.startsWith("data:")) return null;
  try {
    return new URL(t, basePageUrl).href;
  } catch {
    return null;
  }
}

function stripTrailingQueryNoise(href: string): string {
  try {
    const u = new URL(href);
    return `${u.origin}${u.pathname}`;
  } catch {
    return href;
  }
}

/**
 * Map a model-provided URL string to one of the known candidate URLs from the scrape.
 */
export function matchUrlToCandidates(
  modelUrl: string,
  candidates: string[],
  pageUrl: string,
): string | null {
  if (!candidates.length) return null;

  const abs = absolutizeImageUrl(modelUrl, pageUrl);
  if (!abs) return null;

  const candSet = new Set(candidates);
  if (candSet.has(abs)) return abs;

  const norm = (s: string) => {
    try {
      const u = new URL(s);
      return `${u.origin}${u.pathname}${u.search}`;
    } catch {
      return s.trim();
    }
  };

  const nAbs = norm(abs);
  for (const c of candidates) {
    if (norm(c) === nAbs) return c;
  }

  for (const c of candidates) {
    try {
      if (decodeURIComponent(c) === decodeURIComponent(abs)) return c;
    } catch {
      // ignore
    }
  }

  let absPath: string;
  try {
    absPath = new URL(abs).pathname;
  } catch {
    absPath = "";
  }
  if (absPath) {
    for (const c of candidates) {
      try {
        if (new URL(c).pathname === absPath) return c;
      } catch {
        // ignore
      }
    }
  }

  const pathOnly = modelUrl.trim().replace(/^https?:\/\/[^/]+/i, "").split("?")[0] ?? "";
  if (pathOnly && pathOnly !== "/") {
    for (const c of candidates) {
      if (c.includes(pathOnly) || stripTrailingQueryNoise(c).endsWith(pathOnly)) return c;
    }
  }

  for (const c of candidates) {
    const basePath = stripTrailingQueryNoise(abs);
    if (basePath && c.startsWith(basePath)) return c;
  }

  return null;
}

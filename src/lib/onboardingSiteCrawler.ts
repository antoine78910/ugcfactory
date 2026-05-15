export type OnboardingCrawledPage = {
  url: string;
  title?: string;
  textSample: string;
};

const FETCH_TIMEOUT_MS = 18_000;
const MAX_PAGES = 9;
const MAX_TEXT_PER_PAGE = 14_000;

function stripHtmlToText(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const noTags = noScript.replace(/<[^>]+>/g, " ");
  return noTags.replace(/\s+/g, " ").trim();
}

function extractTitle(html: string): string | undefined {
  const m = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html);
  return m?.[1]?.replace(/\s+/g, " ").trim() || undefined;
}

export function normalizeBrandSiteUrl(raw: string): string {
  const t = raw.trim();
  if (!t) throw new Error("Site URL is required.");
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  const u = new URL(withScheme);
  if (!u.hostname) throw new Error("Invalid site URL.");
  u.hash = "";
  u.pathname = u.pathname || "/";
  return u.origin + (u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "") || "");
}

/** Same host only; shallow crawl (homepage + limited internal links). */
export async function crawlSiteForOnboarding(originInput: string): Promise<{
  originDisplay: string;
  pages: OnboardingCrawledPage[];
  errors: string[];
}> {
  const errors: string[] = [];
  const startUrl = normalizeBrandSiteUrl(originInput);
  const base = new URL(startUrl.startsWith("http") ? startUrl : `https://${startUrl}`);
  const origin = base.origin;

  const pages: OnboardingCrawledPage[] = [];
  const seen = new Set<string>();

  async function fetchOne(url: string): Promise<{ html: string } | null> {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (compatible; YouryBrandOnboarding/1.0)",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`);
        return null;
      }
      const ct = res.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml/i.test(ct) && !url.endsWith(".html")) {
        errors.push(`${url}: skipped non-html (${ct || "unknown"})`);
        return null;
      }
      const html = await res.text();
      return { html };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch failed";
      errors.push(`${url}: ${msg}`);
      return null;
    }
  }

  function extractInternalLinks(html: string, pageUrl: URL): string[] {
    const out: string[] = [];
    const re = /href\s*=\s*["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const raw = (m[1] ?? "").trim();
      if (!raw || raw.startsWith("#") || raw.toLowerCase().startsWith("javascript:")) continue;
      if (raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
      try {
        const abs = new URL(raw, pageUrl).href.split("#")[0]!;
        if (!abs.startsWith(origin)) continue;
        const u = new URL(abs);
        if (u.search && u.search.length > 80) continue;
        const path = u.pathname.toLowerCase();
        if (/\.(pdf|zip|jpg|jpeg|png|gif|webp|svg|mp4|mov|xml|json)$/i.test(path)) continue;
        out.push(abs);
      } catch {
        /* skip */
      }
    }
    return [...new Set(out)];
  }

  const queue: string[] = [base.href.split("#")[0]!];
  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const got = await fetchOne(next);
    if (!got) continue;
    const text = stripHtmlToText(got.html).slice(0, MAX_TEXT_PER_PAGE);
    pages.push({
      url: next,
      title: extractTitle(got.html),
      textSample: text,
    });
    if (pages.length === 1) {
      const links = extractInternalLinks(got.html, new URL(next));
      for (const l of links) {
        if (!seen.has(l) && !queue.includes(l)) queue.push(l);
      }
    }
  }

  return {
    originDisplay: origin,
    pages,
    errors,
  };
}

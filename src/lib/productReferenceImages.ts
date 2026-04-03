import { absolutizeImageUrl } from "@/lib/imageUrl";

/** Max product reference images sent to GPT/Claude vision (multi-angle understanding). */
export const MAX_GPT_PRODUCT_REFERENCE_IMAGES = 8;

/** Max product reference URLs passed to KIE Nano Banana Pro `image_input` (provider accepts multiple). */
export const MAX_NANO_BANANA_PRODUCT_REFERENCE_IMAGES = 8;

function isAbsoluteHttp(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

export function absolutizeProductImageUrl(raw: string, pageUrl: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (isAbsoluteHttp(t)) return t;
  const base = pageUrl.trim();
  if (!base) return t;
  return absolutizeImageUrl(t, base) ?? t;
}

/** Dedupe absolute HTTPS URLs (after absolutize) for stable lists / snapshots. */
export function dedupeHttpsProductUrls(pageUrl: string, urls: string[]): string[] {
  const base = pageUrl.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const a = absolutizeProductImageUrl(raw, base);
    if (!a || !/^https?:\/\//i.test(a) || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

/**
 * URLs for GPT vision: user neutral upload first (if any), then other packshots from classify / selection.
 * Dedupes, keeps max {@link MAX_GPT_PRODUCT_REFERENCE_IMAGES}. If only one angle exists, returns one URL.
 */
export function productUrlsForGpt(opts: {
  pageUrl: string;
  neutralUploadUrl: string | null | undefined;
  candidateUrls: string[];
  fallbackUrl: string | null | undefined;
}): string[] {
  const base = opts.pageUrl.trim();
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const a = absolutizeProductImageUrl(raw, base);
    if (!a || !/^https?:\/\//i.test(a)) return;
    if (seen.has(a)) return;
    seen.add(a);
    out.push(a);
  };

  if (opts.neutralUploadUrl) push(opts.neutralUploadUrl);
  for (const u of opts.candidateUrls) push(u);
  if (opts.fallbackUrl) push(opts.fallbackUrl);

  return out.slice(0, MAX_GPT_PRODUCT_REFERENCE_IMAGES);
}

/**
 * All HTTPS product reference URLs for Nano Banana Pro (same priority as {@link pickBestProductUrlForNanoBanana}, capped).
 */
export function allProductUrlsForNanoBanana(opts: {
  pageUrl: string;
  neutralUploadUrl: string | null | undefined;
  candidateUrls: string[];
  fallbackUrl: string | null | undefined;
}): string[] {
  const base = opts.pageUrl.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    const a = raw ? absolutizeProductImageUrl(raw, base) : "";
    if (!a || !/^https?:\/\//i.test(a) || seen.has(a)) return;
    seen.add(a);
    out.push(a);
  };
  push(opts.neutralUploadUrl);
  for (const u of opts.candidateUrls) push(u);
  push(opts.fallbackUrl);
  return out.slice(0, MAX_NANO_BANANA_PRODUCT_REFERENCE_IMAGES);
}

/**
 * NanoBanana accepts reference image(s): prefer user neutral upload, else best-ranked packshot (first candidate), else fallback.
 */
export function pickBestProductUrlForNanoBanana(opts: {
  pageUrl: string;
  neutralUploadUrl: string | null | undefined;
  candidateUrls: string[];
  fallbackUrl: string | null | undefined;
}): string | null {
  const all = allProductUrlsForNanoBanana(opts);
  return all[0] ?? null;
}

/** Wizard packshots are usually already absolute; still normalize for GPT list. */
export function packshotUrlsForGpt(pageUrl: string, packshotUrls: string[], fallbackFromExtracted?: string | null) {
  return productUrlsForGpt({
    pageUrl,
    neutralUploadUrl: null,
    candidateUrls: packshotUrls,
    fallbackUrl: fallbackFromExtracted ?? null,
  });
}

export function pickPackshotForNanoBanana(pageUrl: string, packshotUrls: string[], fallbackFromExtracted?: string | null) {
  return pickBestProductUrlForNanoBanana({
    pageUrl,
    neutralUploadUrl: null,
    candidateUrls: packshotUrls,
    fallbackUrl: fallbackFromExtracted ?? null,
  });
}

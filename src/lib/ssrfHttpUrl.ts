/** Reject hostnames targeting private/internal IP ranges (SSRF protection). */
export function isPrivateHost(hostname: string): boolean {
  if (/^127\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  if (hostname === "localhost") return true;
  if (hostname === "::1" || hostname === "[::1]") return true;
  if (/^fc/i.test(hostname) || /^fd/i.test(hostname)) return true;
  return false;
}

/** Parse and validate an http(s) URL that is safe to fetch server-side. */
export function parsePublicHttpUrl(urlParam: string): URL | null {
  const t = urlParam.trim();
  if (!t) return null;
  let target: URL;
  try {
    target = new URL(t);
  } catch {
    return null;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return null;
  if (isPrivateHost(target.hostname)) return null;
  return target;
}

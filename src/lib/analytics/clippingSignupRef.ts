/** Visitor id cookie set on /start/clipping (clipping template signup attribution). */
export const CLIPPING_SIGNUP_VISITOR_COOKIE = "youry_clipping_vid";
export const CLIPPING_SIGNUP_ENTRY_COOKIE = "youry_clipping_entry";
export const CLIPPING_SIGNUP_VISITOR_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

/** Post-signup destination for clippers (Link to Ad in the studio shell). */
export const CLIPPING_SIGNUP_REDIRECT_PATH = "/link-to-ad";

export function newClippingSignupVisitorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cv_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function readClippingSignupVisitorIdFromDocument(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${CLIPPING_SIGNUP_VISITOR_COOKIE}=([^;]+)`),
    );
    const raw = m?.[1] ? decodeURIComponent(m[1].trim()) : "";
    return raw || null;
  } catch {
    return null;
  }
}

export function hasClippingSignupEntryCookie(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return new RegExp(`(?:^|;\\s*)${CLIPPING_SIGNUP_ENTRY_COOKIE}=1(?:;|$)`).test(document.cookie);
  } catch {
    return false;
  }
}

/** Extra DataFast params when the visitor came from /start/clipping. */
export function clippingSignupAttributionParams(): Record<string, string> | undefined {
  return hasClippingSignupEntryCookie() ? { entry: "clipping_template" } : undefined;
}

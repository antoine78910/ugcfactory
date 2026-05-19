/** Cookie set when a visitor lands on youry.io/start (short link). */
export const START_LINK_COOKIE = "youry_start_entry";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

export function setStartLinkEntryCookie(): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${START_LINK_COOKIE}=1; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function hasStartLinkEntryCookie(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return new RegExp(`(?:^|;\\s*)${START_LINK_COOKIE}=1(?:;|$)`).test(document.cookie);
  } catch {
    return false;
  }
}

/** Extra DataFast params when the visitor came from /start. */
export function startLinkAttributionParams(): Record<string, string> | undefined {
  return hasStartLinkEntryCookie() ? { entry: "start" } : undefined;
}

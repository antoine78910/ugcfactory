/** Visitor id cookie set on youry.io/start (internal attribution). */
export const START_LINK_VISITOR_COOKIE = "youry_start_vid";
export const START_LINK_VISITOR_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

/** @deprecated Kept for DataFast `entry=start` on goals; prefer START_LINK_VISITOR_COOKIE. */
export const START_LINK_COOKIE = "youry_start_entry";

export function newStartLinkVisitorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function readStartLinkVisitorIdFromDocument(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${START_LINK_VISITOR_COOKIE}=([^;]+)`),
    );
    const raw = m?.[1] ? decodeURIComponent(m[1].trim()) : "";
    return raw || null;
  } catch {
    return null;
  }
}

export function ensureStartLinkVisitorCookie(): string {
  const existing = readStartLinkVisitorIdFromDocument();
  if (existing) return existing;
  const id = newStartLinkVisitorId();
  try {
    document.cookie = `${START_LINK_VISITOR_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${START_LINK_VISITOR_MAX_AGE_SEC}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
  return id;
}

export function setStartLinkEntryCookie(): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${START_LINK_COOKIE}=1; path=/; max-age=${START_LINK_VISITOR_MAX_AGE_SEC}; SameSite=Lax`;
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

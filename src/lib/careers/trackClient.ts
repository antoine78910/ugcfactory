"use client";

const STORAGE_KEY = "youry_careers_vid";

export function getCareersVisitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id || id.length < 8) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Date.now()}`;
  }
}

const EVENT_TYPES = new Set([
  "careers_landing",
  "job_view",
  "application_tab_view",
  "application_started",
]);

export async function trackCareersEvent(
  eventType: string,
  jobSlug?: string | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!EVENT_TYPES.has(eventType)) return;

  const visitorId = getCareersVisitorId();
  if (!visitorId) return;

  try {
    await fetch("/api/careers/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorId,
        eventType,
        jobSlug: jobSlug ?? undefined,
        meta: meta ?? undefined,
      }),
    });
  } catch {
    /* non-blocking */
  }
}

export function careersSessionMarkOnce(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const k = `youry_careers_sess_${key}`;
    if (window.sessionStorage.getItem(k)) return false;
    window.sessionStorage.setItem(k, "1");
    return true;
  } catch {
    return true;
  }
}

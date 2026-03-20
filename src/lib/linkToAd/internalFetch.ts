/**
 * Forward the incoming request cookies so server → server calls hit authenticated API routes
 * (same session as the browser).
 */
export function createInternalFetchFromRequest(incoming: Request) {
  const u = new URL(incoming.url);
  const base = `${u.protocol}//${u.host}`;
  const cookie = incoming.headers.get("cookie") ?? "";

  return function internalFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (cookie) headers.set("Cookie", cookie);
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${base}${path}`, {
      ...init,
      headers,
    });
  };
}

export type InternalFetch = ReturnType<typeof createInternalFetchFromRequest>;

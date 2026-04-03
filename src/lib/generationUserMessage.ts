/**
 * User-visible generation errors (Studio, etc.): short, non-sensitive summaries.
 * Full provider payloads should be logged server-side with `logGenerationFailure`.
 */

const DEFAULT_USER_MESSAGE = "Something went wrong. Please try again.";

function redactSensitiveFragments(text: string): string {
  let out = text;
  out = out.replace(/https?:\/\/[^\s]+/gi, "[link]");
  out = out.replace(/sk-[a-zA-Z0-9]{8,}/gi, "[redacted]");
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-]{8,}/gi, "Bearer [redacted]");
  out = out.replace(/[A-Za-z0-9+/]{60,}={0,2}/g, "[redacted]");
  return out;
}

/**
 * Maps provider / network errors to a safe line for the UI. Logs nothing by itself.
 */
export function userFacingProviderError(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";

  const lower = s.toLowerCase();

  if (/nsfw|porn|sexual|nude|moderation|content policy|policy violation|safety system|unsafe content|blocked|not allowed|prohibited|violate/.test(lower)) {
    return "Blocked by the provider’s content guidelines. Try a different prompt or reference image.";
  }
  if (/rate ?limit|too many requests|\b429\b|throttl/.test(lower)) {
    return "Too many requests. Wait a moment and try again.";
  }
  if (/timeout|timed out|deadline exceeded|\b504\b|gateway time/i.test(lower)) {
    return "The request timed out. Try again.";
  }
  if (/internal error|server exception|temporar(y)?\s+(error|failure)|try again later/i.test(lower)) {
    return "The image provider had a temporary error. Wait a few seconds and try again.";
  }
  if (/credit|balance|quota|insufficient|payment required|\b402\b/.test(lower)) {
    return "Provider credits or quota issue. Check your API key or billing.";
  }
  if (/unauthor|\b401\b|forbidden|\b403\b|signature|invalid key|apikey|api key rejected/.test(lower)) {
    return "The provider rejected the request (authentication or permissions). Check your API keys.";
  }
  if (/not found|\b404\b|expired|does not exist|task not found/.test(lower)) {
    return "A resource was missing or expired (for example the image link). Re-upload and try again.";
  }
  if (/size|too large|dimension|resolution|exceeds limit|file too/.test(lower)) {
    return "File or media constraints were not met (size, format, or resolution). Try another file.";
  }
  if (/invalid|bad request|\b400\b|malformed|parameter error|validation failed/.test(lower)) {
    return "Invalid parameters or inputs. Adjust settings and retry.";
  }
  if (/fetch failed|failed to fetch|networkerror|load failed|econnreset|socket/i.test(lower)) {
    return "Network error while contacting the image provider. Wait a few seconds and try again.";
  }

  let cleaned = redactSensitiveFragments(s);
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (cleaned.length > 220) cleaned = `${cleaned.slice(0, 217)}…`;

  if (cleaned.length >= 3 && !/[{}[\]"]{6,}/.test(cleaned)) {
    return cleaned;
  }

  return DEFAULT_USER_MESSAGE;
}

export function userFacingProviderErrorOrDefault(raw: string | null | undefined, fallback = DEFAULT_USER_MESSAGE): string {
  const u = userFacingProviderError(raw);
  return u || fallback;
}

export function logGenerationFailure(scope: string, err: unknown, meta?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[generation-failure] ${scope}`, { ...meta, message, stack });
}

export function userMessageFromCaughtError(e: unknown, fallback = DEFAULT_USER_MESSAGE): string {
  if (e instanceof Error && e.message.trim()) {
    return userFacingProviderErrorOrDefault(e.message, fallback);
  }
  return fallback;
}

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
    return "Blocked by content guidelines. Try a different prompt or reference image.";
  }
  if (/rate ?limit|too many requests|\b429\b|throttl/.test(lower)) {
    return "Too many requests. Wait a moment and try again.";
  }
  if (/timeout|timed out|deadline exceeded|\b504\b|gateway time/i.test(lower)) {
    return "The request timed out. Try again.";
  }
  if (/internal error|server exception|temporar(y)?\s+(error|failure)|try again later/i.test(lower)) {
    return "The service had a temporary error. Wait a few seconds and try again.";
  }
  if (/credit|balance|quota|insufficient|payment required|\b402\b/.test(lower)) {
    return "Credits or quota issue. Check your API key or billing.";
  }
  if (/unauthor|\b401\b|forbidden|\b403\b|signature|invalid key|apikey|api key rejected/.test(lower)) {
    return "The request was rejected (authentication or permissions). Check your API keys.";
  }
  if (/not found|\b404\b|expired|does not exist|task not found/.test(lower)) {
    return "A resource was missing or expired (for example the image link). Re-upload and try again.";
  }
  /**
   * PiAPI Seedance often surfaces image-fetch failures as opaque 400/500s with messages like
   * `image_upload`, `download image failed`, `fetch image`, etc. Catch these BEFORE the
   * generic "Invalid parameters" branch so the user gets an actionable hint.
   */
  if (
    /image[_\s-]?upload|download(ing)?[_\s-]?image|fetch(ing)?[_\s-]?image|cannot[_\s-]?download[_\s-]?image|image[_\s-]?fetch/.test(
      lower,
    ) ||
    /reference[_\s-]?image.*(failed|invalid|unreachable|unavailable|cannot)/i.test(lower)
  ) {
    return "The provider could not load the reference image. Use a clearer JPG/PNG (at least 300×300, under ~10 MB), retry, or upload a fresh image.";
  }
  // Model / API rejected generation settings (Sora, Veo, etc.), not the Motion/Translate upload limits.
  if (
    /\b(invalid|unsupported|bad|exceeds)\b.*\b(aspect|resolution|dimensions?|width|height)\b/i.test(lower) ||
    /\b(aspect|resolution|dimensions?|width|height)\b.*\b(invalid|unsupported|not supported|not allowed|exceed|too large|too small)\b/i.test(lower) ||
    /\bwrong\b.*\b(aspect|ratio|resolution)\b/i.test(lower)
  ) {
    return "The model rejected these settings (image shape, aspect ratio, or duration). For Sora 2 / Sora 2 Pro: use 10s or 15s, keep portrait or landscape consistent, and use a clear start image (often 9:16 or 16:9). Adjust and try again.";
  }
  // Upload / payload too large; limits differ by feature (Studio vs Translate URL import vs Motion).
  if (
    /\b413\b|request entity too large|payload too large|body too large|content[- ]length|multipart/i.test(lower) ||
    /file too large|file size|max(imum)? upload|upload (size|limit)|maximum (file|video) size|video (file )?too large/i.test(lower) ||
    (/too large/i.test(lower) && /\b(file|upload|video|asset|media|attachment|blob)\b/i.test(lower)) ||
    /exceeds (the )?(maximum |max )?(file |upload )?size/i.test(lower)
  ) {
    return "This file is too large or the format is not supported. Common video types: MP4, MOV, or WebM. Size limits in this app: Studio uploads (Create, references, elements) up to 100 MB per file; Translate (import by URL) up to 300 MB; Motion control reference videos up to 100 MB. Use a shorter clip, 720p–1080p, or a lower bitrate, then try again.";
  }
  if (/invalid|bad request|\b400\b|malformed|parameter error|validation failed/.test(lower)) {
    return "Invalid parameters or inputs. Adjust settings and retry.";
  }
  if (/fetch failed|failed to fetch|networkerror|load failed|econnreset|socket/i.test(lower)) {
    return "Network error while contacting the service. Wait a few seconds and try again.";
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

function messageForLog(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    if (parts.length > 0) {
      return { message: parts.join(" | ") };
    }
    try {
      return { message: JSON.stringify(err) };
    } catch {
      /* fall through */
    }
  }
  return { message: String(err) };
}

export function logGenerationFailure(scope: string, err: unknown, meta?: Record<string, unknown>): void {
  const { message, stack } = messageForLog(err);
  console.error(`[generation-failure] ${scope}`, { ...meta, message, stack });
}

export function userMessageFromCaughtError(e: unknown, fallback = DEFAULT_USER_MESSAGE): string {
  if (e instanceof Error && e.message.trim()) {
    return userFacingProviderErrorOrDefault(e.message, fallback);
  }
  return fallback;
}

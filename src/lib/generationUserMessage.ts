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
  // Model / API rejected generation settings (Sora, Veo, etc.) — not the Motion/Translate upload limits.
  if (
    /\b(invalid|unsupported|bad|exceeds)\b.*\b(aspect|resolution|dimensions?|width|height)\b/i.test(lower) ||
    /\b(aspect|resolution|dimensions?|width|height)\b.*\b(invalid|unsupported|not supported|not allowed|exceed|too large|too small)\b/i.test(lower) ||
    /\bwrong\b.*\b(aspect|ratio|resolution)\b/i.test(lower)
  ) {
    return "Le modèle a refusé les paramètres (format d’image, ratio ou durée). Pour Sora 2 / Sora 2 Pro : durée 10 s ou 15 s, ratio portrait ou paysage cohérent ; avec image de départ, utilise une image nette (souvent 9:16 ou 16:9). Réessaie après ajustement.";
  }
  // Upload / payload too large — keep Motion & Translate caps as examples for those flows only when it’s clearly a file-size issue.
  if (
    /\b413\b|request entity too large|payload too large|body too large|content[- ]length|multipart/i.test(lower) ||
    /file too large|file size|max(imum)? upload|upload (size|limit)|maximum (file|video) size|video (file )?too large/i.test(lower) ||
    (/too large/i.test(lower) && /\b(file|upload|video|asset|media|attachment|blob)\b/i.test(lower)) ||
    /exceeds (the )?(maximum |max )?(file |upload )?size/i.test(lower)
  ) {
    return "Fichier trop lourd ou non pris en charge. Formats courants : MP4, MOV ou WebM. Réduis la taille (dans l’app : Translate ≤ 300 Mo, Motion control ≤ 100 Mo) et privilégie 720p–1080p si besoin.";
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

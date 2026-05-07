/**
 * Shared detection of "transient" provider error messages — i.e. errors where the
 * underlying generation is almost certainly still running fine and the right
 * action is to keep polling instead of failing the run.
 *
 * Used by every status route (`/api/nanobanana/task`, `/api/kling/status`,
 * `/api/kie/veo/status`, …) so that a Kie / PiAPI rate-limit storm during a
 * burst of parallel jobs doesn't kill perfectly fine generations.
 *
 * Patterns observed in production:
 *   - "Your call frequency is too high. Please try again later." (Kie / PiAPI throttle)
 *   - 429 / 502 / 503 / 504 from the provider gateway
 *   - generic timeout / network blips / server exception
 */
export function isProviderTransientErrorMessage(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const m = raw.toLowerCase();
  return (
    /\bcall frequency\b/.test(m) ||
    /frequency is too high/.test(m) ||
    /\btoo many (requests|calls)\b/.test(m) ||
    /\brate ?limit/.test(m) ||
    /\bthrottl/.test(m) ||
    /\b429\b/.test(m) ||
    /\b502\b/.test(m) ||
    /\b503\b/.test(m) ||
    /\b504\b/.test(m) ||
    /try again later/.test(m) ||
    /\btemporar/.test(m) ||
    /timeout|timed out|deadline exceeded|gateway time/.test(m) ||
    /fetch failed|failed to fetch|networkerror|load failed|econnreset|socket|und_err_socket|other side closed|aborted?/.test(
      m,
    ) ||
    /\b(server exception|internal error|service unavailable|bad gateway|busy|overload)\b/.test(m)
  );
}

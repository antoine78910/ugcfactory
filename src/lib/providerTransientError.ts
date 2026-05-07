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
 *   - "Service is currently unavailable due to high demand. (E003)" (Kie market overload)
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
    /high demand/.test(m) ||
    /currently unavailable/.test(m) ||
    /\(e\d{3}\)/.test(m) ||
    /timeout|timed out|deadline exceeded|gateway time/.test(m) ||
    /fetch failed|failed to fetch|networkerror|load failed|econnreset|socket|und_err_socket|other side closed|aborted?/.test(
      m,
    ) ||
    /\b(server exception|internal error|service unavailable|bad gateway|busy|overload)\b/.test(m)
  );
}

/**
 * Subset of transient errors that signal the **task itself** is dead on the provider
 * (e.g. Kie marks the task as `fail` with "Service is currently unavailable due to
 * high demand. (E003)"). For these we should NOT keep polling indefinitely — the
 * task is permanently failed, and the right action is to re-submit a brand-new task
 * after a short wait.
 *
 * This is distinct from "the status endpoint flapped on a 502" or "frequency too
 * high on the gateway" where the same task is likely still running.
 */
export function isTaskTerminallyDeadButRetryable(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const m = raw.toLowerCase();
  return (
    /high demand/.test(m) ||
    /currently unavailable/.test(m) ||
    /service.*unavailable/.test(m) ||
    /\(e003\)/.test(m) ||
    /\(e\d{3}\)/.test(m)
  );
}

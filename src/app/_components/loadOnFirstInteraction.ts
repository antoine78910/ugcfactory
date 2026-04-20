/**
 * Defer a side-effect until the user clearly engages with the page (any of:
 * pointer / scroll / key / touch), or after a long fallback timeout.
 *
 * This pushes Heyo + Clarity (and similar non-essential third-parties) out of
 * the LP's first ~2-3 seconds so they don't inflate Total Blocking Time.
 *
 * Returns a cleanup that cancels the pending run and removes listeners.
 */
export function loadOnFirstInteraction(
  run: () => void,
  options: { fallbackMs?: number } = {},
): () => void {
  if (typeof window === "undefined") return () => {};
  const { fallbackMs = 12_000 } = options;

  let triggered = false;
  let timeoutId: number | undefined;
  const events: (keyof WindowEventMap)[] = [
    "pointerdown",
    "scroll",
    "keydown",
    "touchstart",
    "mousemove",
    "wheel",
  ];

  const cleanup = () => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    for (const evt of events) {
      window.removeEventListener(evt, fire, true);
    }
  };

  function fire(): void {
    if (triggered) return;
    triggered = true;
    cleanup();
    try {
      run();
    } catch {
      /* run() must never crash the host page */
    }
  }

  for (const evt of events) {
    window.addEventListener(evt, fire, { capture: true, once: true, passive: true });
  }
  timeoutId = window.setTimeout(fire, fallbackMs);

  return cleanup;
}

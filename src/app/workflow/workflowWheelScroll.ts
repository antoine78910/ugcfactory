import type { WheelEvent } from "react";

/**
 * Wheel handler for inputs / textareas / scrollable divs that live inside the React Flow canvas.
 *
 * React Flow listens for wheel globally to pan + zoom, which steals the scroll inside
 * textareas / contentEditable / overflowing fields the moment the cursor sits over them.
 * Pair this with the `nowheel` className on the same element so the React Flow Pane stops
 * intercepting the event and the browser delivers it here. We then either let the textarea
 * scroll natively (when there is nothing to scroll, e.g. single-line input) or take ownership
 * and manually scroll, preventing both default behavior and the React Flow zoom/pan.
 *
 * Works for `<textarea>`, single-line `<input>` (only stops propagation; nothing to scroll),
 * and any scrollable `<div contentEditable>` / wrapper.
 */
export function keepWheelInsideScrollable<E extends HTMLElement>(e: WheelEvent<E>): void {
  const el = e.currentTarget as HTMLElement;
  const canScroll = el.scrollHeight > el.clientHeight;
  const isFocused = typeof document !== "undefined" && document.activeElement === el;
  if (!canScroll && !isFocused) {
    e.stopPropagation();
    return;
  }
  e.preventDefault();
  el.scrollTop += e.deltaY;
  e.stopPropagation();
}

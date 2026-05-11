/**
 * Global concurrent-mount slot for grid <video> tiles.
 *
 * Without this, an above-the-fold grid mounts 20+ <video preload="metadata"> elements at
 * once, each triggering an HTTP fetch of the MP4 moov atom. The browser caps to ~6 parallel
 * connections per origin (HTTP/1.1) — additional decoders queue up and the grid renders
 * tile by tile. This module gates how many videos can be in the "loading first frame"
 * state simultaneously; subsequent VideoCards wait until a slot is released.
 *
 * Slots are released when a video fires `loadeddata` (first frame visible) OR when the
 * component unmounts, whichever comes first.
 */

const MAX_CONCURRENT_VIDEO_MOUNTS = 4;

let inFlight = 0;
const waiters: Array<() => void> = [];

export function acquireVideoMountSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT_VIDEO_MOUNTS) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      inFlight++;
      resolve();
    });
  });
}

export function releaseVideoMountSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  const next = waiters.shift();
  if (next) next();
}

/** Test/debug helper — current slot occupancy. */
export function videoMountSlotsInUse(): number {
  return inFlight;
}

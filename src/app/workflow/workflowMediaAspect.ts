/** Measure width/height ratio from an object URL (e.g. URL.createObjectURL). */

export function measureImageAspectFromObjectUrl(objectUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) resolve(w / h);
      else reject(new Error("Invalid image dimensions"));
    };
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = objectUrl;
  });
}

export function measureVideoAspectFromObjectUrl(objectUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => {
      const w = v.videoWidth;
      const h = v.videoHeight;
      v.removeAttribute("src");
      v.load();
      if (w > 0 && h > 0) resolve(w / h);
      else reject(new Error("Invalid video dimensions"));
    };
    v.onerror = () => {
      v.removeAttribute("src");
      v.load();
      reject(new Error("Video failed to load"));
    };
    v.src = objectUrl;
  });
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** Human-readable ratio label from pixel aspect (width / height). */
export function aspectRatioStringFromIntrinsic(ar: number): string {
  if (!Number.isFinite(ar) || ar <= 0) return "1:1";
  const denom = 1000;
  const w = Math.round(ar * denom);
  const h = denom;
  const g = gcd(w, h);
  const rw = Math.round(w / g);
  const rh = Math.round(h / g);
  if (rw > 99 || rh > 99) {
    return ar >= 1
      ? `${Math.round(ar * 1000) / 1000}:1`
      : `1:${Math.round((1 / ar) * 1000) / 1000}`;
  }
  return `${rw}:${rh}`;
}

/** Best effort for remote avatar URLs (CORS may block — caller can fall back). */
export async function measureImageAspectFromUrlSafe(url: string): Promise<number> {
  try {
    return await measureImageAspectFromObjectUrl(url);
  } catch {
    return 3 / 4;
  }
}

import sharp from "sharp";

export interface PreFilteredImage {
  url: string;
  width: number;
  height: number;
}

// Lookup table: popcount for each byte value 0–255
const POPCOUNT = Array.from({ length: 256 }, (_, i) => {
  let n = 0;
  for (let b = i; b > 0; b &= b - 1) n++;
  return n;
});

/**
 * 8×8 difference hash: compare adjacent pixels per row.
 * Returns an 8-byte Uint8Array (one bit per column comparison).
 */
async function dHash(buf: Buffer): Promise<Uint8Array> {
  const { data } = await sharp(buf)
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const hash = new Uint8Array(8);
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      if (data[row * 9 + col] < data[row * 9 + col + 1]) {
        byte |= 1 << (7 - col);
      }
    }
    hash[row] = byte;
  }
  return hash;
}

function hammingDistance(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < 8; i++) n += POPCOUNT[a[i] ^ b[i]];
  return n;
}

/** Maximum bit-difference to consider two images near-duplicates (out of 64). */
const DEDUP_THRESHOLD = 10;

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; UGC-Studio/1.0)",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
} as const;

/**
 * Filter a list of image URLs to those that:
 * - Are at least `minDim × minDim` pixels (verified by fetching the real file)
 * - Are not SVG or GIF
 * - Are perceptually unique (dHash Hamming distance > DEDUP_THRESHOLD vs all already-kept images)
 *
 * Images are fetched in concurrent batches to keep latency low (typically ~1s for CDN images).
 * The order of the input list is preserved for duplicate resolution (first seen wins).
 */
export async function preFilterImages(
  urls: string[],
  opts?: {
    minDim?: number;
    maxConcurrency?: number;
    timeoutMs?: number;
  },
): Promise<PreFilteredImage[]> {
  const { minDim = 300, maxConcurrency = 10, timeoutMs = 5_000 } = opts ?? {};

  const processUrl = async (
    url: string,
  ): Promise<(PreFilteredImage & { hash: Uint8Array }) | null> => {
    try {
      const lower = url.toLowerCase();
      // Skip obvious non-raster formats before making a network request
      if (/\.svg(\?|$)/.test(lower) || /\.gif(\?|$)/.test(lower)) return null;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: FETCH_HEADERS,
      });
      if (!res.ok) return null;

      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > 20 * 1024 * 1024) return null;

      const meta = await sharp(buf).metadata();
      if (!meta.width || !meta.height) return null;
      // Hard reject: too small or wrong format
      if (meta.width < minDim || meta.height < minDim) return null;
      if (meta.format === "svg" || meta.format === "gif") return null;

      const hash = await dHash(buf);
      return { url, width: meta.width, height: meta.height, hash };
    } catch {
      return null;
    }
  };

  // Process in fixed-size batches for bounded concurrency
  const withHashes: Array<PreFilteredImage & { hash: Uint8Array }> = [];
  for (let i = 0; i < urls.length; i += maxConcurrency) {
    const batch = await Promise.all(
      urls.slice(i, i + maxConcurrency).map(processUrl),
    );
    for (const r of batch) if (r) withHashes.push(r);
  }

  // Perceptual deduplication: keep first occurrence, drop near-duplicates
  const deduped: Array<PreFilteredImage & { hash: Uint8Array }> = [];
  for (const img of withHashes) {
    const isDuplicate = deduped.some(
      (existing) => hammingDistance(existing.hash, img.hash) <= DEDUP_THRESHOLD,
    );
    if (!isDuplicate) deduped.push(img);
  }

  return deduped.map(({ url, width, height }) => ({ url, width, height }));
}

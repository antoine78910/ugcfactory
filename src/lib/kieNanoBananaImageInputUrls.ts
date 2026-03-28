/**
 * KIE Nano Banana `image_input` URLs must point to formats the API accepts (typically JPEG/PNG).
 * WebP, GIF, paths without a file extension (common on Supabase: …/uuid), etc. trigger:
 * "image_input file type not supported".
 */

import sharp from "sharp";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

const BUCKET = "ugc-uploads";
const PREFIX = "kie-nano-ref";

/** In-memory cache so Link to Ad “3 images” (same ref URL) only normalizes once per few minutes. */
const cache = new Map<string, { url: string; at: number }>();
const CACHE_MS = 8 * 60 * 1000;
const CACHE_MAX = 80;

function pathnameLastSegment(url: string): string {
  try {
    const { pathname } = new URL(url);
    const seg = pathname.split("/").filter(Boolean).pop() ?? "";
    return seg.toLowerCase();
  } catch {
    return "";
  }
}

/** KIE accepts our JPEG/PNG URLs; everything else is re-encoded to JPEG on storage. */
export function needsKieNanoBananaImageInputNormalize(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  const base = pathnameLastSegment(u);
  if (!base) return true;
  if (/\.(jpe?g|png)$/.test(base)) return false;
  if (/\.(webp|gif|avif|svg|heic|heif|bmp|tiff?)$/.test(base)) return true;
  if (!base.includes(".")) return true;
  return true;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
    headers: {
      Accept: "image/*,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; UGC-Studio/1.0)",
    },
  });
  if (!res.ok) throw new Error(`Could not download reference image (HTTP ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("Reference image download was empty.");
  if (buf.length > 40 * 1024 * 1024) throw new Error("Reference image is too large.");
  return buf;
}

async function uploadJpegToUgcUploads(jpeg: Buffer): Promise<string> {
  const admin = createSupabaseServiceClient();
  if (!admin) {
    throw new Error(
      "Reference image must be a public JPEG or PNG URL. Set SUPABASE_SERVICE_ROLE_KEY so the server can convert WebP / extensionless uploads for Nano Banana.",
    );
  }
  const path = `${PREFIX}/${crypto.randomUUID()}.jpg`;
  const { data, error } = await admin.storage.from(BUCKET).upload(path, jpeg, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(data.path);
  return publicUrl;
}

async function normalizeOneUrl(raw: string): Promise<string> {
  const url = raw.trim();
  if (!url) return url;

  if (!needsKieNanoBananaImageInputNormalize(url)) {
    return url;
  }

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.url;
  }

  const buf = await fetchBuffer(url);
  let jpeg: Buffer;
  try {
    jpeg = await sharp(buf).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  } catch {
    throw new Error("Could not convert the product reference image to JPEG for the image model.");
  }

  const publicUrl = await uploadJpegToUgcUploads(jpeg);
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value as string | undefined;
    if (first) cache.delete(first);
  }
  cache.set(url, { url: publicUrl, at: Date.now() });
  return publicUrl;
}

/**
 * Ensures each URL is safe for KIE `image_input` (JPEG/PNG with recognizable type).
 */
export async function normalizeKieNanoBananaImageInputUrls(urls: string[] | undefined): Promise<string[] | undefined> {
  if (!urls?.length) return urls;
  const trimmed = urls.map((u) => u.trim()).filter(Boolean);
  if (!trimmed.length) return undefined;

  const unique = [...new Set(trimmed)];
  const resolved = new Map<string, string>();
  for (const u of unique) {
    resolved.set(u, await normalizeOneUrl(u));
  }
  return trimmed.map((u) => resolved.get(u) ?? u);
}

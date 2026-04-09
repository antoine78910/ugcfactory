import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import sharp from "sharp";

const STORAGE_BUCKET = "ugc-uploads";
const MAX_BYTES = 20 * 1024 * 1024;
const TARGET_MAX_SIDE_PX = 2048;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * PiAPI Seedance often fails `image_upload` when pulling arbitrary `image_urls` (short timeouts,
 * CDN quirks). We fetch the frame on our infrastructure and expose a fresh public object URL.
 */
export async function mirrorImageUrlForPiapiSeedance(imageUrl: string, userId: string): Promise<string> {
  const url = imageUrl.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("Invalid image URL for video.");
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    throw new Error("Storage not configured.");
  }

  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      Accept: "image/*,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; UGCFactory/1.0)",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Could not download reference image (HTTP ${res.status}).`);
  }

  const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ct.startsWith("image/")) {
    throw new Error("Reference URL did not return an image.");
  }

  let buf: Buffer = Buffer.from(await res.arrayBuffer());
  let reencodedToJpeg = false;
  if (buf.byteLength > MAX_BYTES) {
    // Re-encode oversized images to a smaller JPEG so PiAPI can pull them reliably.
    // This mirrors the approach used by KIE Nano reference normalization.
    try {
      let quality = 85;
      for (let attempt = 0; attempt < 4; attempt++) {
        const next: Buffer = await sharp(buf)
          .rotate()
          .resize({
            width: TARGET_MAX_SIDE_PX,
            height: TARGET_MAX_SIDE_PX,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
        buf = next;
        reencodedToJpeg = true;
        if (buf.byteLength <= MAX_BYTES) break;
        quality = Math.max(55, quality - 10);
      }
    } catch {
      // If conversion fails, fall through to size error below.
    }
    if (buf.byteLength > MAX_BYTES) {
      throw new Error("Reference image is too large.");
    }
  }

  const ext = reencodedToJpeg ? ".jpg" : (MIME_EXT[ct] ?? ".jpg");
  const contentType = reencodedToJpeg ? "image/jpeg" : ct;
  const filename = `piapi-seedance/${crypto.randomUUID()}${ext}`;
  const storagePath = `${userId}/${filename}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buf, { contentType, upsert: false });

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
  return publicUrl;
}

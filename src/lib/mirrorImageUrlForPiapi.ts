import { createSupabaseServiceClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "ugc-uploads";
const MAX_BYTES = 20 * 1024 * 1024;

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

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new Error("Reference image is too large.");
  }

  const ext = MIME_EXT[ct] ?? ".jpg";
  const filename = `piapi-seedance/${crypto.randomUUID()}${ext}`;
  const storagePath = `${userId}/${filename}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buf, { contentType: ct, upsert: false });

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
  return publicUrl;
}

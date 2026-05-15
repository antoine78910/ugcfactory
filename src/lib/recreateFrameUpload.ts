import sharp from "sharp";
import { randomUUID } from "crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

const BUCKET = "ugc-uploads";

/**
 * Upload a scene screenshot (PNG/JPEG buffer from ffmpeg) as JPEG for public HTTPS URLs
 * (Claude vision + KIE GPT Image 2 references).
 */
export async function uploadRecreateSceneFrameJpeg(userId: string, imageBuffer: Buffer): Promise<string> {
  const admin = createSupabaseServiceClient();
  if (!admin) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to publish recreate scene frames. Add it to your environment.",
    );
  }
  const jpeg = await sharp(imageBuffer).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const path = `${userId}/recreate-scenes/${randomUUID()}.jpg`;
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

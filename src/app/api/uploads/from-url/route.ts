export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

const IMAGE_BUCKET = "ugc-uploads";
const VIDEO_BUCKET = "studio-media";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;   // 20 MB
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;  // 300 MB

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};

/** Guess extension from URL path when content-type is unreliable. */
function guessExtFromUrl(url: string): string {
  const lower = (url.toLowerCase().split("?")[0] ?? "");
  if (lower.endsWith(".mp4")) return ".mp4";
  if (lower.endsWith(".mov")) return ".mov";
  if (lower.endsWith(".webm")) return ".webm";
  if (lower.endsWith(".png")) return ".png";
  if (lower.endsWith(".webp")) return ".webp";
  if (lower.endsWith(".gif")) return ".gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return ".jpg";
  if (lower.endsWith(".avif")) return ".avif";
  return "";
}

function isVideoExt(ext: string): boolean {
  return ext === ".mp4" || ext === ".mov" || ext === ".webm";
}

export async function POST(req: Request) {
  try {
    const { user, response } = await requireSupabaseUser();
    if (response) return response;

    const body = (await req.json()) as { url?: string };
    const url = (body.url ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 502 });
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(55_000), redirect: "follow" });
    if (!res.ok) {
      return NextResponse.json({ error: `Fetch failed: ${res.status}` }, { status: 502 });
    }

    const rawCt = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const extFromUrl = guessExtFromUrl(url);

    // Determine media kind: prefer content-type, fall back to URL extension
    const isVideo =
      rawCt.startsWith("video/") ||
      (!rawCt.startsWith("image/") && isVideoExt(extFromUrl));
    const isImage =
      !isVideo &&
      (rawCt.startsWith("image/") || (!rawCt.startsWith("video/") && extFromUrl !== "" && !isVideoExt(extFromUrl)));

    if (!isVideo && !isImage) {
      return NextResponse.json({ error: "Not an image or video" }, { status: 400 });
    }

    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: "Empty response" }, { status: 502 });
    }

    // Determine content-type and extension to store
    let storeCt = rawCt;
    let ext = extFromUrl;

    if (!storeCt || storeCt === "application/octet-stream") {
      if (ext === ".mp4") storeCt = "video/mp4";
      else if (ext === ".mov") storeCt = "video/quicktime";
      else if (ext === ".webm") storeCt = "video/webm";
      else if (ext === ".png") storeCt = "image/png";
      else if (ext === ".webp") storeCt = "image/webp";
      else if (ext === ".jpg") storeCt = "image/jpeg";
      else if (ext === ".gif") storeCt = "image/gif";
    }
    if (!ext) {
      ext = MIME_TO_EXT[storeCt] ?? (isVideo ? ".mp4" : ".jpg");
    }

    const filename = `${crypto.randomUUID()}${ext}`;
    const bucket = isVideo ? VIDEO_BUCKET : IMAGE_BUCKET;
    const storagePath = `${user.id}/${filename}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buf, { contentType: storeCt || undefined, upsert: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload from URL failed" },
      { status: 500 },
    );
  }
}

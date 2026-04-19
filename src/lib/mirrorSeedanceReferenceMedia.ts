import { createSupabaseServiceClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "ugc-uploads";
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const FETCH_TIMEOUTS = [45_000, 90_000];

async function mirrorBinaryToSeedanceBucket(
  url: string,
  userId: string,
  opts: {
    /** e.g. piapi-seedance-video */
    folder: string;
    allowedContentTypePrefixes: string[];
    maxBytes: number;
    wrongTypeMessage: string;
  },
): Promise<string> {
  const u = url.trim();
  if (!u || !/^https?:\/\//i.test(u)) {
    throw new Error("Invalid media URL for video.");
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    throw new Error("Storage not configured.");
  }

  let res: Response | undefined;
  for (let attempt = 0; attempt < FETCH_TIMEOUTS.length; attempt++) {
    try {
      res = await fetch(u, {
        redirect: "follow",
        headers: {
          Accept: "*/*",
          "User-Agent": "Mozilla/5.0 (compatible; UGCFactory/1.0)",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUTS[attempt]),
      });
      if (res.ok) break;
    } catch (err) {
      if (attempt < FETCH_TIMEOUTS.length - 1) continue;
      throw err;
    }
  }
  if (!res || !res.ok) {
    throw new Error(`Could not download reference media (HTTP ${res?.status ?? "unknown"}).`);
  }

  const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!opts.allowedContentTypePrefixes.some((p) => ct.startsWith(p))) {
    throw new Error(opts.wrongTypeMessage);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > opts.maxBytes) {
    throw new Error("Reference file is too large.");
  }

  const ext =
    ct.includes("quicktime") || ct.includes("mov")
      ? ".mov"
      : ct.includes("webm")
        ? ".webm"
        : ct.includes("wav")
          ? ".wav"
          : ct.includes("mpeg") || ct.includes("mp3")
            ? ".mp3"
            : ".mp4";

  const filename = `${opts.folder}/${crypto.randomUUID()}${ext}`;
  const storagePath = `${userId}/${filename}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buf, { contentType: ct || undefined, upsert: false });

  if (error) {
    throw new Error(error.message);
  }

  const signed = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(data.path, 60 * 60 * 24);
  if (!signed.error && signed.data?.signedUrl) {
    return signed.data.signedUrl;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
  return publicUrl;
}

export async function mirrorVideoUrlForPiapiSeedance(videoUrl: string, userId: string): Promise<string> {
  return mirrorBinaryToSeedanceBucket(videoUrl, userId, {
    folder: "piapi-seedance-video",
    /** PiAPI Seedance 2: mp4, mov (see seedance-2 docs). */
    allowedContentTypePrefixes: ["video/mp4", "video/quicktime"],
    maxBytes: MAX_VIDEO_BYTES,
    wrongTypeMessage: "Reference URL must be a video (MP4 or MOV).",
  });
}

export async function mirrorAudioUrlForPiapiSeedance(audioUrl: string, userId: string): Promise<string> {
  return mirrorBinaryToSeedanceBucket(audioUrl, userId, {
    folder: "piapi-seedance-audio",
    allowedContentTypePrefixes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"],
    maxBytes: MAX_AUDIO_BYTES,
    wrongTypeMessage: "Reference URL must be audio (MP3 or WAV, max ~15s recommended).",
  });
}

import { waitForSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  assertStudioUploadForKind,
  inferStudioUploadKind,
} from "@/lib/studioUploadValidation";

/** Stay under typical Vercel serverless request body limits (~4.5 MB); larger files go direct to Supabase. */
const VERCEL_SAFE_BODY_BYTES = 3.5 * 1024 * 1024;

const BUCKET = "ugc-uploads";

function extFromMime(mime: string): string {
  const m = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
  } as Record<string, string>;
  return m[mime] ?? "";
}

async function uploadViaNextApi(file: File): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  let res: Response;
  try {
    res = await fetch("/api/uploads", { method: "POST", body: fd });
  } catch (e) {
    const isNetwork = e instanceof TypeError && String(e.message).toLowerCase().includes("fetch");
    throw new Error(
      isNetwork
        ? "Upload failed (network). If the file is large, try again, the app may route big uploads directly to storage."
        : e instanceof Error
          ? e.message
          : "Upload failed",
    );
  }
  const raw = await res.text().catch(() => "");
  let json: { url?: string; error?: string } = {};
  if (raw) {
    try {
      json = JSON.parse(raw) as { url?: string; error?: string };
    } catch {
      const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 180);
      throw new Error(
        res.ok
          ? "Upload failed: invalid server response."
          : snippet || `Upload failed (${res.status}).`,
      );
    }
  }
  if (!res.ok || !json.url) throw new Error(json.error || `Upload failed (${res.status})`);
  return json.url;
}

async function uploadViaSupabaseDirect(file: File): Promise<string> {
  const supabase = await waitForSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("File upload is unavailable: Supabase is not configured.");
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) throw new Error("Sign in to upload files.");

  const name = file.name || "upload";
  const dot = name.lastIndexOf(".");
  const mime = file.type || "";
  const ext =
    dot >= 0
      ? name.slice(dot).toLowerCase()
      : extFromMime(mime) ||
        (mime.startsWith("image/") ? ".jpg" : "") ||
        (mime.startsWith("video/") ? ".mp4" : "") ||
        (mime.startsWith("audio/") ? ".mp3" : "");

  const path = `${userData.user.id}/${crypto.randomUUID()}${ext || (mime.startsWith("image/") ? ".jpg" : ".bin")}`;

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return publicUrl;
}

/**
 * Upload a browser `File` to public CDN URL.
 * Large files and videos use Supabase Storage from the browser (bypasses Vercel body limits).
 */
export type UploadFileKind = "image" | "video" | "audio";

export async function uploadFileToCdn(
  file: File,
  opts?: { kind?: UploadFileKind },
): Promise<string> {
  const kind = opts?.kind ?? inferStudioUploadKind(file);
  assertStudioUploadForKind(file, kind);

  const mime = file.type || "";
  const useDirect =
    file.size > VERCEL_SAFE_BODY_BYTES || mime.startsWith("video/") || mime.startsWith("audio/");

  if (useDirect) {
    try {
      return await uploadViaSupabaseDirect(file);
    } catch (err) {
      if (file.size <= VERCEL_SAFE_BODY_BYTES) {
        return uploadViaNextApi(file);
      }
      throw err instanceof Error ? err : new Error("Upload failed");
    }
  }

  return uploadViaNextApi(file);
}

/** Upload from a `blob:` preview URL (e.g. motion reference video) to a public HTTPS URL. */
export async function uploadBlobUrlToCdn(
  blobUrl: string,
  filename: string,
  fallbackMime: string,
  opts?: { kind?: UploadFileKind },
): Promise<string> {
  let blob: Blob;
  try {
    const resFetch = await fetch(blobUrl);
    blob = await resFetch.blob();
  } catch (e) {
    const isNetwork = e instanceof TypeError && String(e.message).toLowerCase().includes("fetch");
    throw new Error(isNetwork ? "Could not read the local file preview (try re-selecting the file)." : "Could not read file");
  }
  const type = blob.type || fallbackMime;
  const file = new File([blob], filename, { type });
  return uploadFileToCdn(file, opts);
}

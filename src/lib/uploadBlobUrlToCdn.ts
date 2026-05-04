import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseBrowserClient,
  peekSupabaseBrowserSingleton,
  waitForSupabaseBrowserClient,
} from "@/lib/supabase/client";
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

const UPLOAD_NEXT_API_TIMEOUT_MS = 120_000;
const UPLOAD_SUPABASE_TIMEOUT_MS = 120_000;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let done = false;
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(message));
    }, ms);
    p.then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(id);
        resolve(v);
      },
      (err) => {
        if (done) return;
        done = true;
        clearTimeout(id);
        reject(err);
      },
    );
  });
}

async function uploadViaNextApi(file: File): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPLOAD_NEXT_API_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("/api/uploads", { method: "POST", body: fd, signal: ac.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    const isNetwork = e instanceof TypeError && String(e.message).toLowerCase().includes("fetch");
    throw new Error(
      aborted
        ? "Upload timed out. Try a smaller image or check your connection."
        : isNetwork
          ? "Upload failed (network). If the file is large, try again, the app may route big uploads directly to storage."
          : e instanceof Error
            ? e.message
            : "Upload failed",
    );
  } finally {
    clearTimeout(timer);
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

async function uploadViaSupabaseDirectWithClient(supabase: SupabaseClient, file: File): Promise<string> {
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

  const { data, error } = await withTimeout(
    supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    }),
    UPLOAD_SUPABASE_TIMEOUT_MS,
    "Upload timed out. Try a smaller image or check your connection.",
  );
  if (error) throw new Error(error.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return publicUrl;
}

async function uploadViaSupabaseDirect(file: File): Promise<string> {
  const supabase = await waitForSupabaseBrowserClient(8000);
  if (!supabase) {
    throw new Error("File upload is unavailable: Supabase is not configured.");
  }
  return uploadViaSupabaseDirectWithClient(supabase, file);
}

/** When the browser Supabase client is ready, upload straight to Storage (avoids Vercel hop for images). */
async function tryBrowserDirectImageUpload(file: File): Promise<string | null> {
  let client = peekSupabaseBrowserSingleton() ?? createSupabaseBrowserClient();
  if (!client) {
    client = await waitForSupabaseBrowserClient(5000);
  }
  if (!client) return null;
  try {
    return await uploadViaSupabaseDirectWithClient(client, file);
  } catch {
    return null;
  }
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
  // Reference images: prefer browser → Supabase Storage (faster than browser → Vercel → Storage).
  if (kind === "image") {
    const directUrl = await tryBrowserDirectImageUpload(file);
    if (directUrl) return directUrl;
  }

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

/**
 * Decode a `data:[<mime>][;base64],<payload>` URL straight to a Blob.
 *
 * Avoids the `fetch(dataUrl)` path, which throws TypeError under strict CSP, in
 * some Chromium extensions, and on very large payloads (e.g. extracted video
 * frames piped from one video generator into the next).
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid data URL.");
  const meta = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const isBase64 = /;base64$/i.test(meta);
  const mime = (isBase64 ? meta.replace(/;base64$/i, "") : meta).trim() || "application/octet-stream";
  if (isBase64) {
    const bin = atob(payload);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

/** Upload from a `blob:` or `data:` preview URL (e.g. motion reference video, extracted frame) to a public HTTPS URL. */
export async function uploadBlobUrlToCdn(
  blobUrl: string,
  filename: string,
  fallbackMime: string,
  opts?: { kind?: UploadFileKind },
): Promise<string> {
  let blob: Blob;
  if (blobUrl.startsWith("data:")) {
    try {
      blob = dataUrlToBlob(blobUrl);
    } catch {
      throw new Error("Could not decode the captured frame. Re-extract the start/end image and try again.");
    }
  } else {
    try {
      const resFetch = await fetch(blobUrl);
      blob = await resFetch.blob();
    } catch (e) {
      const isNetwork = e instanceof TypeError && String(e.message).toLowerCase().includes("fetch");
      throw new Error(isNetwork ? "Could not read the local file preview (try re-selecting the file)." : "Could not read file");
    }
  }
  const type = blob.type || fallbackMime;
  const file = new File([blob], filename, { type });
  return uploadFileToCdn(file, opts);
}

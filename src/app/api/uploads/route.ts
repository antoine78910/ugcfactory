export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { getAppUrl } from "@/lib/env";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { assertGenericMultipartUpload } from "@/lib/studioUploadValidation";

const STORAGE_BUCKET = "ugc-uploads";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export async function POST(req: Request) {
  try {
    const { user, response } = await requireSupabaseUser();
    if (response) return response;

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing `file` in multipart form data." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum is 100MB.` },
        { status: 413 },
      );
    }

    try {
      assertGenericMultipartUpload(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unsupported file format.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const extFromName = (() => {
      const name = file.name || "";
      const i = name.lastIndexOf(".");
      if (i === -1) return "";
      const ext = name.slice(i).toLowerCase();
      if (!/^\.[a-z0-9]+$/.test(ext)) return "";
      return ext;
    })();

    const extFromType = (() => {
      const map: Record<string, string> = {
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
      };
      return map[file.type] ?? "";
    })();

    const ext =
      extFromName ||
      extFromType ||
      ((file.type || "").startsWith("image/") ? ".jpg" : "") ||
      ((file.type || "").startsWith("video/") ? ".mp4" : "") ||
      ((file.type || "").startsWith("audio/") ? ".mp3" : "");
    const filename = `${crypto.randomUUID()}${ext}`;

    const supabaseAdmin = createSupabaseServiceClient();
    if (supabaseAdmin) {
      const storagePath = `${user.id}/${filename}`;
      const { data, error } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.type || undefined,
          upsert: false,
        });
      if (error) {
        return NextResponse.json(
          {
            error:
              error.message === "Bucket not found"
                ? "Create a public « ugc-uploads » bucket in Supabase (Storage)."
                : error.message,
          },
          { status: 502 },
        );
      }
      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
      return NextResponse.json({
        url: publicUrl,
        filename: data.path,
        contentType: file.type,
        size: file.size,
      });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const baseUrl = getAppUrl();
    const url = `${baseUrl}/uploads/${filename}`;

    return NextResponse.json({
      url,
      filename,
      contentType: file.type,
      size: file.size,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    const isFsError = /EACCES|EPERM|READONLY|ENOENT|EROFS/i.test(msg);
    const error = isFsError
      ? "Upload failed on this host (disk not writable). Add SUPABASE_SERVICE_ROLE_KEY and an « ugc-uploads » bucket (Supabase Storage), or run locally."
      : msg;
    return NextResponse.json({ error }, { status: 502 });
  }
}


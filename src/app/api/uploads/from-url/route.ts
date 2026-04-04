export const runtime = "nodejs";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "ugc-uploads";
const MAX_BYTES = 20 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

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

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      return NextResponse.json({ error: `Fetch failed: ${res.status}` }, { status: 502 });
    }

    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ct.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image" }, { status: 400 });
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const ext = MIME_EXT[ct] ?? ".jpg";
    const filename = `${crypto.randomUUID()}${ext}`;
    const storagePath = `${user.id}/${filename}`;

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buf, { contentType: ct, upsert: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);
    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload from URL failed" },
      { status: 500 },
    );
  }
}

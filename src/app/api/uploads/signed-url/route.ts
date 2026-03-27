export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";

const STORAGE_BUCKET = "ugc-uploads";

type Body = {
  filename: string;
  contentType: string;
};

export async function POST(req: Request) {
  try {
    const { user, response } = await requireSupabaseUser();
    if (response) return response;

    const body = (await req.json()) as Body;
    const ext = (body.filename ?? "").replace(/^.*\./, ".").toLowerCase() || ".mp4";
    const contentType = body.contentType || "video/mp4";
    const storagePath = `${user.id}/${crypto.randomUUID()}${ext}`;

    const admin = createSupabaseServiceClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Server storage not configured (SUPABASE_SERVICE_ROLE_KEY missing)." },
        { status: 500 },
      );
    }

    const { data, error } = await admin.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message === "Bucket not found"
              ? `Create a public bucket "${STORAGE_BUCKET}" in Supabase Storage.`
              : error.message,
        },
        { status: 502 },
      );
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: storagePath,
      publicUrl,
      contentType,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create signed upload URL";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

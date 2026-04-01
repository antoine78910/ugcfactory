export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { isStudioGenerationRowId } from "@/lib/studioGenerationRowId";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { STUDIO_MEDIA_BUCKET, studioMediaObjectPathFromPublicUrl } from "@/lib/studioGenerationsMedia";

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { supabase, user, response } = await requireSupabaseUser();
  if (response) return response;

  const { id: raw } = await ctx.params;
  const id = String(raw ?? "").trim();
  if (!id || !isStudioGenerationRowId(id)) {
    return NextResponse.json({ error: "Invalid generation id." }, { status: 400 });
  }

  // Load row first (RLS: only the owner can read/delete).
  const { data: row, error: rowErr } = await supabase
    .from("studio_generations")
    .select("id, user_id, result_urls")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 502 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Best-effort: delete Supabase Storage objects for this row.
  const admin = createSupabaseServiceClient();
  if (admin) {
    const paths = new Set<string>();
    for (const u of (row.result_urls as unknown as string[] | null) ?? []) {
      const p = studioMediaObjectPathFromPublicUrl(String(u ?? "").trim());
      if (p) paths.add(p);
    }

    // Also remove everything under `${userId}/${rowId}/` to cover non-URL artifacts.
    const prefix = `${user.id}/${id}`;
    try {
      // Supabase Storage list isn't recursive; list the direct folder and remove items.
      const { data: listed, error: listErr } = await admin.storage.from(STUDIO_MEDIA_BUCKET).list(prefix, {
        limit: 1000,
      });
      if (!listErr && Array.isArray(listed)) {
        for (const item of listed) {
          if (!item?.name) continue;
          paths.add(`${prefix}/${item.name}`);
        }
      }
    } catch {
      /* ignore */
    }

    if (paths.size > 0) {
      try {
        await admin.storage.from(STUDIO_MEDIA_BUCKET).remove([...paths]);
      } catch {
        /* ignore */
      }
    }
  }

  const { data, error } = await supabase
    .from("studio_generations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  if (!data?.length) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}

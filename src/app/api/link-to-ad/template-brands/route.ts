export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { isLtaTemplateRecordingUser } from "@/lib/ltaTemplateRecordingAccess";
import { resolveAuthUserEmail } from "@/lib/sessionUserEmail";
import { readUniverseFromExtracted } from "@/lib/linkToAdUniverse";
import type { LtaTemplateBrandSummary } from "@/lib/ltaTemplateRecording";

function thumbFromExtracted(extracted: unknown, selectedImageUrl: string | null): string | null {
  const snap = readUniverseFromExtracted(extracted);
  if (!snap) return selectedImageUrl;
  const fromProduct =
    (Array.isArray(snap.productOnlyImageUrls) ? snap.productOnlyImageUrls[0] : null) ??
    snap.cleanCandidate?.url ??
    snap.fallbackImageUrl ??
    snap.neutralUploadUrl ??
    snap.nanoBananaImageUrl ??
    null;
  return fromProduct ?? selectedImageUrl;
}

export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const admin = createSupabaseServiceClient();
  const email = await resolveAuthUserEmail(auth.user, admin);
  if (!(await isLtaTemplateRecordingUser(email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const brands: LtaTemplateBrandSummary[] = [];
  const seenRunIds = new Set<string>();

  if (admin) {
    try {
      const { data: rows, error } = await admin
        .from("lta_template_brands")
        .select("run_id, normalized_url, store_url, title, thumb_url")
        .order("created_at", { ascending: false })
        .limit(80);
      if (!error && rows) {
        for (const row of rows) {
          const runId = typeof row.run_id === "string" ? row.run_id : "";
          if (!runId || seenRunIds.has(runId)) continue;
          seenRunIds.add(runId);
          brands.push({
            runId,
            normalizedUrl: String(row.normalized_url ?? "").trim(),
            storeUrl: String(row.store_url ?? "").trim(),
            title: typeof row.title === "string" ? row.title : null,
            thumbUrl: typeof row.thumb_url === "string" ? row.thumb_url : null,
          });
        }
      }
    } catch {
      /* table may not exist yet */
    }

    // Fallback: current user's completed Link to Ad runs (until templates are synced from My Projects).
    if (brands.length === 0) {
      try {
        const { data: runs, error: runsErr } = await admin
          .from("ugc_runs")
          .select("id, store_url, title, selected_image_url, extracted, video_url, updated_at")
          .eq("user_id", auth.user.id)
          .order("updated_at", { ascending: false })
          .limit(80);
        if (!runsErr && runs) {
          for (const r of runs) {
            const runId = typeof r.id === "string" ? r.id : "";
            if (!runId || seenRunIds.has(runId)) continue;
            const snap = readUniverseFromExtracted(r.extracted);
            if (!snap) continue;
            const hasVideo =
              Boolean(typeof r.video_url === "string" && r.video_url.trim()) ||
              Boolean(snap.klingVideoUrl?.trim()) ||
              Boolean(
                snap.klingByReferenceIndex?.some(
                  (slot) => typeof slot?.videoUrl === "string" && slot.videoUrl.trim(),
                ),
              );
            if (!hasVideo) continue;
            seenRunIds.add(runId);
            const storeUrl = typeof r.store_url === "string" ? r.store_url.trim() : "";
            if (!storeUrl) continue;
            brands.push({
              runId,
              normalizedUrl: storeUrl.toLowerCase(),
              storeUrl,
              title: typeof r.title === "string" ? r.title : null,
              thumbUrl: thumbFromExtracted(r.extracted, r.selected_image_url ?? null),
            });
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  return NextResponse.json({ brands });
}

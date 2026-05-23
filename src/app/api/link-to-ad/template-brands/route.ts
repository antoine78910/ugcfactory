export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import type { LtaTemplateBrandSummary } from "@/lib/ltaTemplateRecording";

/** Shared catalog: every project marked Template in My Projects (any user). */
export async function GET() {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;

  const admin = createSupabaseServiceClient();

  const brands: LtaTemplateBrandSummary[] = [];
  const seenNormalizedUrls = new Set<string>();

  if (admin) {
    try {
      const { data: rows, error } = await admin
        .from("lta_template_brands")
        .select("run_id, normalized_url, store_url, title, thumb_url")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error && rows) {
        for (const row of rows) {
          const runId = typeof row.run_id === "string" ? row.run_id : "";
          const normalizedUrl = String(row.normalized_url ?? "").trim().toLowerCase();
          const storeUrl = String(row.store_url ?? "").trim();
          if (!runId || !normalizedUrl || !storeUrl || seenNormalizedUrls.has(normalizedUrl)) {
            continue;
          }
          seenNormalizedUrls.add(normalizedUrl);
          brands.push({
            runId,
            normalizedUrl,
            storeUrl,
            title: typeof row.title === "string" ? row.title : null,
            thumbUrl: typeof row.thumb_url === "string" ? row.thumb_url : null,
          });
        }
      }
    } catch {
      /* table may not exist yet */
    }
  }

  return NextResponse.json({ brands });
}

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";

function deriveAppEndpoint(row: Record<string, unknown>): string {
  const kind = String(row.kind ?? "").trim().toLowerCase();
  // Prefer kind-based mapping (most reliable).
  if (kind === "studio_audio") return "/api/elevenlabs/speech-to-speech";
  if (kind === "studio_translate_video") return "/api/wavespeed/video-translate";
  if (kind === "motion_control") return "/api/kling/motion-control";
  if (
    kind === "studio_video" ||
    kind === "workflow_video" ||
    kind === "studio_watermark" ||
    kind === "link_to_ad_video"
  ) {
    return "/api/kling/generate";
  }
  if (kind === "link_to_ad_image") return "/api/nanobanana/generate";
  if (kind === "studio_image" || kind === "workflow_image" || kind === "avatar") {
    return "/api/studio/generations/start";
  }
  if (kind === "studio_upscale") return "/api/kie/upscale";
  return "-";
}

export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPage = Math.min(100, Math.max(10, Number(url.searchParams.get("per_page")) || 50));
  const kind = url.searchParams.get("kind") || null;
  const status = url.searchParams.get("status") || null;
  const userId = url.searchParams.get("user_id") || null;
  const search = url.searchParams.get("q")?.trim() || null;

  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = admin
    .from("studio_generations")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (kind) query = query.eq("kind", kind);
  if (status) query = query.eq("status", status);
  if (userId) query = query.eq("user_id", userId);
  if (search) query = query.or(`label.ilike.%${search}%,external_task_id.ilike.%${search}%`);

  const { data: rows, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Collect unique user_ids and fetch emails
  const userIds = [...new Set((rows ?? []).map((r: Record<string, unknown>) => r.user_id as string))];
  const emailMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (users?.users) {
      for (const u of users.users) {
        if (userIds.includes(u.id)) {
          emailMap[u.id] = u.email ?? u.id;
        }
      }
    }
  }

  return NextResponse.json({
    rows: (rows ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      app_endpoint: deriveAppEndpoint(r),
    })),
    emailMap,
    total: count ?? 0,
    page,
    perPage,
  });
}

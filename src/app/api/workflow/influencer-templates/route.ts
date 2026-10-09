import { NextResponse } from "next/server";

import type { WorkflowProjectStateV1 } from "@/app/workflow/workflowProjectStorage";
import { CREATOR_PRODUCT_TEMPLATES } from "@/lib/creatorProductTemplates";
import { isInfluencerAccount } from "@/lib/influencerAccounts";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Master canvas duplicated on every Access template click. */
const STATIC_AD_WORKFLOW_NAME = "Static Ads";

function isProjectState(value: unknown): value is WorkflowProjectStateV1 {
  if (!value || typeof value !== "object") return false;
  const state = value as WorkflowProjectStateV1;
  return state.v === 1 && Array.isArray(state.pages) && state.pages.some((page) => Array.isArray(page.nodes));
}

function nodeCount(state: WorkflowProjectStateV1): number {
  return state.pages.reduce((sum, page) => sum + (Array.isArray(page.nodes) ? page.nodes.length : 0), 0);
}

export async function POST(req: Request) {
  const auth = await requireSupabaseUser();
  if (auth.response) return auth.response;
  if (!isInfluencerAccount(auth.user)) {
    return NextResponse.json({ error: "Influencer account required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const templateId = typeof (body as { templateId?: unknown }).templateId === "string"
    ? (body as { templateId: string }).templateId.trim()
    : "";
  const template = CREATOR_PRODUCT_TEMPLATES.find((item) => item.id === templateId);
  if (!template) {
    return NextResponse.json({ error: "Unknown template." }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  const { data: sources, error: sourceErr } = await admin
    .from("workflow_spaces")
    .select("state, preview_data_url, updated_at")
    .eq("name", STATIC_AD_WORKFLOW_NAME)
    .order("updated_at", { ascending: false })
    .limit(8);
  if (sourceErr) {
    return NextResponse.json({ error: sourceErr.message }, { status: 500 });
  }

  const source = (sources ?? [])
    .map((row) => ({
      state: row.state,
      preview: typeof row.preview_data_url === "string" ? row.preview_data_url : null,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    }))
    .filter((row): row is { state: WorkflowProjectStateV1; preview: string | null; updatedAt: string } =>
      isProjectState(row.state),
    )
    .sort((a, b) => nodeCount(b.state) - nodeCount(a.state) || b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!source || nodeCount(source.state) < 2) {
    return NextResponse.json({ error: "Static ad workflow was not found." }, { status: 404 });
  }

  const state = JSON.parse(JSON.stringify(source.state)) as WorkflowProjectStateV1;
  state.onboardingDismissed = true;

  const spaceId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const { error: insertErr } = await admin.from("workflow_spaces").insert({
    id: spaceId,
    name: `${template.name} static ad`,
    state,
    preview_data_url: source.preview,
    created_by: auth.user.id,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { error: ownerErr } = await admin.from("workflow_space_collaborators").insert({
    space_id: spaceId,
    user_id: auth.user.id,
    role: "owner",
  });
  if (ownerErr) {
    await admin.from("workflow_spaces").delete().eq("id", spaceId);
    return NextResponse.json({ error: ownerErr.message }, { status: 500 });
  }

  return NextResponse.json({ spaceId, created: true });
}

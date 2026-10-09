import { NextResponse } from "next/server";

import {
  duplicateWorkflowPage,
  type WorkflowFlowPage,
  type WorkflowProjectStateV1,
} from "@/app/workflow/workflowProjectStorage";
import { CREATOR_PRODUCT_TEMPLATES } from "@/lib/creatorProductTemplates";
import { isInfluencerAccount } from "@/lib/influencerAccounts";
import { STATIC_AD_WORKFLOW_NAME, staticAdPageId } from "@/lib/staticAdWorkflow";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProjectState(value: unknown): value is WorkflowProjectStateV1 {
  if (!value || typeof value !== "object") return false;
  const state = value as WorkflowProjectStateV1;
  return state.v === 1 && Array.isArray(state.pages) && state.pages.some((page) => Array.isArray(page.nodes));
}

function nodeCount(state: WorkflowProjectStateV1): number {
  return state.pages.reduce((sum, page) => sum + (Array.isArray(page.nodes) ? page.nodes.length : 0), 0);
}

function richestPage(state: WorkflowProjectStateV1): WorkflowFlowPage | null {
  const pages = state.pages.filter((page) => Array.isArray(page.nodes));
  if (!pages.length) return null;
  return [...pages].sort((a, b) => b.nodes.length - a.nodes.length)[0] ?? null;
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
    .select("id, state, updated_at")
    .eq("name", STATIC_AD_WORKFLOW_NAME)
    .order("updated_at", { ascending: false })
    .limit(8);
  if (sourceErr) {
    return NextResponse.json({ error: sourceErr.message }, { status: 500 });
  }

  const source = (sources ?? [])
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : "",
      state: row.state,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    }))
    .filter((row): row is { id: string; state: WorkflowProjectStateV1; updatedAt: string } =>
      Boolean(row.id) && isProjectState(row.state),
    )
    .sort((a, b) => nodeCount(b.state) - nodeCount(a.state) || b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!source || nodeCount(source.state) < 2) {
    return NextResponse.json({ error: "Static ad workflow was not found." }, { status: 404 });
  }

  const pageId = staticAdPageId(template.id);
  const state = JSON.parse(JSON.stringify(source.state)) as WorkflowProjectStateV1;
  const existing = state.pages.find((page) => page.id === pageId);
  let created = false;
  if (!existing) {
    const canvas = richestPage(state);
    if (!canvas || canvas.nodes.length < 2) {
      return NextResponse.json({ error: "Static ad workflow was not found." }, { status: 404 });
    }
    const duplicated = duplicateWorkflowPage(canvas);
    const page: WorkflowFlowPage = { ...duplicated, id: pageId, name: template.name };
    const index = state.pages.findIndex((item) => item.id === canvas.id);
    const at = index >= 0 ? index + 1 : state.pages.length;
    state.pages = [...state.pages.slice(0, at), page, ...state.pages.slice(at)];
    created = true;

    const { error: updateErr } = await admin
      .from("workflow_spaces")
      .update({ state, updated_at: new Date().toISOString() })
      .eq("id", source.id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  const { data: membership } = await admin
    .from("workflow_space_collaborators")
    .select("role")
    .eq("space_id", source.id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!membership) {
    const { error: collabErr } = await admin.from("workflow_space_collaborators").insert({
      space_id: source.id,
      user_id: auth.user.id,
      role: "editor",
    });
    if (collabErr) {
      return NextResponse.json({ error: collabErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ spaceId: source.id, pageId, created });
}

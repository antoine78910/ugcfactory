import { NextResponse } from "next/server";

import { buildAdAssetNode } from "@/app/workflow/workflowNodeFactory";
import type { WorkflowProjectStateV1 } from "@/app/workflow/workflowProjectStorage";
import { CREATOR_PRODUCT_TEMPLATES, type CreatorProductTemplate } from "@/lib/creatorProductTemplates";
import { isInfluencerAccount } from "@/lib/influencerAccounts";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A blank static-ad node. The influencer edits it after the clone. */
function starterProject(template: CreatorProductTemplate, spaceId: string): WorkflowProjectStateV1 {
  const pageId = `influencer-tpl-page-${spaceId}`;
  const ad = buildAdAssetNode("image", { x: 280, y: 180 }, { label: `${template.name} static ad` });
  ad.id = `influencer-tpl-ad-${spaceId}`;
  return {
    v: 1,
    onboardingDismissed: true,
    activePageId: pageId,
    pages: [
      {
        id: pageId,
        name: template.name,
        nodes: [ad],
        edges: [],
      },
    ],
  };
}

/**
 * Create a new influencer workflow from one static-ad product template.
 * Every click inserts a new space owned by the caller. Previous copies stay untouched.
 */
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

  const spaceId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const { error: insertErr } = await admin.from("workflow_spaces").insert({
    id: spaceId,
    name: `${template.name} static ad`,
    state: starterProject(template, spaceId),
    preview_data_url: template.imageUrl,
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

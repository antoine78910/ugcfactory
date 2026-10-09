import { NextResponse } from "next/server";

import { buildAdAssetNode, buildImageRefNode } from "@/app/workflow/workflowNodeFactory";
import type { WorkflowProjectStateV1 } from "@/app/workflow/workflowProjectStorage";
import { CREATOR_PRODUCT_TEMPLATES, type CreatorProductTemplate } from "@/lib/creatorProductTemplates";
import { isInfluencerAccount } from "@/lib/influencerAccounts";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A fresh static-ad workflow for this click. Each open gets its own space. */
function starterProject(template: CreatorProductTemplate, spaceId: string): WorkflowProjectStateV1 {
  const pageId = `influencer-tpl-page-${spaceId}`;
  const product = buildImageRefNode(
    { x: 48, y: 180 },
    {
      label: template.name,
      imageUrl: template.imageUrl,
      source: "upload",
      mediaKind: "image",
    },
  );
  product.id = `influencer-tpl-product-${spaceId}`;
  const ad = buildAdAssetNode("image", {
    x: 460,
    y: 150,
    label: `${template.name} static ad`,
    prompt: `Static ad for ${template.name}. Use the product photo. Product page: ${template.productUrl}`,
  });
  ad.id = `influencer-tpl-ad-${spaceId}`;
  return {
    v: 1,
    onboardingDismissed: true,
    activePageId: pageId,
    pages: [
      {
        id: pageId,
        name: template.name,
        nodes: [product, ad],
        edges: [
          {
            id: `influencer-tpl-edge-${spaceId}`,
            source: product.id,
            sourceHandle: "out",
            target: ad.id,
            targetHandle: "in",
            style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
          },
        ],
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

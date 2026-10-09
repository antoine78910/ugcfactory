import { NextResponse } from "next/server";

import { buildAdAssetNode, buildImageRefNode } from "@/app/workflow/workflowNodeFactory";
import type { WorkflowProjectStateV1 } from "@/app/workflow/workflowProjectStorage";
import { CREATOR_PRODUCT_TEMPLATES, type CreatorProductTemplate } from "@/lib/creatorProductTemplates";
import { isInfluencerAccount } from "@/lib/influencerAccounts";
import { createSupabaseServiceClient } from "@/lib/supabase/admin";
import { requireSupabaseUser } from "@/lib/supabase/requireUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function spaceIdForTemplate(templateId: string) {
  return `influencer-template-${templateId}`;
}

/** One shared static-ad workflow per product. Created once, then reused. */
function starterProject(template: CreatorProductTemplate): WorkflowProjectStateV1 {
  const pageId = `influencer-tpl-page-${template.id}`;
  const product = buildImageRefNode(
    { x: 48, y: 180 },
    {
      label: template.name,
      imageUrl: template.imageUrl,
      source: "upload",
      mediaKind: "image",
    },
  );
  product.id = `influencer-tpl-product-${template.id}`;
  const ad = buildAdAssetNode("image", {
    x: 460,
    y: 150,
    label: `${template.name} static ad`,
    prompt: `Static ad for ${template.name}. Use the product photo. Product page: ${template.productUrl}`,
  });
  ad.id = `influencer-tpl-ad-${template.id}`;
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
            id: `influencer-tpl-edge-${template.id}`,
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

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "23505" || (error.message ?? "").toLowerCase().includes("duplicate");
}

/**
 * Open the shared influencer workflow for one product template.
 * The first request creates the duplicate. Later clicks reuse that same space.
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

  const spaceId = spaceIdForTemplate(template.id);
  const { data: existing } = await admin.from("workflow_spaces").select("id").eq("id", spaceId).maybeSingle();

  if (!existing) {
    const nowIso = new Date().toISOString();
    const { error: insertErr } = await admin.from("workflow_spaces").insert({
      id: spaceId,
      name: template.name,
      state: starterProject(template),
      preview_data_url: template.imageUrl,
      created_by: auth.user.id,
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (insertErr && !isUniqueViolation(insertErr)) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    if (!insertErr) {
      const { error: ownerErr } = await admin.from("workflow_space_collaborators").insert({
        space_id: spaceId,
        user_id: auth.user.id,
        role: "owner",
      });
      if (ownerErr && !isUniqueViolation(ownerErr)) {
        return NextResponse.json({ error: ownerErr.message }, { status: 500 });
      }
      return NextResponse.json({ spaceId, created: true });
    }
  }

  const { error: memberErr } = await admin.from("workflow_space_collaborators").upsert(
    {
      space_id: spaceId,
      user_id: auth.user.id,
      role: "editor",
    },
    { onConflict: "space_id,user_id", ignoreDuplicates: true },
  );
  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  return NextResponse.json({ spaceId, created: false });
}

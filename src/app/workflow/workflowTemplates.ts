import type { Edge } from "@xyflow/react";

import { buildAdAssetNode } from "./workflowNodeFactory";
import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";

export type WorkflowTemplateMeta = {
  id: string;
  name: string;
  /** Short line for cards on the landing page */
  blurb: string;
};

export const WORKFLOW_TEMPLATE_LIST: WorkflowTemplateMeta[] = [
  {
    id: "ugc-pipeline",
    name: "UGC content pipeline",
    blurb: "Image → video → variation, wired and ready to customize.",
  },
  {
    id: "dual-hook-video",
    name: "Dual hook to video",
    blurb: "Two image directions feeding one UGC-style clip.",
  },
];

const edgeStyle = { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 };

function makeEdge(source: string, target: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    sourceHandle: "out",
    target,
    targetHandle: "in",
    style: edgeStyle,
  };
}

function buildUgcPipeline(): WorkflowProjectStateV1 {
  const pageId = "tpl-page-ugc";
  const img = buildAdAssetNode("image", { x: 48, y: 160 });
  img.data = {
    ...img.data,
    label: "Product still",
    prompt: "Premium product flat lay, soft daylight, minimal props.",
  };
  const vid = buildAdAssetNode("video", { x: 400, y: 140 });
  vid.data = {
    ...vid.data,
    label: "UGC clip",
    prompt: "Casual creator-style walkthrough, natural voiceover energy, 9:16.",
  };
  const varn = buildAdAssetNode("variation", { x: 752, y: 168 });
  varn.data = {
    ...varn.data,
    label: "Ad variation",
    prompt: "Bold hook line + social proof overlay; keep brand colors.",
  };
  return {
    v: 1,
    onboardingDismissed: true,
    activePageId: pageId,
    pages: [
      {
        id: pageId,
        name: "Pipeline",
        nodes: [img, vid, varn],
        edges: [makeEdge(img.id, vid.id), makeEdge(vid.id, varn.id)],
      },
    ],
  };
}

function buildDualHook(): WorkflowProjectStateV1 {
  const pageId = "tpl-page-dual";
  const a = buildAdAssetNode("image", { x: 40, y: 80 });
  a.data = {
    ...a.data,
    label: "Hook A — problem",
    prompt: "Close-up frustration moment, cool tones, thumb-stopping.",
  };
  const b = buildAdAssetNode("image", { x: 40, y: 320 });
  b.data = {
    ...b.data,
    label: "Hook B — desire",
    prompt: "Aspirational lifestyle shot, warm light, product visible.",
  };
  const v = buildAdAssetNode("video", { x: 420, y: 200 });
  v.data = {
    ...v.data,
    label: "UGC mashup",
    prompt: "Merge both angles into one punchy 9:16 story.",
  };
  return {
    v: 1,
    onboardingDismissed: true,
    activePageId: pageId,
    pages: [
      {
        id: pageId,
        name: "Launch",
        nodes: [a, b, v],
        edges: [makeEdge(a.id, v.id), makeEdge(b.id, v.id)],
      },
    ],
  };
}

const builders: Record<string, () => WorkflowProjectStateV1> = {
  "ugc-pipeline": buildUgcPipeline,
  "dual-hook-video": buildDualHook,
};

export function getWorkflowTemplateMeta(id: string): WorkflowTemplateMeta | undefined {
  return WORKFLOW_TEMPLATE_LIST.find((t) => t.id === id);
}

/** Fresh project graph (new node ids each call). */
export function buildTemplateProject(templateId: string): WorkflowProjectStateV1 | null {
  const fn = builders[templateId];
  if (!fn) return null;
  return fn();
}

export function cloneTemplateProjectForNewSpace(templateId: string): WorkflowProjectStateV1 | null {
  const p = buildTemplateProject(templateId);
  if (!p) return null;
  return structuredClone(p);
}

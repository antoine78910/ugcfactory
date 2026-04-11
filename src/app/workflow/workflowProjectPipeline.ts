import type { Edge, XYPosition } from "@xyflow/react";

import { buildAdAssetNode } from "./workflowNodeFactory";
import type { WorkflowCanvasNode } from "./workflowFlowTypes";

const EDGE_STYLE = { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 };

function makeEdge(source: string, target: string): Edge {
  return {
    id: `e-proj-${source.slice(0, 8)}-${target.slice(0, 8)}-${crypto.randomUUID().slice(0, 6)}`,
    source,
    sourceHandle: "out",
    target,
    targetHandle: "in",
    style: EDGE_STYLE,
  };
}

/**
 * Full campaign branch: product + persona → brand brief → three angles → image prompts → images → video prompt → video.
 * `origin` is usually the viewport center in flow coordinates so the graph lands where the user is looking.
 */
export function buildWorkflowProjectPipeline(origin: XYPosition): {
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
} {
  const ox = origin.x - 920;
  const oy = origin.y - 120;

  const nodes: WorkflowCanvasNode[] = [];
  const edges: Edge[] = [];

  const product = buildAdAssetNode(
    "image",
    { x: ox, y: oy },
    {
      label: "Product image",
      prompt: "Key product shots, packaging, and label details to keep on-brand.",
    },
  );
  const persona = buildAdAssetNode(
    "variation",
    { x: ox, y: oy + 220 },
    {
      label: "Persona / avatar",
      prompt: "Optional: creator persona, tone, and avatar or reference face if you use one.",
    },
  );
  const brief = buildAdAssetNode(
    "variation",
    { x: ox + 300, y: oy + 110 },
    {
      label: "Brand brief",
      prompt: "Brand voice, promise, audience, offer, and what success looks like for this campaign.",
    },
  );
  nodes.push(product, persona, brief);
  edges.push(makeEdge(product.id, brief.id), makeEdge(persona.id, brief.id));

  const angleDefs = [
    { label: "Angle A", y: oy - 40, hint: "First hook or story beat to test (problem, desire, or proof)." },
    { label: "Angle B", y: oy + 110, hint: "Second creative direction — alternate hook or audience angle." },
    { label: "Angle C", y: oy + 260, hint: "Third direction — social proof, urgency, or lifestyle angle." },
  ] as const;

  const angles: ReturnType<typeof buildAdAssetNode>[] = [];
  for (const a of angleDefs) {
    const node = buildAdAssetNode("variation", { x: ox + 620, y: a.y }, { label: a.label, prompt: a.hint });
    angles.push(node);
    nodes.push(node);
    edges.push(makeEdge(brief.id, node.id));
  }

  const imgPrompts = buildAdAssetNode(
    "variation",
    { x: ox + 960, y: oy + 110 },
    {
      label: "Image prompts",
      prompt: "Prompts for stills that follow the angle you keep for generations (layout, lighting, text overlays).",
    },
  );
  nodes.push(imgPrompts);
  for (const a of angles) {
    edges.push(makeEdge(a.id, imgPrompts.id));
  }

  const images = buildAdAssetNode(
    "image",
    { x: ox + 1280, y: oy + 110 },
    {
      label: "Images",
      prompt: "Generated or picked stills; branch new ideas from here or feed the winner into video.",
    },
  );
  nodes.push(images);
  edges.push(makeEdge(imgPrompts.id, images.id));

  const vidPrompt = buildAdAssetNode(
    "variation",
    { x: ox + 1580, y: oy + 110 },
    {
      label: "Video prompt",
      prompt: "Motion, pacing, hook, VO or captions, and CTA — tied to the image you selected.",
    },
  );
  nodes.push(vidPrompt);
  edges.push(makeEdge(images.id, vidPrompt.id));

  const video = buildAdAssetNode(
    "video",
    { x: ox + 1880, y: oy + 110 },
    {
      label: "Video",
      prompt: "Final clip for this branch — duplicate the pipeline to explore parallel concepts.",
    },
  );
  nodes.push(video);
  edges.push(makeEdge(vidPrompt.id, video.id));

  return { nodes, edges };
}

/** Drag-and-drop payload for the full project graph (see WORKFLOW_NODE_DND). */
export const WORKFLOW_PROJECT_PIPELINE_DND = "project-pipeline";

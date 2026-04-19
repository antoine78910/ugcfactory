import type { Edge, XYPosition } from "@xyflow/react";

import { buildAdAssetNode, buildImageRefNode, buildStickyNoteNode } from "./workflowNodeFactory";
import type { WorkflowCanvasNode } from "./workflowFlowTypes";
import {
  normalizePipelineByAngle,
  parseThreeLabeledPrompts,
  readUniverseFromExtracted,
  splitAllScriptOptions,
  type LinkToAdAnglePipelineV1,
} from "@/lib/linkToAdUniverse";

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
    { label: "Angle B", y: oy + 110, hint: "Second creative direction, alternate hook or audience angle." },
    { label: "Angle C", y: oy + 260, hint: "Third direction, social proof, urgency, or lifestyle angle." },
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
      prompt: "Motion, pacing, hook, VO or captions, and CTA, tied to the image you selected.",
    },
  );
  nodes.push(vidPrompt);
  edges.push(makeEdge(images.id, vidPrompt.id));

  const video = buildAdAssetNode(
    "video",
    { x: ox + 1880, y: oy + 110 },
    {
      label: "Video",
      prompt: "Final clip for this branch, duplicate the pipeline to explore parallel concepts.",
    },
  );
  nodes.push(video);
  edges.push(makeEdge(vidPrompt.id, video.id));

  return { nodes, edges };
}

/** Drag-and-drop payload for the full project graph (see WORKFLOW_NODE_DND). */
export const WORKFLOW_PROJECT_PIPELINE_DND = "project-pipeline";

export type WorkflowRunProjectLike = {
  id: string;
  title?: string | null;
  store_url?: string | null;
  selected_image_url?: string | null;
  packshot_urls?: string[] | null;
  extracted?: unknown;
};

function firstNonEmpty(...vals: Array<string | null | undefined>): string {
  for (const v of vals) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return "";
}

function preferredProductImage(run: WorkflowRunProjectLike): string {
  const selected = firstNonEmpty(run.selected_image_url);
  if (selected) return selected;
  const pack = Array.isArray(run.packshot_urls)
    ? run.packshot_urls.map((u) => (typeof u === "string" ? u.trim() : "")).find(Boolean) || ""
    : "";
  return pack;
}

function angleIndexToUse(pipes: [LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1, LinkToAdAnglePipelineV1], preferred: unknown): 0 | 1 | 2 {
  if (preferred === 0 || preferred === 1 || preferred === 2) return preferred;
  for (let i = 0 as 0 | 1 | 2; i < 3; i = (i + 1) as 0 | 1 | 2) {
    const p = pipes[i];
    if (!p) continue;
    if ((p.nanoBananaImageUrls?.some((u) => typeof u === "string" && u.trim()) ?? false) || (p.ugcVideoPromptGpt ?? "").trim()) {
      return i;
    }
  }
  return 0;
}

/** Build a workflow pipeline prefilled from one Link to Ad project run. */
export function buildWorkflowProjectPipelineFromRun(
  origin: XYPosition,
  run: WorkflowRunProjectLike,
): { nodes: WorkflowCanvasNode[]; edges: Edge[] } {
  const snap = readUniverseFromExtracted(run.extracted);
  if (!snap) return buildWorkflowProjectPipeline(origin);

  const ox = origin.x - 980;
  const oy = origin.y - 120;
  const nodes: WorkflowCanvasNode[] = [];
  const edges: Edge[] = [];
  const pushEdge = (source: string, target: string) => edges.push(makeEdge(source, target));

  const productImageUrl = preferredProductImage(run);
  const scripts = splitAllScriptOptions(snap.scriptsText ?? "");
  const pipes = normalizePipelineByAngle(snap);
  const selectedAngle = angleIndexToUse(pipes, snap.selectedAngleIndex);
  const selectedPipe = pipes[selectedAngle];
  const selectedAngleLabel = firstNonEmpty(
    Array.isArray(snap.angleLabels) ? snap.angleLabels[selectedAngle] : "",
    `Angle ${selectedAngle + 1}`,
  );

  // 1) Angles column (text boxes), vertically.
  const angleNodes: WorkflowCanvasNode[] = [];
  for (let i = 0; i < 3; i++) {
    const n = buildStickyNoteNode({ x: ox, y: oy - 30 + i * 185 });
    const label = firstNonEmpty(Array.isArray(snap.angleLabels) ? snap.angleLabels[i] : "", `Angle ${i + 1}`);
    const script = firstNonEmpty(scripts[i], "No angle script found");
    n.data = {
      ...n.data,
      text: `${label}\n\n${script}`,
      color: i === selectedAngle ? "#e9d5ff" : "#dbeafe",
      size: "medium",
      shape: "rounded",
    };
    angleNodes.push(n);
    nodes.push(n);
  }
  const selectedAngleNode = angleNodes[selectedAngle] ?? angleNodes[0]!;

  // 2) Product image node (uploaded-like reference).
  const product = buildImageRefNode(
    { x: ox + 330, y: oy + 95 },
    {
      label: "Product image",
      imageUrl: productImageUrl || "about:blank",
      source: "upload",
      mediaKind: "image",
    },
  );
  nodes.push(product);
  pushEdge(selectedAngleNode.id, product.id);

  // 3) Three image prompts as text boxes.
  const promptBodies = parseThreeLabeledPrompts(firstNonEmpty(selectedPipe.nanoBananaPromptsRaw, ""));
  const promptNotes: WorkflowCanvasNode[] = [];
  for (let i = 0; i < 3; i++) {
    const p = buildStickyNoteNode({ x: ox + 650, y: oy - 30 + i * 170 });
    p.data = {
      ...p.data,
      text: `Image prompt ${i + 1} (${selectedAngleLabel})\n\n${firstNonEmpty(promptBodies[i], "No prompt found")}`,
      color: "#fef9c3",
      size: "medium",
      shape: "rounded",
    };
    promptNotes.push(p);
    nodes.push(p);
    pushEdge(product.id, p.id);
  }

  // 4) Two Image Generator nodes (not pre-generated).
  const imageGen1 = buildAdAssetNode("image", { x: ox + 990, y: oy + 10 }, {
    label: "Image generator 1",
    prompt: firstNonEmpty(promptBodies[0], "Generate from prompt 1"),
    referencePreviewUrl: productImageUrl || undefined,
    referenceSource: "upload",
    referenceMediaKind: "image",
  });
  const imageGen2 = buildAdAssetNode("image", { x: ox + 990, y: oy + 230 }, {
    label: "Image generator 2",
    prompt: firstNonEmpty(promptBodies[1], "Generate from prompt 2"),
    referencePreviewUrl: productImageUrl || undefined,
    referenceSource: "upload",
    referenceMediaKind: "image",
  });
  nodes.push(imageGen1, imageGen2);
  pushEdge(promptNotes[0]!.id, imageGen1.id);
  pushEdge(promptNotes[1]!.id, imageGen2.id);

  const imageBaseX = ox + 1320;
  const imageY = oy + 40;
  const nanoUrls = Array.isArray(selectedPipe.nanoBananaImageUrls) ? selectedPipe.nanoBananaImageUrls : [];
  const selectedNanoIdx =
    selectedPipe.nanoBananaSelectedImageIndex === 0 ||
    selectedPipe.nanoBananaSelectedImageIndex === 1 ||
    selectedPipe.nanoBananaSelectedImageIndex === 2
      ? selectedPipe.nanoBananaSelectedImageIndex
      : 0;
  const selectedNanoImageUrl = firstNonEmpty(
    nanoUrls[selectedNanoIdx],
    selectedPipe.nanoBananaImageUrl,
    nanoUrls[0],
    productImageUrl,
  );

  // 5) Selected Nano image node for video.
  const selectedNano = buildImageRefNode(
    { x: imageBaseX, y: imageY + 120 },
    {
      label: "Selected Nano image for video",
      imageUrl: selectedNanoImageUrl || "about:blank",
      source: "upload",
      mediaKind: "image",
    },
  );
  nodes.push(selectedNano);
  pushEdge(imageGen1.id, selectedNano.id);
  pushEdge(imageGen2.id, selectedNano.id);

  // 6) Video generator with imported prompt.
  const videoPromptText = firstNonEmpty(selectedPipe.ugcVideoPromptGpt, "No video prompt found");
  const videoGenerator = buildAdAssetNode("video", { x: ox + 1650, y: oy + 110 }, {
    label: "Video generator",
    prompt: videoPromptText,
    referencePreviewUrl: selectedNanoImageUrl || undefined,
    referenceSource: "upload",
    referenceMediaKind: "image",
  });
  nodes.push(videoGenerator);
  pushEdge(selectedNano.id, videoGenerator.id);

  const klingSlots = selectedPipe.klingByReferenceIndex ?? [];
  const slot = klingSlots[selectedNanoIdx];
  const videoUrl = firstNonEmpty(slot?.videoUrl, Array.isArray(slot?.history) ? slot?.history[0] : undefined);
  // 7) Final video node.
  if (videoUrl) {
    const finalVideo = buildImageRefNode(
      { x: ox + 1980, y: oy + 110 },
      {
        label: "Final video",
        imageUrl: videoUrl,
        source: "upload",
        mediaKind: "video",
      },
    );
    nodes.push(finalVideo);
    pushEdge(videoGenerator.id, finalVideo.id);
  } else {
    const finalVideoPending = buildAdAssetNode("video", { x: ox + 1980, y: oy + 110 }, {
      label: "Final video",
      prompt: "No final video found in this project yet.",
    });
    nodes.push(finalVideoPending);
    pushEdge(videoGenerator.id, finalVideoPending.id);
  }

  return { nodes, edges };
}

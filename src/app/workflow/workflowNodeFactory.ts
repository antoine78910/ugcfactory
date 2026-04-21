import type { XYPosition } from "@xyflow/react";

import type { AdAssetNodeData, AdAssetNodeType } from "./nodes/AdAssetNode";
import type { ImageRefNodeData, ImageRefNodeType } from "./nodes/ImageRefNode";
import type { TextPromptNodeType } from "./nodes/TextPromptNode";
import type { PromptListNodeType } from "./workflowPromptListTypes";
import { PROMPT_LIST_DEFAULT_DATA } from "./workflowPromptListTypes";
import type { StickyNoteNodeType } from "./workflowStickyNoteTypes";
import { aspectRatioStringFromIntrinsic } from "./workflowMediaAspect";
import { STICKY_NOTE_DEFAULT_DATA } from "./workflowStickyNoteTypes";

/** Custom data transfer type for palette → canvas drag (values: `pick` | node kind | `sticky` | `textPrompt` | `imageRef`). */
export const WORKFLOW_NODE_DND = "application/youry-workflow-node";

export type WorkflowDragNodeKind = AdAssetNodeType["data"]["kind"];

export type BuildAdAssetNodeOptions = {
  label?: string;
  /** Initial prompt on the node (e.g. template pipelines). */
  prompt?: string;
  /** width/height, when set, card preview uses this exact shape. */
  intrinsicAspect?: number;
  referencePreviewUrl?: string;
  referenceSource?: "upload" | "avatar";
  referenceMediaKind?: "image" | "video";
};

function genDefaultsForKind(
  kind: WorkflowDragNodeKind,
): Pick<AdAssetNodeData, "prompt" | "model" | "aspectRatio" | "resolution" | "quantity" | "generatorExportMode"> {
  if (kind === "video") {
    return {
      prompt: "",
      model: "kling-3.0/video",
      aspectRatio: "9:16",
      resolution: "720p",
      quantity: 1,
      generatorExportMode: "list",
    };
  }
  if (kind === "variation" || kind === "assistant") {
    return {
      prompt: "",
      model: "creative",
      aspectRatio: "1:1",
      resolution: "1024",
      quantity: 1,
      generatorExportMode: "list",
    };
  }
  if (kind === "website") {
    return {
      prompt: "",
      model: "nano",
      aspectRatio: "1:1",
      resolution: "1024",
      quantity: 1,
      generatorExportMode: "list",
    };
  }
  return {
    prompt: "",
    model: "nano",
    aspectRatio: "1:1",
    resolution: "1024",
    quantity: 1,
    generatorExportMode: "list",
  };
}

export function buildAdAssetNode(
  kind: WorkflowDragNodeKind,
  position: XYPosition,
  options?: BuildAdAssetNodeOptions,
): AdAssetNodeType {
  const id = crypto.randomUUID();
  const labels: Record<WorkflowDragNodeKind, string> = {
    image: "Image Generator",
    video: "Video Generator",
    variation: "Variation",
    assistant: "Assistant",
    upscale: "Image Upscaler",
    website: "Website",
  };

  const genDefaults = genDefaultsForKind(kind);
  const data: AdAssetNodeData = {
    kind,
    label: options?.label ?? labels[kind],
    ...genDefaults,
  };
  if (kind === "assistant") {
    data.assistantModel = "claude-sonnet-4-5";
    data.assistantMode = "input";
    data.assistantOutput = "";
    data.assistantExportMode = "text";
  }
  if (kind === "website") {
    data.websiteUrl = "";
    data.websiteOutputMode = "full_flow";
    data.websiteProductImageCount = 3;
  }

  if (options?.prompt !== undefined) data.prompt = options.prompt;

  if (options?.intrinsicAspect != null && Number.isFinite(options.intrinsicAspect) && options.intrinsicAspect > 0) {
    data.intrinsicAspect = options.intrinsicAspect;
    data.aspectRatio = aspectRatioStringFromIntrinsic(options.intrinsicAspect);
  }
  if (options?.referencePreviewUrl) data.referencePreviewUrl = options.referencePreviewUrl;
  if (options?.referenceSource) data.referenceSource = options.referenceSource;
  if (options?.referenceMediaKind) data.referenceMediaKind = options.referenceMediaKind;

  return {
    id,
    type: "adAsset",
    position,
    data,
  };
}

export function buildStickyNoteNode(position: XYPosition): StickyNoteNodeType {
  return {
    id: crypto.randomUUID(),
    type: "stickyNote",
    position,
    zIndex: 2,
    data: { ...STICKY_NOTE_DEFAULT_DATA },
  };
}

export function buildTextPromptNode(position: XYPosition): TextPromptNodeType {
  return {
    id: crypto.randomUUID(),
    type: "textPrompt",
    position,
    zIndex: 1,
    data: { prompt: "" },
  };
}

export type BuildPromptListNodeOptions = {
  label?: string;
  lines?: string[];
  mode?: "prompts" | "results";
};

export function buildPromptListNode(position: XYPosition, options?: BuildPromptListNodeOptions): PromptListNodeType {
  return {
    id: crypto.randomUUID(),
    type: "promptList",
    position,
    zIndex: 1,
    data: {
      ...PROMPT_LIST_DEFAULT_DATA,
      label: options?.label ?? PROMPT_LIST_DEFAULT_DATA.label,
      lines: options?.lines?.length ? [...options.lines] : [],
      mode: options?.mode ?? "prompts",
    },
  };
}

export type BuildImageRefNodeOptions = {
  label?: string;
  imageUrl: string;
  source: "upload" | "avatar";
  mediaKind: "image" | "video";
  intrinsicAspect?: number;
};

export function buildImageRefNode(position: XYPosition, options: BuildImageRefNodeOptions): ImageRefNodeType {
  const data: ImageRefNodeData = {
    label: options.label ?? (options.source === "avatar" ? "Avatar" : "Image"),
    imageUrl: options.imageUrl,
    source: options.source,
    mediaKind: options.mediaKind,
    intrinsicAspect: options.intrinsicAspect,
  };
  return {
    id: crypto.randomUUID(),
    type: "imageRef",
    position,
    data,
  };
}

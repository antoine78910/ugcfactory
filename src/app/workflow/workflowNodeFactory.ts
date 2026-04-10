import type { XYPosition } from "@xyflow/react";

import type { AdAssetNodeData, AdAssetNodeType } from "./nodes/AdAssetNode";

/** Custom data transfer type for palette → canvas drag (values: `pick` | node kind). */
export const WORKFLOW_NODE_DND = "application/youry-workflow-node";

export type WorkflowDragNodeKind = AdAssetNodeType["data"]["kind"];

export function buildAdAssetNode(kind: WorkflowDragNodeKind, position: XYPosition): AdAssetNodeType {
  const id = crypto.randomUUID();
  const labels: Record<WorkflowDragNodeKind, string> = {
    image: "Product image",
    video: "UGC video",
    variation: "Ad variation",
  };
  const genDefaults: Pick<AdAssetNodeData, "prompt" | "model" | "aspectRatio" | "resolution" | "quantity"> = {
    prompt: "",
    model: "auto",
    aspectRatio: kind === "video" ? "9:16" : "1:1",
    resolution: kind === "video" ? "720p" : "1024",
    quantity: 1,
  };
  return {
    id,
    type: "adAsset",
    position,
    data: { kind, label: labels[kind], ...genDefaults },
  };
}

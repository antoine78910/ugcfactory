import type { Transform } from "@xyflow/react";

import type { WorkflowCanvasNode } from "./workflowFlowTypes";

export type WorkflowMarqueeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type WorkflowInternalNode = {
  measured?: { width?: number | null; height?: number | null };
  internals: {
    positionAbsolute: { x: number; y: number };
    handleBounds?: unknown;
  };
};

/** Screen-space marquee rect (pane coords) → flow coordinates. */
export function screenMarqueeRectToFlowRect(
  rect: WorkflowMarqueeRect,
  transform: Transform,
): WorkflowMarqueeRect {
  const [tx, ty, scale] = transform;
  return {
    x: (rect.x - tx) / scale,
    y: (rect.y - ty) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

function rectOverlapArea(a: WorkflowMarqueeRect, b: WorkflowMarqueeRect): number {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapX <= 0 || overlapY <= 0) return 0;
  return overlapX * overlapY;
}

/**
 * adAsset module ids whose bounds intersect the marquee in flow space.
 * Ignores graph edges; uses measured dimensions only (not handleBounds).
 */
export function getAdAssetIdsInMarqueeRect(
  nodes: WorkflowCanvasNode[],
  flowRect: WorkflowMarqueeRect,
  getInternalNode: (id: string) => WorkflowInternalNode | null | undefined,
  partial: boolean,
): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.type !== "adAsset" || node.hidden) continue;
    if (node.selectable === false) continue;

    const internal = getInternalNode(node.id);
    const width =
      internal?.measured?.width ?? node.width ?? node.measured?.width ?? null;
    const height =
      internal?.measured?.height ?? node.height ?? node.measured?.height ?? null;
    if (width == null || height == null || width <= 0 || height <= 0) continue;

    const abs = internal?.internals?.positionAbsolute ?? node.position;
    const nodeRect: WorkflowMarqueeRect = {
      x: abs.x,
      y: abs.y,
      width,
      height,
    };
    const overlap = rectOverlapArea(flowRect, nodeRect);
    const nodeArea = width * height;
    const matches = partial ? overlap > 0 : overlap >= nodeArea - 0.5;
    if (matches) ids.push(node.id);
  }
  return ids;
}

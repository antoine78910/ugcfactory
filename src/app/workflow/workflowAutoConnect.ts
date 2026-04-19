import type { Node } from "@xyflow/react";

/** Pixels (screen / flow at zoom 1), dropping a wire near a handle snaps more easily. */
export const WORKFLOW_CONNECTION_RADIUS = 96;

/** Max distance in flow space between output (right) and input (left) to auto-link after dragging a node. */
export const WORKFLOW_NODE_SNAP_FLOW = 160;

type InternalLike = {
  measured: { width?: number; height?: number };
  internals: {
    positionAbsolute: { x: number; y: number };
    bounds?: { width: number | null; height: number | null } | null;
  };
};

const DEFAULT_W = 300;
const DEFAULT_H = 230;
const HANDLE_Y_FRAC = 0.42;

function anchorsFromInternal(internal: InternalLike | undefined): {
  left: { x: number; y: number };
  right: { x: number; y: number };
} | null {
  if (!internal) return null;
  const abs = internal.internals.positionAbsolute;
  const w = internal.measured.width ?? internal.internals.bounds?.width ?? DEFAULT_W;
  const h = internal.measured.height ?? internal.internals.bounds?.height ?? DEFAULT_H;
  const nw = typeof w === "number" && Number.isFinite(w) && w > 0 ? w : DEFAULT_W;
  const nh = typeof h === "number" && Number.isFinite(h) && h > 0 ? h : DEFAULT_H;
  const y = abs.y + nh * HANDLE_Y_FRAC;
  return {
    left: { x: abs.x, y },
    right: { x: abs.x + nw, y },
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * When a generator node is dropped near another (left/right handles aligned in flow space),
 * returns a directed edge source → target to create.
 */
export function suggestAutoConnectAfterNodeDrag(
  draggedId: string,
  getNodes: () => Node[],
  getInternalNode: (id: string) => InternalLike | undefined,
  snapFlow: number = WORKFLOW_NODE_SNAP_FLOW,
): { source: string; target: string } | null {
  const nodes = getNodes();
  const dragged = nodes.find((n) => n.id === draggedId);
  if (!dragged || (dragged.type !== "adAsset" && dragged.type !== "imageRef")) return null;

  const dInt = getInternalNode(draggedId);
  const dAnchors = anchorsFromInternal(dInt);
  if (!dAnchors) return null;

  const dParent = dragged.parentId ?? null;

  let best: { source: string; target: string; d: number } | null = null;

  for (const o of nodes) {
    if (o.id === draggedId || (o.type !== "adAsset" && o.type !== "imageRef")) continue;
    if ((o.parentId ?? null) !== dParent) continue;

    const oInt = getInternalNode(o.id);
    const oAnchors = anchorsFromInternal(oInt);
    if (!oAnchors) continue;

    const upstreamToDragged = dist(oAnchors.right, dAnchors.left);
    if (upstreamToDragged < snapFlow && (!best || upstreamToDragged < best.d)) {
      best = { source: o.id, target: draggedId, d: upstreamToDragged };
    }

    const draggedToDownstream = dist(dAnchors.right, oAnchors.left);
    if (draggedToDownstream < snapFlow && (!best || draggedToDownstream < best.d)) {
      best = { source: draggedId, target: o.id, d: draggedToDownstream };
    }
  }

  if (!best) return null;
  return { source: best.source, target: best.target };
}

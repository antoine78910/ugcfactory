import { getNodesInside, type NodeLookup, type Transform } from "@xyflow/system";

export type WorkflowMarqueeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Group frames are layout chrome — not box-select targets. */
export const WORKFLOW_MARQUEE_EXCLUDED_TYPES = new Set(["workflowGroup"]);

export function isWorkflowMarqueeNodeType(type: string | null | undefined): boolean {
  return typeof type === "string" && !WORKFLOW_MARQUEE_EXCLUDED_TYPES.has(type);
}

/** @deprecated Use isWorkflowMarqueeNodeType — all canvas nodes except group frames. */
export const WORKFLOW_MARQUEE_MODULE_TYPES = new Set([
  "adAsset",
  "imageRef",
  "textPrompt",
  "promptList",
  "stickyNote",
]);

/**
 * Module ids inside the pane-space marquee, using the same geometry as React Flow.
 * `excludeNonSelectableNodes` is off so upload cards (`imageRef`) still match even when
 * their `selectable` flag is false.
 */
export function getMarqueeModuleIdsInRect(
  nodeLookup: NodeLookup,
  paneRect: WorkflowMarqueeRect,
  transform: Transform,
  partial: boolean,
): string[] {
  const inside = getNodesInside(nodeLookup, paneRect, transform, partial, false);
  return inside
    .filter(
      (node): node is (typeof inside)[number] =>
        !node.hidden && isWorkflowMarqueeNodeType(node.type),
    )
    .map((node) => node.id);
}

/** Pane-space rect fields used by React Flow's `getNodesInside`. */
export function normalizeMarqueePaneRect(rect: WorkflowMarqueeRect): WorkflowMarqueeRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Module ids for a finished marquee: geometry first, then React Flow's own pick
 * (same rect math, but may include nodes our lookup pass missed mid-frame).
 */
const MARQUEE_RECT_PAD_PX = 6;

function inflateMarqueePaneRect(rect: WorkflowMarqueeRect): WorkflowMarqueeRect {
  const pad = MARQUEE_RECT_PAD_PX;
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

export function pickMarqueeModuleIds(
  paneRect: WorkflowMarqueeRect,
  nodeLookup: NodeLookup,
  transform: Transform,
  rfSelected: ReadonlyArray<{ id: string; type?: string | null; hidden?: boolean | null }>,
  partial = true,
): string[] {
  const normalized = normalizeMarqueePaneRect(paneRect);
  const geometric = getMarqueeModuleIdsInRect(nodeLookup, normalized, transform, partial);
  if (geometric.length > 0) return geometric;

  const inflated = getMarqueeModuleIdsInRect(
    nodeLookup,
    inflateMarqueePaneRect(normalized),
    transform,
    partial,
  );
  if (inflated.length > 0) return inflated;

  const rfModules = rfSelected
    .filter(
      (node) =>
        !node.hidden &&
        typeof node.type === "string" &&
        isWorkflowMarqueeNodeType(node.type),
    )
    .map((node) => node.id);
  if (rfModules.length > 0) return rfModules;

  // Same hit-test React Flow uses during drag (selectable nodes only), then module filter.
  const rfGeometry = getNodesInside(nodeLookup, normalized, transform, partial, true)
    .filter(
      (node) =>
        !node.hidden && isWorkflowMarqueeNodeType(node.type),
    )
    .map((node) => node.id);
  return rfGeometry;
}

/** @deprecated Use getMarqueeModuleIdsInRect — kept for any external imports. */
export const getAdAssetIdsInMarqueeRect = getMarqueeModuleIdsInRect;

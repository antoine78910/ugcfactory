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
 * Module ids for a finished marquee: pane-rect geometry only (no wires / neighbors).
 * `partial: false` keeps cards fully inside the box; `true` allows any overlap.
 */
export function pickMarqueeModuleIds(
  paneRect: WorkflowMarqueeRect,
  nodeLookup: NodeLookup,
  transform: Transform,
  partial = false,
): string[] {
  return getMarqueeModuleIdsInRect(
    nodeLookup,
    normalizeMarqueePaneRect(paneRect),
    transform,
    partial,
  );
}

/** @deprecated Use getMarqueeModuleIdsInRect — kept for any external imports. */
export const getAdAssetIdsInMarqueeRect = getMarqueeModuleIdsInRect;

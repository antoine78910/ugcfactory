import type { WorkflowCanvasNode } from "./workflowFlowTypes";
import { WORKFLOW_MARQUEE_EXCLUDED_TYPES } from "./workflowMarqueeSelection";

/** Canvas nodes that must participate in click + box selection (legacy saves used `selectable: false`). */
export function isWorkflowSelectableNodeType(type: string | undefined | null): boolean {
  return typeof type === "string" && !WORKFLOW_MARQUEE_EXCLUDED_TYPES.has(type);
}

/** Top-level canvas modules that can be grouped (same families as duplicate). */
export function isWorkflowGroupableModuleNode(node: WorkflowCanvasNode): boolean {
  if (node.parentId) return false;
  return (
    node.type === "adAsset" ||
    node.type === "imageRef" ||
    node.type === "textPrompt" ||
    node.type === "promptList" ||
    node.type === "stickyNote"
  );
}

export function ensureWorkflowNodesSelectable(nodes: WorkflowCanvasNode[]): WorkflowCanvasNode[] {
  let changed = false;
  const next = nodes.map((node) => {
    if (!isWorkflowSelectableNodeType(node.type)) return node;
    if (node.selectable !== false) return node;
    changed = true;
    return { ...node, selectable: true };
  });
  return changed ? next : nodes;
}

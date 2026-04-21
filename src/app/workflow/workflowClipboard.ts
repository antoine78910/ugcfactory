import type { Edge } from "@xyflow/react";

import type { AdAssetNodeType } from "./nodes/AdAssetNode";
import type { ImageRefNodeType } from "./nodes/ImageRefNode";
import type { TextPromptNodeType } from "./nodes/TextPromptNode";
import type { PromptListNodeType } from "./workflowPromptListTypes";
import type { StickyNoteNodeType } from "./workflowStickyNoteTypes";
import type { WorkflowGroupNodeType } from "./nodes/WorkflowGroupNode";
import type { WorkflowCanvasNode } from "./workflowFlowTypes";
import { collectWorkflowSelectionNodeRefs, type CloneWorkflowResult } from "./workflowClone";

export const WORKFLOW_CLIPBOARD_KIND = "ugc-workflow" as const;

export type WorkflowClipboardPayloadV1 = {
  v: 1;
  kind: typeof WORKFLOW_CLIPBOARD_KIND;
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
};

const PASTE_DX = 48;
const PASTE_DY = 48;

export function buildWorkflowClipboardPayload(
  allNodes: WorkflowCanvasNode[],
  allEdges: Edge[],
  selected: WorkflowCanvasNode[],
): WorkflowClipboardPayloadV1 | null {
  const refs = collectWorkflowSelectionNodeRefs(allNodes, selected);
  if (!refs?.length) return null;

  const idSet = new Set(refs.map((n) => n.id));
  const exportEdges = allEdges.filter((e) => idSet.has(e.source) && idSet.has(e.target));

  const nodes = refs.map((n) => {
    const copy = structuredClone(n) as WorkflowCanvasNode;
    return { ...copy, selected: false };
  });
  const edges = exportEdges.map((e) => structuredClone(e) as Edge);

  return { v: 1, kind: WORKFLOW_CLIPBOARD_KIND, nodes, edges };
}

export function parseWorkflowClipboardText(text: string): WorkflowClipboardPayloadV1 | null {
  const t = text.trim();
  if (!t.startsWith("{")) return null;
  try {
    const raw = JSON.parse(t) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    if (o.v !== 1 || o.kind !== WORKFLOW_CLIPBOARD_KIND) return null;
    if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) return null;
    return {
      v: 1,
      kind: WORKFLOW_CLIPBOARD_KIND,
      nodes: o.nodes as WorkflowCanvasNode[],
      edges: o.edges as Edge[],
    };
  } catch {
    return null;
  }
}

export function serializeWorkflowClipboardPayload(payload: WorkflowClipboardPayloadV1): string {
  return JSON.stringify(payload);
}

/** Remove nodes and any edges touching them. */
export function removeWorkflowNodesById(
  allNodes: WorkflowCanvasNode[],
  allEdges: Edge[],
  removeIds: Set<string>,
): { nodes: WorkflowCanvasNode[]; edges: Edge[] } {
  return {
    nodes: allNodes.filter((n) => !removeIds.has(n.id)),
    edges: allEdges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)),
  };
}

/**
 * Turn clipboard payload into new graph fragments (new ids, optional nudge like duplicate).
 */
export function remapPastedWorkflowPayload(payload: WorkflowClipboardPayloadV1): CloneWorkflowResult | null {
  const { nodes: srcNodes, edges: srcEdges } = payload;
  if (!srcNodes.length) return null;

  const idMap = new Map<string, string>();
  for (const n of srcNodes) {
    idMap.set(n.id, crypto.randomUUID());
  }

  const nodesToAdd: WorkflowCanvasNode[] = srcNodes.map((n) => {
    const newId = idMap.get(n.id)!;
    if (n.type === "workflowGroup") {
      const g = n as WorkflowGroupNodeType;
      return {
        ...g,
        id: newId,
        selected: false,
        position: {
          x: g.position.x + PASTE_DX,
          y: g.position.y + PASTE_DY,
        },
        data: structuredClone(g.data),
      } satisfies WorkflowGroupNodeType;
    }
    if (n.type === "stickyNote") {
      const s = n as StickyNoteNodeType;
      return {
        ...s,
        id: newId,
        selected: false,
        position: {
          x: s.position.x + PASTE_DX,
          y: s.position.y + PASTE_DY,
        },
        data: structuredClone(s.data),
        zIndex: s.zIndex ?? 2,
      } satisfies StickyNoteNodeType;
    }
    if (n.type === "imageRef") {
      const r = n as ImageRefNodeType;
      return {
        ...r,
        id: newId,
        selected: false,
        position: {
          x: r.position.x + PASTE_DX,
          y: r.position.y + PASTE_DY,
        },
        data: structuredClone(r.data),
        zIndex: r.zIndex,
      } satisfies ImageRefNodeType;
    }
    if (n.type === "textPrompt") {
      const t = n as TextPromptNodeType;
      return {
        ...t,
        id: newId,
        selected: false,
        position: {
          x: t.position.x + PASTE_DX,
          y: t.position.y + PASTE_DY,
        },
        data: structuredClone(t.data),
        zIndex: t.zIndex ?? 1,
      } satisfies TextPromptNodeType;
    }
    if (n.type === "promptList") {
      const l = n as PromptListNodeType;
      return {
        ...l,
        id: newId,
        selected: false,
        position: {
          x: l.position.x + PASTE_DX,
          y: l.position.y + PASTE_DY,
        },
        data: structuredClone(l.data),
        zIndex: l.zIndex ?? 1,
      } satisfies PromptListNodeType;
    }
    const a = n as AdAssetNodeType;
    const mappedParent = a.parentId ? idMap.get(a.parentId) : undefined;
    if (mappedParent) {
      return {
        ...a,
        id: newId,
        parentId: mappedParent,
        extent: "parent" as const,
        position: { ...a.position },
        selected: false,
        data: structuredClone(a.data),
      } satisfies AdAssetNodeType;
    }
    return {
      ...a,
      id: newId,
      selected: false,
      position: {
        x: a.position.x + PASTE_DX,
        y: a.position.y + PASTE_DY,
      },
      data: structuredClone(a.data),
    } satisfies AdAssetNodeType;
  });

  const selectIds: string[] = [];
  for (const n of nodesToAdd) {
    if (n.type === "workflowGroup") selectIds.push(n.id);
  }
  for (const n of nodesToAdd) {
    if ((n.type === "adAsset" || n.type === "imageRef") && !n.parentId) selectIds.push(n.id);
    if (n.type === "stickyNote" || n.type === "textPrompt" || n.type === "promptList") selectIds.push(n.id);
  }
  if (selectIds.length === 0 && nodesToAdd[0]) {
    selectIds.push(nodesToAdd[0].id);
  }

  const edgesToAdd: Edge[] = [];
  for (const e of srcEdges) {
    const ns = idMap.get(e.source);
    const nt = idMap.get(e.target);
    if (ns && nt) {
      edgesToAdd.push({
        ...e,
        id: `e-${ns}-${nt}-${crypto.randomUUID().slice(0, 8)}`,
        source: ns,
        target: nt,
      });
    }
  }

  return { nodesToAdd, edgesToAdd, selectIds };
}

export async function writeWorkflowClipboardPayload(payload: WorkflowClipboardPayloadV1): Promise<void> {
  const text = serializeWorkflowClipboardPayload(payload);
  await navigator.clipboard.writeText(text);
}

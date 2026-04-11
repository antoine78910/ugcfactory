import type { Edge } from "@xyflow/react";

import type { AdAssetNodeType } from "./nodes/AdAssetNode";
import type { StickyNoteNodeType } from "./workflowStickyNoteTypes";
import type { WorkflowGroupNodeType } from "./nodes/WorkflowGroupNode";
import type { WorkflowCanvasNode } from "./workflowFlowTypes";

const DX = 48;
const DY = 48;

export type CloneWorkflowResult = {
  nodesToAdd: WorkflowCanvasNode[];
  edgesToAdd: Edge[];
  /** New node ids to mark selected */
  selectIds: string[];
};

function cloneGroupLabel(label: string): string {
  const t = label.trim();
  if (!t) return "Group (copy)";
  return t.endsWith("(copy)") ? t : `${t} (copy)`;
}

/**
 * Node refs that belong to the current selection (same rules as duplicate / cut).
 * Groups include all child generators from the graph; loose generators skip children of selected groups.
 */
export function collectWorkflowSelectionNodeRefs(
  allNodes: WorkflowCanvasNode[],
  selected: WorkflowCanvasNode[],
): WorkflowCanvasNode[] | null {
  if (selected.length === 0) return null;

  const out: WorkflowCanvasNode[] = [];
  const addedIds = new Set<string>();

  const selectedGroups = selected.filter((n): n is WorkflowGroupNodeType => n.type === "workflowGroup");
  const selectedGroupIds = new Set(selectedGroups.map((g) => g.id));

  for (const g of selectedGroups) {
    const groupNode = allNodes.find((x) => x.id === g.id) ?? g;
    if (!addedIds.has(groupNode.id)) {
      out.push(groupNode);
      addedIds.add(groupNode.id);
    }
    const children = allNodes.filter(
      (n): n is AdAssetNodeType => n.type === "adAsset" && n.parentId === groupNode.id,
    );
    for (const c of children) {
      if (!addedIds.has(c.id)) {
        out.push(c);
        addedIds.add(c.id);
      }
    }
  }

  const selectedAssets = selected.filter((n): n is AdAssetNodeType => n.type === "adAsset");
  for (const a of selectedAssets) {
    if (addedIds.has(a.id)) continue;
    const parentId = a.parentId;
    if (parentId && selectedGroupIds.has(parentId)) continue;
    const nodeRef = allNodes.find((x) => x.id === a.id) ?? a;
    if (!addedIds.has(nodeRef.id)) {
      out.push(nodeRef);
      addedIds.add(nodeRef.id);
    }
  }

  const selectedStickies = selected.filter((n): n is StickyNoteNodeType => n.type === "stickyNote");
  for (const s of selectedStickies) {
    if (addedIds.has(s.id)) continue;
    const nodeRef = allNodes.find((x) => x.id === s.id) ?? s;
    if (!addedIds.has(nodeRef.id)) {
      out.push(nodeRef);
      addedIds.add(nodeRef.id);
    }
  }

  return out.length ? out : null;
}

/**
 * Clone selected workflow groups (with all child generators) and/or selected generator nodes.
 * Remaps edges whose both endpoints are part of the same clone batch.
 */
export function cloneWorkflowSelection(
  allNodes: WorkflowCanvasNode[],
  allEdges: Edge[],
  selected: WorkflowCanvasNode[],
): CloneWorkflowResult | null {
  const selectedGroups = selected.filter((n): n is WorkflowGroupNodeType => n.type === "workflowGroup");
  const selectedGroupIds = new Set(selectedGroups.map((g) => g.id));

  const refs = collectWorkflowSelectionNodeRefs(allNodes, selected);
  if (!refs?.length) return null;

  const idMap = new Map<string, string>();
  const nodesToAdd: WorkflowCanvasNode[] = [];
  const selectIds: string[] = [];

  let groupIndex = 0;
  for (const g of selectedGroups) {
    const ox = DX * (groupIndex + 1);
    const oy = DY * (groupIndex + 1);
    groupIndex += 1;

    const oldGid = g.id;
    const newGid = crypto.randomUUID();
    idMap.set(oldGid, newGid);

    const children = allNodes.filter(
      (n): n is AdAssetNodeType => n.type === "adAsset" && n.parentId === oldGid,
    );
    for (const c of children) {
      idMap.set(c.id, crypto.randomUUID());
    }

    const newGroup: WorkflowGroupNodeType = {
      id: newGid,
      type: "workflowGroup",
      position: { x: g.position.x + ox, y: g.position.y + oy },
      style: g.style ? { ...g.style } : undefined,
      data: {
        ...structuredClone(g.data),
        label: cloneGroupLabel(g.data.label),
      },
      zIndex: g.zIndex ?? -1,
      selected: false,
    };
    nodesToAdd.push(newGroup);
    selectIds.push(newGid);

    for (const c of children) {
      const newId = idMap.get(c.id)!;
      nodesToAdd.push({
        id: newId,
        type: "adAsset",
        parentId: newGid,
        extent: "parent",
        position: { x: c.position.x, y: c.position.y },
        data: structuredClone(c.data),
        selected: false,
      });
    }
  }

  const selectedAssets = refs.filter((n): n is AdAssetNodeType => n.type === "adAsset");
  for (const a of selectedAssets) {
    if (idMap.has(a.id)) continue;

    const parentId = a.parentId;
    if (parentId && selectedGroupIds.has(parentId)) continue;

    const newId = crypto.randomUUID();
    idMap.set(a.id, newId);

    const base: AdAssetNodeType = {
      id: newId,
      type: "adAsset",
      position: !parentId
        ? { x: a.position.x + DX, y: a.position.y + DY }
        : { x: a.position.x + DX * 0.5, y: a.position.y + DY * 0.5 },
      data: structuredClone(a.data),
      selected: false,
      ...(parentId ? { parentId, extent: "parent" as const } : {}),
    };
    nodesToAdd.push(base);
    selectIds.push(newId);
  }

  const selectedStickies = refs.filter((n): n is StickyNoteNodeType => n.type === "stickyNote");
  for (const s of selectedStickies) {
    if (idMap.has(s.id)) continue;

    const newId = crypto.randomUUID();
    idMap.set(s.id, newId);

    nodesToAdd.push({
      id: newId,
      type: "stickyNote",
      position: { x: s.position.x + DX, y: s.position.y + DY },
      data: structuredClone(s.data),
      selected: false,
      zIndex: s.zIndex ?? 2,
    });
    selectIds.push(newId);
  }

  if (nodesToAdd.length === 0) return null;

  const edgesToAdd: Edge[] = [];
  for (const e of allEdges) {
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

export function canCloneWorkflowSelection(selected: WorkflowCanvasNode[]): boolean {
  return selected.some((n) => n.type === "workflowGroup" || n.type === "adAsset" || n.type === "stickyNote");
}

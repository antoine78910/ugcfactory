import type { Edge, Node } from "@xyflow/react";

import type { AdAssetNodeData } from "@/app/workflow/nodes/AdAssetNode";

export function isRunnableWorkflowAdAssetKind(kind: AdAssetNodeData["kind"] | undefined): boolean {
  return (
    kind === "image" ||
    kind === "video" ||
    kind === "motion" ||
    kind === "assistant" ||
    kind === "website"
  );
}

function isRunnableNode(n: Node | undefined): n is Node<AdAssetNodeData, "adAsset"> {
  if (!n || n.type !== "adAsset") return false;
  return isRunnableWorkflowAdAssetKind((n.data as AdAssetNodeData).kind);
}

/**
 * Runnable modules to execute for "Run from here":
 * - everything downstream of `startNodeId`, plus
 * - any runnable upstream ancestors (through prompt text, lists, image refs, etc.)
 *   that feed those downstream modules.
 */
export function collectWorkflowRunFromHereIds(
  startNodeId: string,
  nodes: Node[],
  edges: Edge[],
): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!byId.has(startNodeId)) return [];

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e.target);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
  }

  const forwardReach = new Set<string>();
  const qForward = [startNodeId];
  while (qForward.length) {
    const cur = qForward.shift()!;
    if (forwardReach.has(cur)) continue;
    forwardReach.add(cur);
    for (const nxt of outgoing.get(cur) ?? []) qForward.push(nxt);
  }

  const runnableIds = new Set<string>();
  for (const nid of forwardReach) {
    if (isRunnableNode(byId.get(nid))) runnableIds.add(nid);
  }
  if (isRunnableNode(byId.get(startNodeId))) runnableIds.add(startNodeId);

  const walkBack = [...forwardReach];
  const seenBack = new Set<string>(walkBack);
  while (walkBack.length) {
    const cur = walkBack.shift()!;
    for (const pred of incoming.get(cur) ?? []) {
      if (isRunnableNode(byId.get(pred))) runnableIds.add(pred);
      if (!seenBack.has(pred)) {
        seenBack.add(pred);
        walkBack.push(pred);
      }
    }
  }

  return [...runnableIds];
}

/** Topological run order: upstream assistants before downstream generators. */
export function orderWorkflowRunFromHereIds(
  runnableIds: string[],
  nodes: Node[],
  edges: Edge[],
  startNodeId: string,
): string[] {
  if (!runnableIds.length) return [];
  const runSet = new Set(runnableIds);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
  }

  const ancestorRunnables = new Map<string, Set<string>>();
  for (const rid of runnableIds) {
    const ancestors = new Set<string>();
    const queue = [rid];
    const seen = new Set<string>();
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const pred of incoming.get(cur) ?? []) {
        if (runSet.has(pred) && pred !== rid) ancestors.add(pred);
        if (!seen.has(pred)) queue.push(pred);
      }
    }
    ancestorRunnables.set(rid, ancestors);
  }

  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const rid of runnableIds) {
    indegree.set(rid, ancestorRunnables.get(rid)?.size ?? 0);
    children.set(rid, []);
  }
  for (const rid of runnableIds) {
    for (const pred of ancestorRunnables.get(rid) ?? []) {
      children.get(pred)!.push(rid);
    }
  }

  const reachIndex = new Map<string, number>();
  const qReach = [startNodeId];
  let idx = 0;
  const seenReach = new Set<string>();
  while (qReach.length) {
    const cur = qReach.shift()!;
    if (seenReach.has(cur)) continue;
    seenReach.add(cur);
    reachIndex.set(cur, idx++);
    const out = edges.filter((e) => e.source === cur).map((e) => e.target);
    for (const nxt of out) if (!seenReach.has(nxt)) qReach.push(nxt);
  }
  for (const rid of runnableIds) {
    if (!reachIndex.has(rid)) reachIndex.set(rid, idx++);
  }

  const ready = runnableIds
    .filter((rid) => (indegree.get(rid) ?? 0) === 0)
    .sort((a, b) => (reachIndex.get(a) ?? 0) - (reachIndex.get(b) ?? 0));
  const ordered: string[] = [];
  while (ready.length) {
    const cur = ready.shift()!;
    ordered.push(cur);
    for (const nxt of children.get(cur) ?? []) {
      const nextDeg = (indegree.get(nxt) ?? 0) - 1;
      indegree.set(nxt, nextDeg);
      if (nextDeg === 0) {
        ready.push(nxt);
        ready.sort((a, b) => (reachIndex.get(a) ?? 0) - (reachIndex.get(b) ?? 0));
      }
    }
  }
  if (ordered.length !== runnableIds.length) {
    for (const rid of runnableIds) {
      if (!ordered.includes(rid)) ordered.push(rid);
    }
  }
  return ordered;
}

export function planWorkflowRunFromHere(
  startNodeId: string,
  nodes: Node[],
  edges: Edge[],
): { runnableIds: string[]; orderedRunIds: string[] } {
  const runnableIds = collectWorkflowRunFromHereIds(startNodeId, nodes, edges);
  const orderedRunIds = orderWorkflowRunFromHereIds(runnableIds, nodes, edges, startNodeId);
  return { runnableIds, orderedRunIds };
}

/** Step indices of runnable ancestors for UI (run-from-here plan popover). */
export function workflowRunFromHereParentStepIndices(
  orderedRunIds: string[],
  edges: Edge[],
): Map<string, number[]> {
  const runSet = new Set(orderedRunIds);
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e.source);
  }
  const indexOf = new Map(orderedRunIds.map((id, i) => [id, i]));
  const result = new Map<string, number[]>();
  for (const rid of orderedRunIds) {
    const ancestors = new Set<string>();
    const queue = [rid];
    const seen = new Set<string>();
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const pred of incoming.get(cur) ?? []) {
        if (runSet.has(pred) && pred !== rid) ancestors.add(pred);
        if (!seen.has(pred)) queue.push(pred);
      }
    }
    const pIdx = [...ancestors]
      .map((p) => indexOf.get(p))
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => a - b);
    result.set(rid, pIdx);
  }
  return result;
}

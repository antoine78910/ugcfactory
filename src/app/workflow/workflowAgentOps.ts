import type { Edge, XYPosition } from "@xyflow/react";

import {
  buildAdAssetNode,
  buildPromptListNode,
  buildStickyNoteNode,
  buildTextPromptNode,
  type WorkflowDragNodeKind,
} from "./workflowNodeFactory";
import type { WorkflowCanvasNode } from "./workflowFlowTypes";
import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";
import { computeWorkflowAlignPositions, type WorkflowAlignBox } from "./workflowAlign";

export type WorkflowAgentOp =
  | { op: "clear_canvas" }
  | {
      op: "add_node";
      /** Temporary id used in later ops (`n1`, `prompt_a`, …). Mapped to a real UUID on apply. */
      tempId: string;
      factory: "adAsset" | "textPrompt" | "promptList" | "sticky";
      kind?: WorkflowDragNodeKind;
      position: XYPosition;
      data?: Record<string, unknown>;
    }
  | { op: "patch_node"; nodeId: string; data: Record<string, unknown> }
  | { op: "move_node"; nodeId: string; position: XYPosition }
  | {
      op: "connect";
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
    }
  | { op: "delete_nodes"; nodeIds: string[] }
  | { op: "align_grid"; nodeIds: string[]; rows?: number; cols?: number; gap?: number }
  | { op: "run_node"; nodeId: string }
  | { op: "run_from_here"; nodeId: string };

export type WorkflowAgentPlan = {
  summary: string;
  ops: WorkflowAgentOp[];
};

export type WorkflowAgentApplyResult = {
  project: WorkflowProjectStateV1;
  /** Real node ids to dispatch after React has remounted the canvas. */
  runNodeIds: string[];
  runFromHereIds: string[];
  tempIdMap: Record<string, string>;
  applied: number;
};

const AD_ASSET_KINDS = new Set<WorkflowDragNodeKind>([
  "image",
  "video",
  "motion",
  "variation",
  "assistant",
  "upscale",
  "website",
  "videoMerge",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asXY(v: unknown, fallback: XYPosition = { x: 0, y: 0 }): XYPosition {
  if (!isRecord(v)) return fallback;
  const x = typeof v.x === "number" && Number.isFinite(v.x) ? v.x : fallback.x;
  const y = typeof v.y === "number" && Number.isFinite(v.y) ? v.y : fallback.y;
  return { x, y };
}

function parseOp(raw: unknown): WorkflowAgentOp | null {
  if (!isRecord(raw) || typeof raw.op !== "string") return null;
  switch (raw.op) {
    case "clear_canvas":
      return { op: "clear_canvas" };
    case "add_node": {
      const tempId = typeof raw.tempId === "string" ? raw.tempId.trim() : "";
      const factory = raw.factory;
      if (!tempId) return null;
      if (factory !== "adAsset" && factory !== "textPrompt" && factory !== "promptList" && factory !== "sticky") {
        return null;
      }
      const kindRaw = typeof raw.kind === "string" ? raw.kind : "image";
      const kind = (AD_ASSET_KINDS.has(kindRaw as WorkflowDragNodeKind) ? kindRaw : "image") as WorkflowDragNodeKind;
      return {
        op: "add_node",
        tempId,
        factory,
        kind: factory === "adAsset" ? kind : undefined,
        position: asXY(raw.position, { x: 120, y: 120 }),
        data: isRecord(raw.data) ? raw.data : undefined,
      };
    }
    case "patch_node": {
      const nodeId = typeof raw.nodeId === "string" ? raw.nodeId.trim() : "";
      if (!nodeId || !isRecord(raw.data)) return null;
      return { op: "patch_node", nodeId, data: raw.data };
    }
    case "move_node": {
      const nodeId = typeof raw.nodeId === "string" ? raw.nodeId.trim() : "";
      if (!nodeId) return null;
      return { op: "move_node", nodeId, position: asXY(raw.position) };
    }
    case "connect": {
      const source = typeof raw.source === "string" ? raw.source.trim() : "";
      const target = typeof raw.target === "string" ? raw.target.trim() : "";
      if (!source || !target) return null;
      return {
        op: "connect",
        source,
        target,
        sourceHandle: typeof raw.sourceHandle === "string" ? raw.sourceHandle : undefined,
        targetHandle: typeof raw.targetHandle === "string" ? raw.targetHandle : undefined,
      };
    }
    case "delete_nodes": {
      if (!Array.isArray(raw.nodeIds)) return null;
      const nodeIds = raw.nodeIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      if (nodeIds.length === 0) return null;
      return { op: "delete_nodes", nodeIds };
    }
    case "align_grid": {
      if (!Array.isArray(raw.nodeIds)) return null;
      const nodeIds = raw.nodeIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      if (nodeIds.length < 2) return null;
      return {
        op: "align_grid",
        nodeIds,
        rows: typeof raw.rows === "number" ? raw.rows : undefined,
        cols: typeof raw.cols === "number" ? raw.cols : undefined,
        gap: typeof raw.gap === "number" ? raw.gap : undefined,
      };
    }
    case "run_node": {
      const nodeId = typeof raw.nodeId === "string" ? raw.nodeId.trim() : "";
      if (!nodeId) return null;
      return { op: "run_node", nodeId };
    }
    case "run_from_here": {
      const nodeId = typeof raw.nodeId === "string" ? raw.nodeId.trim() : "";
      if (!nodeId) return null;
      return { op: "run_from_here", nodeId };
    }
    default:
      return null;
  }
}

/** Extract a `{ summary, ops }` plan from model output (JSON object or fenced block). */
export function parseWorkflowAgentPlan(rawText: string): WorkflowAgentPlan | null {
  const text = rawText.trim();
  if (!text) return null;

  const candidates: string[] = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.unshift(fence[1].trim());
  const brace = text.match(/\{[\s\S]*\}/);
  if (brace?.[0]) candidates.unshift(brace[0]);

  for (const c of candidates) {
    try {
      const j = JSON.parse(c) as unknown;
      if (!isRecord(j) || !Array.isArray(j.ops)) continue;
      const ops: WorkflowAgentOp[] = [];
      for (const item of j.ops) {
        const op = parseOp(item);
        if (op) ops.push(op);
      }
      if (ops.length === 0) continue;
      const summary =
        typeof j.summary === "string" && j.summary.trim()
          ? j.summary.trim().slice(0, 400)
          : `Applied ${ops.length} workflow action${ops.length === 1 ? "" : "s"}.`;
      return { summary, ops };
    } catch {
      /* try next */
    }
  }
  return null;
}

function defaultSourceHandle(node: WorkflowCanvasNode): string {
  if (node.type === "adAsset") {
    const kind = (node.data as { kind?: string }).kind;
    if (kind === "image" || kind === "variation" || kind === "upscale") return "generated";
  }
  return "out";
}

function defaultTargetHandle(node: WorkflowCanvasNode): string {
  if (node.type === "adAsset") {
    const kind = (node.data as { kind?: string }).kind;
    if (kind === "image" || kind === "variation" || kind === "upscale") return "reference";
    if (kind === "video" || kind === "motion") return "in";
    if (kind === "assistant") return "in";
    if (kind === "website") return "in";
    if (kind === "videoMerge") return "in";
  }
  if (node.type === "imageRef") return "in";
  if (node.type === "textPrompt" || node.type === "promptList") return "in";
  return "in";
}

function mergeNodeData(node: WorkflowCanvasNode, patch: Record<string, unknown>): WorkflowCanvasNode {
  const nextData = { ...(node.data as object), ...patch } as WorkflowCanvasNode["data"];
  return { ...node, data: nextData } as WorkflowCanvasNode;
}

function createNodeFromOp(op: Extract<WorkflowAgentOp, { op: "add_node" }>): WorkflowCanvasNode {
  if (op.factory === "textPrompt") {
    const n = buildTextPromptNode(op.position);
    if (op.data && typeof op.data.prompt === "string") {
      return { ...n, data: { ...n.data, prompt: op.data.prompt } };
    }
    return n;
  }
  if (op.factory === "promptList") {
    const lines = Array.isArray(op.data?.lines)
      ? op.data!.lines.filter((x): x is string => typeof x === "string")
      : undefined;
    const label = typeof op.data?.label === "string" ? op.data.label : undefined;
    const mode = op.data?.mode === "results" || op.data?.mode === "prompts" ? op.data.mode : undefined;
    return buildPromptListNode(op.position, { label, lines, mode });
  }
  if (op.factory === "sticky") {
    const n = buildStickyNoteNode(op.position);
    if (op.data && typeof op.data.text === "string") {
      return { ...n, data: { ...n.data, text: op.data.text } };
    }
    return n;
  }
  const kind = op.kind && AD_ASSET_KINDS.has(op.kind) ? op.kind : "image";
  const n = buildAdAssetNode(kind, op.position, {
    label: typeof op.data?.label === "string" ? op.data.label : undefined,
    prompt: typeof op.data?.prompt === "string" ? op.data.prompt : undefined,
    model: typeof op.data?.model === "string" ? op.data.model : undefined,
    resolution: typeof op.data?.resolution === "string" ? op.data.resolution : undefined,
    assistantVisionPreset:
      op.data?.assistantVisionPreset === "image_to_json" || op.data?.assistantVisionPreset === "video_to_prompt"
        ? op.data.assistantVisionPreset
        : undefined,
  });
  if (!op.data) return n;
  const rest = { ...op.data };
  delete rest.label;
  delete rest.prompt;
  delete rest.model;
  delete rest.resolution;
  delete rest.assistantVisionPreset;
  if (Object.keys(rest).length === 0) return n;
  return mergeNodeData(n, rest);
}

/**
 * Apply a plan to the active page of a project. Returns a new project + deferred run intents.
 */
export function applyWorkflowAgentPlan(
  project: WorkflowProjectStateV1,
  plan: WorkflowAgentPlan,
): WorkflowAgentApplyResult {
  const pageId = project.activePageId;
  const pageIndex = project.pages.findIndex((p) => p.id === pageId);
  if (pageIndex < 0) {
    return { project, runNodeIds: [], runFromHereIds: [], tempIdMap: {}, applied: 0 };
  }

  let nodes = [...project.pages[pageIndex].nodes] as WorkflowCanvasNode[];
  let edges = [...project.pages[pageIndex].edges] as Edge[];
  const idMap = new Map<string, string>();
  const runNodeIds: string[] = [];
  const runFromHereIds: string[] = [];
  let applied = 0;

  const resolveId = (id: string) => idMap.get(id) ?? id;

  for (const op of plan.ops) {
    switch (op.op) {
      case "clear_canvas": {
        nodes = [];
        edges = [];
        idMap.clear();
        applied += 1;
        break;
      }
      case "add_node": {
        if (idMap.has(op.tempId) || nodes.some((n) => n.id === op.tempId)) break;
        const created = createNodeFromOp(op);
        idMap.set(op.tempId, created.id);
        nodes.push(created);
        applied += 1;
        break;
      }
      case "patch_node": {
        const id = resolveId(op.nodeId);
        const idx = nodes.findIndex((n) => n.id === id);
        if (idx < 0) break;
        nodes[idx] = mergeNodeData(nodes[idx], op.data);
        applied += 1;
        break;
      }
      case "move_node": {
        const id = resolveId(op.nodeId);
        const idx = nodes.findIndex((n) => n.id === id);
        if (idx < 0) break;
        nodes[idx] = { ...nodes[idx], position: { ...op.position } };
        applied += 1;
        break;
      }
      case "connect": {
        const source = resolveId(op.source);
        const target = resolveId(op.target);
        const srcNode = nodes.find((n) => n.id === source);
        const tgtNode = nodes.find((n) => n.id === target);
        if (!srcNode || !tgtNode) break;
        const sourceHandle = op.sourceHandle || defaultSourceHandle(srcNode);
        const targetHandle = op.targetHandle || defaultTargetHandle(tgtNode);
        if (edges.some((e) => e.source === source && e.target === target && e.sourceHandle === sourceHandle && e.targetHandle === targetHandle)) {
          break;
        }
        edges.push({
          id: `e-${source}-${target}-${crypto.randomUUID().slice(0, 8)}`,
          source,
          sourceHandle,
          target,
          targetHandle,
          style: { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 },
        });
        applied += 1;
        break;
      }
      case "delete_nodes": {
        const ids = new Set(op.nodeIds.map(resolveId));
        const before = nodes.length;
        nodes = nodes.filter((n) => !ids.has(n.id));
        edges = edges.filter((e) => !ids.has(e.source) && !ids.has(e.target));
        if (nodes.length !== before) applied += 1;
        break;
      }
      case "align_grid": {
        const ids = op.nodeIds.map(resolveId);
        const selected = nodes.filter((n) => ids.includes(n.id));
        if (selected.length < 2) break;
        const boxes: WorkflowAlignBox[] = selected.map((n) => ({
          id: n.id,
          x: n.position.x,
          y: n.position.y,
          width: (typeof n.width === "number" ? n.width : 280) || 280,
          height: (typeof n.height === "number" ? n.height : 200) || 200,
        }));
        const positions = computeWorkflowAlignPositions(boxes, "grid", {
          rows: op.rows,
          cols: op.cols,
          gap: op.gap,
        });
        nodes = nodes.map((n) => {
          const p = positions.get(n.id);
          return p ? ({ ...n, position: p } as WorkflowCanvasNode) : n;
        });
        applied += 1;
        break;
      }
      case "run_node": {
        runNodeIds.push(resolveId(op.nodeId));
        applied += 1;
        break;
      }
      case "run_from_here": {
        runFromHereIds.push(resolveId(op.nodeId));
        applied += 1;
        break;
      }
    }
  }

  const nextPages = project.pages.map((p, i) =>
    i === pageIndex ? { ...p, nodes, edges } : p,
  );
  const tempIdMap: Record<string, string> = {};
  for (const [k, v] of idMap) tempIdMap[k] = v;

  return {
    project: { ...project, pages: nextPages },
    runNodeIds,
    runFromHereIds,
    tempIdMap,
    applied,
  };
}

/** Compact graph snapshot for the model (ids + types + prompts + positions). */
export function summarizeWorkflowGraphForAgent(project: WorkflowProjectStateV1): unknown {
  const page = project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0];
  if (!page) return { nodes: [], edges: [] };
  return {
    nodes: page.nodes.map((n) => {
      const d = n.data as Record<string, unknown>;
      const base: Record<string, unknown> = {
        id: n.id,
        type: n.type,
        position: n.position,
      };
      if (n.type === "adAsset") {
        base.kind = d.kind;
        base.label = d.label;
        if (typeof d.prompt === "string" && d.prompt) base.prompt = d.prompt.slice(0, 500);
        if (typeof d.model === "string") base.model = d.model;
      } else if (n.type === "textPrompt") {
        if (typeof d.prompt === "string") base.prompt = d.prompt.slice(0, 800);
      } else if (n.type === "promptList") {
        base.label = d.label;
        base.lines = Array.isArray(d.lines) ? (d.lines as string[]).slice(0, 20) : [];
      } else if (n.type === "stickyNote") {
        if (typeof d.text === "string") base.text = d.text.slice(0, 200);
      } else if (n.type === "workflowGroup") {
        base.label = d.label;
      }
      return base;
    }),
    edges: page.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })),
  };
}

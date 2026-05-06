"use client";

import { NodeToolbar, Position, useReactFlow, useStore } from "@xyflow/react";
import { ChevronDown, Copy, HelpCircle, MoreHorizontal, Play, Spline, Trash2, Ungroup } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { HoverCard } from "radix-ui";

import { cn } from "@/lib/utils";

import { cloneWorkflowSelection } from "../workflowClone";
import type { WorkflowCanvasNode } from "../workflowFlowTypes";
import type { AdAssetNodeData } from "./AdAssetNode";
import { estimateWorkflowAdAssetRunCredits } from "../workflowNodeRun";

const btn =
  "flex h-8 items-center justify-center rounded-lg text-white transition hover:bg-white/[0.08] active:bg-white/[0.06]";
const iconBtn = cn(btn, "w-8");
const splitMain = cn(btn, "gap-0.5 pl-2.5 pr-1");
const splitChev = cn(btn, "w-7 px-0");

type WorkflowNodeContextToolbarProps = {
  nodeId: string;
  onRun: () => void;
  onRunFromHere?: () => void;
  onUngroup?: () => void;
  /** Sticky notes only need duplicate / delete, no run or path controls. */
  variant?: "module" | "sticky";
};

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-white/[0.12]" aria-hidden />;
}

function isRunnableWorkflowAdAssetKind(kind: AdAssetNodeData["kind"]): boolean {
  return kind === "image" || kind === "video" || kind === "motion" || kind === "assistant" || kind === "website";
}

export function WorkflowNodeContextToolbar({
  nodeId,
  onRun,
  onRunFromHere,
  onUngroup,
  variant = "module",
}: WorkflowNodeContextToolbarProps) {
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const soleSelection = useStore(
    (s) => {
      const sel = s.nodes.filter((n) => n.selected);
      return sel.length === 1 && sel[0]?.id === nodeId;
    },
    (a, b) => a === b,
  );

  const removeSubtree = useCallback(() => {
    const nodes = getNodes() as WorkflowCanvasNode[];
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const removeIds = new Set<string>([nodeId]);
    if (node.type === "workflowGroup") {
      for (const n of nodes) {
        if (n.type === "adAsset" && n.parentId === nodeId) removeIds.add(n.id);
      }
    }
    setNodes(nodes.filter((n) => !removeIds.has(n.id)));
    setEdges(getEdges().filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)));
    const removed =
      node.type === "workflowGroup"
        ? "Group removed"
        : node.type === "stickyNote"
          ? "Note removed"
          : node.type === "textPrompt"
            ? "Prompt text removed"
            : "Module removed";
    toast.success(removed);
  }, [getEdges, getNodes, nodeId, setEdges, setNodes]);

  const duplicateNode = useCallback(() => {
    const nodes = getNodes() as WorkflowCanvasNode[];
    const edges = getEdges();
    const self = nodes.find((n) => n.id === nodeId);
    if (!self) return;
    const res = cloneWorkflowSelection(nodes, edges, [self]);
    if (!res) {
      toast.error("Nothing to duplicate");
      return;
    }
    const selectSet = new Set(res.selectIds);
    setNodes([
      ...nodes.map((n) => ({ ...n, selected: false })),
      ...res.nodesToAdd.map((n) => ({ ...n, selected: selectSet.has(n.id) })),
    ]);
    setEdges((eds) => [...eds, ...res.edgesToAdd]);
    toast.success("Duplicated");
  }, [getEdges, getNodes, nodeId, setEdges, setNodes]);

  const hasDownstream = useMemo(() => {
    const edges = getEdges();
    return edges.some((e) => e.source === nodeId);
  }, [getEdges, nodeId]);

  const runFromHerePlan = useMemo(() => {
    if (!hasDownstream) return null;
    const nodes = getNodes() as WorkflowCanvasNode[];
    const edges = getEdges();

    const byId = new Map(nodes.map((n) => [n.id, n]));
    if (!byId.has(nodeId)) return null;

    const outgoing = new Map<string, string[]>();
    for (const e of edges) {
      if (!outgoing.has(e.source)) outgoing.set(e.source, []);
      outgoing.get(e.source)!.push(e.target);
    }

    const seen = new Set<string>();
    const queue = [nodeId];
    const reachable: string[] = [];
    while (queue.length) {
      const cur = queue.shift()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      reachable.push(cur);
      for (const nxt of outgoing.get(cur) ?? []) {
        if (!seen.has(nxt)) queue.push(nxt);
      }
    }

    const runIds = reachable.filter((nid) => {
      const n = byId.get(nid);
      if (!n || n.type !== "adAsset") return false;
      const d = n.data as AdAssetNodeData;
      return isRunnableWorkflowAdAssetKind(d.kind);
    });
    if (!runIds.length) return { orderedRunIds: [], estimatedCredits: 0, byId };

    // Order runnable nodes topologically within the reachable subgraph.
    const runSet = new Set(runIds);
    const indegree = new Map<string, number>();
    const children = new Map<string, string[]>();
    const reachOrder = new Map<string, number>(reachable.map((nid, idx) => [nid, idx]));
    for (const rid of runIds) {
      indegree.set(rid, 0);
      children.set(rid, []);
    }
    for (const e of edges) {
      if (!runSet.has(e.source) || !runSet.has(e.target)) continue;
      children.get(e.source)!.push(e.target);
      indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    }
    const ready: string[] = runIds.filter((rid) => (indegree.get(rid) ?? 0) === 0);
    ready.sort((a, b) => (reachOrder.get(a) ?? 0) - (reachOrder.get(b) ?? 0));
    const orderedRunIds: string[] = [];
    while (ready.length) {
      const cur = ready.shift()!;
      orderedRunIds.push(cur);
      for (const nxt of children.get(cur) ?? []) {
        const nextDeg = (indegree.get(nxt) ?? 0) - 1;
        indegree.set(nxt, nextDeg);
        if (nextDeg === 0) {
          ready.push(nxt);
          ready.sort((a, b) => (reachOrder.get(a) ?? 0) - (reachOrder.get(b) ?? 0));
        }
      }
    }
    if (orderedRunIds.length !== runIds.length) {
      for (const rid of runIds) if (!orderedRunIds.includes(rid)) orderedRunIds.push(rid);
    }

    const estimatedCredits = orderedRunIds.reduce((sum, nid) => {
      const n = byId.get(nid);
      if (!n || n.type !== "adAsset") return sum;
      const d = n.data as AdAssetNodeData;
      return sum + estimateWorkflowAdAssetRunCredits(d, nid, nodes, edges);
    }, 0);

    return { orderedRunIds, estimatedCredits, byId };
  }, [getEdges, getNodes, hasDownstream, nodeId]);

  const triggerRunMain = useCallback(() => {
    if (!hasDownstream) {
      onRun();
      return;
    }
    setRunMenuOpen((v) => !v);
  }, [hasDownstream, onRun]);

  const triggerRunThisOnly = useCallback(() => {
    setRunMenuOpen(false);
    onRun();
  }, [onRun]);

  const triggerRunFromHere = useCallback(() => {
    setRunMenuOpen(false);
    if (onRunFromHere) onRunFromHere();
    else onRun();
  }, [onRun, onRunFromHere]);

  return (
    <NodeToolbar
      isVisible={soleSelection}
      position={Position.Top}
      offset={14}
      align="center"
      className="!m-0 !border-0 !bg-transparent !p-0 !shadow-none"
    >
      <div
        className="nodrag nopan flex items-center rounded-full border border-white/[0.12] bg-[#14141a]/95 px-1 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-md"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {variant === "module" ? (
          <>
            <div className="relative flex items-center">
              <button type="button" className={splitMain} title="Run" onClick={triggerRunMain}>
                <Play className="h-3.5 w-3.5 fill-white text-white" strokeWidth={0} />
              </button>
              {hasDownstream ? (
                <button
                  type="button"
                  className={splitChev}
                  title="Run options"
                  onClick={() => setRunMenuOpen((v) => !v)}
                >
                  <ChevronDown className="h-3.5 w-3.5 text-white/70" strokeWidth={2.5} />
                </button>
              ) : null}
              {runMenuOpen && hasDownstream ? (
                <div className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[170px] rounded-xl border border-white/12 bg-[#14141a]/95 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur-md">
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-white/90 transition hover:bg-white/[0.08]"
                    onClick={triggerRunThisOnly}
                  >
                    This node only
                  </button>
                  <div className="flex w-full items-center gap-1 rounded-lg px-2.5 py-1.5 transition hover:bg-white/[0.08]">
                    <button
                      type="button"
                      className="flex flex-1 items-center py-0.5 text-left text-[12px] font-medium text-white/90"
                      onClick={triggerRunFromHere}
                    >
                      Run from here
                    </button>
                    {runFromHerePlan ? (
                      <HoverCard.Root openDelay={220} closeDelay={90}>
                        <HoverCard.Trigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/20 text-white/70 transition hover:bg-black/35 hover:text-white"
                            aria-label="Show run plan"
                            title="Show run plan"
                            onClick={(e) => e.preventDefault()}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <HelpCircle className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                          </button>
                        </HoverCard.Trigger>
                        <HoverCard.Portal>
                          <HoverCard.Content
                            side="right"
                            align="start"
                            sideOffset={10}
                            className="z-[200] w-[340px] rounded-xl border border-white/12 bg-[#101018]/95 p-3 shadow-[0_18px_55px_rgba(0,0,0,0.65)] backdrop-blur-md"
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-white/90">Run from here</div>
                                <div className="mt-0.5 text-[11px] text-white/60">
                                  {runFromHerePlan.orderedRunIds.length
                                    ? `${runFromHerePlan.orderedRunIds.length} node(s) • ~${Math.round(
                                        runFromHerePlan.estimatedCredits,
                                      )} credits`
                                    : "No runnable nodes downstream"}
                                </div>
                              </div>
                            </div>
                            {runFromHerePlan.orderedRunIds.length ? (
                              <div className="mt-2 max-h-[240px] overflow-y-auto pr-1">
                                <div className="space-y-1.5">
                                  {runFromHerePlan.orderedRunIds.map((rid, idx) => {
                                    const n = runFromHerePlan.byId.get(rid) as WorkflowCanvasNode | undefined;
                                    const label =
                                      n?.type === "adAsset"
                                        ? (((n.data as AdAssetNodeData).label ?? "").trim() ||
                                          (n.data as AdAssetNodeData).kind)
                                        : n?.type ?? "node";
                                    const kind =
                                      n?.type === "adAsset" ? (n.data as AdAssetNodeData).kind : (n?.type ?? "node");
                                    return (
                                      <div
                                        key={rid}
                                        className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5"
                                      >
                                        <div className="mt-[1px] w-5 shrink-0 text-right text-[10px] font-semibold text-white/35">
                                          {idx + 1}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-[11px] font-semibold text-white/80">{label}</div>
                                          <div className="truncate text-[10px] text-white/45">
                                            {kind} · {rid}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </HoverCard.Content>
                        </HoverCard.Portal>
                      </HoverCard.Root>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <ToolbarDivider />

            <div className="relative flex items-center">
              <button
                type="button"
                className={splitMain}
                title="Path"
                onClick={() =>
                  toast.message("Coming soon", { description: "Reroute and path styles between modules." })
                }
              >
                <Spline className="h-3.5 w-3.5 text-white" strokeWidth={2} />
              </button>
              <button
                type="button"
                className={splitChev}
                title="Path options"
                onClick={() =>
                  toast.message("Coming soon", { description: "Branching and path templates will live here." })
                }
              >
                <ChevronDown className="h-3.5 w-3.5 text-white/70" strokeWidth={2.5} />
              </button>
            </div>

            <ToolbarDivider />
          </>
        ) : null}

        <button type="button" className={iconBtn} title="Delete" onClick={removeSubtree}>
          <Trash2 className="h-3.5 w-3.5 text-white" strokeWidth={2} />
        </button>

        {onUngroup ? (
          <>
            <ToolbarDivider />
            <button type="button" className={iconBtn} title="Ungroup" onClick={onUngroup}>
              <Ungroup className="h-3.5 w-3.5 text-white" strokeWidth={2} />
            </button>
          </>
        ) : null}

        <ToolbarDivider />

        <div className="relative flex items-center">
          <button type="button" className={splitMain} title="Duplicate" onClick={duplicateNode}>
            <Copy className="h-3.5 w-3.5 text-white" strokeWidth={2} />
          </button>
          <button
            type="button"
            className={splitChev}
            title="Duplicate options"
            onClick={() =>
              toast.message("Coming soon", { description: "Duplicate with links, inputs, or into a group." })
            }
          >
            <ChevronDown className="h-3.5 w-3.5 text-white/70" strokeWidth={2.5} />
          </button>
        </div>

        {variant === "module" ? (
          <>
            <ToolbarDivider />

            <button
              type="button"
              className={iconBtn}
              title="More"
              onClick={() =>
                toast.message("Coming soon", { description: "Rename, notes, and advanced module settings." })
              }
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-white" strokeWidth={2} />
            </button>
          </>
        ) : null}
      </div>
    </NodeToolbar>
  );
}

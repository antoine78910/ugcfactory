"use client";

import { NodeToolbar, Position, useReactFlow, useStore } from "@xyflow/react";
import { ArrowDown, ChevronDown, Coins, Copy, HelpCircle, MoreHorizontal, Play, Spline, Trash2, Ungroup } from "lucide-react";
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
    if (!runIds.length) {
      return {
        orderedRunIds: [],
        estimatedCredits: 0,
        byId,
        perStepCredits: new Map<string, number>(),
        parentStepIndices: new Map<string, number[]>(),
      };
    }

    // Order runnable nodes topologically within the reachable subgraph.
    const runSet = new Set(runIds);
    const indegree = new Map<string, number>();
    const children = new Map<string, string[]>();
    const parents = new Map<string, string[]>();
    const reachOrder = new Map<string, number>(reachable.map((nid, idx) => [nid, idx]));
    for (const rid of runIds) {
      indegree.set(rid, 0);
      children.set(rid, []);
      parents.set(rid, []);
    }
    for (const e of edges) {
      if (!runSet.has(e.source) || !runSet.has(e.target)) continue;
      children.get(e.source)!.push(e.target);
      parents.get(e.target)!.push(e.source);
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

    const indexOfRunId = new Map<string, number>(orderedRunIds.map((rid, idx) => [rid, idx]));
    const parentStepIndices = new Map<string, number[]>();
    for (const rid of orderedRunIds) {
      const pIds = parents.get(rid) ?? [];
      const pIdx = pIds
        .map((p) => indexOfRunId.get(p))
        .filter((v): v is number => typeof v === "number")
        .sort((a, b) => a - b);
      parentStepIndices.set(rid, pIdx);
    }

    const perStepCredits = new Map<string, number>();
    let estimatedCredits = 0;
    for (const rid of orderedRunIds) {
      const n = byId.get(rid);
      if (!n || n.type !== "adAsset") continue;
      const d = n.data as AdAssetNodeData;
      const cost = estimateWorkflowAdAssetRunCredits(d, rid, nodes, edges);
      perStepCredits.set(rid, cost);
      estimatedCredits += cost;
    }

    return { orderedRunIds, estimatedCredits, byId, perStepCredits, parentStepIndices };
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
              {/**
               * Inline help button: always visible (when there's downstream) so users
               * never have to dig through a dropdown to see the full run-from-here plan.
               * Hover OR click to open; the popover lists every step in topological
               * order with its individual credit cost and parent-step references.
               */}
              {runFromHerePlan ? (
                <HoverCard.Root openDelay={120} closeDelay={120}>
                  <HoverCard.Trigger asChild>
                    <button
                      type="button"
                      className={cn(iconBtn, "ml-0.5 text-white/65 hover:text-white")}
                      aria-label="Show run-from-here plan"
                      title="Show run-from-here plan"
                      onClick={(e) => e.preventDefault()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <HelpCircle className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                    </button>
                  </HoverCard.Trigger>
                  <HoverCard.Portal>
                    <HoverCard.Content
                      side="top"
                      align="center"
                      sideOffset={12}
                      className="z-[200] w-[360px] rounded-xl border border-white/12 bg-[#101018]/95 p-3 shadow-[0_18px_55px_rgba(0,0,0,0.65)] backdrop-blur-md"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-white/90">Run from here</div>
                          <div className="mt-0.5 text-[11px] text-white/60">
                            {runFromHerePlan.orderedRunIds.length
                              ? `${runFromHerePlan.orderedRunIds.length} step${runFromHerePlan.orderedRunIds.length > 1 ? "s" : ""} chained from this module`
                              : "No runnable modules downstream"}
                          </div>
                        </div>
                        {runFromHerePlan.orderedRunIds.length ? (
                          <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                            <Coins className="h-3 w-3" strokeWidth={2.2} aria-hidden />~
                            {Math.round(runFromHerePlan.estimatedCredits)}
                          </div>
                        ) : null}
                      </div>
                      {runFromHerePlan.orderedRunIds.length ? (
                        <div className="mt-2 max-h-[280px] overflow-y-auto pr-1">
                          <div className="space-y-0.5">
                            {runFromHerePlan.orderedRunIds.map((rid, idx) => {
                              const n = runFromHerePlan.byId.get(rid) as
                                | WorkflowCanvasNode
                                | undefined;
                              const label =
                                n?.type === "adAsset"
                                  ? (((n.data as AdAssetNodeData).label ?? "").trim() ||
                                    (n.data as AdAssetNodeData).kind)
                                  : n?.type ?? "node";
                              const kind =
                                n?.type === "adAsset"
                                  ? (n.data as AdAssetNodeData).kind
                                  : (n?.type ?? "node");
                              const cost = runFromHerePlan.perStepCredits.get(rid) ?? 0;
                              const parents = runFromHerePlan.parentStepIndices.get(rid) ?? [];
                              const isLast = idx === runFromHerePlan.orderedRunIds.length - 1;
                              return (
                                <div key={rid}>
                                  <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
                                    <div className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-[10px] font-semibold text-white/65">
                                      {idx + 1}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="truncate text-[11px] font-semibold text-white/85">
                                          {label}
                                        </div>
                                        <div className="inline-flex shrink-0 items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-[1px] text-[10px] font-medium text-white/75">
                                          <Coins className="h-2.5 w-2.5 text-amber-200" strokeWidth={2.4} aria-hidden />
                                          {cost > 0 ? `~${Math.round(cost)}` : "—"}
                                        </div>
                                      </div>
                                      <div className="mt-[1px] flex items-center gap-1.5 text-[10px] text-white/45">
                                        <span className="rounded bg-white/[0.05] px-1 py-[1px] font-medium uppercase tracking-wide text-white/55">
                                          {kind}
                                        </span>
                                        {parents.length ? (
                                          <span className="truncate">
                                            ← from {parents.map((p) => `#${p + 1}`).join(", ")}
                                          </span>
                                        ) : (
                                          <span className="italic text-white/35">starts the chain</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  {!isLast ? (
                                    <div className="my-0.5 flex items-center justify-center">
                                      <ArrowDown className="h-3 w-3 text-white/30" strokeWidth={2.2} aria-hidden />
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-white/55">
                          Connect this module to an image/video/motion generator (or
                          assistant) to enable Run from here.
                        </div>
                      )}
                    </HoverCard.Content>
                  </HoverCard.Portal>
                </HoverCard.Root>
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
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-white/90 transition hover:bg-white/[0.08]"
                    onClick={triggerRunFromHere}
                  >
                    Run from here
                  </button>
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

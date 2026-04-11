"use client";

import { NodeToolbar, Position, useReactFlow, useStore } from "@xyflow/react";
import { ChevronDown, Copy, MoreHorizontal, Play, Spline, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { cloneWorkflowSelection } from "../workflowClone";
import type { WorkflowCanvasNode } from "../workflowFlowTypes";

const btn =
  "flex h-8 items-center justify-center rounded-lg text-white transition hover:bg-white/[0.08] active:bg-white/[0.06]";
const iconBtn = cn(btn, "w-8");
const splitMain = cn(btn, "gap-0.5 pl-2.5 pr-1");
const splitChev = cn(btn, "w-7 px-0");

type WorkflowNodeContextToolbarProps = {
  nodeId: string;
  onRun: () => void;
  /** Sticky notes only need duplicate / delete — no run or path controls. */
  variant?: "module" | "sticky";
};

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-white/[0.12]" aria-hidden />;
}

export function WorkflowNodeContextToolbar({
  nodeId,
  onRun,
  variant = "module",
}: WorkflowNodeContextToolbarProps) {
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();
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
      node.type === "workflowGroup" ? "Group removed" : node.type === "stickyNote" ? "Note removed" : "Module removed";
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
              <button type="button" className={splitMain} title="Run" onClick={onRun}>
                <Play className="h-3.5 w-3.5 fill-white text-white" strokeWidth={0} />
              </button>
              <button
                type="button"
                className={splitChev}
                title="Run options"
                onClick={() =>
                  toast.message("Coming soon", { description: "Queue, presets, and batch runs will live here." })
                }
              >
                <ChevronDown className="h-3.5 w-3.5 text-white/70" strokeWidth={2.5} />
              </button>
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

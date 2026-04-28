"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { FileText, Type } from "lucide-react";
import { useCallback } from "react";

import { cn } from "@/lib/utils";

import { useWorkflowNodePatch } from "../workflowNodePatchContext";
import { keepWheelInsideScrollable } from "../workflowWheelScroll";
import { WorkflowNodeContextToolbar } from "./WorkflowNodeContextToolbar";

export type TextPromptNodeData = {
  prompt: string;
};

export type TextPromptNodeType = Node<TextPromptNodeData, "textPrompt">;

const defaultData: TextPromptNodeData = { prompt: "" };

export function TextPromptNode({ id, data: rawData, selected }: NodeProps<TextPromptNodeType>) {
  const data = { ...defaultData, ...rawData };
  const patchAll = useWorkflowNodePatch();
  const patch = useCallback((p: Partial<TextPromptNodeData>) => patchAll(id, p), [id, patchAll]);
  const outputBubbleShellClass =
    "workflow-port-create-cursor nodrag nopan relative h-8 w-8 shrink-0 rounded-full border border-white/15 bg-[#15151a]/95 transition";
  const outputBubbleHandleClass =
    "workflow-port-create-cursor nodrag nopan !absolute !inset-0 !z-[2] !box-border !h-8 !w-8 !min-h-8 !min-w-8 !max-h-8 !max-w-8 !rounded-full !border-0 !bg-transparent opacity-0 !transform-none";

  return (
    <>
      <WorkflowNodeContextToolbar nodeId={id} onRun={() => {}} variant="sticky" />
      <div
        className="relative flex items-start gap-1"
        onMouseEnter={() => window.dispatchEvent(new CustomEvent("workflow:hover-node", { detail: { nodeId: id } }))}
        onMouseLeave={() => window.dispatchEvent(new CustomEvent("workflow:unhover-node"))}
      >
        <div
          className={cn(
            "relative flex w-[260px] flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#0a0a0c] shadow-[0_12px_40px_rgba(0,0,0,0.55)]",
            selected && "ring-2 ring-violet-500/85 ring-offset-2 ring-offset-[#06070d]",
          )}
        >
          <div className="flex items-center gap-2 border-b border-white/[0.08] px-2.5 py-2">
            <FileText className="h-3.5 w-3.5 shrink-0 text-white/50" strokeWidth={2} aria-hidden />
            <span className="select-none text-[10px] font-semibold uppercase tracking-wide text-white/45">Prompt text</span>
          </div>
          <div className="p-2.5">
            <textarea
              value={data.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
              placeholder="Type the prompt to send into connected generators…"
              rows={6}
              onWheelCapture={keepWheelInsideScrollable}
              className="nodrag nopan nowheel w-full resize-y rounded-lg border border-white/12 bg-black/50 px-2.5 py-2 text-[13px] leading-snug text-white/90 placeholder:text-white/28 outline-none focus:border-violet-500/35"
            />
          </div>
        </div>
        <div className="nodrag nopan relative z-[7] mt-2 flex shrink-0 flex-col gap-1">
          <div className={outputBubbleShellClass}>
            <Handle id="out" type="source" position={Position.Right} className={outputBubbleHandleClass} />
            <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/85">
              <Type className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

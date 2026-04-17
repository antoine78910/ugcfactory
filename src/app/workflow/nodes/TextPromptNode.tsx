"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";
import { useCallback } from "react";

import { cn } from "@/lib/utils";

import { useWorkflowNodePatch } from "../workflowNodePatchContext";
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

  return (
    <>
      <WorkflowNodeContextToolbar nodeId={id} onRun={() => {}} variant="sticky" />
      <div
        className={cn(
          "relative flex w-[260px] flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#0a0a0c] shadow-[0_12px_40px_rgba(0,0,0,0.55)]",
          selected && "ring-2 ring-violet-500/85 ring-offset-2 ring-offset-[#06070d]",
        )}
        onMouseEnter={() => window.dispatchEvent(new CustomEvent("workflow:hover-node", { detail: { nodeId: id } }))}
        onMouseLeave={() => window.dispatchEvent(new CustomEvent("workflow:unhover-node"))}
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
            className="nodrag nopan w-full resize-y rounded-lg border border-white/12 bg-black/50 px-2.5 py-2 text-[13px] leading-snug text-white/90 placeholder:text-white/28 outline-none focus:border-violet-500/35"
          />
        </div>
        <Handle
          id="out"
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-violet-500/45 !bg-[#06070d]"
        />
      </div>
    </>
  );
}

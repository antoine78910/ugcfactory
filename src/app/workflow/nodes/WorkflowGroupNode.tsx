"use client";

import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { useWorkflowNodePatch } from "../workflowNodePatchContext";

export type WorkflowGroupNodeData = {
  label: string;
  /** CSS color (hex or rgb) for border / accents */
  color: string;
};

export type WorkflowGroupNodeType = Node<WorkflowGroupNodeData, "workflowGroup">;

export const GROUP_COLOR_PRESETS = [
  { value: "#a78bfa", label: "Violet" },
  { value: "#60a5fa", label: "Blue" },
  { value: "#34d399", label: "Emerald" },
  { value: "#fbbf24", label: "Amber" },
  { value: "#fb7185", label: "Rose" },
  { value: "#22d3ee", label: "Cyan" },
] as const;

export function WorkflowGroupNode({ id, data, selected }: NodeProps<WorkflowGroupNodeType>) {
  const patch = useWorkflowNodePatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(data.label);
  }, [data.label, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitLabel = useCallback(() => {
    setEditing(false);
    const next = draft.trim() || "Group";
    patch(id, { label: next });
  }, [draft, id, patch]);

  const border = data.color || GROUP_COLOR_PRESETS[0].value;

  return (
    <>
      <NodeResizer
        minWidth={200}
        minHeight={160}
        isVisible={selected}
        lineClassName="!border-white/25"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border !border-white/40 !bg-[#12101a]"
      />
      <div
        className={cn(
          "h-full w-full rounded-2xl border-2 border-dashed bg-black/20",
          "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]",
        )}
        style={{ borderColor: border }}
      >
        <div
          className="nodrag nopan flex items-center gap-2 rounded-t-[14px] border-b border-white/[0.08] px-2.5 py-2"
          style={{ backgroundColor: `${border}18` }}
        >
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitLabel();
                if (e.key === "Escape") {
                  setDraft(data.label);
                  setEditing(false);
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/35 px-2 py-1 text-[12px] font-semibold text-white outline-none focus:ring-1 focus:ring-white/25"
            />
          ) : (
            <button
              type="button"
              title="Double-click to rename"
              onDoubleClick={() => setEditing(true)}
              className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-white/90"
            >
              {data.label}
            </button>
          )}
          <div className="flex shrink-0 gap-1">
            {GROUP_COLOR_PRESETS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                className={cn(
                  "h-4 w-4 rounded-full border border-white/20 shadow-sm transition hover:scale-110",
                  data.color === c.value && "ring-2 ring-white/50 ring-offset-1 ring-offset-[#0b0912]",
                )}
                style={{ backgroundColor: c.value }}
                onClick={() => patch(id, { color: c.value })}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { useWorkflowNodePatch } from "../workflowNodePatchContext";
import { WorkflowNodeContextToolbar } from "./WorkflowNodeContextToolbar";

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

function hexForColorInput(hex: string | undefined): string {
  const v = (hex ?? "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  return GROUP_COLOR_PRESETS[0].value;
}

/** 8-digit #RRGGBBAA for tinted fills (hex colors only). */
function hexWithAlpha(hex: string, alphaByte: string): string | null {
  const v = hex.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) return null;
  return `${v}${alphaByte}`;
}

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
  const areaFill = hexWithAlpha(border, "2e");
  const headerFill = hexWithAlpha(border, "40");

  return (
    <>
      <WorkflowNodeContextToolbar
        nodeId={id}
        onRun={() =>
          toast.message("Run group", {
            description: "End-to-end runs for every module in this group will be available soon.",
          })
        }
      />
      <NodeResizer
        minWidth={200}
        minHeight={160}
        isVisible={selected}
        lineClassName="!border-white/25"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border !border-white/40 !bg-[#12101a]"
      />
      <div
        className={cn(
          "h-full w-full rounded-2xl border-2 border-dashed",
          !areaFill && "bg-black/30",
          selected && "ring-2 ring-violet-400/75 ring-offset-2 ring-offset-transparent",
        )}
        style={{
          borderColor: border,
          ...(areaFill ? { backgroundColor: areaFill } : {}),
          boxShadow: `inset 0 0 0 1px ${hexWithAlpha(border, "55") ?? "rgba(255,255,255,0.08)"}, inset 0 0 48px ${hexWithAlpha(border, "18") ?? "transparent"}`,
        }}
      >
        <div
          className="nodrag nopan flex items-start justify-between gap-2 rounded-t-[14px] border-b px-2.5 py-2"
          style={{
            backgroundColor: headerFill ?? `${border}18`,
            borderBottomColor: hexWithAlpha(border, "55") ?? "rgba(255,255,255,0.12)",
          }}
        >
          <div className="min-w-0 flex-1 self-start">
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
                className="w-full rounded-lg border border-white/15 bg-black/35 px-2 py-1 text-left text-[12px] font-semibold text-white outline-none focus:ring-1 focus:ring-white/25"
              />
            ) : (
              <button
                type="button"
                title="Double-click to rename"
                onDoubleClick={() => setEditing(true)}
                className="block w-full truncate text-left text-[12px] font-semibold leading-tight text-white/90"
              >
                {data.label}
              </button>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 pt-0.5">
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
            <label className="ml-0.5 flex cursor-pointer items-center rounded border border-white/15 bg-black/25 px-1 py-0.5 hover:border-white/25">
              <span className="sr-only">Custom group color</span>
              <input
                type="color"
                value={hexForColorInput(data.color)}
                onChange={(e) => patch(id, { color: e.target.value })}
                className="h-4 w-7 cursor-pointer border-0 bg-transparent p-0"
                title="Custom color"
              />
            </label>
          </div>
        </div>
      </div>
    </>
  );
}

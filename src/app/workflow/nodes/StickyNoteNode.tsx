"use client";

import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { GripVertical, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import type { WorkflowCanvasNode } from "../workflowFlowTypes";
import { useWorkflowNodePatch } from "../workflowNodePatchContext";
import { STICKY_NOTE_DEFAULT_DATA, type StickyNoteNodeData, type StickyNoteNodeType } from "../workflowStickyNoteTypes";
import { StickyNoteNodeToolbar } from "./StickyNoteNodeToolbar";

export type { StickyNoteNodeData, StickyNoteNodeType } from "../workflowStickyNoteTypes";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizedHtml(data: StickyNoteNodeData): string {
  if (data.html && data.html.trim()) return data.html;
  if (data.text?.trim()) return `<p>${escapeHtml(data.text)}</p>`;
  return "<p><br></p>";
}

function mergeStickyData(data: StickyNoteNodeData): StickyNoteNodeData {
  return { ...STICKY_NOTE_DEFAULT_DATA, ...data };
}

export function StickyNoteNode({ id, data: rawData, selected }: NodeProps<StickyNoteNodeType>) {
  const data = mergeStickyData(rawData);
  const patchAll = useWorkflowNodePatch();
  const editorRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef(false);
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();

  const patch = useCallback(
    (p: Partial<StickyNoteNodeData>) => {
      patchAll(id, p);
    },
    [id, patchAll],
  );

  // Sync external updates (undo/redo) without fighting the active editor selection.
  useEffect(() => {
    if (editingRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    const next = normalizedHtml(data);
    if (el.innerHTML !== next) el.innerHTML = next;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync when serialized content changes
  }, [data.html, data.text, id]);

  const onInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    patch({
      html: el.innerHTML,
      text: el.innerText.replace(/\u00a0/g, " ").trim() ? el.innerText : "",
    });
  }, [patch]);

  const deleteNode = useCallback(() => {
    const nodes = getNodes() as WorkflowCanvasNode[];
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(getEdges().filter((e) => e.source !== id && e.target !== id));
    toast.success("Note deleted");
  }, [getEdges, getNodes, id, setEdges, setNodes]);
  const openOutputCreatePicker = useCallback(
    (targetEl: HTMLElement) => {
      const rect = targetEl.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent("workflow:open-output-picker", {
          detail: {
            sourceNodeId: id,
            sourceHandleId: "out",
            screenX: Math.round(rect.right + 10),
            screenY: Math.round(rect.top + rect.height / 2),
          },
        }),
      );
    },
    [id],
  );

  const shapeClass =
    data.shape === "square" ? "rounded-sm" : data.shape === "pill" ? "rounded-[2rem]" : "rounded-xl";

  const sizeClass =
    data.size === "small"
      ? "min-h-[96px] w-[200px] text-xs leading-snug"
      : data.size === "large"
        ? "min-h-[168px] w-[280px] text-base leading-relaxed"
        : "min-h-[128px] w-[240px] text-[13px] leading-snug";

  const borderColor = "rgba(255,255,255,0.16)";

  return (
    <>
      <StickyNoteNodeToolbar nodeId={id} data={data} selected={selected} patch={patch} editorRef={editorRef} />
      <div
        className={cn(
          "workflow-sticky-note flex flex-col overflow-hidden border shadow-[0_12px_28px_rgba(0,0,0,0.35)]",
          shapeClass,
          sizeClass,
          selected && "ring-2 ring-violet-500/85 ring-offset-2 ring-offset-[#06070d]",
        )}
        style={{
          backgroundColor: data.color,
          borderColor,
          color: data.textColor,
        }}
        onMouseEnter={() => window.dispatchEvent(new CustomEvent("workflow:hover-node", { detail: { nodeId: id } }))}
        onMouseLeave={() => window.dispatchEvent(new CustomEvent("workflow:unhover-node"))}
      >
        {/* Draggable strip (editor is nodrag, without this, only the thin padding could move the note). */}
        <div
          className="flex shrink-0 cursor-grab items-center gap-1 border-b border-white/10 px-2 py-1.5 active:cursor-grabbing"
          title="Drag to move"
        >
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-700/70" strokeWidth={2.25} aria-hidden />
          <span
            id={`workflow-sticky-label-${id}`}
            className="select-none text-[10px] font-semibold uppercase tracking-wide text-zinc-700/80"
          >
            Note
          </span>
          <button
            type="button"
            onClick={deleteNode}
            className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-700/80 transition hover:bg-rose-500/15 hover:text-rose-700"
            title="Delete note"
            aria-label="Delete note"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 pt-1.5">
          <div
            ref={editorRef}
            id={`workflow-sticky-ed-${id}`}
            aria-labelledby={`workflow-sticky-label-${id}`}
            className={cn(
              "nodrag nopan max-h-[min(40vh,280px)] min-h-[3.25rem] w-full flex-1 overflow-y-auto outline-none",
              "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
              "[&_p]:text-inherit [&_span]:text-inherit",
            )}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => {
              editingRef.current = true;
            }}
            onBlur={() => {
              editingRef.current = false;
              onInput();
            }}
            onInput={onInput}
          />
        </div>
        <Handle
          id="in"
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-amber-600/45 !bg-amber-100"
        />
        <Handle
          id="out"
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-amber-600/45 !bg-amber-100"
        />
        <button
          type="button"
          className="workflow-port-create-cursor absolute -right-4 top-1/2 z-[6] h-6 w-6 -translate-y-1/2 cursor-crosshair rounded-full"
          title="Click to add a connected module"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openOutputCreatePicker(e.currentTarget);
          }}
        />
      </div>
    </>
  );
}

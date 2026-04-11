"use client";

import { type NodeProps } from "@xyflow/react";
import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

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

  const shapeClass =
    data.shape === "square" ? "rounded-sm" : data.shape === "pill" ? "rounded-[2rem]" : "rounded-xl";

  const sizeClass =
    data.size === "small"
      ? "min-h-[96px] w-[200px] text-xs leading-snug"
      : data.size === "large"
        ? "min-h-[168px] w-[280px] text-base leading-relaxed"
        : "min-h-[128px] w-[240px] text-[13px] leading-snug";

  const borderColor = "rgba(0,0,0,0.12)";

  return (
    <>
      <StickyNoteNodeToolbar nodeId={id} data={data} selected={selected} patch={patch} editorRef={editorRef} />
      <div
        className={cn(
          "workflow-sticky-note flex flex-col overflow-hidden border shadow-[0_12px_28px_rgba(0,0,0,0.35)]",
          shapeClass,
          sizeClass,
          selected && "ring-2 ring-amber-400/90 ring-offset-2 ring-offset-[#06070d]",
        )}
        style={{
          backgroundColor: data.color,
          borderColor,
          color: "#18181b",
        }}
      >
        {/* Draggable strip (editor is nodrag — without this, only the thin padding could move the note). */}
        <div
          className="flex shrink-0 cursor-grab items-center gap-1 border-b border-black/10 px-2 py-1.5 active:cursor-grabbing"
          title="Drag to move"
        >
          <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-45" strokeWidth={2.25} aria-hidden />
          <span
            id={`workflow-sticky-label-${id}`}
            className="select-none text-[10px] font-semibold uppercase tracking-wide text-zinc-800/75"
          >
            Comment
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 pt-1.5">
          <div
            ref={editorRef}
            id={`workflow-sticky-ed-${id}`}
            aria-labelledby={`workflow-sticky-label-${id}`}
            className={cn(
              "nodrag nopan max-h-[min(40vh,280px)] min-h-[3.25rem] w-full flex-1 overflow-y-auto outline-none",
              "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
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
      </div>
    </>
  );
}

"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { FileText, Type } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { useWorkflowNodePatch } from "../workflowNodePatchContext";
import { keepWheelInsideScrollable } from "../workflowWheelScroll";
import { WorkflowNodeContextToolbar } from "./WorkflowNodeContextToolbar";

export type TextPromptNodeData = {
  prompt: string;
};

export type TextPromptNodeType = Node<TextPromptNodeData, "textPrompt">;

const defaultData: TextPromptNodeData = { prompt: "" };

const TEXT_PROMPT_EDITOR_WIDTH_MIN = 300;
const TEXT_PROMPT_EDITOR_WIDTH_MAX = 920;

export function TextPromptNode({ id, data: rawData, selected }: NodeProps<TextPromptNodeType>) {
  const data = { ...defaultData, ...rawData };
  const patchAll = useWorkflowNodePatch();
  const patch = useCallback((p: Partial<TextPromptNodeData>) => patchAll(id, p), [id, patchAll]);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [promptEditorDraft, setPromptEditorDraft] = useState(data.prompt);
  const [promptEditorWidthPx, setPromptEditorWidthPx] = useState(420);
  const promptEditorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const promptEditorResizeRef = useRef<{ pointerId: number; startX: number; startW: number } | null>(null);

  const openPromptEditor = useCallback(() => {
    setPromptEditorDraft(data.prompt);
    setPromptEditorWidthPx(
      Math.min(
        TEXT_PROMPT_EDITOR_WIDTH_MAX,
        Math.max(TEXT_PROMPT_EDITOR_WIDTH_MIN, Math.round(260 * 1.35)),
      ),
    );
    setPromptEditorOpen(true);
  }, [data.prompt]);

  const closePromptEditor = useCallback(() => {
    patch({ prompt: promptEditorDraft });
    setPromptEditorOpen(false);
  }, [patch, promptEditorDraft]);

  const onPromptEditorResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      promptEditorResizeRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startW: promptEditorWidthPx,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [promptEditorWidthPx],
  );

  useEffect(() => {
    if (!promptEditorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePromptEditor();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePromptEditor, promptEditorOpen]);

  useEffect(() => {
    if (!promptEditorOpen) return;
    const raf = requestAnimationFrame(() => promptEditorTextareaRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [promptEditorOpen]);

  useEffect(() => {
    if (!promptEditorOpen) return;
    const onMove = (e: PointerEvent) => {
      const st = promptEditorResizeRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      const dx = e.clientX - st.startX;
      const next = Math.min(
        TEXT_PROMPT_EDITOR_WIDTH_MAX,
        Math.max(TEXT_PROMPT_EDITOR_WIDTH_MIN, st.startW + dx),
      );
      setPromptEditorWidthPx(next);
    };
    const onEnd = (e: PointerEvent) => {
      const st = promptEditorResizeRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      promptEditorResizeRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [promptEditorOpen]);

  const outputBubbleShellClass =
    "workflow-port-create-cursor nodrag nopan relative h-8 w-8 shrink-0 rounded-full border border-transparent bg-transparent shadow-none";
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
          <div className="relative p-2.5">
            <div className={cn(promptEditorOpen && "pointer-events-none opacity-35 blur-[1.5px]")}>
              <textarea
                value={data.prompt}
                onChange={(e) => patch({ prompt: e.target.value })}
                placeholder="Type the prompt to send into connected generators…"
                rows={6}
                onWheelCapture={keepWheelInsideScrollable}
                onFocus={(e) => {
                  openPromptEditor();
                  requestAnimationFrame(() => e.currentTarget.blur());
                }}
                className="nodrag nopan nowheel w-full resize-y rounded-lg border border-white/12 bg-black/50 px-2.5 py-2 text-[13px] leading-snug text-white/90 placeholder:text-white/28 outline-none focus:border-violet-500/35"
              />
            </div>

            {promptEditorOpen ? (
              <div className="nodrag nopan absolute inset-0 z-[24] flex items-center justify-center p-2">
                <button
                  type="button"
                  aria-label="Close prompt editor"
                  className="absolute inset-0 z-0 rounded-b-xl bg-black/45 backdrop-blur-sm"
                  onClick={closePromptEditor}
                />
                <div
                  className="relative z-[25] flex max-h-[min(78vh,92%)] flex-col rounded-xl border border-violet-400/40 bg-[#15151a]/96 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur-md"
                  style={{ width: promptEditorWidthPx, maxWidth: "min(920px, calc(100vw - 24px))" }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    title="Drag to resize width"
                    onPointerDown={onPromptEditorResizePointerDown}
                    className="nodrag nopan absolute -right-1 bottom-2 top-2 z-[2] w-3 cursor-ew-resize rounded-full border border-white/10 bg-white/[0.06] hover:bg-white/[0.12]"
                  />
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-white/65">Edit prompt</p>
                    <button
                      type="button"
                      onClick={closePromptEditor}
                      className="rounded-md px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white"
                    >
                      Done
                    </button>
                  </div>
                  <textarea
                    ref={promptEditorTextareaRef}
                    value={promptEditorDraft}
                    onChange={(e) => setPromptEditorDraft(e.target.value)}
                    placeholder="Type the prompt to send into connected generators…"
                    rows={10}
                    onWheelCapture={keepWheelInsideScrollable}
                    className="nodrag nopan nowheel min-h-[200px] max-h-[52vh] w-full resize-y overflow-y-scroll rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-[13px] leading-relaxed text-white/92 placeholder:text-white/28 outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/25 studio-params-scroll"
                  />
                </div>
              </div>
            ) : null}
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

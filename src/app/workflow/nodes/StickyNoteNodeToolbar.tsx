"use client";

import { NodeToolbar, Position, useReactFlow, useStore } from "@xyflow/react";
import {
  Bold,
  ChevronDown,
  Circle,
  CopyPlus,
  Italic,
  List,
  ListOrdered,
  MoreHorizontal,
  Square,
  Squircle,
  Strikethrough,
  Trash2,
} from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cloneWorkflowSelection } from "../workflowClone";
import type { WorkflowCanvasNode } from "../workflowFlowTypes";
import { STICKY_NOTE_COLOR_PRESETS } from "../workflowStickyNoteTypes";
import type { StickyNoteNodeData, StickyNoteShape, StickyNoteSize } from "../workflowStickyNoteTypes";

const tbBtn =
  "flex h-8 min-w-8 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/[0.08] active:bg-white/[0.06]";
const tbDivider = "mx-0.5 h-5 w-px shrink-0 bg-white/[0.12]";

type Patch = (patch: Partial<StickyNoteNodeData>) => void;

type StickyNoteNodeToolbarProps = {
  nodeId: string;
  data: StickyNoteNodeData;
  selected: boolean;
  patch: Patch;
  editorRef: React.RefObject<HTMLDivElement | null>;
};

function focusEditor(ref: React.RefObject<HTMLDivElement | null>) {
  ref.current?.focus();
}

export function StickyNoteNodeToolbar({ nodeId, data, selected, patch, editorRef }: StickyNoteNodeToolbarProps) {
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  const soleSelection = useStore(
    (s) => {
      const sel = s.nodes.filter((n) => n.selected);
      return sel.length === 1 && sel[0]?.id === nodeId;
    },
    (a, b) => a === b,
  );

  const runFormat = useCallback(
    (command: string, value?: string) => {
      focusEditor(editorRef);
      try {
        document.execCommand(command, false, value);
      } catch {
        /* ignore */
      }
    },
    [editorRef],
  );

  const removeNote = useCallback(() => {
    const nodes = getNodes() as WorkflowCanvasNode[];
    setNodes(nodes.filter((n) => n.id !== nodeId));
    setEdges(getEdges().filter((e) => e.source !== nodeId && e.target !== nodeId));
    toast.success("Note removed");
  }, [getEdges, getNodes, nodeId, setEdges, setNodes]);

  const duplicateNote = useCallback(() => {
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
      isVisible={selected && soleSelection}
      position={Position.Top}
      offset={14}
      align="center"
      className="!m-0 !border-0 !bg-transparent !p-0 !shadow-none"
    >
      <div
        className="nodrag nopan flex max-w-[min(100vw-24px,640px)] flex-wrap items-center gap-0.5 rounded-full border border-white/[0.12] bg-[#14141a]/95 px-1.5 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-md"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Select
          value={data.color}
          onValueChange={(v) => {
            patch({ color: v });
          }}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-auto gap-1.5 border-white/10 bg-white/[0.06] px-2 text-[12px] text-white/85 hover:bg-white/[0.1]"
            aria-label="Note color"
          >
            <SelectValue className="sr-only">Color</SelectValue>
            <span
              className="h-4 w-4 shrink-0 rounded-full border border-black/10 shadow-sm"
              style={{ backgroundColor: data.color }}
              aria-hidden
            />
            <ChevronDown className="h-3.5 w-3.5 opacity-60" strokeWidth={2.5} />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#1a1824] text-white">
            {STICKY_NOTE_COLOR_PRESETS.map((c) => (
              <SelectItem key={c.value} value={c.value} className="text-[13px]">
                <span className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded-full border border-white/10"
                    style={{ backgroundColor: c.value }}
                    aria-hidden
                  />
                  {c.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className={tbDivider} aria-hidden />

        <Select
          value={data.size}
          onValueChange={(v) => patch({ size: v as StickyNoteSize })}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-auto min-w-[5.5rem] border-white/10 bg-white/[0.06] px-2 text-[12px] capitalize text-white/85 hover:bg-white/[0.1]"
            aria-label="Note size"
          >
            <SelectValue />
            <ChevronDown className="h-3.5 w-3.5 opacity-60" strokeWidth={2.5} />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#1a1824] text-white">
            <SelectItem value="small" className="text-[13px]">
              Small
            </SelectItem>
            <SelectItem value="medium" className="text-[13px]">
              Medium
            </SelectItem>
            <SelectItem value="large" className="text-[13px]">
              Large
            </SelectItem>
          </SelectContent>
        </Select>

        <div className={tbDivider} aria-hidden />

        <button
          type="button"
          className={tbBtn}
          title="Bold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormat("bold")}
        >
          <Bold className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className={tbBtn}
          title="Italic"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormat("italic")}
        >
          <Italic className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className={tbBtn}
          title="Bulleted list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormat("insertUnorderedList")}
        >
          <List className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className={tbBtn}
          title="Numbered list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormat("insertOrderedList")}
        >
          <ListOrdered className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className={tbBtn}
          title="Strikethrough"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runFormat("strikeThrough")}
        >
          <Strikethrough className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>

        <div className={tbDivider} aria-hidden />

        <button type="button" className={tbBtn} title="Duplicate" onClick={duplicateNote}>
          <CopyPlus className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button type="button" className={tbBtn} title="Delete" onClick={removeNote}>
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>

        <div className={tbDivider} aria-hidden />

        <Select
          value={data.shape}
          onValueChange={(v) => patch({ shape: v as StickyNoteShape })}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-auto gap-1 border-white/10 bg-white/[0.06] px-2 text-white/85 hover:bg-white/[0.1]"
            aria-label="Note shape"
          >
            <SelectValue className="sr-only">Shape</SelectValue>
            {data.shape === "square" ? (
              <Square className="h-3.5 w-3.5" strokeWidth={2.25} />
            ) : data.shape === "pill" ? (
              <Circle className="h-3.5 w-3.5" strokeWidth={2.25} />
            ) : (
              <Squircle className="h-3.5 w-3.5" strokeWidth={2.25} />
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" strokeWidth={2.5} />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#1a1824] text-white">
            <SelectItem value="square" className="text-[13px]">
              <span className="flex items-center gap-2">
                <Square className="h-4 w-4" strokeWidth={2} /> Square
              </span>
            </SelectItem>
            <SelectItem value="rounded" className="text-[13px]">
              <span className="flex items-center gap-2">
                <Squircle className="h-4 w-4" strokeWidth={2} /> Rounded
              </span>
            </SelectItem>
            <SelectItem value="pill" className="text-[13px]">
              <span className="flex items-center gap-2">
                <Circle className="h-4 w-4" strokeWidth={2} /> Circle
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        <button
          type="button"
          className={tbBtn}
          title="More"
          onClick={() =>
            toast.message("Coming soon", {
              description: "Templates, @mentions, and exports will appear here.",
            })
          }
        >
          <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>
    </NodeToolbar>
  );
}

"use client";

import { NodeToolbar, Position, useReactFlow, useStore } from "@xyflow/react";
import {
  Bold,
  ChevronDown,
  Italic,
  List,
  ListOrdered,
  Strikethrough,
} from "lucide-react";
import { useCallback } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STICKY_NOTE_COLOR_PRESETS, STICKY_NOTE_TEXT_COLOR_PRESETS } from "../workflowStickyNoteTypes";
import type { StickyNoteNodeData } from "../workflowStickyNoteTypes";

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
  useReactFlow();
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

  return (
    <NodeToolbar
      isVisible={selected && soleSelection}
      position={Position.Top}
      offset={14}
      align="center"
      className="!m-0 !border-0 !bg-transparent !p-0 !shadow-none"
    >
      <div
        className="nodrag nopan flex max-w-[min(100vw-24px,560px)] flex-wrap items-center gap-0.5 rounded-full border border-white/[0.12] bg-[#14141a]/95 px-1.5 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-md"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Select
          value="paragraph"
          onValueChange={(v) => {
            focusEditor(editorRef);
            if (v === "paragraph") runFormat("formatBlock", "p");
            if (v === "h2") runFormat("formatBlock", "h2");
            if (v === "h3") runFormat("formatBlock", "h3");
          }}
        >
          <SelectTrigger
            size="sm"
            className="h-8 min-w-[8.5rem] w-auto gap-1.5 border-white/10 bg-white/[0.06] px-2 text-[12px] text-white/85 hover:bg-white/[0.1]"
            aria-label="Text style"
          >
            <SelectValue>Paragraph</SelectValue>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" strokeWidth={2.5} />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#1a1824] text-white">
            <SelectItem value="paragraph" className="text-[13px]">
              Paragraph
            </SelectItem>
            <SelectItem value="h2" className="text-[13px]">
              Heading 2
            </SelectItem>
            <SelectItem value="h3" className="text-[13px]">
              Heading 3
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

        <Select value={data.color} onValueChange={(v) => patch({ color: v })}>
          <SelectTrigger
            size="sm"
            className="h-8 min-w-[8rem] w-auto gap-1.5 border-white/10 bg-white/[0.06] px-2 text-[12px] text-white/85 hover:bg-white/[0.1]"
            aria-label="Note background color"
          >
            <SelectValue>Color</SelectValue>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" strokeWidth={2.5} />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#1a1824] text-white">
            {STICKY_NOTE_COLOR_PRESETS.map((c) => (
              <SelectItem key={c.value} value={c.value} className="text-[13px]">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-sm border border-white/20"
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

        <Select value={data.textColor} onValueChange={(v) => patch({ textColor: v })}>
          <SelectTrigger
            size="sm"
            className="h-8 min-w-[8rem] w-auto gap-1.5 border-white/10 bg-white/[0.06] px-2 text-[12px] text-white/85 hover:bg-white/[0.1]"
            aria-label="Note font color"
          >
            <SelectValue placeholder="Font" />
            <ChevronDown className="h-3.5 w-3.5 opacity-60" strokeWidth={2.5} />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#1a1824] text-white">
            {STICKY_NOTE_TEXT_COLOR_PRESETS.map((c) => (
              <SelectItem key={c.value} value={c.value} className="text-[13px]">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-sm border border-white/20"
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
      </div>
    </NodeToolbar>
  );
}

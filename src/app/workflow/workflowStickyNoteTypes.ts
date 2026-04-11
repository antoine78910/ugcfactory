import type { Node } from "@xyflow/react";

export type StickyNoteSize = "small" | "medium" | "large";
export type StickyNoteShape = "square" | "rounded" | "pill";

export type StickyNoteNodeData = {
  /** Plain text fallback / search */
  text: string;
  /** Rich content from the editor (HTML) */
  html: string;
  /** Note background (hex) */
  color: string;
  size: StickyNoteSize;
  shape: StickyNoteShape;
};

export type StickyNoteNodeType = Node<StickyNoteNodeData, "stickyNote">;

export const STICKY_NOTE_DEFAULT_DATA: Pick<StickyNoteNodeData, "text" | "html" | "color" | "size" | "shape"> = {
  text: "",
  html: "",
  color: "#fef9c3",
  size: "medium",
  shape: "rounded",
};

export const STICKY_NOTE_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: "#fef9c3", label: "Yellow" },
  { value: "#fce7f3", label: "Pink" },
  { value: "#d1fae5", label: "Green" },
  { value: "#dbeafe", label: "Blue" },
  { value: "#e9d5ff", label: "Violet" },
  { value: "#fed7aa", label: "Orange" },
  { value: "#f5f5f4", label: "Stone" },
  { value: "#ffffff", label: "White" },
];

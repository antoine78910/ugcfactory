import type { Node } from "@xyflow/react";

export type StickyNoteSize = "small" | "medium" | "large";
export type StickyNoteShape = "square" | "rounded" | "pill";

export type StickyNoteNodeData = {
  /** Plain-text snapshot of the canvas note body (search/sync). Not the generator “prompt” field. */
  text: string;
  /** Rich content from the editor (HTML) */
  html: string;
  /** Note background (hex) */
  color: string;
  /** Text color (hex) */
  textColor: string;
  size: StickyNoteSize;
  shape: StickyNoteShape;
};

export type StickyNoteNodeType = Node<StickyNoteNodeData, "stickyNote">;

export const STICKY_NOTE_DEFAULT_DATA: Pick<
  StickyNoteNodeData,
  "text" | "html" | "color" | "textColor" | "size" | "shape"
> = {
  text: "",
  html: "",
  color: "#fef9c3",
  textColor: "#18181b",
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

export const STICKY_NOTE_TEXT_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: "#18181b", label: "Black" },
  { value: "#ffffff", label: "White" },
  { value: "#dc2626", label: "Red" },
  { value: "#2563eb", label: "Blue" },
  { value: "#16a34a", label: "Green" },
  { value: "#7c3aed", label: "Violet" },
];

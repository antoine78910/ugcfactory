import type { Node } from "@xyflow/react";

export type PromptListMode = "prompts" | "results";
export type PromptListContentKind = "text" | "media";

export type PromptListNodeData = {
  label: string;
  /** One workflow prompt per entry (non-empty lines). */
  lines: string[];
  /** `results`: lines are treated as media URLs for thumbnails. */
  mode?: PromptListMode;
  /** Explicit UX mode for the list editor/rendering. */
  contentKind?: PromptListContentKind;
};

export type PromptListNodeType = Node<PromptListNodeData, "promptList">;

export const PROMPT_LIST_DEFAULT_DATA: PromptListNodeData = {
  label: "List",
  lines: [],
  mode: "prompts",
  contentKind: "text",
};

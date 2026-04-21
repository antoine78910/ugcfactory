"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { AdAssetNodeData } from "./nodes/AdAssetNode";
import type { TextPromptNodeData } from "./nodes/TextPromptNode";
import type { PromptListNodeData } from "./workflowPromptListTypes";
import type { StickyNoteNodeData } from "./workflowStickyNoteTypes";
import type { WorkflowGroupNodeData } from "./nodes/WorkflowGroupNode";

type PatchFn = (
  nodeId: string,
  patch: Partial<
    AdAssetNodeData &
      WorkflowGroupNodeData &
      StickyNoteNodeData &
      TextPromptNodeData &
      PromptListNodeData
  >,
) => void;

const WorkflowNodePatchContext = createContext<PatchFn | null>(null);

export function WorkflowNodePatchProvider({ children, onPatch }: { children: ReactNode; onPatch: PatchFn }) {
  return <WorkflowNodePatchContext.Provider value={onPatch}>{children}</WorkflowNodePatchContext.Provider>;
}

export function useWorkflowNodePatch(): PatchFn {
  const fn = useContext(WorkflowNodePatchContext);
  if (!fn) {
    return () => {};
  }
  return fn;
}

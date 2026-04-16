import type { AdAssetNodeType } from "./nodes/AdAssetNode";
import type { ImageRefNodeType } from "./nodes/ImageRefNode";
import type { StickyNoteNodeType } from "./workflowStickyNoteTypes";
import type { WorkflowGroupNodeType } from "./nodes/WorkflowGroupNode";

export type WorkflowCanvasNode = AdAssetNodeType | ImageRefNodeType | WorkflowGroupNodeType | StickyNoteNodeType;

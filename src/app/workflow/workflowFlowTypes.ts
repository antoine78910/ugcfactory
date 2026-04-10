import type { AdAssetNodeType } from "./nodes/AdAssetNode";
import type { WorkflowGroupNodeType } from "./nodes/WorkflowGroupNode";

export type WorkflowCanvasNode = AdAssetNodeType | WorkflowGroupNodeType;

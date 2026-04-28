import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";
import type { WorkflowCanvasNode } from "./workflowFlowTypes";

/**
 * Fields on a workflow node's `data` that are runtime-only / per-account and
 * should not ship inside a published community template:
 *  - generated outputs (output preview URLs and frame data URLs are tied to
 *    the original creator's media bucket entries)
 *  - reference uploads (often `blob:` URLs that won't resolve elsewhere)
 *  - in-flight job descriptors
 *  - last-run timestamps
 */
const EPHEMERAL_DATA_FIELDS = [
  "outputPreviewUrl",
  "outputMediaKind",
  "referencePreviewUrl",
  "referenceSource",
  "referenceMediaKind",
  "videoStartImageUrl",
  "videoEndImageUrl",
  "videoExtractedFirstFrameUrl",
  "videoExtractedLastFrameUrl",
  "websiteLastRunAt",
  "pendingWorkflowRun",
  "assistantOutput",
] as const;

function isLikelyDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:") && value.length > 200;
}

function sanitizeNodeData(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const key of EPHEMERAL_DATA_FIELDS) {
    if (key in out) delete out[key];
  }
  // Defensive: drop any other field whose value is a heavy data: URL.
  for (const [k, v] of Object.entries(out)) {
    if (isLikelyDataUrl(v)) delete out[k];
  }
  return out;
}

function sanitizeNode(node: WorkflowCanvasNode): WorkflowCanvasNode {
  return {
    ...node,
    selected: false,
    dragging: false,
    data: sanitizeNodeData(node.data) as WorkflowCanvasNode["data"],
  } as WorkflowCanvasNode;
}

/**
 * Remove ephemeral / oversized fields from each page's nodes so the published
 * template stays well below the API payload limit and only contains the graph
 * structure + prompts new users actually want to clone.
 */
export function sanitizeProjectForCommunityTemplate(
  project: WorkflowProjectStateV1,
): WorkflowProjectStateV1 {
  return {
    ...project,
    onboardingDismissed: true,
    pages: project.pages.map((page) => ({
      ...page,
      nodes: page.nodes.map(sanitizeNode),
    })),
  };
}

/** True when the project would publish as an empty (no-node) template. */
export function projectHasAnyNode(project: WorkflowProjectStateV1): boolean {
  return project.pages.some((p) => Array.isArray(p.nodes) && p.nodes.length > 0);
}

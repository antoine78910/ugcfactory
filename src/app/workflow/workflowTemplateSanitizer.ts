import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";
import type { WorkflowCanvasNode } from "./workflowFlowTypes";

/**
 * Fields on a workflow node's `data` that are runtime-only / per-account and
 * should not ship inside a published community template:
 *  - reference inputs (often `blob:` URLs that won't resolve on other accounts,
 *    or private creator media — start/end frames, reference photos/videos)
 *  - in-flight job descriptors
 *  - last-run timestamps
 *
 * NOTE: `outputPreviewUrl` and `outputMediaKind` are intentionally kept so that
 * generated results remain visible when the template is loaded by other users.
 * These are stable HTTPS URLs (Supabase Storage / provider CDN) that are already
 * publicly accessible (the same URLs back the template thumbnail cards).
 */
const EPHEMERAL_DATA_FIELDS = [
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

function isHttpsUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("https://");
}

/**
 * Scan all nodes in the project and return the first stable HTTPS image URL
 * that can serve as the template card thumbnail.
 *
 * Priority order:
 *  1. `outputPreviewUrl` for image-kind adAsset nodes (generated image output)
 *  2. `videoExtractedFirstFrameUrl` / `videoExtractedLastFrameUrl` (video frames)
 *  3. `referencePreviewUrl` for image-kind adAsset nodes
 *  4. `imageUrl` on imageRef nodes
 *
 * Call this BEFORE `sanitizeProjectForCommunityTemplate` because those fields
 * are stripped during sanitisation.
 */
export function extractWorkflowThumbnailUrl(project: WorkflowProjectStateV1): string | null {
  for (const page of project.pages) {
    for (const node of page.nodes ?? []) {
      const d = node.data as Record<string, unknown>;
      if (node.type === "adAsset") {
        if (isHttpsUrl(d.outputPreviewUrl) && (d.outputMediaKind ?? "image") === "image") {
          return d.outputPreviewUrl as string;
        }
        const frame = d.videoExtractedFirstFrameUrl ?? d.videoExtractedLastFrameUrl;
        if (isHttpsUrl(frame)) return frame as string;
        if (isHttpsUrl(d.referencePreviewUrl) && (d.referenceMediaKind ?? "image") === "image") {
          return d.referencePreviewUrl as string;
        }
      }
      if (node.type === "imageRef" && isHttpsUrl(d.imageUrl)) {
        return d.imageUrl as string;
      }
    }
  }
  return null;
}

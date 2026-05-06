import type { Edge } from "@xyflow/react";

import type { WorkflowCanvasNode } from "./workflowFlowTypes";

/** Image generators used `out` before the dedicated `generated` bubble; rewrite on load. */
export function migrateImageGeneratorOutEdgesToGenerated(nodes: WorkflowCanvasNode[], edges: Edge[]): Edge[] {
  const imageGenIds = new Set(
    nodes
      .filter((n) => n.type === "adAsset" && (n.data as { kind?: string }).kind === "image")
      .map((n) => n.id),
  );
  if (imageGenIds.size === 0) return edges;
  return edges.map((e) => {
    if (!imageGenIds.has(e.source)) return e;
    if ((e.sourceHandle ?? "out") !== "out") return e;
    return { ...e, sourceHandle: "generated" };
  });
}

export type WorkflowFlowPage = {
  id: string;
  name: string;
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
};

export type WorkflowProjectStateV1 = {
  v: 1;
  activePageId: string;
  pages: WorkflowFlowPage[];
  /** After user completes or skips the first-run picker. */
  onboardingDismissed?: boolean;
};

const DEFAULT_FIRST_PAGE_ID = "workflow-page-default";

function newPage(name: string): WorkflowFlowPage {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}`,
    name,
    nodes: [],
    edges: [],
  };
}

/** Deterministic initial state for SSR / hydration. */
export function defaultWorkflowProject(): WorkflowProjectStateV1 {
  return {
    v: 1,
    activePageId: DEFAULT_FIRST_PAGE_ID,
    pages: [{ id: DEFAULT_FIRST_PAGE_ID, name: "Page 1", nodes: [], edges: [] }],
    onboardingDismissed: false,
  };
}

function parseProject(raw: string | null): WorkflowProjectStateV1 | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<WorkflowProjectStateV1>;
    if (p?.v !== 1 || !Array.isArray(p.pages) || p.pages.length === 0) return null;
    const pages: WorkflowFlowPage[] = p.pages.map((x, i) => {
      const nodes = (Array.isArray(x?.nodes) ? x.nodes : []) as WorkflowCanvasNode[];
      const rawEdges = Array.isArray(x?.edges) ? x.edges : [];
      return {
        id: typeof x?.id === "string" ? x.id : `p-${i}`,
        name: typeof x?.name === "string" && x.name.trim() ? x.name.trim() : `Page ${i + 1}`,
        nodes,
        edges: migrateImageGeneratorOutEdgesToGenerated(nodes, rawEdges),
      };
    });
    const active =
      typeof p.activePageId === "string" && pages.some((x) => x.id === p.activePageId)
        ? p.activePageId
        : pages[0].id;
    const onboardingDismissed = Boolean(p.onboardingDismissed);
    return { v: 1, activePageId: active, pages, onboardingDismissed };
  } catch {
    return null;
  }
}

/** Per-user / per-guest isolation: pass scope from `getWorkflowStorageScope`. */
export function workflowSpaceStorageKey(scope: string, spaceId: string): string {
  return `youry-workflow-space-v2:${scope}:${spaceId}`;
}

/** @internal, use `loadProjectForSpace` from workflowSpacesStorage in app code. */
export function loadWorkflowProjectRaw(scope: string, spaceId: string): WorkflowProjectStateV1 {
  const def = defaultWorkflowProject();
  if (typeof window === "undefined") return def;
  try {
    const key = workflowSpaceStorageKey(scope, spaceId);
    const parsed = parseProject(localStorage.getItem(key));
    if (!parsed) return def;
    return parsed;
  } catch {
    return def;
  }
}

/** @internal */
export function saveWorkflowProjectRaw(scope: string, spaceId: string, state: WorkflowProjectStateV1) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(workflowSpaceStorageKey(scope, spaceId), JSON.stringify(sanitizeProjectForLocalStorage(state)));
  } catch {
    /* quota */
  }
}

export function shouldShowWorkflowOnboarding(project: WorkflowProjectStateV1): boolean {
  if (project.onboardingDismissed) return false;
  const hasNodes = project.pages.some((p) => p.nodes.length > 0);
  if (hasNodes) return false;
  return true;
}

export { newPage };

// ---- LocalStorage safety ----------------------------------------------------
// Workflow state is stored in localStorage. Some node fields (video frames, data URLs, blob URLs,
// assistant outputs) can easily exceed quota and cause silent save failures → users "lose" nodes/edges
// after navigating away and back. We aggressively strip those fields before persisting.

const LOCALSTORAGE_EPHEMERAL_FIELDS = new Set([
  // AdAsset runtime / previews
  "outputPreviewUrl",
  "outputMediaKind",
  "pendingWorkflowRun",
  "assistantOutput",
  "websiteLastRunAt",
  // Reference previews (keep main stable URLs on ImageRef nodes instead)
  "referencePreviewUrl",
  "referenceSource",
  "referenceMediaKind",
  // Video generator image references (derived from links)
  "videoStartImageUrl",
  "videoEndImageUrl",
  // Heavy frame extracts (data URLs)
  "videoExtractedFirstFrameUrl",
  "videoExtractedLastFrameUrl",
  // Anything else that might embed data URLs
  "outputFrameDataUrl",
]);

function isHeavyDataUrl(v: unknown): boolean {
  return typeof v === "string" && v.startsWith("data:") && v.length > 200;
}

function isBlobUrl(v: unknown): boolean {
  return typeof v === "string" && v.startsWith("blob:");
}

function sanitizeNodeDataForLocalStorage(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const key of LOCALSTORAGE_EPHEMERAL_FIELDS) {
    if (key in out) delete out[key];
  }
  for (const [k, v] of Object.entries(out)) {
    if (isHeavyDataUrl(v)) delete out[k];
    // Blob URLs won't resolve after reload; keep the node but drop the URL so it doesn't break saves.
    if (isBlobUrl(v)) delete out[k];
  }
  return out;
}

function sanitizeProjectForLocalStorage(project: WorkflowProjectStateV1): WorkflowProjectStateV1 {
  return {
    ...project,
    pages: project.pages.map((p) => ({
      ...p,
      nodes: (p.nodes ?? []).map((n) => ({
        ...n,
        data: sanitizeNodeDataForLocalStorage((n as any).data) as any,
      })) as any,
    })),
  };
}

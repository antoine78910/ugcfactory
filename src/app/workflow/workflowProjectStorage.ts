import type { Edge } from "@xyflow/react";

import type { AdAssetNodeType } from "./nodes/AdAssetNode";

export type WorkflowFlowPage = {
  id: string;
  name: string;
  nodes: AdAssetNodeType[];
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
    const pages: WorkflowFlowPage[] = p.pages.map((x, i) => ({
      id: typeof x?.id === "string" ? x.id : `p-${i}`,
      name: typeof x?.name === "string" && x.name.trim() ? x.name.trim() : `Page ${i + 1}`,
      nodes: Array.isArray(x?.nodes) ? x.nodes : [],
      edges: Array.isArray(x?.edges) ? x.edges : [],
    }));
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

/** @internal — use `loadProjectForSpace` from workflowSpacesStorage in app code. */
export function loadWorkflowProjectRaw(spaceId: string): WorkflowProjectStateV1 {
  const def = defaultWorkflowProject();
  if (typeof window === "undefined") return def;
  try {
    const key = `youry-workflow-space-v1:${spaceId}`;
    const parsed = parseProject(localStorage.getItem(key));
    if (!parsed) return def;
    return parsed;
  } catch {
    return def;
  }
}

/** @internal */
export function saveWorkflowProjectRaw(spaceId: string, state: WorkflowProjectStateV1) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`youry-workflow-space-v1:${spaceId}`, JSON.stringify(state));
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

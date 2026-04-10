import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";
import { defaultWorkflowProject, loadWorkflowProjectRaw, saveWorkflowProjectRaw } from "./workflowProjectStorage";

const INDEX_KEY = "youry-workflow-spaces-index-v1";
const LEGACY_SINGLE_KEY = "youry-workflow-project-v1";

export type WorkflowSpaceMeta = {
  id: string;
  name: string;
  updatedAt: number;
};

type IndexV1 = { v: 1; spaces: WorkflowSpaceMeta[] };

function defaultIndex(): IndexV1 {
  return { v: 1, spaces: [] };
}

function parseIndex(raw: string | null): IndexV1 {
  const def = defaultIndex();
  if (!raw) return def;
  try {
    const p = JSON.parse(raw) as Partial<IndexV1>;
    if (p?.v !== 1 || !Array.isArray(p.spaces)) return def;
    return {
      v: 1,
      spaces: p.spaces.map((s, i) => ({
        id: typeof s?.id === "string" ? s.id : `s-${i}`,
        name: typeof s?.name === "string" && s.name.trim() ? s.name.trim() : "Untitled space",
        updatedAt: typeof s?.updatedAt === "number" ? s.updatedAt : Date.now(),
      })),
    };
  } catch {
    return def;
  }
}

export function loadSpacesIndex(): IndexV1 {
  if (typeof window === "undefined") return defaultIndex();
  let idx = parseIndex(localStorage.getItem(INDEX_KEY));
  if (idx.spaces.length === 0) {
    const legacy = localStorage.getItem(LEGACY_SINGLE_KEY);
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy) as Partial<WorkflowProjectStateV1>;
        if (parsed?.v === 1 && Array.isArray(parsed.pages) && parsed.pages.length > 0) {
          const id =
            typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `mig-${Date.now()}`;
          const hasNodes = parsed.pages.some((p) => {
            const pg = p as { nodes?: unknown };
            return Array.isArray(pg?.nodes) && pg.nodes.length > 0;
          });
          saveWorkflowProjectRaw(id, {
            ...parsed,
            v: 1,
            onboardingDismissed: Boolean(parsed.onboardingDismissed) || hasNodes,
          } as WorkflowProjectStateV1);
          idx = {
            v: 1,
            spaces: [{ id, name: "Untitled space", updatedAt: Date.now() }],
          };
          localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
          localStorage.removeItem(LEGACY_SINGLE_KEY);
        }
      } catch {
        /* ignore broken legacy */
      }
    }
  }
  return idx;
}

export function saveSpacesIndex(index: IndexV1) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* quota */
  }
}

export function createSpace(name = "Untitled space"): WorkflowSpaceMeta {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}`;
  const meta: WorkflowSpaceMeta = { id, name, updatedAt: Date.now() };
  const index = loadSpacesIndex();
  index.spaces = [{ ...meta }, ...index.spaces];
  saveSpacesIndex(index);
  const fresh = defaultWorkflowProject();
  saveWorkflowProjectRaw(id, { ...fresh, onboardingDismissed: false });
  return meta;
}

export function updateSpaceMeta(id: string, patch: Partial<Pick<WorkflowSpaceMeta, "name" | "updatedAt">>) {
  const index = loadSpacesIndex();
  index.spaces = index.spaces.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: patch.updatedAt ?? Date.now() } : s));
  saveSpacesIndex(index);
}

export function touchSpaceUpdated(id: string) {
  updateSpaceMeta(id, { updatedAt: Date.now() });
}

export function deleteSpace(id: string) {
  const index = loadSpacesIndex();
  index.spaces = index.spaces.filter((s) => s.id !== id);
  saveSpacesIndex(index);
  try {
    localStorage.removeItem(storageKeyForSpace(id));
  } catch {
    /* ignore */
  }
}

export function storageKeyForSpace(spaceId: string) {
  return `youry-workflow-space-v1:${spaceId}`;
}

export function loadProjectForSpace(spaceId: string): WorkflowProjectStateV1 {
  return loadWorkflowProjectRaw(spaceId);
}

export function saveProjectForSpace(spaceId: string, state: WorkflowProjectStateV1) {
  saveWorkflowProjectRaw(spaceId, state);
  touchSpaceUpdated(spaceId);
}

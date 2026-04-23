import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";
import {
  defaultWorkflowProject,
  loadWorkflowProjectRaw,
  saveWorkflowProjectRaw,
  workflowSpaceStorageKey,
} from "./workflowProjectStorage";
import { cloneTemplateProjectForNewSpace, getWorkflowTemplateMeta } from "./workflowTemplates";

/** Legacy keys (pre per-user isolation). */
const INDEX_KEY_V1 = "youry-workflow-spaces-index-v1";
const LEGACY_SINGLE_KEY = "youry-workflow-project-v1";

function indexKeyV2(scope: string): string {
  return `youry-workflow-spaces-index-v2:${scope}`;
}

export type WorkflowSpaceMeta = {
  id: string;
  name: string;
  updatedAt: number;
  /** Small rendered snapshot used on Workflow landing cards. */
  previewDataUrl?: string;
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
        name: typeof s?.name === "string" && s.name.trim() ? s.name.trim() : "Untitled workflow",
        updatedAt: typeof s?.updatedAt === "number" ? s.updatedAt : Date.now(),
        previewDataUrl: typeof s?.previewDataUrl === "string" ? s.previewDataUrl : undefined,
      })),
    };
  } catch {
    return def;
  }
}

/**
 * Stable storage partition: one Supabase user id → one workflow library.
 * Not logged in → `guest` (still isolated from any logged-in account on the same device).
 */
export function getWorkflowStorageScope(userId: string | null | undefined): string {
  const id = typeof userId === "string" ? userId.trim() : "";
  return id ? `u:${id}` : "guest";
}

/**
 * If this scope has no v2 data yet, move legacy unscoped index + space payloads into it once,
 * then remove legacy keys so they are not reused by another account.
 */
function maybeMigrateLegacyUnscopedIntoScope(scope: string) {
  if (typeof window === "undefined") return;

  const v2Key = indexKeyV2(scope);
  const existingV2 = parseIndex(localStorage.getItem(v2Key));
  if (existingV2.spaces.length > 0) return;

  let idx = parseIndex(localStorage.getItem(INDEX_KEY_V1));

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
          const project: WorkflowProjectStateV1 = {
            ...parsed,
            v: 1,
            onboardingDismissed: Boolean(parsed.onboardingDismissed) || hasNodes,
          } as WorkflowProjectStateV1;
          saveWorkflowProjectRaw(scope, id, project);
          idx = {
            v: 1,
            spaces: [{ id, name: "Untitled workflow", updatedAt: Date.now() }],
          };
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (idx.spaces.length === 0) return;

  for (const s of idx.spaces) {
    const legacySpaceKey = `youry-workflow-space-v1:${s.id}`;
    const raw = localStorage.getItem(legacySpaceKey);
    if (raw) {
      try {
        localStorage.setItem(workflowSpaceStorageKey(scope, s.id), raw);
      } catch {
        /* quota */
      }
      try {
        localStorage.removeItem(legacySpaceKey);
      } catch {
        /* ignore */
      }
    }
  }

  try {
    localStorage.setItem(v2Key, JSON.stringify(idx));
    localStorage.removeItem(INDEX_KEY_V1);
    localStorage.removeItem(LEGACY_SINGLE_KEY);
  } catch {
    /* quota */
  }
}

/**
 * First login quality-of-life migration:
 * if the authenticated scope is empty but guest scope has workflows from local usage,
 * copy guest index + space payloads into the user scope so modules remain visible after sign-in.
 */
function maybeMigrateGuestScopeIntoUserScope(scope: string) {
  if (typeof window === "undefined") return;
  if (!scope.startsWith("u:")) return;

  const userKey = indexKeyV2(scope);
  const userIdx = parseIndex(localStorage.getItem(userKey));
  if (userIdx.spaces.length > 0) return;

  const guestScope = "guest";
  const guestKey = indexKeyV2(guestScope);
  const guestIdx = parseIndex(localStorage.getItem(guestKey));
  if (guestIdx.spaces.length === 0) return;

  for (const s of guestIdx.spaces) {
    const raw = localStorage.getItem(workflowSpaceStorageKey(guestScope, s.id));
    if (!raw) continue;
    try {
      localStorage.setItem(workflowSpaceStorageKey(scope, s.id), raw);
    } catch {
      /* quota */
    }
  }

  try {
    localStorage.setItem(userKey, JSON.stringify(guestIdx));
  } catch {
    /* quota */
  }
}

export function loadSpacesIndex(scope: string): IndexV1 {
  if (typeof window === "undefined") return defaultIndex();
  maybeMigrateGuestScopeIntoUserScope(scope);
  maybeMigrateLegacyUnscopedIntoScope(scope);
  return parseIndex(localStorage.getItem(indexKeyV2(scope)));
}

export function saveSpacesIndex(scope: string, index: IndexV1) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(indexKeyV2(scope), JSON.stringify(index));
  } catch {
    /* quota */
  }
}

export function createSpace(scope: string, name = "Untitled workflow"): WorkflowSpaceMeta {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}`;
  const meta: WorkflowSpaceMeta = { id, name, updatedAt: Date.now() };
  const index = loadSpacesIndex(scope);
  index.spaces = [{ ...meta }, ...index.spaces];
  saveSpacesIndex(scope, index);
  const fresh = defaultWorkflowProject();
  saveWorkflowProjectRaw(scope, id, { ...fresh, onboardingDismissed: false });
  return meta;
}

export function updateSpaceMeta(
  scope: string,
  id: string,
  patch: Partial<Pick<WorkflowSpaceMeta, "name" | "updatedAt" | "previewDataUrl">>,
) {
  const index = loadSpacesIndex(scope);
  index.spaces = index.spaces.map((s) =>
    s.id === id ? { ...s, ...patch, updatedAt: patch.updatedAt ?? Date.now() } : s,
  );
  saveSpacesIndex(scope, index);
}

export function touchSpaceUpdated(scope: string, id: string) {
  updateSpaceMeta(scope, id, { updatedAt: Date.now() });
}

export function deleteSpace(scope: string, id: string) {
  const index = loadSpacesIndex(scope);
  index.spaces = index.spaces.filter((s) => s.id !== id);
  saveSpacesIndex(scope, index);
  try {
    localStorage.removeItem(storageKeyForSpace(scope, id));
  } catch {
    /* ignore */
  }
}

export function storageKeyForSpace(scope: string, spaceId: string) {
  return workflowSpaceStorageKey(scope, spaceId);
}

export function loadProjectForSpace(scope: string, spaceId: string): WorkflowProjectStateV1 {
  return loadWorkflowProjectRaw(scope, spaceId);
}

export function saveProjectForSpace(scope: string, spaceId: string, state: WorkflowProjectStateV1) {
  saveWorkflowProjectRaw(scope, spaceId, state);
  touchSpaceUpdated(scope, spaceId);
}

/** Creates a new space and copies the template project into it. */
export function createSpaceFromTemplate(scope: string, templateId: string): WorkflowSpaceMeta | null {
  const project = cloneTemplateProjectForNewSpace(templateId, scope);
  if (!project) return null;
  const metaTpl = getWorkflowTemplateMeta(templateId, scope);
  const meta = createSpace(scope, metaTpl?.name ? `${metaTpl.name} (copy)` : "From template");
  saveWorkflowProjectRaw(scope, meta.id, project);
  touchSpaceUpdated(scope, meta.id);
  return meta;
}

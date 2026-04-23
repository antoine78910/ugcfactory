import type { Edge } from "@xyflow/react";

import { buildAdAssetNode } from "./workflowNodeFactory";
import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";

export type WorkflowTemplateMeta = {
  id: string;
  name: string;
  /** Short line for cards on the landing page */
  blurb: string;
  source?: "builtin" | "custom";
};

export const WORKFLOW_TEMPLATE_LIST: WorkflowTemplateMeta[] = [
  {
    id: "ugc-pipeline",
    name: "UGC content pipeline",
    blurb: "Image → video → variation, wired and ready to customize.",
  },
  {
    id: "dual-hook-video",
    name: "Dual hook to video",
    blurb: "Two image directions feeding one UGC-style clip.",
  },
];

type WorkflowCustomTemplateRecord = {
  id: string;
  name: string;
  blurb: string;
  project: WorkflowProjectStateV1;
  createdAt: number;
};

type WorkflowBuiltinTemplatePrefsRecord = {
  id: string;
  name?: string;
  blurb?: string;
  hidden?: boolean;
};

const WORKFLOW_CUSTOM_TEMPLATE_PREFIX = "tmp-template:";

function customTemplatesStorageKey(scope: string): string {
  return `youry-workflow-custom-templates-v1:${scope}`;
}

function builtinTemplatesPrefsStorageKey(scope: string): string {
  return `youry-workflow-builtin-template-prefs-v1:${scope}`;
}

function parseCustomTemplates(raw: string | null): WorkflowCustomTemplateRecord[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as WorkflowCustomTemplateRecord[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x, i) => ({
        id:
          typeof x?.id === "string" && x.id.trim()
            ? x.id.trim()
            : `${WORKFLOW_CUSTOM_TEMPLATE_PREFIX}${Date.now()}-${i}`,
        name: typeof x?.name === "string" && x.name.trim() ? x.name.trim() : "Temporary template",
        blurb: typeof x?.blurb === "string" && x.blurb.trim() ? x.blurb.trim() : "Temporary template copy.",
        project: x?.project as WorkflowProjectStateV1,
        createdAt: typeof x?.createdAt === "number" ? x.createdAt : Date.now(),
      }))
      .filter((x) => x.project && x.project.v === 1 && Array.isArray(x.project.pages));
  } catch {
    return [];
  }
}

function readCustomTemplates(scope: string | null | undefined): WorkflowCustomTemplateRecord[] {
  if (typeof window === "undefined") return [];
  const s = typeof scope === "string" ? scope.trim() : "";
  if (!s) return [];
  return parseCustomTemplates(localStorage.getItem(customTemplatesStorageKey(s)));
}

function writeCustomTemplates(scope: string, records: WorkflowCustomTemplateRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(customTemplatesStorageKey(scope), JSON.stringify(records));
  } catch {
    /* quota */
  }
}

function parseBuiltinTemplatePrefs(raw: string | null): WorkflowBuiltinTemplatePrefsRecord[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as WorkflowBuiltinTemplatePrefsRecord[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => ({
        id: typeof x?.id === "string" ? x.id.trim() : "",
        name: typeof x?.name === "string" ? x.name.trim() : undefined,
        blurb: typeof x?.blurb === "string" ? x.blurb.trim() : undefined,
        hidden: Boolean(x?.hidden),
      }))
      .filter((x) => x.id.length > 0);
  } catch {
    return [];
  }
}

function readBuiltinTemplatePrefs(scope: string | null | undefined): WorkflowBuiltinTemplatePrefsRecord[] {
  if (typeof window === "undefined") return [];
  const s = typeof scope === "string" ? scope.trim() : "";
  if (!s) return [];
  return parseBuiltinTemplatePrefs(localStorage.getItem(builtinTemplatesPrefsStorageKey(s)));
}

function writeBuiltinTemplatePrefs(scope: string, records: WorkflowBuiltinTemplatePrefsRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(builtinTemplatesPrefsStorageKey(scope), JSON.stringify(records));
  } catch {
    /* quota */
  }
}

const edgeStyle = { stroke: "rgba(167, 139, 250, 0.5)", strokeWidth: 2 };

function makeEdge(
  source: string,
  target: string,
  opts?: { sourceHandle?: string; targetHandle?: string },
): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    sourceHandle: opts?.sourceHandle ?? "out",
    target,
    targetHandle: opts?.targetHandle ?? "in",
    style: edgeStyle,
  };
}

function buildUgcPipeline(): WorkflowProjectStateV1 {
  const pageId = "tpl-page-ugc";
  const img = buildAdAssetNode("image", { x: 48, y: 160 });
  img.data = {
    ...img.data,
    label: "Product still",
    prompt: "Premium product flat lay, soft daylight, minimal props.",
  };
  const vid = buildAdAssetNode("video", { x: 400, y: 140 });
  vid.data = {
    ...vid.data,
    label: "UGC clip",
    prompt: "Casual creator-style walkthrough, natural voiceover energy, 9:16.",
  };
  const varn = buildAdAssetNode("variation", { x: 752, y: 168 });
  varn.data = {
    ...varn.data,
    label: "Ad variation",
    prompt: "Bold hook line + social proof overlay; keep brand colors.",
  };
  return {
    v: 1,
    onboardingDismissed: true,
    activePageId: pageId,
    pages: [
      {
        id: pageId,
        name: "Pipeline",
        nodes: [img, vid, varn],
        edges: [makeEdge(img.id, vid.id, { sourceHandle: "generated" }), makeEdge(vid.id, varn.id)],
      },
    ],
  };
}

function buildDualHook(): WorkflowProjectStateV1 {
  const pageId = "tpl-page-dual";
  const a = buildAdAssetNode("image", { x: 40, y: 80 });
  a.data = {
    ...a.data,
    label: "Hook A, problem",
    prompt: "Close-up frustration moment, cool tones, thumb-stopping.",
  };
  const b = buildAdAssetNode("image", { x: 40, y: 320 });
  b.data = {
    ...b.data,
    label: "Hook B, desire",
    prompt: "Aspirational lifestyle shot, warm light, product visible.",
  };
  const v = buildAdAssetNode("video", { x: 420, y: 200 });
  v.data = {
    ...v.data,
    label: "UGC mashup",
    prompt: "Merge both angles into one punchy 9:16 story.",
  };
  return {
    v: 1,
    onboardingDismissed: true,
    activePageId: pageId,
    pages: [
      {
        id: pageId,
        name: "Launch",
        nodes: [a, b, v],
        edges: [makeEdge(a.id, v.id, { sourceHandle: "generated" }), makeEdge(b.id, v.id, { sourceHandle: "generated" })],
      },
    ],
  };
}

const builders: Record<string, () => WorkflowProjectStateV1> = {
  "ugc-pipeline": buildUgcPipeline,
  "dual-hook-video": buildDualHook,
};

export function listWorkflowTemplates(scope?: string | null): WorkflowTemplateMeta[] {
  const builtinPrefs = readBuiltinTemplatePrefs(scope);
  const prefsById = new Map(builtinPrefs.map((x) => [x.id, x]));
  const builtins = WORKFLOW_TEMPLATE_LIST
    .map((x) => {
      const pref = prefsById.get(x.id);
      if (pref?.hidden) return null;
      return {
        id: x.id,
        name: pref?.name || x.name,
        blurb: pref?.blurb || x.blurb,
        source: "builtin" as const,
      };
    })
    .filter((x) => x !== null);
  const custom = readCustomTemplates(scope).map((x) => ({
    id: x.id,
    name: x.name,
    blurb: x.blurb,
    source: "custom" as const,
  }));
  return [...custom, ...builtins];
}

export function getWorkflowTemplateMeta(id: string, scope?: string | null): WorkflowTemplateMeta | undefined {
  return listWorkflowTemplates(scope).find((t) => t.id === id);
}

/** Fresh project graph (new node ids each call). */
export function buildTemplateProject(templateId: string, scope?: string | null): WorkflowProjectStateV1 | null {
  const fn = builders[templateId];
  if (fn) return fn();
  const custom = readCustomTemplates(scope).find((x) => x.id === templateId);
  if (!custom) return null;
  return structuredClone(custom.project);
}

export function cloneTemplateProjectForNewSpace(templateId: string, scope?: string | null): WorkflowProjectStateV1 | null {
  const p = buildTemplateProject(templateId, scope);
  if (!p) return null;
  return structuredClone(p);
}

export function saveTemporaryWorkflowTemplate(scope: string, opts: {
  project: WorkflowProjectStateV1;
  name?: string;
  blurb?: string;
}): WorkflowTemplateMeta {
  const records = readCustomTemplates(scope);
  const id = `${WORKFLOW_CUSTOM_TEMPLATE_PREFIX}${crypto.randomUUID?.() ?? Date.now()}`;
  const name = (opts.name ?? "").trim() || "Temporary template";
  const blurb = (opts.blurb ?? "").trim() || "Temporary template copy.";
  const nextRecord: WorkflowCustomTemplateRecord = {
    id,
    name,
    blurb,
    project: structuredClone(opts.project),
    createdAt: Date.now(),
  };
  writeCustomTemplates(scope, [nextRecord, ...records]);
  return { id, name, blurb, source: "custom" };
}

export function deleteTemporaryWorkflowTemplate(scope: string, templateId: string): boolean {
  const records = readCustomTemplates(scope);
  const next = records.filter((x) => x.id !== templateId);
  if (next.length === records.length) return false;
  writeCustomTemplates(scope, next);
  return true;
}

export function updateTemporaryWorkflowTemplateMeta(
  scope: string,
  templateId: string,
  patch: { name?: string; blurb?: string },
): boolean {
  const records = readCustomTemplates(scope);
  let touched = false;
  const next = records.map((x) => {
    if (x.id !== templateId) return x;
    touched = true;
    const nextName = (patch.name ?? x.name).trim() || x.name;
    const nextBlurb = (patch.blurb ?? x.blurb).trim() || x.blurb;
    return {
      ...x,
      name: nextName,
      blurb: nextBlurb,
    };
  });
  if (!touched) return false;
  writeCustomTemplates(scope, next);
  return true;
}

export function updateWorkflowTemplateMeta(
  scope: string,
  templateId: string,
  patch: { name?: string; blurb?: string },
): boolean {
  if (templateId.startsWith(WORKFLOW_CUSTOM_TEMPLATE_PREFIX)) {
    return updateTemporaryWorkflowTemplateMeta(scope, templateId, patch);
  }
  const records = readBuiltinTemplatePrefs(scope);
  let touched = false;
  const next = records.map((x) => {
    if (x.id !== templateId) return x;
    touched = true;
    return {
      ...x,
      name: patch.name !== undefined ? patch.name.trim() || x.name : x.name,
      blurb: patch.blurb !== undefined ? patch.blurb.trim() || x.blurb : x.blurb,
      hidden: false,
    };
  });
  if (!touched) {
    next.unshift({
      id: templateId,
      name: patch.name?.trim() || undefined,
      blurb: patch.blurb?.trim() || undefined,
      hidden: false,
    });
  }
  writeBuiltinTemplatePrefs(scope, next);
  return true;
}

export function deleteWorkflowTemplate(scope: string, templateId: string): boolean {
  if (templateId.startsWith(WORKFLOW_CUSTOM_TEMPLATE_PREFIX)) {
    return deleteTemporaryWorkflowTemplate(scope, templateId);
  }
  const records = readBuiltinTemplatePrefs(scope);
  const idx = records.findIndex((x) => x.id === templateId);
  if (idx >= 0) {
    const next = [...records];
    next[idx] = { ...next[idx], hidden: true };
    writeBuiltinTemplatePrefs(scope, next);
    return true;
  }
  writeBuiltinTemplatePrefs(scope, [{ id: templateId, hidden: true }, ...records]);
  return true;
}

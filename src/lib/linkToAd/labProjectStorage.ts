import type { LabEdge, LabGraph, LabNode } from "@/lib/linkToAd/buildProjectLabGraph";

export type LabFolder = { id: string; name: string; parentId: string | null };
export type LabCustomAngle = { id: string; name: string; folderId: string | null; notes?: string };
export type LabOffsets = Record<string, { dx: number; dy: number }>;

export type LabArtifacts = {
  folders: LabFolder[];
  customAngles: LabCustomAngle[];
};

export type LabPersistedV1 = {
  v: 1;
  artifacts: LabArtifacts;
  offsets: LabOffsets;
};

function shorten(s: string, max: number) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function normalizeStoreKey(storeUrl: string): string {
  const raw = storeUrl.trim();
  if (!raw) return "default";
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const path = u.pathname.replace(/\/$/, "") || "";
    return `${host}${path}`.toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/\s+/g, "") || "default";
  }
}

const storageKey = (k: string) => `youry-lab-v1:${k}`;

export const defaultLabPersisted = (): LabPersistedV1 => ({
  v: 1,
  artifacts: { folders: [], customAngles: [] },
  offsets: {},
});

export function loadLabPersisted(storeUrl: string): LabPersistedV1 {
  const def = defaultLabPersisted();
  if (typeof window === "undefined") return def;
  try {
    const raw = localStorage.getItem(storageKey(normalizeStoreKey(storeUrl)));
    if (!raw) return def;
    const p = JSON.parse(raw) as Partial<LabPersistedV1>;
    if (p?.v !== 1 || !p.artifacts) return def;
    return {
      v: 1,
      artifacts: {
        folders: Array.isArray(p.artifacts.folders) ? p.artifacts.folders : [],
        customAngles: Array.isArray(p.artifacts.customAngles) ? p.artifacts.customAngles : [],
      },
      offsets: p.offsets && typeof p.offsets === "object" ? (p.offsets as LabOffsets) : {},
    };
  } catch {
    return def;
  }
}

export function saveLabPersisted(storeUrl: string, data: LabPersistedV1) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(normalizeStoreKey(storeUrl)), JSON.stringify(data));
  } catch {
    /* quota */
  }
}

/**
 * Append user folders + custom angles to the right of the auto graph, wired to `root` or parent folder.
 */
export function mergeUserLabIntoGraph(graph: LabGraph, artifacts: LabArtifacts): { nodes: LabNode[]; edges: LabEdge[] } {
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];
  let ei = edges.length;
  const addE = (source: string, target: string) => {
    edges.push({ id: `ux${ei++}`, source, target });
  };

  const anchorX = graph.bounds.maxX + 56;
  let cursorY = 24;

  function visitFolder(parentFileId: string | null, depth: number) {
    const children = artifacts.folders.filter((f) => (f.parentId ?? null) === parentFileId);
    for (const f of children) {
      const nid = `lab-folder-${f.id}`;
      const x = anchorX + depth * 26;
      const y = cursorY;
      cursorY += 56;
      nodes.push({
        id: nid,
        kind: "folder",
        x,
        y,
        w: 204,
        h: 48,
        label: f.name,
        sublabel: "Dossier",
      });
      addE(parentFileId === null ? "root" : `lab-folder-${parentFileId}`, nid);

      for (const ca of artifacts.customAngles.filter((a) => a.folderId === f.id)) {
        const aid = `lab-custom-angle-${ca.id}`;
        nodes.push({
          id: aid,
          kind: "custom_angle",
          x: anchorX + (depth + 1) * 26,
          y: cursorY,
          w: 204,
          h: 44,
          label: ca.name,
          sublabel: ca.notes ? shorten(ca.notes, 72) : "Angle personnalisé (plan)",
        });
        addE(nid, aid);
        cursorY += 50;
      }

      visitFolder(f.id, depth + 1);
    }
  }

  visitFolder(null, 0);

  for (const ca of artifacts.customAngles.filter((a) => !a.folderId)) {
    const aid = `lab-custom-angle-${ca.id}`;
    nodes.push({
      id: aid,
      kind: "custom_angle",
      x: anchorX,
      y: cursorY,
      w: 204,
      h: 44,
      label: ca.name,
      sublabel: ca.notes ? shorten(ca.notes, 72) : "Angle personnalisé (plan)",
    });
    addE("root", aid);
    cursorY += 50;
  }

  return { nodes, edges };
}

/** Build adjacency: parent id -> child node ids (from edges). */
export function childrenMapFromEdges(edges: LabEdge[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of edges) {
    if (!m.has(e.source)) m.set(e.source, []);
    m.get(e.source)!.push(e.target);
  }
  return m;
}

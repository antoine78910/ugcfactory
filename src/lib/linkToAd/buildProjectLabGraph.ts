import {
  normalizePipelineByAngle,
  readUniverseFromExtracted,
  splitAllScriptOptions,
  type LinkToAdAnglePipelineV1,
} from "@/lib/linkToAdUniverse";

export type LabNodeKind =
  | "root"
  | "generation"
  | "brief"
  | "angle"
  | "ref_image"
  | "video"
  | "classic"
  | "folder"
  | "custom_angle";

export type LabNode = {
  id: string;
  kind: LabNodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sublabel?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  runId?: string;
  angleIndex?: number;
  refIndex?: number;
  pendingVideo?: boolean;
};

export type LabEdge = { id: string; source: string; target: string };

export type LabGraph = {
  nodes: LabNode[];
  edges: LabEdge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

function shorten(s: string, max: number) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function angleShortLabel(labels: string[], i: number) {
  const raw = labels[i]?.trim() || `Angle ${i + 1}`;
  return shorten(raw, 72);
}

function hasAngleContent(pipe: LinkToAdAnglePipelineV1) {
  const urls = pipe.nanoBananaImageUrls;
  const hasImgs = Array.isArray(urls) && urls.some((u) => typeof u === "string" && u.trim());
  const hasPrompts = Boolean(pipe.nanoBananaPromptsRaw?.trim());
  const slots = pipe.klingByReferenceIndex;
  const hasKling =
    Array.isArray(slots) &&
    slots.some(
      (s) =>
        (s.videoUrl && s.videoUrl.trim()) ||
        (s.taskId && s.taskId.trim()) ||
        (s.history && s.history.length > 0),
    );
  return hasImgs || hasPrompts || hasKling;
}

/**
 * Build a node graph for the “lab” view: project → generations → brief → 3 angles → 3 refs → videos.
 */
export function buildProjectLabGraph(params: {
  projectTitle: string;
  storeUrl: string;
  runs: Array<{ id: string; created_at: string; extracted?: unknown }>;
}): LabGraph {
  const nodes: LabNode[] = [];
  const edges: LabEdge[] = [];
  let edgeSeq = 0;
  const e = (source: string, target: string) => {
    edges.push({ id: `e${edgeSeq++}`, source, target });
  };

  const rootId = "root";
  nodes.push({
    id: rootId,
    kind: "root",
    x: 0,
    y: 0,
    w: 280,
    h: 88,
    label: shorten(params.projectTitle || "Project", 48),
    sublabel: shorten(params.storeUrl, 56),
  });

  const universeRuns = params.runs.filter((r) => readUniverseFromExtracted(r.extracted) !== null);
  const classicRuns = params.runs.filter((r) => readUniverseFromExtracted(r.extracted) === null);

  /** Vertical slice per generation; tall enough for brief + angle row + refs + video. */
  const blockH = 580;
  let cursorY = 140;
  const runGap = 64;
  /** Horizontal gap between angle columns (refs span ~260px; keep clear margin so angles don’t overlap). */
  const colGap = 300;

  let maxX = 320;
  let maxY = 120;

  const runCentersX: number[] = [];

  for (let r = 0; r < universeRuns.length; r++) {
    const run = universeRuns[r];
    const snap = readUniverseFromExtracted(run.extracted);
    if (!snap) continue;

    const ox = 40;
    const oy = cursorY;
    const genId = `gen-${run.id}`;
    const dateStr = new Date(run.created_at).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    nodes.push({
      id: genId,
      kind: "generation",
      x: ox,
      y: oy,
      w: 260,
      h: 64,
      label: "Link to Ad generation",
      sublabel: dateStr,
      runId: run.id,
    });
    e(rootId, genId);

    const triple = normalizePipelineByAngle(snap);
    const labels = snap.angleLabels;

    let briefId: string | null = null;
    if (snap.summaryText?.trim() || snap.scriptsText?.trim()) {
      briefId = `brief-${run.id}`;
      nodes.push({
        id: briefId,
        kind: "brief",
        x: ox,
        y: oy + 88,
        w: 300,
        h: 72,
        label: snap.summaryText?.trim() ? "Brand brief" : "Scripts",
        sublabel: snap.summaryText?.trim()
          ? shorten(snap.summaryText, 90)
          : snap.scriptsText?.trim()
            ? `${splitAllScriptOptions(snap.scriptsText).length} UGC angles`
            : undefined,
        runId: run.id,
      });
      e(genId, briefId);
    }

    const angleBaseY = oy + (briefId ? 200 : 100);
    const startColX = ox + 20;

    for (let a = 0; a < 3; a++) {
      const pipe = triple[a] as LinkToAdAnglePipelineV1;
      if (!hasAngleContent(pipe)) continue;

      const colX = startColX + a * colGap;
      const angleId = `angle-${run.id}-${a}`;
      nodes.push({
        id: angleId,
        kind: "angle",
        x: colX,
        y: angleBaseY,
        w: 200,
        h: 52,
        label: `Script ${a + 1}`,
        sublabel: angleShortLabel(labels, a),
        runId: run.id,
        angleIndex: a,
      });
      if (briefId) e(briefId, angleId);
      else e(genId, angleId);

      const urls = Array.isArray(pipe.nanoBananaImageUrls) ? pipe.nanoBananaImageUrls : [];
      const slots = pipe.klingByReferenceIndex;
      const imgY = angleBaseY + 72;
      const imgW = 76;
      const imgH = 114;
      const imgStep = 92;

      for (let i = 0; i < 3; i++) {
        const imgId = `img-${run.id}-${a}-${i}`;
        const u = typeof urls[i] === "string" ? urls[i].trim() : "";
        nodes.push({
          id: imgId,
          kind: "ref_image",
          x: colX + (i - 1) * imgStep,
          y: imgY,
          w: imgW,
          h: imgH,
          label: `Ref ${i + 1}`,
          imageUrl: u || null,
          runId: run.id,
          angleIndex: a,
          refIndex: i,
        });
        e(angleId, imgId);

        const slot = Array.isArray(slots) && slots[i] ? slots[i] : null;
        const v = slot?.videoUrl?.trim();
        const tid = slot?.taskId?.trim();
        const hist = slot?.history?.filter((x) => typeof x === "string" && x.trim()) ?? [];
        const vidId = `vid-${run.id}-${a}-${i}`;
        if (v) {
          nodes.push({
            id: vidId,
            kind: "video",
            x: colX + (i - 1) * imgStep - 4,
            y: imgY + imgH + 16,
            w: 84,
            h: 118,
            label: "Video",
            videoUrl: v,
            runId: run.id,
            angleIndex: a,
            refIndex: i,
          });
          e(imgId, vidId);
        } else if (tid) {
          nodes.push({
            id: vidId,
            kind: "video",
            x: colX + (i - 1) * imgStep - 4,
            y: imgY + imgH + 16,
            w: 84,
            h: 56,
            label: "Video",
            sublabel: "Generating…",
            pendingVideo: true,
            runId: run.id,
            angleIndex: a,
            refIndex: i,
          });
          e(imgId, vidId);
        } else if (hist.length > 0) {
          nodes.push({
            id: vidId,
            kind: "video",
            x: colX + (i - 1) * imgStep - 4,
            y: imgY + imgH + 16,
            w: 84,
            h: 118,
            label: "Video (history)",
            videoUrl: hist[0],
            runId: run.id,
            angleIndex: a,
            refIndex: i,
          });
          e(imgId, vidId);
        }
      }

      maxX = Math.max(maxX, colX + 200);
    }

    runCentersX.push(ox + 130);
    cursorY += blockH + runGap;
    maxY = Math.max(maxY, cursorY);
  }

  if (classicRuns.length > 0) {
    const cx = 40;
    const cy = cursorY;
    const clId = "classic-bundle";
    nodes.push({
      id: clId,
      kind: "classic",
      x: cx,
      y: cy,
      w: 280,
      h: 72,
      label: "Classic workflow",
      sublabel: `${classicRuns.length} generation(s). Open from the list.`,
    });
    e(rootId, clId);
    cursorY += 100;
    maxY = Math.max(maxY, cursorY);
  }

  if (universeRuns.length > 0 && runCentersX.length > 0) {
    const mid = runCentersX.reduce((s, x) => s + x, 0) / runCentersX.length;
    const rootNode = nodes.find((n) => n.id === rootId);
    if (rootNode) {
      rootNode.x = mid - rootNode.w / 2;
      rootNode.y = 20;
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 400;
    maxY = 300;
  }

  const pad = 80;
  return {
    nodes,
    edges,
    bounds: {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    },
  };
}

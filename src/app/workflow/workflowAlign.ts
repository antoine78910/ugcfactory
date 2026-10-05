export type WorkflowAlignBox = { id: string; x: number; y: number; width: number; height: number };

export type WorkflowAlignAction =
  | "left"
  | "centerX"
  | "right"
  | "top"
  | "centerY"
  | "bottom"
  | "distributeX"
  | "distributeY"
  | "row"
  | "column"
  | "grid";

export type WorkflowAlignOptions = {
  /** Used by `grid` when set; otherwise a near-square grid is chosen. */
  cols?: number;
  rows?: number;
  gap?: number;
};

export const WORKFLOW_ALIGN_DEFAULT_GAP = 48;

function clampGridDim(n: number | undefined, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

/**
 * Pack boxes into a cols×rows grid (reading order), starting at the selection top-left.
 * Extra cells beyond `boxes.length` are left empty; if boxes exceed cols*rows, extra rows are added.
 */
export function layoutWorkflowAlignGrid(
  boxes: WorkflowAlignBox[],
  cols: number,
  rows: number,
  gap: number = WORKFLOW_ALIGN_DEFAULT_GAP,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (boxes.length === 0) return out;

  const c = clampGridDim(cols, Math.ceil(Math.sqrt(boxes.length)));
  // Prefer the requested row count, but never pad empty trailing rows when there aren't enough items.
  const neededRows = Math.ceil(boxes.length / c);
  let r = clampGridDim(rows, neededRows);
  if (c * r < boxes.length) r = neededRows;
  else r = Math.min(r, neededRows);

  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));

  const byY = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const ordered: WorkflowAlignBox[] = [];
  for (let row = 0; row < r; row++) {
    ordered.push(...byY.slice(row * c, (row + 1) * c).sort((a, b) => a.x - b.x || a.y - b.y));
  }
  // Any leftover boxes (if sort buckets missed some) keep reading order.
  if (ordered.length < boxes.length) {
    const seen = new Set(ordered.map((b) => b.id));
    for (const b of byY) {
      if (!seen.has(b.id)) ordered.push(b);
    }
  }

  const colW = new Array<number>(c).fill(0);
  const rowH = new Array<number>(r).fill(0);
  ordered.forEach((b, i) => {
    const col = i % c;
    const row = Math.floor(i / c);
    if (row >= r) return;
    colW[col] = Math.max(colW[col], b.width);
    rowH[row] = Math.max(rowH[row], b.height);
  });

  const colX: number[] = [];
  let cx = minX;
  for (let col = 0; col < c; col++) {
    colX.push(cx);
    cx += colW[col] + gap;
  }
  const rowY: number[] = [];
  let cy = minY;
  for (let row = 0; row < r; row++) {
    rowY.push(cy);
    cy += rowH[row] + gap;
  }

  ordered.forEach((b, i) => {
    const col = i % c;
    const row = Math.floor(i / c);
    if (row >= r) return;
    out.set(b.id, { x: colX[col], y: rowY[row] });
  });
  return out;
}

/**
 * Returns new absolute top-left positions for the given boxes.
 * Distribute keeps the outermost boxes in place; row/column/grid pack boxes with a fixed gap
 * starting from the selection's top-left corner.
 */
export function computeWorkflowAlignPositions(
  boxes: WorkflowAlignBox[],
  action: WorkflowAlignAction,
  options: WorkflowAlignOptions | number = WORKFLOW_ALIGN_DEFAULT_GAP,
): Map<string, { x: number; y: number }> {
  const opts: WorkflowAlignOptions =
    typeof options === "number" ? { gap: options } : options ?? {};
  const gap = opts.gap ?? WORKFLOW_ALIGN_DEFAULT_GAP;
  const out = new Map<string, { x: number; y: number }>();
  if (boxes.length < 2) return out;

  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.width));
  const maxY = Math.max(...boxes.map((b) => b.y + b.height));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  switch (action) {
    case "left":
      for (const b of boxes) out.set(b.id, { x: minX, y: b.y });
      break;
    case "centerX":
      for (const b of boxes) out.set(b.id, { x: midX - b.width / 2, y: b.y });
      break;
    case "right":
      for (const b of boxes) out.set(b.id, { x: maxX - b.width, y: b.y });
      break;
    case "top":
      for (const b of boxes) out.set(b.id, { x: b.x, y: minY });
      break;
    case "centerY":
      for (const b of boxes) out.set(b.id, { x: b.x, y: midY - b.height / 2 });
      break;
    case "bottom":
      for (const b of boxes) out.set(b.id, { x: b.x, y: maxY - b.height });
      break;
    case "distributeX": {
      const sorted = [...boxes].sort((a, b) => a.x - b.x || a.y - b.y);
      const total = sorted.reduce((s, b) => s + b.width, 0);
      const space = (maxX - minX - total) / (sorted.length - 1);
      let cursor = minX;
      for (const b of sorted) {
        out.set(b.id, { x: cursor, y: b.y });
        cursor += b.width + space;
      }
      break;
    }
    case "distributeY": {
      const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
      const total = sorted.reduce((s, b) => s + b.height, 0);
      const space = (maxY - minY - total) / (sorted.length - 1);
      let cursor = minY;
      for (const b of sorted) {
        out.set(b.id, { x: b.x, y: cursor });
        cursor += b.height + space;
      }
      break;
    }
    case "row": {
      const sorted = [...boxes].sort((a, b) => a.x - b.x || a.y - b.y);
      let cursor = minX;
      for (const b of sorted) {
        out.set(b.id, { x: cursor, y: minY });
        cursor += b.width + gap;
      }
      break;
    }
    case "column": {
      const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
      let cursor = minY;
      for (const b of sorted) {
        out.set(b.id, { x: minX, y: cursor });
        cursor += b.height + gap;
      }
      break;
    }
    case "grid": {
      const defaultCols = Math.ceil(Math.sqrt(boxes.length));
      const cols = clampGridDim(opts.cols, defaultCols);
      const rows = clampGridDim(opts.rows, Math.ceil(boxes.length / cols));
      return layoutWorkflowAlignGrid(boxes, cols, rows, gap);
    }
  }
  return out;
}

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

export const WORKFLOW_ALIGN_DEFAULT_GAP = 48;

/**
 * Returns new absolute top-left positions for the given boxes.
 * Distribute keeps the outermost boxes in place; row/column/grid pack boxes with a fixed gap
 * starting from the selection's top-left corner.
 */
export function computeWorkflowAlignPositions(
  boxes: WorkflowAlignBox[],
  action: WorkflowAlignAction,
  gap: number = WORKFLOW_ALIGN_DEFAULT_GAP,
): Map<string, { x: number; y: number }> {
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
      const cols = Math.ceil(Math.sqrt(boxes.length));
      const rows = Math.ceil(boxes.length / cols);
      // Reading order: bucket into rows by vertical position, then left-to-right.
      const byY = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
      const ordered: WorkflowAlignBox[] = [];
      for (let r = 0; r < rows; r++) {
        ordered.push(...byY.slice(r * cols, (r + 1) * cols).sort((a, b) => a.x - b.x || a.y - b.y));
      }
      const colW = new Array<number>(cols).fill(0);
      const rowH = new Array<number>(rows).fill(0);
      ordered.forEach((b, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        colW[c] = Math.max(colW[c], b.width);
        rowH[r] = Math.max(rowH[r], b.height);
      });
      const colX: number[] = [];
      let cx = minX;
      for (let c = 0; c < cols; c++) {
        colX.push(cx);
        cx += colW[c] + gap;
      }
      const rowY: number[] = [];
      let cy = minY;
      for (let r = 0; r < rows; r++) {
        rowY.push(cy);
        cy += rowH[r] + gap;
      }
      ordered.forEach((b, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        out.set(b.id, { x: colX[c], y: rowY[r] });
      });
      break;
    }
  }
  return out;
}

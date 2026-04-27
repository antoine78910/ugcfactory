import type { AdAssetNodeData } from "./nodes/AdAssetNode";
import type { ImageRefNodeData } from "./nodes/ImageRefNode";
import type { TextPromptNodeData } from "./nodes/TextPromptNode";
import type { WorkflowCanvasNode } from "./workflowFlowTypes";
import type { PromptListNodeData } from "./workflowPromptListTypes";
import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";
import type { StickyNoteNodeData } from "./workflowStickyNoteTypes";

/**
 * Workflow preview renderer.
 *
 * Builds a small, faithful SVG of the workflow canvas (modules, headers, labels,
 * truncated prompt text and image thumbnails) so users can recognize what's inside
 * a saved workflow at a glance — closer to a real screenshot than a generic blob.
 *
 * The output is fully self-contained (no external CSS/fonts), uses a fixed viewBox,
 * and is reproducible from the project state alone (no DOM/canvas dependency, no
 * cross-origin canvas tainting). Image thumbnails are referenced via `<image href>`
 * so the browser fetches them when displaying the SVG; the rest of the preview
 * (cards, labels, prompt excerpts, edges) renders even when assets are missing or
 * blocked.
 */

const VIEW_W = 720;
const VIEW_H = 440;
const PAD = 28;
const HEADER_H = 22;
const PORT_R = 3.5;
const MIN_CARD_W = 132;
const MIN_CARD_H = 74;
/** Template cards must show the full graph, not only the first left-side modules. */
const PREVIEW_MAX_NODES = 240;

const CHAR_W_LABEL = 5.6;
const CHAR_W_BODY = 5.4;
const CHAR_W_SMALL = 4.8;

type CardKind =
  | "image-generator"
  | "video-generator"
  | "variation"
  | "assistant"
  | "upscale"
  | "website"
  | "image-ref"
  | "avatar-ref"
  | "video-ref"
  | "text-prompt"
  | "prompt-list"
  | "sticky-note"
  | "group";

type KindStyle = {
  headerFill: string;
  headerStroke: string;
  bodyTint: string;
  badge: string;
  label: string;
};

const KIND_STYLES: Record<CardKind, KindStyle> = {
  "image-generator": {
    headerFill: "rgba(124,58,237,0.78)",
    headerStroke: "rgba(167,139,250,0.55)",
    bodyTint: "rgba(124,58,237,0.07)",
    badge: "I",
    label: "Image generator",
  },
  "video-generator": {
    headerFill: "rgba(139,92,246,0.78)",
    headerStroke: "rgba(196,181,253,0.55)",
    bodyTint: "rgba(139,92,246,0.07)",
    badge: "V",
    label: "Video generator",
  },
  variation: {
    headerFill: "rgba(168,85,247,0.78)",
    headerStroke: "rgba(216,180,254,0.55)",
    bodyTint: "rgba(168,85,247,0.07)",
    badge: "≈",
    label: "Variation",
  },
  assistant: {
    headerFill: "rgba(37,99,235,0.78)",
    headerStroke: "rgba(147,197,253,0.55)",
    bodyTint: "rgba(37,99,235,0.07)",
    badge: "A",
    label: "Assistant",
  },
  upscale: {
    headerFill: "rgba(91,33,182,0.78)",
    headerStroke: "rgba(196,181,253,0.55)",
    bodyTint: "rgba(91,33,182,0.07)",
    badge: "↑",
    label: "Upscale",
  },
  website: {
    headerFill: "rgba(30,64,175,0.78)",
    headerStroke: "rgba(96,165,250,0.55)",
    bodyTint: "rgba(30,64,175,0.07)",
    badge: "W",
    label: "Website",
  },
  "image-ref": {
    headerFill: "rgba(14,116,144,0.78)",
    headerStroke: "rgba(103,232,249,0.55)",
    bodyTint: "rgba(14,116,144,0.06)",
    badge: "↑",
    label: "Upload image",
  },
  "avatar-ref": {
    headerFill: "rgba(13,148,136,0.78)",
    headerStroke: "rgba(94,234,212,0.55)",
    bodyTint: "rgba(13,148,136,0.06)",
    badge: "A",
    label: "Avatar",
  },
  "video-ref": {
    headerFill: "rgba(15,118,110,0.78)",
    headerStroke: "rgba(94,234,212,0.55)",
    bodyTint: "rgba(15,118,110,0.06)",
    badge: "▶",
    label: "Upload video",
  },
  "text-prompt": {
    headerFill: "rgba(91,33,182,0.78)",
    headerStroke: "rgba(196,181,253,0.5)",
    bodyTint: "rgba(76,29,149,0.08)",
    badge: "T",
    label: "Prompt",
  },
  "prompt-list": {
    headerFill: "rgba(2,132,199,0.78)",
    headerStroke: "rgba(125,211,252,0.5)",
    bodyTint: "rgba(2,132,199,0.07)",
    badge: "≡",
    label: "List",
  },
  "sticky-note": {
    headerFill: "rgba(217,119,6,0.78)",
    headerStroke: "rgba(251,191,36,0.55)",
    bodyTint: "rgba(252,211,77,0.18)",
    badge: "✎",
    label: "Note",
  },
  group: {
    headerFill: "rgba(63,63,70,0.78)",
    headerStroke: "rgba(161,161,170,0.5)",
    bodyTint: "rgba(63,63,70,0.05)",
    badge: "G",
    label: "Group",
  },
};

function classifyNode(n: WorkflowCanvasNode): CardKind {
  if (n.type === "imageRef") {
    const d = n.data as ImageRefNodeData;
    if (d.source === "avatar") return "avatar-ref";
    if (d.mediaKind === "video") return "video-ref";
    return "image-ref";
  }
  if (n.type === "textPrompt") return "text-prompt";
  if (n.type === "promptList") return "prompt-list";
  if (n.type === "stickyNote") return "sticky-note";
  if (n.type === "workflowGroup") return "group";
  if (n.type === "adAsset") {
    const k = (n.data as AdAssetNodeData).kind;
    if (k === "image") return "image-generator";
    if (k === "video") return "video-generator";
    if (k === "variation") return "variation";
    if (k === "assistant") return "assistant";
    if (k === "upscale") return "upscale";
    if (k === "website") return "website";
  }
  return "image-generator";
}

function escapeXml(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeAttr(v: string): string {
  return escapeXml(v);
}

function isUsableImageUrl(url: string | null | undefined): url is string {
  if (typeof url !== "string") return false;
  const t = url.trim();
  if (!t) return false;
  if (t.startsWith("blob:")) return false; // not embeddable into a saved SVG
  return true;
}

function nodeImageThumbUrl(n: WorkflowCanvasNode): string | null {
  if (n.type === "imageRef") {
    const d = n.data as ImageRefNodeData;
    if (d.mediaKind !== "image") return null;
    return isUsableImageUrl(d.imageUrl) ? d.imageUrl : null;
  }
  if (n.type === "adAsset") {
    const d = n.data as AdAssetNodeData;
    const out = d.outputPreviewUrl ?? "";
    if (isUsableImageUrl(out) && (d.outputMediaKind ?? "image") === "image") return out;
    const ref = d.referencePreviewUrl ?? "";
    if (isUsableImageUrl(ref) && (d.referenceMediaKind ?? "image") === "image") return ref;
    const frame = d.videoExtractedLastFrameUrl || d.videoExtractedFirstFrameUrl || "";
    if (isUsableImageUrl(frame)) return frame;
    return null;
  }
  return null;
}

function nodeBodyText(n: WorkflowCanvasNode): string {
  if (n.type === "textPrompt") {
    return ((n.data as TextPromptNodeData).prompt ?? "").trim();
  }
  if (n.type === "promptList") {
    const d = n.data as PromptListNodeData;
    const lines = (d.lines ?? []).filter((l) => typeof l === "string" && l.trim().length > 0);
    return lines.length === 0 ? "" : lines.slice(0, 3).join(" · ");
  }
  if (n.type === "stickyNote") {
    return ((n.data as StickyNoteNodeData).text ?? "").trim();
  }
  if (n.type === "adAsset") {
    const d = n.data as AdAssetNodeData;
    if (d.kind === "assistant") return (d.assistantOutput ?? d.prompt ?? "").trim();
    if (d.kind === "website") return (d.websiteUrl ?? "").trim();
    return (d.prompt ?? "").trim();
  }
  if (n.type === "imageRef") {
    return ((n.data as ImageRefNodeData).label ?? "").trim();
  }
  return "";
}

function nodeSubLabel(n: WorkflowCanvasNode): string {
  if (n.type === "adAsset") {
    const d = n.data as AdAssetNodeData;
    if (d.kind === "assistant" && d.assistantModel) return d.assistantModel.toUpperCase();
    if (d.model) return d.model.toUpperCase();
    if (d.kind === "video" && d.videoDurationSec) return `${d.videoDurationSec}s`;
    return "";
  }
  if (n.type === "promptList") {
    const d = n.data as PromptListNodeData;
    const lines = (d.lines ?? []).filter((l) => typeof l === "string" && l.trim().length > 0);
    if (lines.length === 0) return "Empty";
    return `${lines.length} item${lines.length === 1 ? "" : "s"}`;
  }
  if (n.type === "imageRef") {
    const d = n.data as ImageRefNodeData;
    return d.source === "avatar" ? "Avatar" : d.mediaKind === "video" ? "Video" : "Image";
  }
  return "";
}

function wrapTextLines(text: string, maxLineChars: number, maxLines: number): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || maxLines <= 0 || maxLineChars <= 1) return [];
  const words = cleaned.split(" ");
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (!w) continue;
    if (current.length === 0) {
      if (w.length > maxLineChars) {
        // Hard wrap a very long word.
        if (lines.length < maxLines - 1) {
          lines.push(w.slice(0, maxLineChars));
          current = w.slice(maxLineChars);
        } else {
          lines.push(w.slice(0, Math.max(0, maxLineChars - 1)) + "…");
          return lines;
        }
      } else {
        current = w;
      }
      continue;
    }
    if (current.length + 1 + w.length <= maxLineChars) {
      current += " " + w;
      continue;
    }
    if (lines.length < maxLines - 1) {
      lines.push(current);
      current = w.length > maxLineChars ? w.slice(0, Math.max(0, maxLineChars - 1)) + "…" : w;
    } else {
      lines.push(current);
      // Mark next as overflow → ellipsis.
      const remaining = words.slice(i).join(" ");
      const last = lines[lines.length - 1] ?? "";
      // If room, append "…" to last line.
      if (last.length + 1 < maxLineChars) {
        lines[lines.length - 1] = last + "…";
      }
      void remaining;
      return lines;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function renderHeader(
  x: number,
  y: number,
  w: number,
  rx: number,
  style: KindStyle,
  label: string,
  showBadge: boolean,
): string {
  const headerH = HEADER_H;
  const inner = Math.max(8, w - 16);
  const labelChars = Math.max(4, Math.floor(inner / CHAR_W_LABEL) - (showBadge ? 4 : 0));
  const truncated = label.length > labelChars ? label.slice(0, Math.max(0, labelChars - 1)) + "…" : label;
  const badgeCx = x + 12;
  const badgeCy = y + headerH / 2;
  const textX = showBadge ? badgeCx + 10 : x + 10;

  const headerPath = `
    <path d="M ${x.toFixed(2)} ${(y + rx).toFixed(2)}
             Q ${x.toFixed(2)} ${y.toFixed(2)} ${(x + rx).toFixed(2)} ${y.toFixed(2)}
             L ${(x + w - rx).toFixed(2)} ${y.toFixed(2)}
             Q ${(x + w).toFixed(2)} ${y.toFixed(2)} ${(x + w).toFixed(2)} ${(y + rx).toFixed(2)}
             L ${(x + w).toFixed(2)} ${(y + headerH).toFixed(2)}
             L ${x.toFixed(2)} ${(y + headerH).toFixed(2)} Z"
          fill="${style.headerFill}" />`;

  const badge = showBadge
    ? `<circle cx="${badgeCx.toFixed(2)}" cy="${badgeCy.toFixed(2)}" r="6.5" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.4)" stroke-width="0.6" />
       <text x="${badgeCx.toFixed(2)}" y="${(badgeCy + 3).toFixed(2)}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="700" fill="rgba(255,255,255,0.95)" text-anchor="middle">${escapeXml(style.badge)}</text>`
    : "";

  const labelText = `<text x="${textX.toFixed(2)}" y="${(y + 14.5).toFixed(2)}" font-family="Inter, system-ui, sans-serif" font-size="10.5" font-weight="700" fill="rgba(255,255,255,0.95)" letter-spacing="0.4">${escapeXml(truncated)}</text>`;

  return `${headerPath}${badge}${labelText}`;
}

function renderTextLines(
  x: number,
  y: number,
  w: number,
  h: number,
  lines: string[],
  fill: string,
  fontSize = 10.5,
  lineGap = 4,
): string {
  if (!lines.length) return "";
  const lineH = fontSize + lineGap;
  const totalH = lineH * lines.length;
  const padY = Math.max(0, (h - totalH) / 2);
  const startY = y + padY + fontSize;
  return lines
    .map(
      (ln, i) => `<text x="${(x + 10).toFixed(2)}" y="${(startY + i * lineH).toFixed(2)}" font-family="Inter, system-ui, sans-serif" font-size="${fontSize}" font-weight="500" fill="${fill}">${escapeXml(ln)}</text>`,
    )
    .join("");
  void w;
}

function renderImageBody(
  x: number,
  y: number,
  w: number,
  h: number,
  bodyRx: number,
  url: string,
  clipId: string,
): string {
  return `
    <defs>
      <clipPath id="${clipId}">
        <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${bodyRx.toFixed(2)}" ry="${bodyRx.toFixed(2)}" />
      </clipPath>
    </defs>
    <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${bodyRx.toFixed(2)}" ry="${bodyRx.toFixed(2)}" fill="rgba(8,9,15,0.85)" />
    <image href="${escapeAttr(url)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />
    <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${bodyRx.toFixed(2)}" ry="${bodyRx.toFixed(2)}" fill="url(#wf-prv-img-overlay)" />`;
}

function renderPlaceholderIcon(cx: number, cy: number, kind: CardKind): string {
  if (kind === "image-generator" || kind === "image-ref" || kind === "avatar-ref" || kind === "upscale" || kind === "variation") {
    return `<g opacity="0.32">
      <rect x="${(cx - 14).toFixed(2)}" y="${(cy - 9).toFixed(2)}" width="28" height="18" rx="3" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.2" />
      <circle cx="${(cx - 6).toFixed(2)}" cy="${(cy - 3).toFixed(2)}" r="2.4" fill="rgba(255,255,255,0.85)" />
      <path d="M ${(cx - 12).toFixed(2)} ${(cy + 6).toFixed(2)} L ${(cx - 1).toFixed(2)} ${(cy - 1).toFixed(2)} L ${(cx + 5).toFixed(2)} ${(cy + 4).toFixed(2)} L ${(cx + 12).toFixed(2)} ${(cy + 8).toFixed(2)}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.2" />
    </g>`;
  }
  if (kind === "video-generator" || kind === "video-ref") {
    return `<g opacity="0.32" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.2">
      <rect x="${(cx - 14).toFixed(2)}" y="${(cy - 9).toFixed(2)}" width="28" height="18" rx="3" />
      <path d="M ${(cx - 3).toFixed(2)} ${(cy - 4).toFixed(2)} L ${(cx + 6).toFixed(2)} ${cy.toFixed(2)} L ${(cx - 3).toFixed(2)} ${(cy + 4).toFixed(2)} Z" fill="rgba(255,255,255,0.85)" stroke="none" />
    </g>`;
  }
  if (kind === "assistant") {
    return `<g opacity="0.32" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.2">
      <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="9" />
      <path d="M ${(cx - 4).toFixed(2)} ${(cy - 1).toFixed(2)} L ${cx.toFixed(2)} ${(cy + 3).toFixed(2)} L ${(cx + 5).toFixed(2)} ${(cy - 3).toFixed(2)}" />
    </g>`;
  }
  if (kind === "website") {
    return `<g opacity="0.32" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.2">
      <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="9" />
      <path d="M ${(cx - 9).toFixed(2)} ${cy.toFixed(2)} L ${(cx + 9).toFixed(2)} ${cy.toFixed(2)}" />
      <path d="M ${cx.toFixed(2)} ${(cy - 9).toFixed(2)} Q ${(cx + 5).toFixed(2)} ${cy.toFixed(2)} ${cx.toFixed(2)} ${(cy + 9).toFixed(2)} Q ${(cx - 5).toFixed(2)} ${cy.toFixed(2)} ${cx.toFixed(2)} ${(cy - 9).toFixed(2)} Z" />
    </g>`;
  }
  if (kind === "text-prompt") {
    return `<g opacity="0.32" fill="rgba(255,255,255,0.85)">
      <rect x="${(cx - 12).toFixed(2)}" y="${(cy - 6).toFixed(2)}" width="24" height="2" rx="1" />
      <rect x="${(cx - 12).toFixed(2)}" y="${(cy - 1).toFixed(2)}" width="20" height="2" rx="1" />
      <rect x="${(cx - 12).toFixed(2)}" y="${(cy + 4).toFixed(2)}" width="14" height="2" rx="1" />
    </g>`;
  }
  if (kind === "prompt-list") {
    return `<g opacity="0.32" fill="rgba(255,255,255,0.85)">
      <circle cx="${(cx - 10).toFixed(2)}" cy="${(cy - 6).toFixed(2)}" r="1.6" />
      <rect x="${(cx - 6).toFixed(2)}" y="${(cy - 7).toFixed(2)}" width="20" height="2" rx="1" />
      <circle cx="${(cx - 10).toFixed(2)}" cy="${cy.toFixed(2)}" r="1.6" />
      <rect x="${(cx - 6).toFixed(2)}" y="${(cy - 1).toFixed(2)}" width="16" height="2" rx="1" />
      <circle cx="${(cx - 10).toFixed(2)}" cy="${(cy + 6).toFixed(2)}" r="1.6" />
      <rect x="${(cx - 6).toFixed(2)}" y="${(cy + 5).toFixed(2)}" width="14" height="2" rx="1" />
    </g>`;
  }
  return "";
}

function renderPorts(x: number, y: number, w: number, h: number, kind: CardKind): string {
  // Sticky notes and groups don't have ports.
  if (kind === "sticky-note" || kind === "group") return "";
  const cyMid = y + (HEADER_H + h) / 2;
  const cyMidR = y + (HEADER_H + h) / 2;
  const left = x;
  const right = x + w;
  const portFill = "rgba(167,139,250,0.85)";
  const portStroke = "rgba(255,255,255,0.85)";
  // Inputs only on most types except text-prompt (output only) and image-ref (output only).
  const hasInput = kind !== "text-prompt" && kind !== "image-ref" && kind !== "avatar-ref" && kind !== "video-ref" && kind !== "prompt-list";
  const hasOutput = true;
  return `
    ${hasInput ? `<circle cx="${left.toFixed(2)}" cy="${cyMid.toFixed(2)}" r="${PORT_R}" fill="${portFill}" stroke="${portStroke}" stroke-width="0.8" />` : ""}
    ${hasOutput ? `<circle cx="${right.toFixed(2)}" cy="${cyMidR.toFixed(2)}" r="${PORT_R}" fill="${portFill}" stroke="${portStroke}" stroke-width="0.8" />` : ""}
  `;
}

function renderEdge(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  variant: "default" | "soft" = "default",
): string {
  const dx = Math.max(40, Math.abs(bx - ax) * 0.5);
  const c1x = ax + dx;
  const c2x = bx - dx;
  const stroke = variant === "soft" ? "rgba(196,181,253,0.32)" : "rgba(167,139,250,0.65)";
  return `<path d="M ${ax.toFixed(2)} ${ay.toFixed(2)} C ${c1x.toFixed(2)} ${ay.toFixed(2)}, ${c2x.toFixed(2)} ${by.toFixed(2)}, ${bx.toFixed(2)} ${by.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round" />`;
}

type LaidOutNode = {
  node: WorkflowCanvasNode;
  kind: CardKind;
  x: number;
  y: number;
  w: number;
  h: number;
};

function layoutNodes(
  project: WorkflowProjectStateV1,
  width: number,
  height: number,
): {
  items: LaidOutNode[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number; nodeIds: Set<string> };
} | null {
  const page = project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0];
  if (!page || !Array.isArray(page.nodes) || page.nodes.length === 0) return null;

  // Show the full workflow graph in template previews (users expect every module
  // they published to appear in the card snapshot).
  const sortedByStart = [...page.nodes].sort(
    (a, b) => a.position.x - b.position.x || a.position.y - b.position.y,
  );
  const nodes = sortedByStart.slice(0, PREVIEW_MAX_NODES);

  const nodeIds = new Set(nodes.map((n) => n.id));
  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const maxX = Math.max(
    ...nodes.map((n) => n.position.x + (typeof n.width === "number" && n.width > 0 ? n.width : 220)),
  );
  const maxY = Math.max(
    ...nodes.map((n) => n.position.y + (typeof n.height === "number" && n.height > 0 ? n.height : 140)),
  );

  const srcW = Math.max(1, maxX - minX);
  const srcH = Math.max(1, maxY - minY);
  const targetW = Math.max(1, width - PAD * 2);
  const targetH = Math.max(1, height - PAD * 2);
  const scale = Math.min(targetW / srcW, targetH / srcH);
  const tx = (width - srcW * scale) / 2 - minX * scale;
  const ty = (height - srcH * scale) / 2 - minY * scale;

  const items: LaidOutNode[] = nodes.map((n) => {
    const rawW = typeof n.width === "number" && n.width > 0 ? n.width : 220;
    const rawH = typeof n.height === "number" && n.height > 0 ? n.height : 140;
    const w = Math.max(MIN_CARD_W, rawW * scale);
    const h = Math.max(MIN_CARD_H, rawH * scale);
    const x = n.position.x * scale + tx;
    const y = n.position.y * scale + ty;
    return { node: n, kind: classifyNode(n), x, y, w, h };
  });
  return { items, bounds: { minX, minY, maxX, maxY, nodeIds } };
}

function renderNodeCard(item: LaidOutNode, idx: number, idPrefix: string): string {
  const { node, kind, x, y, w, h } = item;
  const style = KIND_STYLES[kind];
  const rx = 9;
  const bodyRx = 6;
  const headerH = HEADER_H;
  const bodyX = x + 8;
  const bodyY = y + headerH + 6;
  const bodyW = Math.max(0, w - 16);
  const bodyH = Math.max(0, h - headerH - 12);
  const thumb = nodeImageThumbUrl(node);
  const text = nodeBodyText(node);
  const sub = nodeSubLabel(node);

  // Card outer: shadow + bg + border + colored body tint.
  const shadow = `<rect x="${(x + 1.5).toFixed(2)}" y="${(y + 3).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${rx}" ry="${rx}" fill="rgba(0,0,0,0.45)" />`;
  const cardBg = `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${rx}" ry="${rx}" fill="rgba(11,9,18,0.96)" />`;
  const tint = `<rect x="${x.toFixed(2)}" y="${(y + headerH).toFixed(2)}" width="${w.toFixed(2)}" height="${(h - headerH).toFixed(2)}" rx="0" ry="0" fill="${style.bodyTint}" />`;
  const border = `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${rx}" ry="${rx}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;

  // Sticky notes get a custom yellow body matching the node color.
  let body = "";
  if (kind === "sticky-note") {
    const sticky = node.data as StickyNoteNodeData;
    const bg = sticky.color || "#fef9c3";
    const fg = sticky.textColor || "#18181b";
    body = `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${rx}" ry="${rx}" fill="${escapeAttr(bg)}" />`;
    const charsPerLine = Math.max(8, Math.floor(bodyW / CHAR_W_BODY));
    const lines = wrapTextLines(text || sticky.text || "Note", charsPerLine, 4);
    body += renderTextLines(x + 4, y + 8, w - 8, h - 16, lines, escapeAttr(fg), 11, 4);
    return `${shadow}${body}${border}`;
  }

  if (thumb) {
    body = renderImageBody(bodyX, bodyY, bodyW, bodyH, bodyRx, thumb, `${idPrefix}-clip-${idx}`);
    if (sub) {
      body += `<rect x="${(bodyX + 6).toFixed(2)}" y="${(bodyY + bodyH - 18).toFixed(2)}" width="${Math.min(bodyW - 12, sub.length * CHAR_W_SMALL + 10).toFixed(2)}" height="14" rx="3" fill="rgba(0,0,0,0.55)" />`;
      body += `<text x="${(bodyX + 11).toFixed(2)}" y="${(bodyY + bodyH - 8).toFixed(2)}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="600" fill="rgba(255,255,255,0.92)" letter-spacing="0.3">${escapeXml(sub)}</text>`;
    }
  } else if (text) {
    const charsPerLine = Math.max(8, Math.floor(bodyW / CHAR_W_BODY));
    const lines = wrapTextLines(text, charsPerLine, 3);
    body = `<rect x="${bodyX.toFixed(2)}" y="${bodyY.toFixed(2)}" width="${bodyW.toFixed(2)}" height="${bodyH.toFixed(2)}" rx="${bodyRx}" ry="${bodyRx}" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.06)" />`;
    body += renderTextLines(bodyX, bodyY, bodyW, bodyH, lines, "rgba(229,231,235,0.92)", 10.5, 4);
    if (sub) {
      body += `<text x="${(bodyX + 6).toFixed(2)}" y="${(bodyY + bodyH - 6).toFixed(2)}" font-family="Inter, system-ui, sans-serif" font-size="8.5" font-weight="600" fill="rgba(255,255,255,0.55)" letter-spacing="0.3">${escapeXml(sub.toUpperCase())}</text>`;
    }
  } else {
    // Empty / waiting state — placeholder icon centered.
    body = `<rect x="${bodyX.toFixed(2)}" y="${bodyY.toFixed(2)}" width="${bodyW.toFixed(2)}" height="${bodyH.toFixed(2)}" rx="${bodyRx}" ry="${bodyRx}" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" />`;
    body += renderPlaceholderIcon(bodyX + bodyW / 2, bodyY + bodyH / 2, kind);
    if (sub) {
      body += `<text x="${(bodyX + bodyW / 2).toFixed(2)}" y="${(bodyY + bodyH - 8).toFixed(2)}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="600" fill="rgba(255,255,255,0.55)" letter-spacing="0.3">${escapeXml(sub.toUpperCase())}</text>`;
    }
  }

  const header = renderHeader(x, y, w, rx, style, style.label, true);
  const ports = renderPorts(x, y, w, h, kind);

  return `${shadow}${cardBg}${tint}${body}${header}${border}${ports}`;
}

function buildEdges(
  page: NonNullable<WorkflowProjectStateV1["pages"]>[number],
  itemMap: Map<string, LaidOutNode>,
  visibleNodeIds: Set<string>,
): string {
  const out: string[] = [];
  const edges = (page.edges ?? []).slice(0, 80);
  for (const e of edges) {
    if (!visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target)) continue;
    const a = itemMap.get(e.source);
    const b = itemMap.get(e.target);
    if (!a || !b) continue;
    const ax = a.x + a.w;
    const ay = a.y + (HEADER_H + a.h) / 2;
    const bx = b.x;
    const by = b.y + (HEADER_H + b.h) / 2;
    out.push(renderEdge(ax, ay, bx, by, "default"));
  }
  return out.join("");
}

export function buildWorkflowPreviewSvg(
  project: WorkflowProjectStateV1,
  options?: { width?: number; height?: number },
): { svg: string; width: number; height: number } | null {
  const width = options?.width ?? VIEW_W;
  const height = options?.height ?? VIEW_H;
  const layout = layoutNodes(project, width, height);
  if (!layout) return null;
  const page = project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0];
  if (!page) return null;

  const itemMap = new Map<string, LaidOutNode>();
  for (const it of layout.items) itemMap.set(it.node.id, it);

  const idPrefix = `wf-${Math.abs(hashString(project.activePageId + ":" + layout.items.length)).toString(36)}`;

  const edgesSvg = buildEdges(page, itemMap, layout.bounds.nodeIds);
  const nodesSvg = layout.items.map((it, idx) => renderNodeCard(it, idx, idPrefix)).join("");

  const dotSize = 1.1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="wf-prv-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#150f24"/>
      <stop offset="55%" stop-color="#0a0913"/>
      <stop offset="100%" stop-color="#1a1230"/>
    </linearGradient>
    <radialGradient id="wf-prv-glow" cx="50%" cy="38%" r="65%">
      <stop offset="0%" stop-color="rgba(139,92,246,0.18)"/>
      <stop offset="100%" stop-color="rgba(139,92,246,0)"/>
    </radialGradient>
    <linearGradient id="wf-prv-img-overlay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.45)"/>
    </linearGradient>
    <pattern id="wf-prv-dots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="11" cy="11" r="${dotSize}" fill="rgba(255,255,255,0.06)" />
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#wf-prv-bg)" />
  <rect width="${width}" height="${height}" fill="url(#wf-prv-dots)" />
  <rect width="${width}" height="${height}" fill="url(#wf-prv-glow)" />
  ${edgesSvg}
  ${nodesSvg}
</svg>`;

  return { svg, width, height };
}

export function buildWorkflowPreviewDataUrl(project: WorkflowProjectStateV1): string | undefined {
  const out = buildWorkflowPreviewSvg(project);
  if (!out) return undefined;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(out.svg)}`;
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return h;
}

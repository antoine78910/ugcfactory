import type { AdAssetNodeData } from "./nodes/AdAssetNode";
import type { ImageRefNodeData } from "./nodes/ImageRefNode";
import type { PromptListNodeData } from "./workflowPromptListTypes";
import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";
import type { WorkflowCanvasNode } from "./workflowFlowTypes";

export const WORKFLOW_PENDING_MEDIA_PREFIX = "__workflow_pending_media__:";
export const WORKFLOW_ERROR_MEDIA_PREFIX = "__workflow_error_media__:";

export type WorkflowGeneratedMediaItem = {
  id: string;
  url: string;
  kind: "image" | "video";
  label: string;
  pageName: string;
  sourceNodeId: string;
  sourceType: "adAsset" | "promptList" | "imageRef";
  listSlotIndex?: number;
  generatedAt?: number;
};

export function toRenderableMediaUrl(url: string): string {
  return url.replace(/#media=(image|video)$/i, "");
}

export function isPendingMediaToken(url: string): boolean {
  return url.trim().startsWith(WORKFLOW_PENDING_MEDIA_PREFIX);
}

export function isErrorMediaToken(url: string): boolean {
  return url.trim().startsWith(WORKFLOW_ERROR_MEDIA_PREFIX);
}

export function isRenderableWorkflowMediaUrl(url: string): boolean {
  const t = url.trim();
  if (!t || isPendingMediaToken(t) || isErrorMediaToken(t)) return false;
  return t.startsWith("http") || t.startsWith("blob:") || t.startsWith("data:");
}

export function workflowMediaKindFromUrl(url: string, hint?: "image" | "video"): "image" | "video" {
  if (hint === "video" || hint === "image") return hint;
  const u = url.trim().toLowerCase();
  if (u.includes("#media=video")) return "video";
  if (u.includes("#media=image")) return "image";
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) return "video";
  return "image";
}

function pushMedia(
  items: WorkflowGeneratedMediaItem[],
  seen: Set<string>,
  entry: Omit<WorkflowGeneratedMediaItem, "kind"> & { kind?: "image" | "video" },
) {
  const url = entry.url.trim();
  if (!isRenderableWorkflowMediaUrl(url)) return;
  const key = `${entry.sourceNodeId}:${entry.listSlotIndex ?? ""}:${url}`;
  if (seen.has(key)) return;
  seen.add(key);
  items.push({
    ...entry,
    url,
    kind: entry.kind ?? workflowMediaKindFromUrl(url),
  });
}

function collectFromNode(
  node: WorkflowCanvasNode,
  pageName: string,
  items: WorkflowGeneratedMediaItem[],
  seen: Set<string>,
) {
  if (node.type === "adAsset") {
    const d = node.data as AdAssetNodeData;
    const url = (d.outputPreviewUrl ?? "").trim();
    if (!url) return;
    pushMedia(items, seen, {
      id: `ad:${node.id}`,
      url,
      kind: workflowMediaKindFromUrl(url, d.outputMediaKind),
      label: (d.label ?? "Generator").trim() || "Generator",
      pageName,
      sourceNodeId: node.id,
      sourceType: "adAsset",
      generatedAt: typeof (d as any).outputGeneratedAt === "number" ? ((d as any).outputGeneratedAt as number) : undefined,
    });
    return;
  }

  if (node.type === "promptList") {
    const d = node.data as PromptListNodeData;
    if ((d.contentKind ?? "text") !== "media") return;
    const lines = Array.isArray(d.lines) ? d.lines : [];
    const listLabel = (d.label ?? "List").trim() || "List";
    lines.forEach((line, idx) => {
      const url = typeof line === "string" ? line.trim() : "";
      if (!url) return;
      pushMedia(items, seen, {
        id: `list:${node.id}:${idx}`,
        url,
        label: `${listLabel} #${idx + 1}`,
        pageName,
        sourceNodeId: node.id,
        sourceType: "promptList",
        listSlotIndex: idx,
      });
    });
    return;
  }

  if (node.type === "imageRef") {
    const d = node.data as ImageRefNodeData;
    const url = (d.imageUrl ?? "").trim();
    if (!url) return;
    pushMedia(items, seen, {
      id: `ref:${node.id}`,
      url,
      kind: workflowMediaKindFromUrl(url, d.mediaKind),
      label: (d.label ?? "Image").trim() || "Image",
      pageName,
      sourceNodeId: node.id,
      sourceType: "imageRef",
    });
  }
}

/** Collect generated / exported media across all workflow pages (newest pages first). */
export function collectGeneratedMediaFromProject(project: WorkflowProjectStateV1): WorkflowGeneratedMediaItem[] {
  const items: WorkflowGeneratedMediaItem[] = [];
  const seen = new Set<string>();
  const pages = [...project.pages].reverse();
  for (const page of pages) {
    const pageName = (page.name ?? "Page").trim() || "Page";
    for (const node of page.nodes) {
      collectFromNode(node, pageName, items, seen);
    }
  }
  return items;
}

export function orderGeneratedMediaItems(
  items: WorkflowGeneratedMediaItem[],
  orderIds: string[],
): WorkflowGeneratedMediaItem[] {
  if (!orderIds.length) return items;
  const byId = new Map(items.map((it) => [it.id, it]));
  const ordered: WorkflowGeneratedMediaItem[] = [];
  for (const id of orderIds) {
    const it = byId.get(id);
    if (it) {
      ordered.push(it);
      byId.delete(id);
    }
  }
  for (const it of items) {
    if (byId.has(it.id)) ordered.push(it);
  }
  return ordered;
}

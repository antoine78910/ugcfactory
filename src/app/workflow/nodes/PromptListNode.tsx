"use client";

import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Check, Clapperboard, Download, Grid3X3, ImageIcon, List, ListOrdered, Maximize2, Pencil, Plus, Trash2, Type, X } from "lucide-react";
import { createPortal } from "react-dom";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";

import { cn } from "@/lib/utils";

import { primeRemoteMediaForDisplay, splitIntoPromptLines } from "../workflowNodeRun";
import { useWorkflowNodePatch } from "../workflowNodePatchContext";
import { WorkflowNodeContextToolbar } from "./WorkflowNodeContextToolbar";
import {
  PROMPT_LIST_DEFAULT_DATA,
  type PromptListNodeData,
  type PromptListNodeType,
} from "../workflowPromptListTypes";

export type { PromptListNodeData, PromptListNodeType } from "../workflowPromptListTypes";

function isProbablyImageUrl(s: string): boolean {
  const u = s.trim().toLowerCase();
  if (u.includes("#media=image")) return true;
  if (u.includes("#media=video")) return false;
  if (!u.startsWith("http") && !u.startsWith("blob:") && !u.startsWith("data:")) return false;
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u) || u.includes("/image");
}

function isProbablyVideoUrl(s: string): boolean {
  const u = s.trim().toLowerCase();
  if (u.includes("#media=video")) return true;
  if (u.includes("#media=image")) return false;
  if (!u.startsWith("http") && !u.startsWith("blob:") && !u.startsWith("data:")) return false;
  return /\.(mp4|webm|mov)(\?|$)/i.test(u);
}

function toRenderableMediaUrl(s: string): string {
  return s.replace(/#media=(image|video)$/i, "");
}

function keepWheelInsideTextarea(e: WheelEvent<HTMLTextAreaElement>) {
  const el = e.currentTarget;
  const canScroll = el.scrollHeight > el.clientHeight;
  if (!canScroll) return;
  // Prevent React Flow / page from stealing wheel while editing list items.
  e.preventDefault();
  el.scrollTop += e.deltaY;
  e.stopPropagation();
}

function triggerMediaDownload(url: string, fallbackName: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  const a = document.createElement("a");
  if (/^blob:|^data:/i.test(trimmed)) {
    a.href = trimmed;
    a.download = fallbackName;
  } else {
    a.href = `/api/download?url=${encodeURIComponent(trimmed)}`;
  }
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const WORKFLOW_PENDING_MEDIA_PREFIX = "__workflow_pending_media__:";

function isPendingMediaToken(s: string): boolean {
  return s.trim().startsWith(WORKFLOW_PENDING_MEDIA_PREFIX);
}

type PromptListMediaGalleryCellProps = {
  url: string;
  slotIndex: number;
  onDeleteSlot: (idx: number) => void;
  onPreviewUrl: (u: string) => void;
};

const PromptListMediaGalleryCell = memo(function PromptListMediaGalleryCell({
  url,
  slotIndex,
  onDeleteSlot,
  onPreviewUrl,
}: PromptListMediaGalleryCellProps) {
  const renderUrl = toRenderableMediaUrl(url);
  const pending = isPendingMediaToken(url);
  const fetchPriority = slotIndex < 9 ? ("high" as const) : ("low" as const);

  useEffect(() => {
    if (pending) return;
    primeRemoteMediaForDisplay(url);
  }, [pending, url]);

  return (
    <div
      className="group relative aspect-square min-h-0 overflow-hidden rounded-md border border-white/10 bg-black/35"
      onMouseEnter={(e) => {
        const v = e.currentTarget.querySelector("video");
        if (!v) return;
        void v.play().catch(() => {});
      }}
      onMouseLeave={(e) => {
        const v = e.currentTarget.querySelector("video");
        if (!v) return;
        v.pause();
        v.currentTime = 0;
      }}
    >
      {pending ? (
        <div className="flex h-full w-full min-h-0 items-center justify-center bg-white/[0.04]">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-violet-300/90" />
        </div>
      ) : isProbablyVideoUrl(url) ? (
        <video
          src={renderUrl}
          className="h-full w-full min-h-0 object-cover transition group-hover:scale-[1.02]"
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={renderUrl}
          alt=""
          loading="eager"
          decoding="async"
          fetchPriority={fetchPriority}
          className="h-full w-full min-h-0 object-cover transition group-hover:scale-[1.02]"
        />
      )}
      <div className="absolute right-1.5 top-1.5 z-[2] flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          className="nodrag nopan inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/85 backdrop-blur-sm hover:bg-black/70"
          title="Download"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const fallback = isProbablyVideoUrl(url) ? `workflow-media-${slotIndex + 1}.mp4` : `workflow-media-${slotIndex + 1}.jpg`;
            triggerMediaDownload(renderUrl, fallback);
          }}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="nodrag nopan inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/85 backdrop-blur-sm hover:bg-black/70"
          title="View large"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPreviewUrl(url);
          }}
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="nodrag nopan inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/85 backdrop-blur-sm hover:bg-black/70"
          title="Delete media"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDeleteSlot(slotIndex);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
});

export function PromptListNode({ id, data: rawData, selected }: NodeProps<PromptListNodeType>) {
  const data = { ...PROMPT_LIST_DEFAULT_DATA, ...rawData };
  const mode = data.mode ?? "prompts";
  const contentKind = data.contentKind ?? "text";
  const patchAll = useWorkflowNodePatch();
  const patch = useCallback((p: Partial<PromptListNodeData>) => patchAll(id, p), [id, patchAll]);
  const { getNodes, getEdges } = useReactFlow();
  const [text, setText] = useState(() => (data.lines ?? []).join("\n"));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [previewMediaUrl, setPreviewMediaUrl] = useState<string | null>(null);
  const [previewTextItem, setPreviewTextItem] = useState<string | null>(null);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(data.label || "List");
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const syncFromLines = useCallback(
    (lines: string[]) => {
      patch({ lines });
      setText(lines.join("\n"));
    },
    [patch],
  );

  const onTextBlur = useCallback(() => {
    const lines = splitIntoPromptLines(text);
    patch({ lines });
  }, [patch, text]);
  const cancelEditorText = useCallback(() => {
    setText("");
    patch({ mode: "prompts", contentKind: "text" });
    setEditorOpen(false);
    setEditingIndex(null);
  }, [patch]);
  const displayTitle = useMemo(() => {
    const base = (data.label || "List").trim() || "List";
    if (base.toLowerCase() === "list") {
      const tail = id.replace(/[^a-zA-Z0-9]/g, "").slice(-2).toUpperCase() || "XX";
      return `List #${tail}`;
    }
    return base;
  }, [data.label, id]);
  const commitTitle = useCallback(() => {
    const next = titleDraft.trim();
    patch({ label: next || "List" });
    setTitleEditing(false);
  }, [patch, titleDraft]);

  const lineCount = useMemo(() => (data.lines ?? []).filter((l) => l.trim()).length, [data.lines]);
  const incomingInputKind = useMemo<null | "text" | "image" | "video">(() => {
    const incoming = getEdges().filter((e) => e.target === id);
    if (!incoming.length) return null;
    if (incoming.some((e) => (e.targetHandle ?? "in") === "inImage")) return "image";
    if (incoming.some((e) => (e.targetHandle ?? "in") === "inVideo")) return "video";
    return "text";
  }, [getEdges, id, lineCount]);
  const nonEmptyLines = useMemo(() => (data.lines ?? []).map((x) => x.trim()).filter(Boolean), [data.lines]);
  const saveEditorText = useCallback(() => {
    const lines = splitIntoPromptLines(text);
    if (editingIndex != null) {
      const next = nonEmptyLines.slice();
      next[editingIndex] = lines[0] ?? "";
      const cleaned = next.map((x) => x.trim()).filter(Boolean);
      syncFromLines(cleaned);
      patch({ mode: "prompts", contentKind: "text" });
      setText("");
      setEditorOpen(false);
      setEditingIndex(null);
      return;
    }
    const next = [...nonEmptyLines, ...lines].filter(Boolean);
    syncFromLines(next);
    patch({ mode: "prompts", contentKind: "text" });
    setText("");
    setEditorOpen(false);
  }, [editingIndex, nonEmptyLines, patch, syncFromLines, text]);
  const imageLikeCount = useMemo(
    () => nonEmptyLines.filter((u) => isProbablyImageUrl(u)).length,
    [nonEmptyLines],
  );
  const videoLikeCount = useMemo(
    () => nonEmptyLines.filter((u) => isProbablyVideoUrl(u)).length,
    [nonEmptyLines],
  );
  const listOutputKind = useMemo<"text" | "image" | "video">(() => {
    if (contentKind === "media") {
      // Media lists should keep media connectors even while items are still loading placeholders.
      return videoLikeCount > 0 ? "video" : "image";
    }
    if (!nonEmptyLines.length) return "text";
    const imageMajority = imageLikeCount >= Math.ceil(nonEmptyLines.length * 0.6);
    const videoMajority = videoLikeCount >= Math.ceil(nonEmptyLines.length * 0.6);
    if (videoMajority && videoLikeCount >= imageLikeCount) return "video";
    if (imageMajority) return "image";
    return "text";
  }, [contentKind, imageLikeCount, nonEmptyLines.length, videoLikeCount]);
  const outputHandleId = listOutputKind === "image" ? "outImage" : listOutputKind === "video" ? "outVideo" : "outText";
  const activeWireKind: null | "text" | "image" | "video" = incomingInputKind;
  const outputBubbleShellClass =
    "nodrag nopan relative h-8 w-8 shrink-0 rounded-full border bg-[#15151a]/95 transition";
  const inputBubbleShellClass =
    "nodrag nopan relative h-8 w-8 shrink-0 rounded-full border bg-[#15151a]/95 transition";
  const inputBubbleHandleClass =
    "nodrag nopan !absolute !left-0 !top-0 !box-border !h-8 !w-8 !min-h-8 !min-w-8 !max-h-8 !max-w-8 !rounded-full !border-0 !bg-transparent opacity-0 !transform-none";
  const outputBubbleHandleClass =
    "nodrag nopan !absolute !inset-0 !z-[2] !box-border !h-8 !w-8 !min-h-8 !min-w-8 !max-h-8 !max-w-8 !rounded-full !border-0 !bg-transparent opacity-0 !transform-none";
  const isMediaList = contentKind === "media";
  const showMediaGallery = isMediaList && nonEmptyLines.length > 0;
  const listIndexLabel = useMemo(() => {
    const tail = id.replace(/[^a-zA-Z0-9]/g, "").slice(-2).toUpperCase();
    return tail || "??";
  }, [id]);
  const onAddMediaFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      const next = [...nonEmptyLines];
      for (const f of Array.from(files)) {
        if (!/^image\/|^video\//i.test(f.type)) continue;
        const kind = /^video\//i.test(f.type) ? "video" : "image";
        const url = `${URL.createObjectURL(f)}#media=${kind}`;
        next.push(url);
      }
      if (!next.length) return;
      syncFromLines(next);
      patch({ mode: "results", contentKind: "media" });
      setEditorOpen(false);
    },
    [nonEmptyLines, patch, syncFromLines],
  );
  const openMediaPicker = useCallback(() => {
    mediaInputRef.current?.click();
  }, []);
  const showEmptyState = nonEmptyLines.length === 0 && !editorOpen;
  const onEditItem = useCallback(
    (idx: number) => {
      setEditingIndex(idx);
      setText(nonEmptyLines[idx] ?? "");
      setEditorOpen(true);
    },
    [nonEmptyLines],
  );
  const onDeleteItem = useCallback(
    (idx: number) => {
      const next = nonEmptyLines.filter((_, i) => i !== idx);
      syncFromLines(next);
      patch({ mode: next.length ? mode : "prompts", contentKind: isMediaList ? "media" : "text" });
    },
    [isMediaList, mode, nonEmptyLines, patch, syncFromLines],
  );
  const onDeleteItemRef = useRef(onDeleteItem);
  onDeleteItemRef.current = onDeleteItem;
  const deleteSlotStable = useCallback((idx: number) => {
    onDeleteItemRef.current(idx);
  }, []);

  return (
    <>
      <WorkflowNodeContextToolbar nodeId={id} onRun={() => {}} variant="sticky" />
      <div
        className="relative flex items-start gap-1"
        onMouseEnter={() => window.dispatchEvent(new CustomEvent("workflow:hover-node", { detail: { nodeId: id } }))}
        onMouseLeave={() => window.dispatchEvent(new CustomEvent("workflow:unhover-node"))}
      >
        <div className="nodrag nopan relative z-[7] flex shrink-0 flex-col gap-1 self-end pb-3">
          {(!incomingInputKind || incomingInputKind === "text") ? (
            <div className={cn(inputBubbleShellClass, "border-white/15")}>
              <Handle id="inText" type="target" position={Position.Left} className={inputBubbleHandleClass} />
              <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/85">
                <Type className="h-3.5 w-3.5" aria-hidden />
              </span>
            </div>
          ) : null}
          {(!incomingInputKind || incomingInputKind === "image") ? (
            <div className={cn(inputBubbleShellClass, "border-white/15")}>
              <Handle id="inImage" type="target" position={Position.Left} className={inputBubbleHandleClass} />
              <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/85">
                <ImageIcon className="h-3.5 w-3.5" aria-hidden />
              </span>
            </div>
          ) : null}
          {(!incomingInputKind || incomingInputKind === "video") ? (
            <div className={cn(inputBubbleShellClass, "border-white/15")}>
              <Handle id="inVideo" type="target" position={Position.Left} className={inputBubbleHandleClass} />
              <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/85">
                <Clapperboard className="h-3.5 w-3.5" aria-hidden />
              </span>
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            "relative flex w-[310px] flex-col overflow-hidden rounded-xl border border-white/[0.1] bg-[#0a0a0c] shadow-[0_12px_40px_rgba(0,0,0,0.55)] pt-5",
            selected && "ring-2 ring-violet-500/85 ring-offset-2 ring-offset-[#06070d]",
          )}
        >
          <div className="nodrag nopan absolute -top-7 left-0 z-[8] flex min-w-0 items-center gap-2.5 pr-2" onPointerDown={(e) => e.stopPropagation()}>
            <ListOrdered className="h-4 w-4 shrink-0 text-violet-300/90" strokeWidth={2} aria-hidden />
            {titleEditing ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTitle();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setTitleDraft(data.label || "List");
                    setTitleEditing(false);
                  }
                }}
                autoFocus
                className="nodrag nopan min-w-0 flex-1 rounded border border-white/20 bg-black/35 px-2 py-0.5 text-[12px] font-semibold tracking-tight text-white outline-none focus:border-violet-400/60"
              />
            ) : (
              <button
                type="button"
                className="nodrag nopan min-w-0 truncate text-left text-[13px] font-semibold tracking-tight text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setTitleEditing(true);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setTitleEditing(true);
                }}
                title="Rename"
              >
                {displayTitle}
              </button>
            )}
          </div>
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              onAddMediaFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
          {showEmptyState ? (
            <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
              <List className="h-9 w-9 text-white/45" aria-hidden />
              <div>
                <p className="text-[16px] font-semibold text-white/90">No elements yet</p>
                <p className="text-[13px] text-white/45">Add elements to this list</p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="nodrag nopan inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 text-[12px] font-medium text-white/85 hover:bg-white/[0.1]"
                  onClick={() => {
                    patch({ contentKind: "text", mode: "prompts" });
                    setEditingIndex(null);
                    setText("");
                    setEditorOpen(true);
                  }}
                >
                  <Type className="h-3.5 w-3.5" aria-hidden />
                  Add text
                </button>
                <button
                  type="button"
                  className="nodrag nopan inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 text-[12px] font-medium text-white/85 hover:bg-white/[0.1]"
                  onClick={openMediaPicker}
                >
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                  Add media
                </button>
              </div>
            </div>
          ) : isMediaList && showMediaGallery ? (
          <>
            <div className="p-2.5">
              <div className="grid grid-cols-3 gap-2">
                {nonEmptyLines.map((u, i) => (
                  <PromptListMediaGalleryCell
                    key={`media-slot-${i}`}
                    url={u}
                    slotIndex={i}
                    onDeleteSlot={deleteSlotStable}
                    onPreviewUrl={setPreviewMediaUrl}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end border-t border-white/[0.08] px-2.5 py-2 text-[10px] text-white/55">
              <span>{nonEmptyLines.length} media</span>
              <button
                type="button"
                title="Add media"
                className="nodrag nopan inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/85 hover:bg-white/[0.12]"
                onClick={openMediaPicker}
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </>
          ) : editorOpen ? (
            <div className="relative p-2.5">
              <div className="space-y-1.5 opacity-35 blur-[1.5px]">
                {nonEmptyLines.map((line, i) => (
                  <div
                    key={`edit-bg-${i}-${line.slice(0, 24)}`}
                    className={cn(
                      "rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] leading-relaxed text-white/82",
                      editingIndex === i && "border-violet-400/45 bg-violet-500/[0.08]",
                    )}
                  >
                    <span className="block max-h-[2.8em] overflow-hidden break-words leading-relaxed line-clamp-2">{line}</span>
                  </div>
                ))}
              </div>
              <div className="absolute inset-x-2.5 top-2.5 rounded-xl border border-violet-400/45 bg-[#15151a]/96 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onWheelCapture={keepWheelInsideTextarea}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      saveEditorText();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEditorText();
                    }
                  }}
                  placeholder="Type text here... (Ctrl/Cmd + Enter to save)"
                  rows={6}
                  className="nodrag nopan mb-3 min-h-[150px] w-full resize-y border-none bg-transparent px-0 text-[13px] leading-relaxed text-white/90 placeholder:text-white/30 outline-none studio-params-scroll"
                />
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-7 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] px-2 text-[12px] font-semibold text-white/70">
                    Aa
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="nodrag nopan inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/75 hover:bg-white/[0.12] hover:text-white"
                      onClick={cancelEditorText}
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="nodrag nopan inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/75 hover:bg-white/[0.12] hover:text-white"
                      onClick={saveEditorText}
                      title="Save"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className="nodrag nopan inline-flex h-8 items-center rounded-full border border-white/12 bg-white/[0.06] px-3 text-[11px] font-semibold text-white/80 hover:bg-white/[0.1]"
                  onClick={() => {
                    saveEditorText();
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
            <div className="space-y-1.5 p-2.5">
              {nonEmptyLines.map((line, i) => (
                <div
                  key={`${i}-${line.slice(0, 24)}`}
                  className="group relative cursor-pointer rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-[11px] leading-relaxed text-white/82"
                  onMouseEnter={() => {}}
                  onClick={() => setPreviewTextItem(line)}
                  title={line}
                >
                  <span className="block max-h-[2.8em] overflow-hidden pr-14 break-words leading-relaxed line-clamp-2">{line}</span>
                  <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
                    <button
                      type="button"
                      className="nodrag nopan inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/12 bg-white/[0.06] text-white/80 hover:bg-white/[0.12]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditItem(i);
                      }}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="nodrag nopan inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/12 bg-white/[0.06] text-white/80 hover:bg-white/[0.12]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteItem(i);
                      }}
                      title="Delete"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
              {nonEmptyLines.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/12 bg-black/20 px-2.5 py-3 text-[11px] text-white/40">
                  No items yet. Use Replace items to paste or import prompts.
                </p>
              ) : null}
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.08] px-2.5 py-2 text-[10px] text-white/55">
              <span>{nonEmptyLines.length} item{nonEmptyLines.length === 1 ? "" : "s"}</span>
              <button
                type="button"
                title="Add item"
                className="nodrag nopan inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-white/85 hover:bg-white/[0.12]"
                onClick={() => {
                  if (isMediaList) {
                    openMediaPicker();
                    return;
                  }
                  setEditingIndex(null);
                  setText("");
                  setEditorOpen(true);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
            </>
          )}
          <Handle
            id="in"
            type="target"
            position={Position.Left}
            className="hidden"
          />
        </div>
        <div className="nodrag nopan relative z-[7] flex shrink-0 flex-col gap-1 mt-2">
          {(!activeWireKind || activeWireKind === "text") ? (
            <div className={cn(outputBubbleShellClass, "border-white/15")}>
              <Handle id="outText" type="source" position={Position.Right} className={outputBubbleHandleClass} />
              <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/85">
                <Type className="h-3.5 w-3.5" aria-hidden />
              </span>
            </div>
          ) : null}
          {(!activeWireKind || activeWireKind === "image") ? (
            <div className={cn(outputBubbleShellClass, "border-white/15")}>
              <Handle id="outImage" type="source" position={Position.Right} className={outputBubbleHandleClass} />
              <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/85">
                <ImageIcon className="h-3.5 w-3.5" aria-hidden />
              </span>
            </div>
          ) : null}
          {(!activeWireKind || activeWireKind === "video") ? (
            <div className={cn(outputBubbleShellClass, "border-white/15")}>
              <Handle id="outVideo" type="source" position={Position.Right} className={outputBubbleHandleClass} />
              <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-white/85">
                <Clapperboard className="h-3.5 w-3.5" aria-hidden />
              </span>
            </div>
          ) : null}
        </div>
      </div>
      {previewMediaUrl && typeof document !== "undefined"
        ? createPortal(
            <div
              className="nodrag nopan fixed inset-0 z-[9999] flex items-center justify-center bg-black/88 p-2 backdrop-blur-[2px]"
              onClick={() => setPreviewMediaUrl(null)}
              role="dialog"
              aria-modal="true"
              aria-label="Full media preview"
            >
              <button
                type="button"
                className="nodrag nopan absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-lg hover:bg-black/85"
                title="Close preview"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewMediaUrl(null);
                }}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              {isProbablyVideoUrl(previewMediaUrl) ? (
                <video
                  src={toRenderableMediaUrl(previewMediaUrl)}
                  className="h-[92vh] w-[96vw] object-contain"
                  controls
                  autoPlay
                  playsInline
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={toRenderableMediaUrl(previewMediaUrl)}
                  alt=""
                  className="h-[92vh] w-[96vw] object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>,
            document.body,
          )
        : null}
      {previewTextItem && typeof document !== "undefined"
        ? createPortal(
            <div
              className="nodrag nopan fixed inset-0 z-[9999] flex items-center justify-center bg-black/88 p-3 backdrop-blur-[2px]"
              onClick={() => setPreviewTextItem(null)}
              role="dialog"
              aria-modal="true"
              aria-label="Full text preview"
            >
              <button
                type="button"
                className="nodrag nopan absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-lg hover:bg-black/85"
                title="Close preview"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewTextItem(null);
                }}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <div
                className="max-h-[86vh] w-[min(860px,96vw)] overflow-auto rounded-xl border border-white/12 bg-[#0f0f12] p-4 studio-params-scroll"
                onClick={(e) => e.stopPropagation()}
              >
                <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-white/90">
                  {previewTextItem}
                </pre>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

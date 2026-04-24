"use client";

import { Layers, LayoutTemplate, Pencil, Plus, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { useSupabaseBrowserClient } from "@/lib/supabase/BrowserSupabaseProvider";

import { WorkflowAmbientLayer } from "./WorkflowAmbientLayer";
import { WorkflowLandingHeroDiagram } from "./WorkflowLandingHeroDiagram";
import {
  createSpace,
  deleteSpace,
  getWorkflowStorageScope,
  loadProjectForSpace,
  loadSpacesIndex,
  updateSpaceMeta,
  type WorkflowSpaceMeta,
} from "./workflowSpacesStorage";
import type { WorkflowCanvasNode } from "./workflowFlowTypes";
import {
  listWorkflowTemplates,
  workflowCommunityTemplateId,
  type WorkflowTemplateMeta,
} from "./workflowTemplates";

type TabId = "my" | "shared" | "templates";

function formatTimeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

function nodePreviewLabel(node: WorkflowCanvasNode): string {
  if (node.type === "adAsset") {
    const kind = String((node.data as { kind?: unknown })?.kind ?? "").trim();
    if (kind) return kind;
  }
  if (node.type === "textPrompt") return "text";
  if (node.type === "imageRef") return "image";
  if (node.type === "promptList") return "list";
  if (node.type === "stickyNote") return "note";
  return node.type;
}

function nodePreviewMediaUrl(node: WorkflowCanvasNode): string | null {
  if (node.type === "imageRef") {
    const data = node.data as { imageUrl?: unknown; mediaKind?: unknown };
    const url = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
    if (url && data.mediaKind === "image") return url;
    return null;
  }
  if (node.type !== "adAsset") return null;
  const data = node.data as {
    outputPreviewUrl?: unknown;
    outputMediaKind?: unknown;
    referencePreviewUrl?: unknown;
    referenceMediaKind?: unknown;
    videoExtractedLastFrameUrl?: unknown;
    videoExtractedFirstFrameUrl?: unknown;
  };
  const outputUrl = typeof data.outputPreviewUrl === "string" ? data.outputPreviewUrl.trim() : "";
  if (outputUrl && (data.outputMediaKind ?? "image") === "image") return outputUrl;
  const refUrl = typeof data.referencePreviewUrl === "string" ? data.referencePreviewUrl.trim() : "";
  if (refUrl && (data.referenceMediaKind ?? "image") === "image") return refUrl;
  const frameUrl =
    typeof data.videoExtractedLastFrameUrl === "string" && data.videoExtractedLastFrameUrl.trim()
      ? data.videoExtractedLastFrameUrl.trim()
      : typeof data.videoExtractedFirstFrameUrl === "string" && data.videoExtractedFirstFrameUrl.trim()
        ? data.videoExtractedFirstFrameUrl.trim()
        : "";
  if (frameUrl && frameUrl.length <= 180_000) return frameUrl;
  return null;
}

function WorkflowSpaceCardPreviewFallback({
  scope,
  spaceId,
}: {
  scope: string;
  spaceId: string;
}) {
  const preview = useMemo(() => {
    const project = loadProjectForSpace(scope, spaceId);
    const page = project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0];
    if (!page || !Array.isArray(page.nodes) || page.nodes.length === 0) return null;
    const nodes = page.nodes.slice(0, 18) as WorkflowCanvasNode[];
    const edges = (page.edges ?? []).slice(0, 28);
    const minX = Math.min(...nodes.map((n) => n.position.x));
    const minY = Math.min(...nodes.map((n) => n.position.y));
    const maxX = Math.max(...nodes.map((n) => n.position.x + (n.width ?? 180)));
    const maxY = Math.max(...nodes.map((n) => n.position.y + (n.height ?? 110)));
    const width = Math.max(220, maxX - minX + 80);
    const height = Math.max(140, maxY - minY + 80);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    return { nodes, edges, minX, minY, width, height, nodeMap };
  }, [scope, spaceId]);

  if (!preview) {
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-violet-900/30 via-[#1a1a22] to-violet-950/35" />
    );
  }

  return (
    <svg
      viewBox={`0 0 ${preview.width} ${preview.height}`}
      className="absolute inset-0 h-full w-full"
      role="img"
      aria-label="Workflow preview"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id={`wf-bg-${spaceId}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(46,16,101,0.72)" />
          <stop offset="50%" stopColor="rgba(12,13,18,0.96)" />
          <stop offset="100%" stopColor="rgba(30,27,75,0.78)" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={preview.width} height={preview.height} fill={`url(#wf-bg-${spaceId})`} />
      {preview.edges.map((e, idx) => {
        const src = preview.nodeMap.get(e.source);
        const dst = preview.nodeMap.get(e.target);
        if (!src || !dst) return null;
        const x1 = src.position.x - preview.minX + 40 + (src.width ?? 180);
        const y1 = src.position.y - preview.minY + 40 + (src.height ?? 110) * 0.5;
        const x2 = dst.position.x - preview.minX + 40;
        const y2 = dst.position.y - preview.minY + 40 + (dst.height ?? 110) * 0.5;
        const mx = (x1 + x2) * 0.5;
        return (
          <path
            key={`e-${e.id || idx}`}
            d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            stroke="rgba(167,139,250,0.55)"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
      {preview.nodes.map((n, idx) => {
        const x = n.position.x - preview.minX + 40;
        const y = n.position.y - preview.minY + 40;
        const w = Math.max(94, Math.min(220, n.width ?? 170));
        const h = Math.max(58, Math.min(140, n.height ?? 92));
        const label = nodePreviewLabel(n);
        const mediaUrl = nodePreviewMediaUrl(n);
        const clipId = `wf-${spaceId}-clip-${idx}`;
        const fill =
          n.type === "adAsset"
            ? "rgba(17,24,39,0.86)"
            : n.type === "textPrompt"
              ? "rgba(6,78,59,0.62)"
              : n.type === "imageRef"
                ? "rgba(67,56,202,0.6)"
                : n.type === "promptList"
                  ? "rgba(76,29,149,0.58)"
                  : "rgba(146,64,14,0.58)";
        return (
          <g key={`n-${n.id}-${idx}`}>
            {mediaUrl ? (
              <>
                <defs>
                  <clipPath id={clipId}>
                    <rect x={x} y={y} width={w} height={h} rx={12} />
                  </clipPath>
                </defs>
                <image
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  href={mediaUrl}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${clipId})`}
                />
                <rect x={x} y={y} width={w} height={h} rx={12} fill="rgba(7,10,18,0.24)" />
              </>
            ) : (
              <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} />
            )}
            <rect x={x} y={y} width={w} height={h} rx={12} fill="none" stroke="rgba(255,255,255,0.22)" />
            <text
              x={x + 10}
              y={y + 22}
              fill="rgba(255,255,255,0.9)"
              fontSize="11"
              fontFamily="Inter, system-ui, sans-serif"
              fontWeight="700"
            >
              {label.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function WorkflowSpacesLanding() {
  const router = useRouter();
  const sb = useSupabaseBrowserClient();
  const [storageScope, setStorageScope] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<WorkflowSpaceMeta[]>([]);
  const [communityTemplates, setCommunityTemplates] = useState<WorkflowTemplateMeta[]>([]);
  const [communityLoadFailed, setCommunityLoadFailed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<TabId>("my");
  const [query, setQuery] = useState("");
  const [newWorkflowDialogOpen, setNewWorkflowDialogOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("Untitled workflow");
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [editingSpaceName, setEditingSpaceName] = useState("");

  const refreshCommunityTemplates = useCallback(async () => {
    const res = await fetch(`/api/workflow/community-templates?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      setCommunityLoadFailed(true);
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      if (j?.error) toast.error(j.error);
      return;
    }
    setCommunityLoadFailed(false);
    const j = (await res.json().catch(() => null)) as { templates?: unknown } | null;
    const rows = Array.isArray(j?.templates) ? j.templates : [];
    setCommunityTemplates(
      rows
        .filter((r: { id?: unknown }) => typeof r.id === "string" && /^[0-9a-f-]{36}$/i.test(String(r.id).trim()))
        .map((r: { id: string; name?: unknown; blurb?: unknown }) => ({
          id: workflowCommunityTemplateId(r.id.trim()),
          name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Template",
          blurb: typeof r.blurb === "string" && r.blurb.trim() ? r.blurb.trim() : "",
          source: "community" as const,
        })),
    );
  }, []);

  useEffect(() => {
    if (!sb) {
      setStorageScope(getWorkflowStorageScope(null));
      return;
    }
    void sb.auth.getSession().then(({ data }) => {
      setStorageScope(getWorkflowStorageScope(data.session?.user?.id ?? null));
      if (data.session?.user) void refreshCommunityTemplates();
      else setCommunityTemplates([]);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setStorageScope(getWorkflowStorageScope(session?.user?.id ?? null));
      if (session?.user) void refreshCommunityTemplates();
      else {
        setCommunityTemplates([]);
        setCommunityLoadFailed(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, refreshCommunityTemplates]);

  const refresh = useCallback((scope: string) => {
    setSpaces(loadSpacesIndex(scope).spaces);
  }, []);

  useEffect(() => {
    if (storageScope === null) return;
    refresh(storageScope);
    setHydrated(true);
  }, [storageScope, refresh]);

  useEffect(() => {
    if (tab !== "templates") return;
    void refreshCommunityTemplates();
  }, [tab, refreshCommunityTemplates]);

  const filteredSpaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = spaces;
    if (!q) return list;
    return list.filter((s) => s.name.toLowerCase().includes(q));
  }, [spaces, query]);

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = listWorkflowTemplates(storageScope, communityTemplates);
    if (!q) return all;
    return all.filter(
      (t) => t.name.toLowerCase().includes(q) || t.blurb.toLowerCase().includes(q),
    );
  }, [query, storageScope, communityTemplates]);

  const onNewSpace = () => {
    if (storageScope === null) return;
    setNewWorkflowName("Untitled workflow");
    setNewWorkflowDialogOpen(true);
  };

  const confirmNewSpace = () => {
    if (storageScope === null) return;
    const nextName = newWorkflowName.trim() || "Untitled workflow";
    const meta = createSpace(storageScope, nextName);
    setNewWorkflowDialogOpen(false);
    router.push(`/workflow/space/${encodeURIComponent(meta.id)}`);
  };

  const openSpace = (id: string) => {
    router.push(`/workflow/space/${encodeURIComponent(id)}`);
  };

  const openTemplate = (id: string) => {
    router.push(`/workflow/template/${encodeURIComponent(id)}`);
  };
  const removeSpace = (e: MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (storageScope === null) return;
    deleteSpace(storageScope, id);
    refresh(storageScope);
  };
  const startRenameSpace = (e: MouseEvent, space: WorkflowSpaceMeta) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingSpaceId(space.id);
    setEditingSpaceName(space.name);
  };

  const commitRenameSpace = (spaceId: string) => {
    if (storageScope === null) return;
    const nextName = editingSpaceName.trim();
    const current = spaces.find((x) => x.id === spaceId);
    if (!current) {
      setEditingSpaceId(null);
      return;
    }
    if (!nextName || nextName === current.name) return;
    updateSpaceMeta(storageScope, spaceId, { name: nextName });
    refresh(storageScope);
    setEditingSpaceId(null);
  };
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#06070d] text-white">
      {/* Dots only on the canvas (`WorkflowEditor`); keep import so the symbol is always defined for bundlers/HMR */}
      <WorkflowAmbientLayer dots={false} />
      <div className="pointer-events-none absolute left-1/2 top-0 z-[1] h-[380px] w-[min(100%,920px)] -translate-x-1/2 rounded-full bg-violet-600/11 blur-[100px]" />
      <div className="pointer-events-none absolute right-0 top-[120px] z-[1] h-[320px] w-[480px] rounded-full bg-violet-600/12 blur-[90px]" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <div className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-gradient-to-br from-violet-950/80 via-[#0c0d12] to-violet-950/45 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-6">
            <div className="w-full shrink-0 lg:max-w-sm lg:basis-[24%]">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Workflow</h1>
              <p className="mt-2 text-lg font-semibold text-white/80">Start from scratch</p>
              <p className="mt-2 text-sm leading-relaxed text-white/45">
                Create a new workflow and start collaborating
              </p>
              <button
                type="button"
                onClick={onNewSpace}
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-white px-5 py-2.5 text-[14px] font-semibold text-zinc-900 shadow-[0_8px_32px_rgba(139,92,246,0.2)] transition hover:border-violet-300/50 hover:bg-white hover:shadow-[0_10px_36px_rgba(139,92,246,0.25)]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                New workflow
              </button>
            </div>

            <div className="relative min-h-[240px] w-full lg:min-h-0 lg:basis-[76%] lg:min-w-0" aria-hidden>
              <WorkflowLandingHeroDiagram className="h-[min(280px,52vw)] lg:h-[min(300px,36vw)] xl:h-[min(320px,32vw)]" />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-full border border-white/[0.08] bg-[#0b0912]/60 p-1">
            {(
              [
                { id: "my" as const, label: "My workflows", icon: Layers },
                { id: "shared" as const, label: "Shared", icon: Users },
                { id: "templates" as const, label: "Templates", icon: LayoutTemplate },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold transition",
                  tab === id
                    ? "bg-violet-500/15 text-violet-100 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.35)] ring-1 ring-violet-400/25"
                    : "text-white/45 hover:bg-violet-500/10 hover:text-violet-100/90",
                )}
              >
                <Icon className="h-3.5 w-3.5 opacity-80" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-[26rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === "templates" ? "Search templates…" : "Search workflows…"}
                className="w-full rounded-full border border-white/[0.1] bg-[#0b0912]/90 py-2.5 pl-10 pr-4 text-[13px] text-white placeholder:text-white/35 outline-none ring-violet-500/0 transition focus:border-violet-500/35 focus:ring-2 focus:ring-violet-500/25"
              />
            </div>
          </div>
        </div>
        {tab === "templates" && communityLoadFailed ? (
          <p className="mt-2 text-xs text-red-200/80">
            Community templates failed to load. Check Supabase migration/auth, then refresh.
          </p>
        ) : null}

        {!hydrated || storageScope === null ? (
          <p className="mt-10 text-center text-sm text-white/40">Loading workflows…</p>
        ) : tab === "shared" ? (
          <p className="mt-12 text-center text-sm text-white/45">No shared workflows yet.</p>
        ) : tab === "templates" ? (
          filteredTemplates.length === 0 ? (
            <p className="mt-12 text-center text-sm text-white/45">No templates match your search.</p>
          ) : (
            <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((t) => (
                <li key={t.id}>
                  <div
                    role="link"
                    tabIndex={0}
                    onClick={() => openTemplate(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openTemplate(t.id);
                      }
                    }}
                    className="flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0b0912]/90 text-left shadow-[0_12px_40px_rgba(0,0,0,0.35)] outline-none transition hover:border-violet-400/30 hover:bg-[#0b0912] hover:shadow-[0_12px_40px_rgba(139,92,246,0.08)] focus-visible:ring-2 focus-visible:ring-violet-500/50"
                  >
                    <div className="aspect-[16/10] w-full bg-gradient-to-br from-violet-900/35 via-[#1a1a22] to-violet-950/40" />
                    <div className="p-4">
                      <p className="min-w-0 font-semibold text-white">{t.name}</p>
                      <p className="mt-2 min-w-0 text-[13px] leading-relaxed text-white/45">{t.blurb}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-300/70">View preview</p>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/35">
                          {t.source === "community"
                            ? "Everyone"
                            : t.source === "custom"
                              ? "This device"
                              : "Built-in"}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : filteredSpaces.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-14 text-center">
            <p className="text-sm text-white/55">
              {query.trim() ? "No workflows match your search." : "No workflows yet, create your first one above."}
            </p>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSpaces.map((s) => (
              <li key={s.id} className="group relative">
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => openSpace(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openSpace(s.id);
                    }
                  }}
                  className="flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0b0912]/90 text-left shadow-[0_12px_40px_rgba(0,0,0,0.35)] outline-none transition hover:border-violet-400/30 hover:bg-[#0b0912] hover:shadow-[0_12px_40px_rgba(139,92,246,0.08)] focus-visible:ring-2 focus-visible:ring-violet-500/50"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-violet-900/30 via-[#1a1a22] to-violet-950/35">
                    <WorkflowSpaceCardPreviewFallback scope={storageScope} spaceId={s.id} />
                  </div>
                  <div className="flex items-start gap-2 p-4 pr-[4.5rem]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center">
                        {editingSpaceId === s.id ? (
                          <input
                            value={editingSpaceName}
                            autoFocus
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onChange={(e) => setEditingSpaceName(e.target.value)}
                            onBlur={() => commitRenameSpace(s.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRenameSpace(s.id);
                              if (e.key === "Escape") setEditingSpaceId(null);
                              e.stopPropagation();
                            }}
                            className="h-7 w-[min(220px,100%)] rounded-md border border-white/15 bg-black/35 px-2 text-[14px] font-semibold text-white outline-none focus:border-violet-400/40"
                          />
                        ) : (
                          <div className="inline-flex max-w-full items-center gap-1.5">
                            <p className="truncate font-semibold text-white">{s.name}</p>
                            <button
                              type="button"
                              title="Edit name"
                              onClick={(e) => startRenameSpace(e, s)}
                              className="nodrag nopan inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/55 transition hover:bg-white/10 hover:text-white sm:text-white/40"
                            >
                              <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="mt-1 text-[12px] text-white/40">Edited {formatTimeAgo(s.updatedAt)}</p>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-3 right-3 z-10 flex flex-wrap justify-end gap-1 sm:bottom-4 sm:right-4 sm:gap-1.5">
                  <button
                    type="button"
                    title="Delete workflow"
                    onClick={(e) => removeSpace(e, s.id)}
                    className="rounded-lg border border-white/[0.08] bg-black/50 px-2 py-1 text-[11px] font-semibold text-white/55 shadow-sm backdrop-blur-sm transition hover:bg-red-500/15 hover:text-red-200"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {newWorkflowDialogOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0b0912] p-4 shadow-2xl">
            <p className="text-sm font-semibold text-white">New workflow</p>
            <input
              autoFocus
              value={newWorkflowName}
              onChange={(e) => setNewWorkflowName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmNewSpace();
                if (e.key === "Escape") setNewWorkflowDialogOpen(false);
              }}
              className="mt-3 h-10 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm text-white outline-none focus:border-violet-400/45"
              placeholder="Untitled workflow"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewWorkflowDialogOpen(false)}
                className="rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/70 transition hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmNewSpace}
                className="rounded-lg border border-violet-400/30 bg-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/30"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

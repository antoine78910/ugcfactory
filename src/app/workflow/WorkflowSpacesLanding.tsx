"use client";

import { Layers, LayoutTemplate, Plus, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";

import { cn } from "@/lib/utils";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { WorkflowAmbientLayer } from "./WorkflowAmbientLayer";
import {
  createSpace,
  deleteSpace,
  getWorkflowStorageScope,
  loadSpacesIndex,
  type WorkflowSpaceMeta,
} from "./workflowSpacesStorage";
import { WORKFLOW_TEMPLATE_LIST } from "./workflowTemplates";

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

export function WorkflowSpacesLanding() {
  const router = useRouter();
  const [storageScope, setStorageScope] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<WorkflowSpaceMeta[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<TabId>("my");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    void sb.auth.getSession().then(({ data }) => {
      setStorageScope(getWorkflowStorageScope(data.session?.user?.id ?? null));
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setStorageScope(getWorkflowStorageScope(session?.user?.id ?? null));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback((scope: string) => {
    setSpaces(loadSpacesIndex(scope).spaces);
  }, []);

  useEffect(() => {
    if (storageScope === null) return;
    refresh(storageScope);
    setHydrated(true);
  }, [storageScope, refresh]);

  const filteredSpaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = spaces;
    if (!q) return list;
    return list.filter((s) => s.name.toLowerCase().includes(q));
  }, [spaces, query]);

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WORKFLOW_TEMPLATE_LIST;
    return WORKFLOW_TEMPLATE_LIST.filter(
      (t) => t.name.toLowerCase().includes(q) || t.blurb.toLowerCase().includes(q),
    );
  }, [query]);

  const onNewSpace = () => {
    if (storageScope === null) return;
    const meta = createSpace(storageScope);
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

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#06070d] text-white">
      {/* Dots only on the canvas (`WorkflowEditor`); keep import so the symbol is always defined for bundlers/HMR */}
      <WorkflowAmbientLayer dots={false} />
      <div className="pointer-events-none absolute left-1/2 top-0 z-[1] h-[380px] w-[min(100%,920px)] -translate-x-1/2 rounded-full bg-violet-600/11 blur-[100px]" />
      <div className="pointer-events-none absolute right-0 top-[120px] z-[1] h-[320px] w-[480px] rounded-full bg-violet-600/12 blur-[90px]" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        <div className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-gradient-to-br from-violet-950/80 via-[#0c0d12] to-violet-950/45 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
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

            <div className="relative hidden h-[200px] w-[min(100%,380px)] shrink-0 lg:block" aria-hidden>
              <div className="absolute inset-0 rounded-2xl border border-white/10 bg-[#06070d]/90 p-4">
                <div className="relative h-full">
                  <div className="absolute left-2 top-6 h-14 w-24 rounded-xl border border-violet-500/35 bg-black/60" />
                  <div className="absolute right-4 top-10 h-12 w-32 rounded-xl border border-violet-500/35 bg-black/50 px-2 py-1.5 text-[9px] leading-snug text-white/55">
                    Slowly and cinematically zoom out of the scene…
                  </div>
                  <div className="absolute bottom-8 left-1/4 h-12 w-20 rounded-xl border border-white/15 bg-black/70" />
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 200" fill="none">
                    <path
                      d="M 60 70 Q 120 40 180 90 T 300 100"
                      stroke="url(#g1)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 180 90 Q 240 130 320 95"
                      stroke="url(#g2)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
                        <stop stopColor="#c4b5fd" stopOpacity="0.55" />
                        <stop offset="1" stopColor="#a78bfa" stopOpacity="0.65" />
                      </linearGradient>
                      <linearGradient id="g2" x1="0" y1="0" x2="1" y2="0">
                        <stop stopColor="#a78bfa" stopOpacity="0.65" />
                        <stop offset="1" stopColor="#7c3aed" stopOpacity="0.45" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
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

          <div className="relative w-full sm:max-w-md">
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
                      <p className="font-semibold text-white">{t.name}</p>
                      <p className="mt-2 text-[13px] leading-relaxed text-white/45">{t.blurb}</p>
                      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-violet-300/70">
                        View preview
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : filteredSpaces.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-14 text-center">
            <p className="text-sm text-white/55">
              {query.trim() ? "No workflows match your search." : "No workflows yet — create your first one above."}
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
                  <div className="aspect-[16/10] w-full bg-gradient-to-br from-violet-900/30 via-[#1a1a22] to-violet-950/35" />
                  <div className="flex items-start gap-2 p-4 pr-[4.5rem]">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{s.name}</p>
                      <p className="mt-1 text-[12px] text-white/40">Edited {formatTimeAgo(s.updatedAt)}</p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  title="Delete workflow"
                  onClick={(e) => removeSpace(e, s.id)}
                  className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-lg px-2 py-1 text-[11px] font-semibold text-white/35 opacity-0 transition hover:bg-red-500/15 hover:text-red-300 group-hover:pointer-events-auto group-hover:opacity-100"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

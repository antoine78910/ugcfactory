"use client";

import { FolderOpen, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RecreateProjectListItem = {
  id: string;
  title: string;
  updated_at: string;
  video_file_name: string | null;
};

function formatProjectDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

type RecreateProjectsSidebarProps = {
  projects: RecreateProjectListItem[];
  activeProjectId: string | null;
  loading: boolean;
  onRefresh: () => void;
  onSelect: (projectId: string) => void;
};

export function RecreateProjectsSidebar(props: RecreateProjectsSidebarProps) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/10 bg-[#08080a]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/55">
          <FolderOpen className="size-3.5" />
          Projects
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 text-white/50 hover:text-white"
          disabled={props.loading}
          onClick={() => props.onRefresh()}
          title="Refresh projects"
        >
          {props.loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
        {props.projects.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] leading-snug text-white/40">
            No saved projects yet. Analyze a video to create one.
          </p>
        ) : (
          <ul className="space-y-1">
            {props.projects.map((p) => {
              const active = props.activeProjectId === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => props.onSelect(p.id)}
                    className={cn(
                      "flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition",
                      active
                        ? "bg-violet-500/20 ring-1 ring-violet-400/35"
                        : "hover:bg-white/[0.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "line-clamp-2 text-xs font-medium leading-snug",
                        active ? "text-violet-50" : "text-white/90",
                      )}
                    >
                      {p.title}
                    </span>
                    <span className="mt-1 truncate text-[10px] text-white/40">
                      {p.video_file_name ?? "Video"}
                      {p.updated_at ? ` · ${formatProjectDate(p.updated_at)}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

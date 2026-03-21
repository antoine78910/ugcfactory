"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderPlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LabEdge, LabNode } from "@/lib/linkToAd/buildProjectLabGraph";
import type { LabArtifacts, LabCustomAngle, LabFolder } from "@/lib/linkToAd/labProjectStorage";
import { childrenMapFromEdges } from "@/lib/linkToAd/labProjectStorage";

type Props = {
  nodes: LabNode[];
  edges: LabEdge[];
  artifacts: LabArtifacts;
  onArtifactsChange: (a: LabArtifacts) => void;
  selectedId: string | null;
  onSelectNodeId: (id: string | null) => void;
  onFocusNode?: (id: string) => void;
};

function TreeRow({
  depth,
  label,
  sub,
  icon,
  expanded,
  onToggle,
  hasChildren,
  active,
  onClick,
}: {
  depth: number;
  label: string;
  sub?: string;
  icon?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  hasChildren: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-1 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40",
        active ? "bg-violet-500/25 text-white" : "text-white/75 hover:bg-white/[0.06]",
      )}
      style={{ paddingLeft: 6 + depth * 12 }}
    >
      {hasChildren ? (
        <span
          role="presentation"
          className="mt-0.5 shrink-0 text-white/45"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      ) : (
        <span className="inline-block w-3.5 shrink-0" />
      )}
      {icon ? <span className="mt-0.5 shrink-0 opacity-70">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {sub ? <span className="block truncate text-[9px] text-white/40">{sub}</span> : null}
      </span>
    </div>
  );
}

function buildAutoTreeChildren(edges: LabEdge[], parentId: string, nodeById: Map<string, LabNode>): string[] {
  const m = childrenMapFromEdges(edges);
  const raw = m.get(parentId) ?? [];
  return raw.filter((cid) => {
    const n = nodeById.get(cid);
    if (!n) return false;
    return n.kind !== "folder" && n.kind !== "custom_angle";
  });
}

export function ProjectLabSidebar({
  nodes,
  edges,
  artifacts,
  onArtifactsChange,
  selectedId,
  onSelectNodeId,
  onFocusNode,
}: Props) {
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["root", "lab-user-root"]));
  const [newFolderName, setNewFolderName] = useState("");
  const [newAngleName, setNewAngleName] = useState("");
  const [newAngleNotes, setNewAngleNotes] = useState("");
  const [targetFolderId, setTargetFolderId] = useState<string | "root" | "">("");

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  function removeFolder(id: string) {
    const keepFolders = artifacts.folders.filter((f) => f.id !== id && f.parentId !== id);
    const keepAngles = artifacts.customAngles.filter((a) => a.folderId !== id);
    onArtifactsChange({ folders: keepFolders, customAngles: keepAngles });
  }

  function removeAngle(id: string) {
    onArtifactsChange({
      ...artifacts,
      customAngles: artifacts.customAngles.filter((a) => a.id !== id),
    });
  }

  const autoEdges = useMemo(() => edges.filter((e) => !e.id.startsWith("ux")), [edges]);

  function renderAutoBranch(parentId: string, depth: number): React.ReactNode {
    const childIds = buildAutoTreeChildren(autoEdges, parentId, nodeById);
    const n = nodeById.get(parentId);
    if (!n && parentId !== "root") return null;

    const rows: React.ReactNode[] = [];
    for (const cid of childIds) {
      const child = nodeById.get(cid);
      if (!child) continue;
      if (child.kind === "folder" || child.kind === "custom_angle") continue;

      const sub = child.sublabel;
      const grand = buildAutoTreeChildren(autoEdges, cid, nodeById);
      const isOpen = expanded.has(cid);
      rows.push(
        <div key={cid}>
          <TreeRow
            depth={depth}
            label={child.label}
            sub={sub}
            expanded={isOpen}
            onToggle={() => toggle(cid)}
            hasChildren={grand.length > 0}
            active={selectedId === cid}
            onClick={() => {
              onSelectNodeId(cid);
              onFocusNode?.(cid);
            }}
          />
          {isOpen && grand.length > 0 ? <div>{renderAutoBranch(cid, depth + 1)}</div> : null}
        </div>,
      );
    }
    return <>{rows}</>;
  }

  function renderFolderRow(f: LabFolder, depth: number): React.ReactNode {
    const id = `lab-folder-${f.id}`;
    const childFolders = artifacts.folders.filter((c) => c.parentId === f.id);
    const anglesHere = artifacts.customAngles.filter((a) => a.folderId === f.id);
    const isOpen = expanded.has(id);
    const hasKids = childFolders.length > 0 || anglesHere.length > 0;

    return (
      <div key={f.id}>
        <TreeRow
          depth={depth}
          label={f.name}
          sub="Folder"
          expanded={isOpen}
          onToggle={() => toggle(id)}
          hasChildren={hasKids}
          active={selectedId === id}
          onClick={() => {
            onSelectNodeId(id);
            onFocusNode?.(id);
          }}
        />
        {isOpen ? (
          <div>
            {anglesHere.map((a) => {
              const aid = `lab-custom-angle-${a.id}`;
              return (
                <div key={a.id} className="flex items-center gap-0.5">
                  <div className="min-w-0 flex-1">
                    <TreeRow
                      depth={depth + 1}
                      label={a.name}
                      sub={a.notes || "Custom angle"}
                      expanded={false}
                      onToggle={() => {}}
                      hasChildren={false}
                      active={selectedId === aid}
                      onClick={() => {
                        onSelectNodeId(aid);
                        onFocusNode?.(aid);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-white/35 hover:text-red-300"
                    title="Delete"
                    onClick={() => removeAngle(a.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
            {childFolders.map((c) => renderFolderRow(c, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  function addFolder() {
    const name = newFolderName.trim() || "New folder";
    const parent =
      targetFolderId === "" || targetFolderId === "root"
        ? null
        : artifacts.folders.some((x) => x.id === targetFolderId)
          ? targetFolderId
          : null;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `f-${Date.now()}`;
    onArtifactsChange({
      ...artifacts,
      folders: [...artifacts.folders, { id, name, parentId: parent }],
    });
    setNewFolderName("");
    setExpanded((s) => new Set([...s, parent ? `lab-folder-${parent}` : "lab-user-root", `lab-folder-${id}`]));
  }

  function addAngle() {
    const name = newAngleName.trim() || "New angle";
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `a-${Date.now()}`;
    const folderId =
      targetFolderId && targetFolderId !== "root" && artifacts.folders.some((x) => x.id === targetFolderId)
        ? targetFolderId
        : null;
    const ca: LabCustomAngle = {
      id,
      name,
      folderId,
      notes: newAngleNotes.trim() || undefined,
    };
    onArtifactsChange({
      ...artifacts,
      customAngles: [...artifacts.customAngles, ca],
    });
    setNewAngleName("");
    setNewAngleNotes("");
    if (folderId) setExpanded((s) => new Set([...s, `lab-folder-${folderId}`]));
  }

  const topFolders = artifacts.folders.filter((f) => !f.parentId);
  const orphanAngles = artifacts.customAngles.filter((a) => !a.folderId);

  return (
    <aside className="flex w-[min(100%,280px)] shrink-0 flex-col border-r border-white/10 bg-black/55 backdrop-blur-md">
      <div className="border-b border-white/10 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300/90">Architecture</p>
        <p className="mt-0.5 text-[10px] text-white/40">Tree of generated nodes plus your layout.</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-white/35">Project data</p>
        <TreeRow
          depth={0}
          label="Product / runs"
          sub="Link to Ad & classic"
          expanded={expanded.has("root")}
          onToggle={() => toggle("root")}
          hasChildren
          active={selectedId === "root"}
          onClick={() => {
            onSelectNodeId("root");
            onFocusNode?.("root");
          }}
        />
        {expanded.has("root") ? <div className="mt-0.5">{renderAutoBranch("root", 1)}</div> : null}

        <p className="mb-1 mt-4 px-1 text-[9px] font-semibold uppercase tracking-wide text-white/35">Your space</p>
        <TreeRow
          depth={0}
          label="Folders & custom angles"
          expanded={expanded.has("lab-user-root")}
          onToggle={() => toggle("lab-user-root")}
          hasChildren={topFolders.length > 0 || orphanAngles.length > 0}
          active={false}
          onClick={() => toggle("lab-user-root")}
        />
        {expanded.has("lab-user-root") ? (
          <div className="mt-0.5 space-y-0.5">
            {topFolders.map((f) => renderFolderRow(f, 1))}
            {orphanAngles.map((a) => {
              const aid = `lab-custom-angle-${a.id}`;
              return (
                <div key={a.id} className="flex items-center gap-0.5">
                  <div className="min-w-0 flex-1">
                    <TreeRow
                      depth={1}
                      label={a.name}
                      sub={a.notes || "Sub-project"}
                      expanded={false}
                      onToggle={() => {}}
                      hasChildren={false}
                      active={selectedId === aid}
                      onClick={() => {
                        onSelectNodeId(aid);
                        onFocusNode?.(aid);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-white/35 hover:text-red-300"
                    title="Delete"
                    onClick={() => removeAngle(a.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-white/10 p-3">
        <p className="text-[9px] font-semibold uppercase text-white/40">Create</p>
        <select
          className="h-8 w-full rounded-md border border-white/15 bg-white/[0.04] px-2 text-[11px] text-white"
          value={targetFolderId}
          onChange={(e) => setTargetFolderId(e.target.value as typeof targetFolderId)}
        >
          <option value="">Root (project-linked)</option>
          {artifacts.folders.map((f) => (
            <option key={f.id} value={f.id}>
              In “{f.name}”
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="h-8 flex-1 border-white/15 bg-white/[0.04] text-[11px] text-white"
          />
          <Button type="button" size="icon" className="h-8 w-8 shrink-0 bg-cyan-500/30" onClick={addFolder} title="New folder">
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>
        <Input
          value={newAngleName}
          onChange={(e) => setNewAngleName(e.target.value)}
          placeholder="Angle name"
          className="h-8 border-white/15 bg-white/[0.04] text-[11px] text-white"
        />
        <Input
          value={newAngleNotes}
          onChange={(e) => setNewAngleNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="h-8 border-white/15 bg-white/[0.04] text-[11px] text-white"
        />
        <Button type="button" size="sm" className="w-full gap-1 bg-violet-500/25 text-white" onClick={addAngle}>
          <Plus className="h-3.5 w-3.5" />
          New angle
        </Button>
        {artifacts.folders.length > 0 ? (
          <div className="space-y-1 pt-1">
            <p className="text-[9px] text-white/35">Delete folder (clears linked angles)</p>
            {artifacts.folders.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-1 rounded border border-white/10 bg-white/[0.02] px-2 py-1">
                <span className="truncate text-[10px] text-white/70">{f.name}</span>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-300/80" onClick={() => removeFolder(f.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

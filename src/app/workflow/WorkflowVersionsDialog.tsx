"use client";

import { Dialog } from "radix-ui";
import { History, Loader2, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";
import {
  listCloudWorkflowVersions,
  restoreCloudWorkflowVersion,
  type CloudWorkflowVersion,
} from "./workflowSpacesCloud";

const REASON_LABEL: Record<string, string> = {
  periodic: "Autosave",
  nodes_removed: "Before modules were removed",
  delete: "Before deletion",
  baseline: "Initial backup",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkflowVersionsDialog({
  open,
  onOpenChange,
  spaceId,
  canRestore,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  canRestore: boolean;
  onRestored: (state: WorkflowProjectStateV1, updatedAt: string) => void;
}) {
  const [versions, setVersions] = useState<CloudWorkflowVersion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await listCloudWorkflowVersions(spaceId);
    setLoading(false);
    if (list === null) {
      toast.error("Could not load versions.");
      setVersions([]);
      return;
    }
    setVersions(list);
  }, [spaceId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const onRestore = async (v: CloudWorkflowVersion) => {
    if (!canRestore || restoringId) return;
    setRestoringId(v.id);
    const res = await restoreCloudWorkflowVersion(spaceId, v.id);
    setRestoringId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onRestored(res.state, res.updatedAt);
    toast.success("Version restored", { description: "Your previous canvas was saved as a version too." });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/75 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[221] flex max-h-[80vh] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-white/12 bg-[#101014] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="mb-1 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-white">
              <History className="h-4 w-4 text-violet-300" />
              Version history
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-4 text-[13px] leading-relaxed text-white/50">
            Snapshots are saved automatically every few minutes and whenever modules are removed.
          </Dialog.Description>

          <div className="-mx-2 min-h-[120px] flex-1 overflow-y-auto px-2">
            {loading && versions === null ? (
              <div className="flex h-[120px] items-center justify-center text-white/50">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : versions && versions.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-white/45">
                No versions yet. They appear after a few minutes of editing.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {(versions ?? []).map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-white/90">{formatWhen(v.savedAt ?? v.createdAt)}</p>
                      <p className="truncate text-[12px] text-white/45">
                        {v.nodeCount} module{v.nodeCount === 1 ? "" : "s"} · {REASON_LABEL[v.reason] ?? v.reason}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!canRestore || restoringId !== null}
                      onClick={() => void onRestore(v)}
                      title={canRestore ? "Restore this version" : "Only owners and editors can restore"}
                      className={cn(
                        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 text-[12px] font-semibold text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                    >
                      {restoringId === v.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

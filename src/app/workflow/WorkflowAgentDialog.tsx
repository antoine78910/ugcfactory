"use client";

import { Dialog } from "radix-ui";
import {
  Bot,
  ImagePlus,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { uploadFileToCdn } from "@/lib/uploadBlobUrlToCdn";
import type { WorkflowProjectStateV1 } from "./workflowProjectStorage";
import {
  applyWorkflowAgentPlan,
  parseWorkflowAgentPlan,
  summarizeWorkflowGraphForAgent,
  type WorkflowAgentPlan,
} from "./workflowAgentOps";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: WorkflowProjectStateV1;
  onApply: (next: WorkflowProjectStateV1, runs: { runNodeIds: string[]; runFromHereIds: string[] }) => void;
  readOnly?: boolean;
};

export function WorkflowAgentDialog({ open, onOpenChange, project, onApply, readOnly }: Props) {
  const [instruction, setInstruction] = useState("");
  const [html, setHtml] = useState("");
  const [rebuild, setRebuild] = useState(true);
  const [model, setModel] = useState<"claude-sonnet-4-5" | "gpt-5o">("claude-sonnet-4-5");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLastSummary(null);
  }, [open]);

  const onPickFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const next: string[] = [];
      for (const file of Array.from(files).slice(0, 4)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image.`);
          continue;
        }
        const publicUrl = await uploadFileToCdn(file);
        if (publicUrl) next.push(publicUrl);
      }
      if (next.length === 0) {
        toast.error("Could not upload screenshot(s).");
      } else {
        setImageUrls((prev) => [...prev, ...next].slice(0, 6));
        toast.success(next.length === 1 ? "Screenshot uploaded" : `${next.length} screenshots uploaded`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  const runAgent = useCallback(async () => {
    if (readOnly) return;
    if (!instruction.trim() && !html.trim() && imageUrls.length === 0) {
      toast.error("Add an instruction, HTML, or a screenshot.");
      return;
    }
    setBusy(true);
    setLastSummary(null);
    try {
      const res = await fetch("/api/gpt/workflow-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          instruction: instruction.trim() || undefined,
          html: html.trim() || undefined,
          imageUrls,
          rebuild,
          model,
          currentGraph: summarizeWorkflowGraphForAgent(project),
        }),
      });
      const j = (await res.json().catch(() => null)) as {
        plan?: WorkflowAgentPlan;
        raw?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        toast.error(j?.error ?? "Agent failed.");
        return;
      }
      const plan = j?.plan ?? (j?.raw ? parseWorkflowAgentPlan(j.raw) : null);
      if (!plan) {
        toast.error("Agent returned no usable actions.");
        return;
      }
      const result = applyWorkflowAgentPlan(project, plan);
      if (result.applied === 0) {
        toast.message("Nothing to apply", { description: plan.summary });
        setLastSummary(plan.summary);
        return;
      }
      onApply(result.project, {
        runNodeIds: result.runNodeIds,
        runFromHereIds: result.runFromHereIds,
      });
      setLastSummary(plan.summary);
      toast.success("Agent applied", { description: plan.summary });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Agent failed.");
    } finally {
      setBusy(false);
    }
  }, [readOnly, instruction, html, imageUrls, rebuild, model, project, onApply, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/75 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[221] flex max-h-[88vh] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-white/12 bg-[#101014] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="mb-1 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-white">
              <Bot className="h-4 w-4 text-violet-300" />
              Workflow agent
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
            Describe what to build, paste page HTML, or drop a screenshot of a workflow. The agent can add modules,
            fill prompts, connect, arrange, and run.
          </Dialog.Description>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Instruction</span>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                placeholder="e.g. Recreate this screenshot: prompt text → image generator → video…"
                className="w-full resize-y rounded-xl border border-white/12 bg-black/35 px-3 py-2.5 text-[13px] text-white/90 outline-none placeholder:text-white/30 focus:border-violet-400/45"
              />
            </label>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-white/45">Screenshot</span>
                {imageUrls.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setImageUrls([])}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/45 hover:text-white/75"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </button>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void onPickFiles(e.target.files)}
              />
              <button
                type="button"
                disabled={uploading || busy}
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/18 bg-white/[0.03] px-3 py-6 text-[13px] font-semibold text-white/70 transition hover:border-violet-400/35 hover:bg-violet-500/[0.06] hover:text-white disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload screenshot"}
              </button>
              {imageUrls.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {imageUrls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="h-16 w-16 rounded-lg border border-white/12 object-cover"
                    />
                  ))}
                </div>
              ) : null}
            </div>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                Page HTML <span className="font-normal normal-case text-white/30">(optional)</span>
              </span>
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={4}
                placeholder="Paste HTML of a page to analyze…"
                className="w-full resize-y rounded-xl border border-white/12 bg-black/35 px-3 py-2.5 font-mono text-[11px] text-white/80 outline-none placeholder:text-white/30 focus:border-violet-400/45"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-white/70">
                <input
                  type="checkbox"
                  checked={rebuild}
                  onChange={(e) => setRebuild(e.target.checked)}
                  className="rounded border-white/20"
                />
                Clear canvas first (rebuild)
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-white/70">
                Model
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as "claude-sonnet-4-5" | "gpt-5o")}
                  className="rounded-md border border-white/12 bg-black/40 px-2 py-1 text-[12px] text-white/85 outline-none"
                >
                  <option value="claude-sonnet-4-5">Claude</option>
                  <option value="gpt-5o">GPT</option>
                </select>
              </label>
            </div>

            {lastSummary ? (
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white/60">
                {lastSummary}
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-white/[0.08] pt-4">
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-full border border-white/14 px-3.5 text-[13px] font-semibold text-white/70 transition hover:bg-white/[0.06]"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={busy || uploading || readOnly}
              onClick={() => void runAgent()}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border border-violet-400/35 bg-white px-3.5 text-[13px] font-semibold text-zinc-900 shadow-sm transition hover:bg-white/95 disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {busy ? "Working…" : "Run agent"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

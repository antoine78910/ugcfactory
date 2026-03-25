"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cloneExtractedBase, readUniverseFromExtracted, type LinkToAdUniverseSnapshotV1 } from "@/lib/linkToAdUniverse";

export type ProjectRunBrandBriefEditorProps = {
  runId: string;
  storeUrl: string;
  title: string | null;
  extracted: unknown;
  summaryText: string;
  onSaved: () => void;
};

export function ProjectRunBrandBriefEditor({
  runId,
  storeUrl,
  title,
  extracted,
  summaryText,
  onSaved,
}: ProjectRunBrandBriefEditorProps) {
  const [text, setText] = useState(summaryText);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(summaryText);
  }, [summaryText]);

  async function handleSave() {
    const snap = readUniverseFromExtracted(extracted);
    if (!snap) {
      toast.error("Invalid project data.");
      return;
    }
    const nextSnap: LinkToAdUniverseSnapshotV1 = {
      ...snap,
      summaryText: text.trim(),
    };
    const base = cloneExtractedBase(extracted);
    setSaving(true);
    try {
      const res = await fetch("/api/runs/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          storeUrl,
          title,
          extracted: { ...base, __universe: nextSnap },
        }),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error || "Save failed");
      toast.success("Product brief updated");
      onSaved();
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 space-y-3 border-b border-white/10 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-white/80">Product brief</p>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => void handleSave()}
          className="h-8 border border-emerald-400/35 bg-emerald-500/20 text-white hover:bg-emerald-500/35"
        >
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Save brief
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-white/45">
        Full product analysis used for scripts and context. Edit for tighter positioning before regenerating or continuing in
        Link to Ad.
      </p>
      <div className="space-y-1">
        <Label className="text-[11px] text-white/55">Product brief (from URL scan)</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[160px] border-white/10 bg-black/40 text-sm leading-relaxed text-white/85"
          spellCheck
        />
      </div>
    </div>
  );
}

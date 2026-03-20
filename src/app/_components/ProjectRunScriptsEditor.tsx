"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cloneExtractedBase,
  deriveAngleLabelsFromScripts,
  joinScriptOptions,
  readUniverseFromExtracted,
  splitScriptOptions,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";

export type ProjectRunScriptsEditorProps = {
  runId: string;
  storeUrl: string;
  title: string | null;
  extracted: unknown;
  scriptsText: string;
  onSaved: () => void;
};

export function ProjectRunScriptsEditor({
  runId,
  storeUrl,
  title,
  extracted,
  scriptsText,
  onSaved,
}: ProjectRunScriptsEditorProps) {
  const [parts, setParts] = useState<[string, string, string]>(() => splitScriptOptions(scriptsText));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setParts(splitScriptOptions(scriptsText));
  }, [scriptsText]);

  async function handleSave() {
    const snap = readUniverseFromExtracted(extracted);
    if (!snap) {
      toast.error("Invalid project data.");
      return;
    }
    const merged = joinScriptOptions(parts);
    const labels = deriveAngleLabelsFromScripts(merged);
    const nextSnap: LinkToAdUniverseSnapshotV1 = {
      ...snap,
      scriptsText: merged,
      angleLabels: labels,
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
      toast.success("Scripts updated");
      onSaved();
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  const updatePart = (i: 0 | 1 | 2, v: string) => {
    setParts((p) => {
      const n: [string, string, string] = [...p] as [string, string, string];
      n[i] = v;
      return n;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-white/80">Edit the three script angles</p>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => void handleSave()}
          className="h-8 border border-violet-400/40 bg-violet-500/25 text-white hover:bg-violet-500/40"
        >
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Save scripts
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-white/45">
        Refine hooks, lines, and CTA. Saving updates the run and refreshes angle teasers when you open Link to Ad.
      </p>
      {([0, 1, 2] as const).map((i) => (
        <div key={i} className="space-y-1">
          <Label className="text-[11px] text-white/55">Script option {i + 1}</Label>
          <Textarea
            value={parts[i]}
            onChange={(e) => updatePart(i, e.target.value)}
            className="min-h-[140px] border-white/10 bg-black/40 font-mono text-xs leading-relaxed text-white/85"
            spellCheck={false}
          />
        </div>
      ))}
    </div>
  );
}

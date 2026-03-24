"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  cloneExtractedBase,
  deriveAngleLabelsFromScripts,
  joinScriptOptions,
  readUniverseFromExtracted,
  splitScriptOptions,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";
import {
  type ScriptFactorBlocks,
  angleBlockForEditing,
  composeScriptFromFactors,
  splitScriptFactorsForUi,
} from "@/lib/linkToAdScriptFactors";

export type ProjectRunScriptsEditorProps = {
  runId: string;
  storeUrl: string;
  title: string | null;
  extracted: unknown;
  scriptsText: string;
  angleLabels?: [string, string, string];
  onSaved: () => void;
};

function factorsFromScripts(scriptsText: string): [ScriptFactorBlocks, ScriptFactorBlocks, ScriptFactorBlocks] {
  const triple = splitScriptOptions(scriptsText);
  return triple.map((block) => {
    const { editable, headline } = angleBlockForEditing(block);
    return splitScriptFactorsForUi(editable, headline);
  }) as [ScriptFactorBlocks, ScriptFactorBlocks, ScriptFactorBlocks];
}

const FACTOR_ROWS: { key: keyof ScriptFactorBlocks; label: string }[] = [
  { key: "hook", label: "Hook" },
  { key: "problem", label: "Problem" },
  { key: "avatar", label: "Avatar" },
  { key: "benefits", label: "Benefits" },
  { key: "proof", label: "Proof" },
  { key: "offer", label: "Offer" },
  { key: "cta", label: "CTA" },
  { key: "tone", label: "Tone" },
];

export function ProjectRunScriptsEditor({
  runId,
  storeUrl,
  title,
  extracted,
  scriptsText,
  angleLabels,
  onSaved,
}: ProjectRunScriptsEditorProps) {
  const [factorsByAngle, setFactorsByAngle] = useState<
    [ScriptFactorBlocks, ScriptFactorBlocks, ScriptFactorBlocks]
  >(() => factorsFromScripts(scriptsText));
  const [activeAngle, setActiveAngle] = useState<0 | 1 | 2>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFactorsByAngle(factorsFromScripts(scriptsText));
  }, [scriptsText]);

  const updateFactor = useCallback((angle: 0 | 1 | 2, key: keyof ScriptFactorBlocks, value: string) => {
    setFactorsByAngle((prev) => {
      const next: [ScriptFactorBlocks, ScriptFactorBlocks, ScriptFactorBlocks] = [
        { ...prev[0] },
        { ...prev[1] },
        { ...prev[2] },
      ];
      next[angle] = { ...next[angle], [key]: value };
      return next;
    });
  }, []);

  async function handleSave() {
    const snap = readUniverseFromExtracted(extracted);
    if (!snap) {
      toast.error("Invalid project data.");
      return;
    }
    const bodies: [string, string, string] = [
      composeScriptFromFactors(factorsByAngle[0]),
      composeScriptFromFactors(factorsByAngle[1]),
      composeScriptFromFactors(factorsByAngle[2]),
    ];
    const merged = joinScriptOptions(bodies);
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
      toast.success("Angle factors updated");
      onSaved();
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  const angleTabLabel = (i: 0 | 1 | 2) => {
    const custom = angleLabels?.[i]?.trim();
    if (custom) {
      const short = custom.length > 42 ? `${custom.slice(0, 40)}…` : custom;
      return `Angle ${i + 1}: ${short}`;
    }
    return `Marketing angle ${i + 1}`;
  };

  const f = factorsByAngle[activeAngle];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-white/80">Edit the three marketing angles</p>
          <p className="mt-0.5 text-[11px] leading-snug text-white/45">
            Adjust Hook, Problem, Avatar, and the other factors — same structure as in Link to Ad. Raw script text is not
            shown here.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => void handleSave()}
          className="h-8 border border-violet-400/40 bg-violet-500/25 text-white hover:bg-violet-500/40"
        >
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Save angles
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-black/30 p-1">
        {([0, 1, 2] as const).map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveAngle(i)}
            className={cn(
              "min-h-9 flex-1 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition sm:min-w-0 sm:flex-none sm:px-3",
              activeAngle === i
                ? "bg-violet-500/35 text-white shadow-sm"
                : "text-white/55 hover:bg-white/[0.06] hover:text-white/80",
            )}
          >
            {angleTabLabel(i)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FACTOR_ROWS.map(({ key, label }) => (
          <div key={`${activeAngle}-${key}`} className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-white/45">{label}</Label>
            <Textarea
              value={f[key]}
              onChange={(e) => updateFactor(activeAngle, key, e.target.value)}
              className="min-h-[72px] border-white/10 bg-black/40 text-xs leading-relaxed text-white/85"
              spellCheck
            />
          </div>
        ))}
      </div>
    </div>
  );
}

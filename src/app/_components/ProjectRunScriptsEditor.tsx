"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  cloneExtractedBase,
  deriveAngleLabelsFromScripts,
  joinScriptOptionsFromBodies,
  readUniverseFromExtracted,
  splitAllScriptOptions,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";
import {
  type ScriptFactorBlocks,
  angleBlockForEditing,
  composeScriptFromFactors,
  EMPTY_SCRIPT_FACTORS,
  splitScriptFactorsForUi,
} from "@/lib/linkToAdScriptFactors";

export type ProjectRunScriptsEditorProps = {
  runId: string;
  storeUrl: string;
  title: string | null;
  extracted: unknown;
  scriptsText: string;
  angleLabels?: string[];
  /** Brand brief for guided / auto new angle (GPT). */
  brandBrief?: string;
  productImageUrls?: string[] | null;
  onSaved: () => void;
};

function factorsFromBodies(bodies: string[]): ScriptFactorBlocks[] {
  return bodies.map((block) => {
    const { editable, headline } = angleBlockForEditing(block);
    return splitScriptFactorsForUi(editable, headline);
  });
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
  brandBrief = "",
  productImageUrls,
  onSaved,
}: ProjectRunScriptsEditorProps) {
  const initialBodies = useMemo(() => splitAllScriptOptions(scriptsText), [scriptsText]);
  const [factorsByAngle, setFactorsByAngle] = useState<ScriptFactorBlocks[]>(() => factorsFromBodies(initialBodies));
  const [activeAngle, setActiveAngle] = useState(0);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"guide" | "discover">("guide");
  const [addPrompt, setAddPrompt] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const bodies = splitAllScriptOptions(scriptsText);
    setFactorsByAngle(factorsFromBodies(bodies));
    setActiveAngle((a) => Math.min(a, Math.max(0, bodies.length - 1)));
  }, [scriptsText]);

  const angleCount = factorsByAngle.length;

  const updateFactor = useCallback((angle: number, key: keyof ScriptFactorBlocks, value: string) => {
    setFactorsByAngle((prev) => {
      const next = prev.map((f, i) => (i === angle ? { ...f, [key]: value } : f));
      return next;
    });
  }, []);

  function persistMerged(bodies: string[], labelsOverride?: string[]) {
    const snap = readUniverseFromExtracted(extracted);
    if (!snap) {
      toast.error("Invalid project data.");
      return;
    }
    const numEmpty = bodies.filter((b) => !angleBlockForEditing(b).editable.trim()).length;
    if (numEmpty === bodies.length) {
      toast.error("At least one angle needs content before saving.");
      return;
    }
    const merged = joinScriptOptionsFromBodies(bodies);
    const labels = labelsOverride ?? deriveAngleLabelsFromScripts(merged);
    const nextSnap: LinkToAdUniverseSnapshotV1 = {
      ...snap,
      scriptsText: merged,
      angleLabels: labels,
    };
    const base = cloneExtractedBase(extracted);
    return { nextSnap, base, merged };
  }

  async function handleSave() {
    const bodies = factorsByAngle.map((f) => composeScriptFromFactors(f));
    const pack = persistMerged(bodies);
    if (!pack) return;
    setSaving(true);
    try {
      const res = await fetch("/api/runs/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          storeUrl,
          title,
          extracted: { ...pack.base, __universe: pack.nextSnap },
        }),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error || "Save failed");
      toast.success("Angles updated");
      onSaved();
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  }

  async function savePayload(nextSnap: LinkToAdUniverseSnapshotV1, base: Record<string, unknown>) {
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
  }

  function removeAngle(index: number) {
    if (angleCount <= 3) {
      setFactorsByAngle((prev) => {
        const next = [...prev];
        next[index] = { ...EMPTY_SCRIPT_FACTORS };
        return next;
      });
      toast.message("Angle cleared", { description: "Save angles to apply. You need at least 3 slots for Link to Ad." });
      return;
    }
    setFactorsByAngle((prev) => prev.filter((_, i) => i !== index));
    setActiveAngle((a) => Math.max(0, Math.min(a, angleCount - 2)));
  }

  async function confirmAddAngle() {
    const brief = brandBrief.trim();
    if (!brief) {
      toast.error("Product brief is empty", { description: "Add a brief above or open this ad in Link to Ad first." });
      return;
    }
    if (angleCount >= 4) {
      toast.error("Maximum 4 angles.");
      return;
    }
    const customAngle =
      addMode === "discover"
        ? "Propose ONE new UGC marketing angle that is clearly different from typical pain / proof / transformation pitches, grounded only in the brand brief. Then output the full script in SCRIPT OPTION 1 form as instructed."
        : addPrompt.trim();
    if (!customAngle) {
      toast.error(addMode === "guide" ? "Describe the angle you want." : "Could not start.");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch("/api/gpt/ugc-custom-angle-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandBrief: brief,
          customAngle,
          productImageUrls: productImageUrls?.filter((u) => /^https?:\/\//i.test(u)).slice(0, 3) ?? [],
          videoDurationSeconds: 15,
          provider: "claude",
        }),
      });
      const json = (await res.json()) as { data?: string; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Generation failed");
      const newScript = json.data.trim();
      const cleanedBody = newScript.replace(/^\s*SCRIPT\s+OPTION\s*\d+\b\s*\n*/i, "").trim();
      if (!cleanedBody) throw new Error("Empty script from AI");

      const bodies = factorsByAngle.map((f) => composeScriptFromFactors(f));
      bodies.push(cleanedBody);
      const merged = joinScriptOptionsFromBodies(bodies);
      const labels = deriveAngleLabelsFromScripts(merged);

      const snap = readUniverseFromExtracted(extracted);
      if (!snap) throw new Error("Invalid project data.");
      const nextSnap: LinkToAdUniverseSnapshotV1 = { ...snap, scriptsText: merged, angleLabels: labels };
      const base = cloneExtractedBase(extracted);
      await savePayload(nextSnap, base);
      toast.success("New angle added");
      setAddOpen(false);
      setAddPrompt("");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add angle");
    } finally {
      setAdding(false);
    }
  }

  const angleTabLabel = (i: number) => {
    const custom = angleLabels?.[i]?.trim();
    if (custom) {
      const short = custom.length > 42 ? `${custom.slice(0, 40)}…` : custom;
      return `Angle ${i + 1}: ${short}`;
    }
    return `Marketing angle ${i + 1}`;
  };

  const f = factorsByAngle[activeAngle] ?? EMPTY_SCRIPT_FACTORS;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-white/80">Marketing angles</p>
          <p className="mt-0.5 text-[11px] leading-snug text-white/45">
            Edit Hook → Tone per angle. Add a 4th angle with + or clear one you don’t want. Saves sync with Link to Ad.
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

      <div className="flex flex-wrap items-stretch gap-1.5 rounded-xl border border-white/10 bg-black/30 p-1">
        {factorsByAngle.map((_, i) => (
          <div key={i} className="flex min-h-9 min-w-0 flex-1 gap-0.5 sm:flex-none">
            <button
              type="button"
              onClick={() => setActiveAngle(i)}
              className={cn(
                "min-h-9 flex-1 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition sm:min-w-[7rem] sm:px-3",
                activeAngle === i
                  ? "bg-violet-500/35 text-white shadow-sm"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white/80",
              )}
            >
              {angleTabLabel(i)}
            </button>
            <button
              type="button"
              title={angleCount > 3 ? "Remove this angle" : "Clear this angle"}
              onClick={() => removeAngle(i)}
              className="flex shrink-0 items-center justify-center rounded-lg border border-white/10 px-2 text-white/45 transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
        {angleCount < 4 ? (
          <button
            type="button"
            onClick={() => {
              setAddOpen((o) => !o);
              setAddMode("guide");
            }}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-lg border border-dashed border-violet-400/35 px-3 py-1.5 text-[11px] font-semibold text-violet-200/90 transition hover:border-violet-400/55 hover:bg-violet-500/10",
              addOpen && "border-violet-400/60 bg-violet-500/15",
            )}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add angle
          </button>
        ) : null}
      </div>

      {addOpen && angleCount < 4 ? (
        <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.07] p-3 space-y-3">
          <p className="text-[11px] font-semibold text-white/80">New angle — how should the AI work?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAddMode("guide")}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition",
                addMode === "guide"
                  ? "border-violet-400/50 bg-violet-500/25 text-white"
                  : "border-white/15 text-white/55 hover:bg-white/[0.05]",
              )}
            >
              I’ll guide the AI
            </button>
            <button
              type="button"
              onClick={() => setAddMode("discover")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition",
                addMode === "discover"
                  ? "border-violet-400/50 bg-violet-500/25 text-white"
                  : "border-white/15 text-white/55 hover:bg-white/[0.05]",
              )}
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden />
              Let the AI find one
            </button>
          </div>
          {addMode === "guide" ? (
            <div className="space-y-1">
              <Label className="text-[10px] text-white/45">Describe the creative angle (hook, situation, audience…)</Label>
              <Textarea
                value={addPrompt}
                onChange={(e) => setAddPrompt(e.target.value)}
                className="min-h-[88px] border-white/10 bg-black/40 text-xs text-white/85"
                placeholder='e.g. "Busy parent morning, product as the 30-second win, skeptical but curious tone."'
                spellCheck
              />
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-white/50">
              We’ll ask the model for one new angle that fits the product brief only — no extra input needed.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={adding}
              onClick={() => void confirmAddAngle()}
              className="h-8 border border-violet-300/40 bg-violet-400/90 text-black hover:bg-violet-300"
            >
              {adding ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Generate &amp; add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={adding}
              onClick={() => {
                setAddOpen(false);
                setAddPrompt("");
              }}
              className="h-8 border border-white/15 bg-transparent text-white/70 hover:bg-white/[0.06]"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

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

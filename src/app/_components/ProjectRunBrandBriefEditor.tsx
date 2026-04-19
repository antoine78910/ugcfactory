"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  cloneExtractedBase,
  mergeProductBriefForEditing,
  readUniverseFromExtracted,
  splitProductBriefForEditing,
  type LinkToAdUniverseSnapshotV1,
} from "@/lib/linkToAdUniverse";

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
  const [hero, setHero] = useState("");
  const [tail, setTail] = useState("");
  const [useBrandPrefix, setUseBrandPrefix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);

  useEffect(() => {
    const s = splitProductBriefForEditing(summaryText);
    setHero(s.hero);
    setTail(s.tail);
    setUseBrandPrefix(s.useBrandPrefix);
    setFullOpen(false);
  }, [summaryText]);

  async function handleSave() {
    const snap = readUniverseFromExtracted(extracted);
    if (!snap) {
      toast.error("Invalid project data.");
      return;
    }
    const merged = mergeProductBriefForEditing(hero, tail, useBrandPrefix);
    const nextSnap: LinkToAdUniverseSnapshotV1 = {
      ...snap,
      summaryText: merged.trim(),
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
        <div>
          <p className="text-xs font-semibold text-white/80">Product brief</p>
          <p className="mt-0.5 max-w-xl text-[11px] leading-snug text-white/45">
            Edit the core story (positioning, product, who it’s for). Extra scan detail stays available below for power
            users, it still feeds the AI when you generate scripts.
          </p>
        </div>
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

      <div className="space-y-1">
        <Label className="text-[11px] text-white/55">What you’re selling (main story)</Label>
        <Textarea
          value={hero}
          onChange={(e) => setHero(e.target.value)}
          className="min-h-[100px] border-white/10 bg-black/40 text-sm leading-relaxed text-white/85"
          spellCheck
          placeholder="Brand, product, promise, audience, the part you’d tweak before generating new angles."
        />
      </div>

      {tail.trim() ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setFullOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[11px] font-semibold text-white/60 transition hover:bg-white/[0.04] hover:text-white/75"
          >
            <span>More from the scan ({tail.length.toLocaleString()} chars), optional detail</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition", fullOpen && "rotate-180")} aria-hidden />
          </button>
          {fullOpen ? (
            <div className="border-t border-white/10 px-3 py-2 pb-3">
              <Textarea
                value={tail}
                onChange={(e) => setTail(e.target.value)}
                className="min-h-[120px] border-white/10 bg-black/35 text-xs leading-relaxed text-white/78"
                spellCheck
              />
              <p className="mt-1.5 text-[10px] text-white/35">
                Objections, extra angles ideas, positioning nuance, kept for context, hidden by default so the panel
                stays light.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {useBrandPrefix ? (
        <p className="text-[10px] text-white/32">
          Saved with a “Brand brief:” prefix so downstream tools keep the expected format.
        </p>
      ) : null}
    </div>
  );
}

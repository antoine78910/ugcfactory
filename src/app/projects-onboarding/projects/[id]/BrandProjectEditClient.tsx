"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Loader2, Plus, Settings2, Trash2 } from "lucide-react";

import { BrandProjectDashboard, type BrandProjectRow } from "@/app/projects-onboarding/_components/BrandProjectDashboard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { BrandMarketingAngle } from "@/lib/onboardingBrandClaude";
import { toast } from "sonner";

type Tab = "dashboard" | "settings";

function newAngle(): BrandMarketingAngle {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `angle-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, label: "", rationale: "" };
}

export default function BrandProjectEditClient({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [row, setRow] = useState<BrandProjectRow | null>(null);
  const [title, setTitle] = useState("");
  const [angles, setAngles] = useState<BrandMarketingAngle[]>([]);
  const [competitors, setCompetitors] = useState<unknown[]>([]);
  const [newCompName, setNewCompName] = useState("");
  const [newCompDomain, setNewCompDomain] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/brand/projects/${encodeURIComponent(projectId)}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string } & Partial<BrandProjectRow>;
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const data = json as BrandProjectRow;
      setRow(data);
      setTitle(data.title ?? "");
      setAngles(Array.isArray(data.marketing_angles) ? data.marketing_angles : []);
      setCompetitors(Array.isArray(data.competitors) ? data.competitors : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load project.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    const cleanAngles = angles
      .map((a) => ({
        id: a.id,
        label: a.label.trim(),
        rationale: a.rationale?.trim() || undefined,
        evidence: a.evidence?.trim() || undefined,
      }))
      .filter((a) => a.label.length > 0);

    setSaving(true);
    try {
      const res = await fetch(`/api/onboarding/brand/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          marketing_angles: cleanAngles,
          competitors,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      toast.success("Saved.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [angles, competitors, load, projectId, title]);

  const addCompetitorStub = useCallback(() => {
    const name = newCompName.trim();
    if (!name) {
      toast.error("Enter a competitor name.");
      return;
    }
    const domain = newCompDomain.trim() || null;
    setCompetitors((prev) => [
      ...prev,
      {
        input_name: name,
        input_domain: domain,
        trendtrack_lookup: null,
        trendtrack_ads: [],
        website_text_sample: "",
        claude: {
          summary: "Not analyzed yet — use Refresh on the dashboard or re-run onboarding.",
          ad_patterns: [],
          angles_they_stress: [],
          gaps_you_can_attack: [],
        },
      },
    ]);
    setNewCompName("");
    setNewCompDomain("");
    toast.success("Competitor added — save in Settings, then refresh on Dashboard.");
  }, [newCompDomain, newCompName]);

  if (loading || !row) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[#050507] text-white/60">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactElement }[] = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="size-3.5" /> },
    { id: "settings", label: "Settings", icon: <Settings2 className="size-3.5" /> },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#050507] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/projects-onboarding/projects" className="text-sm text-violet-300 hover:underline">
              ← My projects
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{row.title}</h1>
            <p className="mt-1 text-sm text-white/50">{row.site_url}</p>
          </div>
          <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                  tab === t.id ? "bg-violet-500/20 text-violet-100" : "text-white/50 hover:text-white",
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "dashboard" ? (
          <BrandProjectDashboard project={row} onProjectUpdated={() => void load()} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            <Card className="border-white/10 bg-white/[0.03] shadow-none">
              <CardHeader>
                <CardTitle>Project settings</CardTitle>
                <CardDescription className="text-white/55">Title, angles, and competitor list.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border-white/15 bg-black/35 text-white"
                  />
                </div>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="bg-violet-400 text-black hover:bg-violet-300"
                >
                  {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Save changes
                </Button>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03] shadow-none">
              <CardHeader>
                <CardTitle>Marketing angles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {angles.map((a, idx) => (
                  <div key={a.id} className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-xs">Label</Label>
                          <Input
                            value={a.label}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAngles((prev) => prev.map((x, i) => (i === idx ? { ...x, label: v } : x)));
                            }}
                            className="border-white/15 bg-black/35 text-white"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Rationale</Label>
                          <Input
                            value={a.rationale ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAngles((prev) => prev.map((x, i) => (i === idx ? { ...x, rationale: v } : x)));
                            }}
                            className="border-white/15 bg-black/35 text-white"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-white/45 hover:text-red-300"
                        onClick={() => setAngles((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove angle"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                  onClick={() => setAngles((prev) => [...prev, newAngle()])}
                >
                  <Plus className="mr-2 size-4" />
                  Add angle
                </Button>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03] shadow-none">
              <CardHeader>
                <CardTitle>Competitors</CardTitle>
                <CardDescription className="text-white/55">
                  Manual rows only here — use Dashboard → Refresh for TrendTrack enrichment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {competitors.length === 0 ? (
                  <p className="text-sm text-white/45">No competitors stored.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-white/75">
                    {competitors.map((c, i) => {
                      const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
                      const name = typeof o.input_name === "string" ? o.input_name : `Competitor ${i + 1}`;
                      return (
                        <li key={`${name}-${i}`} className="rounded-lg border border-white/10 bg-black/25 p-3">
                          <div className="font-medium text-white">{name}</div>
                          {typeof o.input_domain === "string" ? (
                            <p className="text-xs text-white/40">{o.input_domain}</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">New competitor name</Label>
                    <Input
                      value={newCompName}
                      onChange={(e) => setNewCompName(e.target.value)}
                      className="border-white/15 bg-black/35 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Domain (optional)</Label>
                    <Input
                      value={newCompDomain}
                      onChange={(e) => setNewCompDomain(e.target.value)}
                      className="border-white/15 bg-black/35 text-white"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="border-white/15 bg-white/10 text-white"
                  onClick={addCompetitorStub}
                >
                  Add competitor row
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
